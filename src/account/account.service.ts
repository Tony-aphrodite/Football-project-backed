import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Gsi, Keys } from '../dynamodb/keys';
import { EmailService } from '../email/email.service';
import { accountDeletedEmail } from '../email/email.templates';
import { ListingsService } from '../listings/listings.service';
import { PagarmeService } from '../payments/pagarme.service';
import { UsersService } from '../users/users.service';
import { assertReauthenticated } from '../auth/reauth';
import type { OrderRecord } from '../orders/entities/order.entity';

/** Orders that still involve money or a jersey in transit. */
const OPEN_STATUSES = ['PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED', 'DISPUTED'];

/**
 * Account deletion requested by the user (Privacy Policy §12; required by the
 * App Store and Google Play).
 *
 * What goes: login, contact details, address, push token, saved card, active
 * listings, and the e-mail/phone/CPF/Google/Apple lookups — so the person can
 * sign up again later.
 *
 * What stays, as the policy allows: the CPF and bank details on the closed
 * record (tax and consumer-law retention, 5 years), the Pagar.me recipient —
 * its available balance keeps being paid out automatically on the 5th of each
 * month — and past orders and ratings.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly db: DynamoDbService,
    private readonly users: UsersService,
    private readonly listings: ListingsService,
    private readonly pagarme: PagarmeService,
    private readonly email: EmailService,
  ) {}

  async deleteAccount(userId: string, input: { confirm: string; password?: string; totpCode?: string }): Promise<void> {
    if (input.confirm.trim().toUpperCase() !== 'EXCLUIR') {
      throw new BadRequestException('Digite EXCLUIR para confirmar.');
    }
    const user = await this.users.getById(userId);
    if (user.status !== 'ACTIVE') throw new BadRequestException('Esta conta não está ativa.');
    await assertReauthenticated(user, input);

    // Deleting mid-transaction would strand a buyer's money or a seller's jersey.
    const [asBuyer, asSeller] = await Promise.all([
      this.db.query<OrderRecord>({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': Gsi.ordersAsBuyer(userId).GSI1PK },
      }),
      this.db.query<OrderRecord>({
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: { ':pk': Gsi.ordersAsSeller(userId).GSI2PK },
      }),
    ]);
    const open = [...asBuyer, ...asSeller].filter((o) => OPEN_STATUSES.includes(o.status));
    if (open.length > 0) {
      throw new BadRequestException(
        `Você tem ${open.length} pedido${open.length > 1 ? 's' : ''} em andamento. ` +
        'Conclua ou resolva antes de excluir a conta, ou fale com contato@arenadosmantos.app.br.',
      );
    }

    // Active listings come down (and out of search).
    const mine = await this.listings.listMine(userId);
    for (const l of mine.filter((x) => x.status === 'ACTIVE')) {
      await this.listings.remove(userId, l.listingId).catch((err) =>
        this.logger.warn(`Could not remove listing ${l.listingId} of deleted user ${userId}`, err),
      );
    }

    if (user.savedCard && user.pagarmeCustomerId) {
      await this.pagarme.deleteCustomerCard(user.pagarmeCustomerId, user.savedCard.cardId).catch(() => undefined);
    }

    // Say goodbye while we still have the address.
    if (user.email) {
      const mail = accountDeletedEmail(user.displayName);
      await this.email.send(user.email, mail.subject, mail.html).catch(() => undefined);
    }

    // Free the identifiers, only where they still point at this user.
    const lookups = [
      user.email && Keys.lookupEmail(user.email),
      user.phoneE164 && Keys.lookupPhone(user.phoneE164),
      user.cpf && Keys.lookupCpf(user.cpf),
      user.googleSub && Keys.lookupGoogle(user.googleSub),
      user.appleSub && Keys.lookupApple(user.appleSub),
    ].filter(Boolean) as { PK: string; SK: string }[];
    for (const key of lookups) {
      await this.db.transactWrite([{
        Delete: {
          TableName: this.db.tableName,
          Key: key,
          ConditionExpression: 'attribute_not_exists(PK) OR userId = :uid',
          ExpressionAttributeValues: { ':uid': userId },
        },
      }]).catch((err) => this.logger.warn(`Lookup ${key.PK} not removed for ${userId}`, err));
    }

    const now = new Date().toISOString();
    const k = Keys.user(userId);
    await this.db.update({
      Key: { PK: k.PK, SK: k.SK },
      UpdateExpression: [
        'SET #s = :deleted, deletedAt = :now, displayName = :anon, updatedAt = :now',
        'REMOVE email, phoneE164, contactPhone, nomeCompleto, expoPushToken, savedCard,',
        'passwordHash, totpSecret, totpPendingSecret, googleSub, appleSub, marketingConsent,',
        'sellerCep, sellerRua, sellerNumero, sellerComplemento, sellerBairro, sellerCidade, sellerEstado',
      ].join(' '),
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':deleted': 'DELETED', ':now': now, ':anon': 'Usuário removido' },
    });
    this.logger.log(`Account ${userId} deleted by its owner`);
  }
}
