import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Gsi, Keys } from '../dynamodb/keys';
import { OrderRecord } from '../orders/entities/order.entity';
import type { SavedCard, UserRecord } from '../users/entities/user.entity';
import { PagarmeService, type PagarmeCharge } from './pagarme.service';
import { ShippingService } from '../shipping/shipping.service';
import { UsersService } from '../users/users.service';
import { DeveloperEarningsService } from '../developer-earnings/developer-earnings.service';
import { FiscalService } from '../fiscal/fiscal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import {
  orderPaidBuyerEmail,
  orderPaidSellerEmail,
  orderShippedBuyerEmail,
  shippingLabelEmail,
  type OrderEmailData,
} from '../email/email.templates';
import type { AppConfig } from '../config/configuration';

export interface PixPaymentResult {
  orderId: string;
  pagarmeOrderId: string;
  pagarmeChargeId: string;
  pixQrCode: string;
  pixQrCodeUrl: string;
  pixExpiresAt: string;
  totalCents: number;
}

export interface PaymentStatusResult {
  orderId: string;
  status: string;
  pagarmeStatus: string | null;
}

/** Human-readable decline reason from a charge, or null when there is none. */
function describeDecline(charge: PagarmeCharge): string | null {
  const t = charge.last_transaction;
  if (!t) return null;
  const parts = [
    t.acquirer_message && `acquirer: ${t.acquirer_message}${t.acquirer_return_code ? ` (${t.acquirer_return_code})` : ''}`,
    t.gateway_response?.errors?.length && `gateway: ${t.gateway_response.errors.map((e) => e.message).join('; ')}`,
    t.antifraud_response?.status && `antifraud: ${t.antifraud_response.status}${t.antifraud_response.reason ? ` (${t.antifraud_response.reason})` : ''}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' | ') : null;
}

export interface PaymentConfig {
  cardTokenizationKey: string | null;
  /** Why tokenization is on or off, for diagnosing the Railway setup. */
  status: 'ok' | 'missing_public_key' | 'missing_secret_key' | 'mode_mismatch';
  publicKeyMode?: 'test' | 'live';
  secretKeyMode?: 'test' | 'live';
}

export interface CardPaymentResult {
  status:  'authorized' | 'refused' | 'pending';
  orderId: string;
  chargeId: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  /** Memoised sandbox check for Arena's recipient. */
  private arenaRecipientOk?: Promise<boolean>;

  constructor(
    private readonly db:          DynamoDbService,
    private readonly pagarme:     PagarmeService,
    private readonly shipping:    ShippingService,
    private readonly users:       UsersService,
    private readonly devEarnings: DeveloperEarningsService,
    private readonly fiscal:         FiscalService,
    private readonly notifications:  NotificationsService,
    private readonly config:         ConfigService<AppConfig, true>,
    private readonly email:          EmailService,
  ) {}

  /** Shape an order record for the email templates. */
  private emailData(order: OrderRecord): OrderEmailData {
    return {
      orderId:    order.orderId,
      teamName:   order.teamName,
      season:     order.season,
      priceCents: order.priceCents,
      totalCents: order.totalCents,
      buyerName:  order.buyerName,
      sellerName: order.sellerName,
      tracking:   order.correiosTracking,
    };
  }

  // ── Initiate PIX ─────────────────────────────────────────────────────────

  async initiatePixPayment(
    buyerId: string,
    orderId: string,
  ): Promise<PixPaymentResult> {
    const orderKey = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(orderKey.PK, orderKey.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');

    if (order.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException(
        `Order cannot be paid in status ${order.status}`,
      );
    }

    // Fetch buyer data — required by Pagar.me
    const buyerKey = Keys.user(buyerId);
    const buyer = await this.db.get<{ cpf?: string; displayName: string; phoneE164?: string; email?: string }>(
      buyerKey.PK,
      buyerKey.SK,
    );
    if (!buyer) throw new NotFoundException('Buyer profile not found');

    const cpf   = buyer.cpf ?? '00000000000';
    const phone = buyer.phoneE164 ?? '+5511999999999';

    // Load seller for recipient ID (split payment)
    const sellerKey = Keys.user(order.sellerId);
    const seller    = await this.db.get<{ pagarmeRecipientId?: string }>(sellerKey.PK, sellerKey.SK);
    const split = await this.splitRecipients(seller?.pagarmeRecipientId);

    const pagarmeOrder = await this.pagarme.createPixOrder({
      externalCode:     `ARENA-${orderId}`,
      amountCents:      order.totalCents,
      customerName:     buyer.displayName,
      customerCpf:      cpf,
      customerPhone:    phone,
      customerEmail:    buyer.email,
      itemDescription:  `Camisa ${order.teamName} — ${order.supplier} ${order.season}`,
      expiresInSeconds: 86_400,
      // Include split only when both recipient IDs are configured
      arenaRecipientId:  split?.arena,
      sellerRecipientId: split?.seller,
      commissionPct: 7,
    });

    const charge = pagarmeOrder.charges?.[0];
    const tx     = charge?.last_transaction;

    if (!charge || !tx?.qr_code) {
      this.logger.error(
        `Pagar.me gave no PIX QR code for order ${orderId}: ${charge ? describeDecline(charge) ?? charge.status : 'no charge'}`,
      );
      // Same as a refused card: the jersey goes back on sale.
      await this.cancelUnpaidOrder(orderId, `pix ${charge?.status ?? 'no charge'}: ${charge ? describeDecline(charge) ?? '' : ''}`);
      throw new ServiceUnavailableException('Não foi possível gerar o PIX agora. Tente novamente mais tarde.');
    }

    const pixExpiresAt = tx.expires_at ?? new Date(Date.now() + 86_400_000).toISOString();
    const now = new Date().toISOString();

    await this.db.update({
      Key: { PK: orderKey.PK, SK: orderKey.SK },
      UpdateExpression: [
        'SET pagarmeOrderId = :poi',
        'pagarmeChargeId = :pci',
        'paymentMethod = :pm',
        'pixQrCode = :qr',
        'pixQrCodeUrl = :qru',
        'pixExpiresAt = :exp',
        'updatedAt = :now',
      ].join(', '),
      ExpressionAttributeValues: {
        ':poi': pagarmeOrder.id,
        ':pci': charge.id,
        ':pm':  'PIX',
        ':qr':  tx.qr_code,
        ':qru': tx.qr_code_url ?? '',
        ':exp': pixExpiresAt,
        ':now': now,
      },
    });

    return {
      orderId,
      pagarmeOrderId: pagarmeOrder.id,
      pagarmeChargeId: charge.id,
      pixQrCode: tx.qr_code,
      pixQrCodeUrl: tx.qr_code_url ?? '',
      pixExpiresAt,
      totalCents: order.totalCents,
    };
  }

  // ── Initiate Credit Card ──────────────────────────────────────────────────

  async initiateCardPayment(
    buyerId: string,
    dto: {
      orderId:       string;
      installments:  number;
      useSavedCard?: boolean;
      saveCard?:     boolean;
      cardToken?:    string;
      cardLast4?:    string;
      cardNumber?:   string;
      cardHolderName?: string;
      cardExpMonth?: number;
      cardExpYear?:  number;
      cardCvv?:      string;
    },
  ): Promise<CardPaymentResult> {
    const orderKey = Keys.order(dto.orderId);
    const order = await this.db.get<OrderRecord>(orderKey.PK, orderKey.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');

    if (order.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException(
        `Order cannot be paid in status ${order.status}`,
      );
    }

    // Fetch buyer data — required by Pagar.me
    const buyerKey = Keys.user(buyerId);
    const buyer = await this.db.get<UserRecord>(buyerKey.PK, buyerKey.SK);
    if (!buyer) throw new NotFoundException('Buyer profile not found');

    const cpf   = buyer.cpf ?? '00000000000';
    const phone = buyer.phoneE164 ?? '+5511999999999';

    // Fetch listing for item description
    const listingKey = Keys.listing(order.listingId);
    const listing = await this.db.get<{ description?: string }>(listingKey.PK, listingKey.SK);
    const itemDescription = listing?.description
      ?? `Camisa ${order.teamName} — ${order.supplier} ${order.season}`;

    // Load seller for split payment
    const sellerKey = Keys.user(order.sellerId);
    const seller    = await this.db.get<{ pagarmeRecipientId?: string }>(sellerKey.PK, sellerKey.SK);
    const split = await this.splitRecipients(seller?.pagarmeRecipientId);

    const billingAddress = buyer.sellerCep && buyer.sellerRua && buyer.sellerCidade && buyer.sellerEstado
      ? {
          line1:   `${buyer.sellerNumero ?? 'S/N'}, ${buyer.sellerRua}, ${buyer.sellerBairro ?? ''}`,
          zipCode: buyer.sellerCep,
          city:    buyer.sellerCidade,
          state:   buyer.sellerEstado,
        }
      : undefined;

    // Which card: the saved one, a typed one kept in the vault, or a typed one
    // used only for this purchase.
    let vault: { customerId: string; cardId: string } | undefined;
    let cardToSave: SavedCard | undefined;

    if (dto.useSavedCard) {
      if (!buyer.savedCard || !buyer.pagarmeCustomerId) {
        throw new BadRequestException('Nenhum cartão salvo. Digite os dados do cartão.');
      }
      vault = { customerId: buyer.pagarmeCustomerId, cardId: buyer.savedCard.cardId };
    } else {
      if (!dto.cardToken && (!dto.cardNumber || !dto.cardHolderName || !dto.cardExpMonth || !dto.cardExpYear || !dto.cardCvv)) {
        throw new BadRequestException('Preencha os dados do cartão.');
      }
      if (dto.saveCard) {
        // Saving is a convenience: if the vault refuses, still charge the typed card.
        try {
          const customerId = buyer.pagarmeCustomerId ?? (await this.pagarme.createCustomer({
            name:      buyer.nomeCompleto ?? buyer.displayName,
            email:     buyer.email ?? `${cpf}@arenadosmantos.app`,
            cpf,
            phoneE164: buyer.phoneE164,
          })).id;
          if (!buyer.pagarmeCustomerId) {
            await this.db.update({
              Key: { PK: buyerKey.PK, SK: buyerKey.SK },
              UpdateExpression: 'SET pagarmeCustomerId = :c',
              ExpressionAttributeValues: { ':c': customerId },
            });
          }
          const card = await this.pagarme.createCustomerCard(customerId, {
            ...(dto.cardToken
              ? { token: dto.cardToken }
              : {
                  number:     dto.cardNumber!,
                  holderName: dto.cardHolderName!,
                  expMonth:   dto.cardExpMonth!,
                  expYear:    dto.cardExpYear!,
                  cvv:        dto.cardCvv!,
                }),
            billingAddress,
          });
          vault = { customerId, cardId: card.id };
          cardToSave = {
            cardId:   card.id,
            brand:    card.brand,
            last4:    card.last_four_digits,
            expMonth: card.exp_month,
            expYear:  card.exp_year,
          };
        } catch (err) {
          // A token is single-use: if the vault call consumed it, charging it
          // again fails too — so say so instead of pretending it was typed.
          if (dto.cardToken) {
            this.logger.warn(`Could not save tokenized card for ${buyerId}`, err);
            throw new BadRequestException('Não foi possível validar o cartão. Confira os dados e tente novamente.');
          }
          this.logger.warn(`Could not save card for ${buyerId}, charging it directly`, err);
        }
      }
    }

    const pagarmeOrder = await this.pagarme.createCardOrder({
      externalCode:    `ARENA-${dto.orderId}`,
      amountCents:     order.totalCents,
      customerName:    buyer.displayName,
      customerCpf:     cpf,
      customerPhone:   phone,
      customerEmail:   buyer.email,
      itemDescription,
      installments:    dto.installments,
      ...(vault
        ? { customerId: vault.customerId, cardId: vault.cardId }
        : dto.cardToken
        ? { cardToken: dto.cardToken }
        : {
            cardNumber:     dto.cardNumber,
            cardHolderName: dto.cardHolderName,
            cardExpMonth:   dto.cardExpMonth,
            cardExpYear:    dto.cardExpYear,
            cardCvv:        dto.cardCvv,
          }),
      arenaRecipientId:  split?.arena,
      sellerRecipientId: split?.seller,
      commissionPct: 7,
    });

    const charge = pagarmeOrder.charges?.[0];
    if (!charge) {
      this.logger.error('Pagar.me credit card response missing charge', pagarmeOrder);
      throw new Error('Pagar.me returned an unexpected response');
    }

    const chargeStatus = charge.status; // 'authorized', 'paid', 'refused', 'pending', etc.
    const declineReason = describeDecline(charge);
    if (declineReason) {
      this.logger.warn(`Card charge ${charge.id} for order ${dto.orderId} is ${chargeStatus}: ${declineReason}`);
    }
    const isPaid = chargeStatus === 'authorized' || chargeStatus === 'paid';

    const cardLast4 = dto.useSavedCard
      ? buyer.savedCard!.last4
      : cardToSave?.last4 ?? dto.cardLast4 ?? (dto.cardNumber ?? '').replace(/\D/g, '').slice(-4);

    if (cardToSave && vault) {
      if (isPaid) {
        // One saved card per account: the new one replaces the old.
        const previous = buyer.savedCard;
        await this.db.update({
          Key: { PK: buyerKey.PK, SK: buyerKey.SK },
          UpdateExpression: 'SET savedCard = :sc, updatedAt = :now',
          ExpressionAttributeValues: { ':sc': cardToSave, ':now': new Date().toISOString() },
        });
        if (previous && previous.cardId !== cardToSave.cardId) {
          void this.pagarme.deleteCustomerCard(vault.customerId, previous.cardId).catch(() => undefined);
        }
      } else {
        // A refused card is not worth keeping.
        void this.pagarme.deleteCustomerCard(vault.customerId, cardToSave.cardId).catch(() => undefined);
      }
    }
    const now = new Date().toISOString();

    // Base update: store charge details and payment method regardless of status
    const updateExpressionParts = [
      'SET pagarmeOrderId = :poi',
      'paymentMethod = :pm',
      'cardChargeId = :cci',
      'cardLast4 = :cl4',
      'installments = :inst',
      'updatedAt = :now',
    ];
    const expressionValues: Record<string, unknown> = {
      ':poi':  pagarmeOrder.id,
      ':pm':   'CREDIT_CARD',
      ':cci':  charge.id,
      ':cl4':  cardLast4,
      ':inst': dto.installments,
      ':now':  now,
    };

    if (isPaid) {
      const escrowReleaseAt = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
      updateExpressionParts.push('#s = :paid', 'escrowReleaseAt = :era');
      expressionValues[':paid'] = 'PAID';
      expressionValues[':era']  = escrowReleaseAt;
    }

    await this.db.update({
      Key: { PK: orderKey.PK, SK: orderKey.SK },
      UpdateExpression: updateExpressionParts.join(', '),
      ...(isPaid ? { ExpressionAttributeNames: { '#s': 'status' } } : {}),
      ExpressionAttributeValues: expressionValues,
    });

    if (isPaid) {
      this.logger.log(`Order ${dto.orderId} paid via credit card (charge ${charge.id})`);
      // Async: notifications, fiscal + shipping (same as PIX path). The order is
      // already PAID here, so the charge.paid webhook's markPaid will skip it —
      // notifying must happen now or the seller and buyer never hear about it.
      void this.notifyPaid(order);
      void this.fiscal.emitCommissionNfse(order);
      void this.fiscal.emitMpcNfe(order);
      if (order.deliveryMethod === 'CORREIOS' && order.buyerCep) {
        void this.purchaseLabelAsync(order);
      }
    }

    // Map Pagar.me charge status to our CardPaymentResult status
    let resultStatus: CardPaymentResult['status'];
    if (chargeStatus === 'authorized' || chargeStatus === 'paid') {
      resultStatus = 'authorized';
    } else if (chargeStatus === 'refused' || chargeStatus === 'failed' || chargeStatus === 'with_error') {
      resultStatus = 'refused';
      // The order took the jersey off sale; a refused card must give it back,
      // or the listing stays SOLD with nobody paying for it.
      await this.cancelUnpaidOrder(dto.orderId, `card ${chargeStatus}: ${declineReason ?? 'no reason given'}`);
      // A setup problem on our side is not the buyer's card: say so honestly.
      if (declineReason?.includes('gateway:')) {
        this.logger.error(`Pagar.me rejected the charge request itself (not the card): ${declineReason}`);
        throw new ServiceUnavailableException(
          'Não foi possível processar o pagamento agora — o problema não é o seu cartão. Tente novamente mais tarde.',
        );
      }
    } else {
      resultStatus = 'pending';
    }

    return {
      status:   resultStatus,
      orderId:  dto.orderId,
      chargeId: charge.id,
    };
  }

  /**
   * Cancel an order that was never paid and put the jersey back on sale:
   * order → CANCELLED, listing SOLD → ACTIVE, seller's active count +1, and
   * the coupon use (if any) returned. Conditional, so it never touches an
   * order that got paid in the meantime.
   */
  async cancelUnpaidOrder(orderId: string, reason: string): Promise<boolean> {
    const orderKey = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(orderKey.PK, orderKey.SK);
    if (!order || order.status !== 'PENDING_PAYMENT') return false;

    const now        = new Date().toISOString();
    const listingKey = Keys.listing(order.listingId);
    const sellerKey  = Keys.user(order.sellerId);

    try {
      await this.db.transactWrite([
        {
          Update: {
            TableName: this.db.tableName,
            Key: { PK: orderKey.PK, SK: orderKey.SK },
            UpdateExpression: 'SET #s = :cancelled, cancelReason = :r, cancelledAt = :now, updatedAt = :now',
            ConditionExpression: '#s = :pending',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':cancelled': 'CANCELLED', ':pending': 'PENDING_PAYMENT', ':r': reason.slice(0, 300), ':now': now },
          },
        },
        {
          Update: {
            TableName: this.db.tableName,
            Key: { PK: listingKey.PK, SK: listingKey.SK },
            UpdateExpression: 'SET #s = :active, GSI1PK = :gsi1pk, updatedAt = :now',
            ConditionExpression: '#s = :sold',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':active': 'ACTIVE', ':sold': 'SOLD', ':gsi1pk': Gsi.listingFeed('ACTIVE').GSI1PK, ':now': now },
          },
        },
        {
          Update: {
            TableName: this.db.tableName,
            Key: { PK: sellerKey.PK, SK: sellerKey.SK },
            UpdateExpression: 'SET listingsActiveCount = if_not_exists(listingsActiveCount, :zero) + :one, updatedAt = :now',
            ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':now': now },
          },
        },
        ...(order.couponCode ? [
          {
            Delete: {
              TableName: this.db.tableName,
              Key: Keys.couponRedemption(order.couponCode, order.buyerId),
            },
          },
          {
            Update: {
              TableName: this.db.tableName,
              Key: Keys.coupon(order.couponCode),
              UpdateExpression: 'SET redemptionCount = redemptionCount - :one',
              ConditionExpression: 'redemptionCount > :zero',
              ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
            },
          },
        ] : []),
      ]);
    } catch (err) {
      this.logger.error(`Could not cancel unpaid order ${orderId} (${reason})`, err);
      return false;
    }
    this.logger.log(`Order ${orderId} cancelled, listing ${order.listingId} back on sale — ${reason}`);
    return true;
  }

  /**
   * Hourly sweep of orders nobody paid: card orders after 30 minutes, PIX
   * orders once the 24h QR code has expired. Pagar.me is asked first, so a
   * payment whose webhook got lost is marked PAID instead of cancelled.
   */
  async expireUnpaidOrders(): Promise<void> {
    const pending = await this.db.scanAll<OrderRecord & { pagarmeOrderId?: string; paymentMethod?: string }>({
      FilterExpression: 'entityType = :o AND #s = :pending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':o': 'Order', ':pending': 'PENDING_PAYMENT' },
    });
    const nowMs = Date.now();
    let cancelled = 0;

    for (const order of pending) {
      const ageMin = (nowMs - new Date(order.createdAt).getTime()) / 60_000;
      const limitMin = order.paymentMethod === 'CREDIT_CARD' ? 30 : 26 * 60;
      if (ageMin < limitMin) continue;

      if (order.pagarmeOrderId) {
        try {
          const remote = await this.pagarme.getOrder(order.pagarmeOrderId);
          if (remote.status === 'paid') {
            await this.markPaid(order.orderId);
            continue;
          }
        } catch (err) {
          // Unknown remote state: never cancel something that might be paid.
          this.logger.warn(`Skipping expiry of ${order.orderId}: Pagar.me lookup failed`, err);
          continue;
        }
      }
      if (await this.cancelUnpaidOrder(order.orderId, `unpaid after ${Math.round(ageMin)} min`)) cancelled++;
    }
    if (cancelled > 0) this.logger.log(`Expired ${cancelled} unpaid order(s)`);
  }

  /**
   * The two recipients a charge is split between, or null when there is no
   * usable split.
   *
   * In sandbox the split is dropped (with a warning) when Arena's recipient is
   * missing, unknown to Pagar.me, or the same as the seller's — otherwise
   * every test payment fails on "Recipient not found" and nothing else can be
   * tested. In production the split is never dropped: the money must be shared
   * correctly, so a broken setup has to fail loudly instead.
   */
  private async splitRecipients(sellerRecipientId?: string): Promise<{ arena: string; seller: string } | null> {
    const arena = this.config.get('pagarme.arenaRecipientId', { infer: true });
    if (!arena || !sellerRecipientId) return null;

    const sandbox = !!this.config.get('pagarme.apiKey', { infer: true })?.startsWith('sk_test_');
    if (!sandbox) return { arena, seller: sellerRecipientId };

    if (arena === sellerRecipientId) {
      this.logger.warn('Sandbox: Arena and seller share a recipient — charging without split');
      return null;
    }
    // Checked once per process; a sandbox account rarely changes mid-run.
    this.arenaRecipientOk ??= this.pagarme.recipientExists(arena)
      .then((r) => r.exists)
      .catch(() => true);
    if (!(await this.arenaRecipientOk)) {
      this.logger.warn(`Sandbox: Arena recipient ${arena} does not exist in Pagar.me — charging without split`);
      return null;
    }
    return { arena, seller: sellerRecipientId };
  }

  /** Admin: recipients in the Pagar.me account, to pick the right split IDs. */
  async listRecipients(): Promise<unknown> {
    const configured = this.config.get('pagarme.arenaRecipientId', { infer: true });
    const recipients = await this.pagarme.listRecipients();
    return {
      configuredArenaRecipientId: configured,
      configuredExists: recipients.some((r) => r.id === configured),
      recipients,
    };
  }

  /** Admin diagnostics: Pagar.me's view of an order's charges, decline reasons only. */
  async diagnosePagarmeOrder(orderId: string): Promise<unknown> {
    const orderKey = Keys.order(orderId);
    const order = await this.db.get<OrderRecord & { pagarmeOrderId?: string }>(orderKey.PK, orderKey.SK);
    if (!order?.pagarmeOrderId) throw new NotFoundException('Order has no Pagar.me order');
    const remote = await this.pagarme.getOrder(order.pagarmeOrderId);
    const sellerKey = Keys.user(order.sellerId);
    const seller = await this.db.get<{ pagarmeRecipientId?: string }>(sellerKey.PK, sellerKey.SK);
    const arenaId = this.config.get('pagarme.arenaRecipientId', { infer: true });
    const check = async (id?: string) => (id ? { idSuffix: id.slice(-6), ...(await this.pagarme.recipientExists(id)) } : null);
    return {
      orderId,
      recipients: { arena: await check(arenaId), seller: await check(seller?.pagarmeRecipientId) },
      localStatus: order.status,
      pagarmeStatus: remote.status,
      charges: (remote.charges ?? []).map((c) => ({
        id: c.id,
        status: c.status,
        transactionStatus: c.last_transaction?.status,
        reason: describeDecline(c),
      })),
    };
  }

  /**
   * What the app needs to tokenize cards. The public key is only handed out
   * when it matches the secret key's mode — a live token cannot be charged
   * with a test secret key (or vice versa), and the app then falls back to
   * sending the card to this server as before.
   */
  getPaymentConfig(): PaymentConfig {
    // Trimmed: a stray space or newline pasted into the dashboard must not
    // silently break the mode check.
    const publicKey = this.config.get('pagarme.publicKey', { infer: true })?.trim();
    const secretKey = this.config.get('pagarme.apiKey', { infer: true })?.trim();
    if (!publicKey) return { cardTokenizationKey: null, status: 'missing_public_key' };
    if (!secretKey) return { cardTokenizationKey: null, status: 'missing_secret_key' };

    // Only the modes are reported — never any part of either key.
    const publicMode = publicKey.startsWith('pk_test_') ? 'test' : 'live';
    const secretMode = secretKey.startsWith('sk_test_') ? 'test' : 'live';
    if (publicMode !== secretMode) {
      this.logger.error(
        `PAGARME_PUBLIC_KEY is a ${publicMode} key but PAGARME_API_KEY is ${secretMode} — card tokenization disabled`,
      );
      return { cardTokenizationKey: null, status: 'mode_mismatch', publicKeyMode: publicMode, secretKeyMode: secretMode };
    }
    return { cardTokenizationKey: publicKey, status: 'ok', publicKeyMode: publicMode, secretKeyMode: secretMode };
  }

  /** Forget the saved card: removed from Pagar.me's vault and from the account. */
  async removeSavedCard(userId: string): Promise<void> {
    const key  = Keys.user(userId);
    const user = await this.db.get<UserRecord>(key.PK, key.SK);
    if (!user?.savedCard) return;
    if (user.pagarmeCustomerId) {
      await this.pagarme.deleteCustomerCard(user.pagarmeCustomerId, user.savedCard.cardId)
        .catch((err) => this.logger.warn(`Pagar.me card delete failed for ${userId}`, err));
    }
    await this.db.update({
      Key: { PK: key.PK, SK: key.SK },
      UpdateExpression: 'REMOVE savedCard SET updatedAt = :now',
      ExpressionAttributeValues: { ':now': new Date().toISOString() },
    });
  }

  // ── Poll payment status ───────────────────────────────────────────────────

  async getPaymentStatus(
    userId: string,
    orderId: string,
  ): Promise<PaymentStatusResult> {
    const orderKey = Keys.order(orderId);
    const order = await this.db.get<OrderRecord & {
      pagarmeOrderId?: string;
    }>(orderKey.PK, orderKey.SK);

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not your order');
    }

    let pagarmeStatus: string | null = null;

    // If there's a Pagar.me order and our local status is still PENDING_PAYMENT,
    // sync with Pagar.me to catch payments that came in without a webhook.
    if (order.pagarmeOrderId && order.status === 'PENDING_PAYMENT') {
      try {
        const remote = await this.pagarme.getOrder(order.pagarmeOrderId);
        pagarmeStatus = remote.status;

        if (remote.status === 'paid') {
          await this.markPaid(orderId);
          return { orderId, status: 'PAID', pagarmeStatus };
        }
      } catch (err) {
        this.logger.warn(`Pagar.me poll failed for order ${orderId}:`, err);
      }
    }

    return { orderId, status: order.status, pagarmeStatus };
  }

  // ── Webhook handler ───────────────────────────────────────────────────────

  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    if (!this.pagarme.validateWebhookSignature(rawBody, signature)) {
      this.logger.warn('Webhook signature validation failed');
      return;
    }

    let event: { type: string; data: { id: string; order?: { code: string } } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      this.logger.warn('Webhook body is not valid JSON');
      return;
    }

    this.logger.log(`Webhook received: ${event.type}`);

    if (event.type === 'charge.paid') {
      // event.data.order.code = "ARENA-{orderId}"
      const orderCode = event.data.order?.code ?? '';
      const orderId = orderCode.replace('ARENA-', '');
      if (orderId) {
        await this.markPaid(orderId).catch((err) =>
          this.logger.error(`markPaid failed for ${orderId}:`, err),
        );
      }
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async markPaid(orderId: string): Promise<void> {
    const orderKey = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(orderKey.PK, orderKey.SK);
    if (!order || order.status !== 'PENDING_PAYMENT') return;

    const now = new Date().toISOString();
    // Escrow auto-releases 7 days after payment
    const escrowReleaseAt = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();

    await this.db.update({
      Key: { PK: orderKey.PK, SK: orderKey.SK },
      UpdateExpression: 'SET #s = :paid, escrowReleaseAt = :era, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':paid': 'PAID',
        ':era':  escrowReleaseAt,
        ':now':  now,
      },
    });

    this.logger.log(`Order ${orderId} marked PAID, escrow releases at ${escrowReleaseAt}`);

    // Async: notifications, fiscal invoices, shipping label
    void this.notifyPaid(order);
    void this.fiscal.emitCommissionNfse(order);
    void this.fiscal.emitMpcNfe(order);
    if (order.deliveryMethod === 'CORREIOS' && order.buyerCep) {
      void this.purchaseLabelAsync(order);
    }
  }

  private async notifyPaid(order: OrderRecord): Promise<void> {
    const seller = await this.users.findById(order.sellerId).catch(() => null);
    const shortId = order.orderId.slice(-8).toUpperCase();
    await this.notifications.send(
      seller?.expoPushToken,
      '🛒 Novo pedido pago!',
      `${order.buyerName} comprou ${order.teamName}. Pedido #${shortId}`,
      { orderId: order.orderId, screen: 'OrderDetail' },
    );
    const paidMail = orderPaidSellerEmail(this.emailData(order));
    void this.email.send(seller?.email, paidMail.subject, paidMail.html);

    // Buyer confirmation: a receipt, and the fastest way for an account owner
    // to spot a purchase they did not make.
    const buyer = await this.users.findById(order.buyerId).catch(() => null);
    const buyerMail = orderPaidBuyerEmail(this.emailData(order));
    void this.email.send(buyer?.email, buyerMail.subject, buyerMail.html);
  }

  private async purchaseLabelAsync(order: OrderRecord): Promise<void> {
    try {
      const [seller, buyer] = await Promise.all([
        this.users.findById(order.sellerId).catch(() => null),
        this.users.findById(order.buyerId).catch(() => null),
      ]);

      // Melhor Envio refuses a label without a complete address on both sides.
      // Stop with the exact reason instead of making a call that cannot succeed —
      // incomplete addresses are why no label had ever been generated.
      const missing = (fields: Record<string, string | undefined>) =>
        Object.entries(fields).filter(([, v]) => !v?.trim()).map(([k]) => k);
      const sellerMissing = missing({
        CEP: seller?.sellerCep, rua: seller?.sellerRua, numero: seller?.sellerNumero,
        bairro: seller?.sellerBairro, cidade: seller?.sellerCidade, UF: seller?.sellerEstado,
      });
      const buyerMissing = missing({
        CEP: order.buyerCep, rua: order.buyerRua, numero: order.buyerNumero,
        bairro: order.buyerBairro, cidade: order.buyerCidade, UF: order.buyerEstado,
      });
      if (!seller || sellerMissing.length || buyerMissing.length) {
        this.logger.error(
          `Label NOT purchased for order ${order.orderId} — incomplete address. ` +
          `Seller missing: [${sellerMissing.join(', ') || 'none'}]; ` +
          `buyer missing: [${buyerMissing.join(', ') || 'none'}]`,
        );
        return;
      }

      // Get listing for weight info
      const listingKey = Keys.listing(order.listingId);
      const listing = await this.db.get<{ weightGrams?: number }>(listingKey.PK, listingKey.SK);

      // Use the service ID the buyer selected at checkout; fall back to PAC (1)
      const serviceId = order.shippingServiceId ?? 1;

      const result = await this.shipping.purchaseLabel({
        orderId: order.orderId,
        from: {
          name:       order.sellerName,
          phone:      seller.phoneE164 ?? seller.contactPhone,
          email:      seller.email,
          document:   seller.cpf,
          postalCode: seller.sellerCep!,
          address:    seller.sellerRua!,
          number:     seller.sellerNumero!,
          complement: seller.sellerComplemento,
          district:   seller.sellerBairro!,
          city:       seller.sellerCidade!,
          stateAbbr:  seller.sellerEstado!,
        },
        to: {
          name:       order.buyerName,
          phone:      buyer?.phoneE164 ?? buyer?.contactPhone,
          email:      buyer?.email,
          document:   buyer?.cpf,
          postalCode: order.buyerCep!,
          address:    order.buyerRua!,
          number:     order.buyerNumero!,
          complement: order.buyerComplemento,
          district:   order.buyerBairro!,
          city:       order.buyerCidade!,
          stateAbbr:  order.buyerEstado!,
        },
        serviceId,
        weightGrams:  listing?.weightGrams ?? 300,
        productName:  `${order.teamName} ${order.season ?? ''}`.trim(),
        productValue: order.priceCents / 100,
      });

      if (result) {
        // Calculate spread: buyer paid shipping − actual Melhor Envio cost
        const spreadCents = Math.max(0, order.shippingCents - result.actualCostCents);

        // Record spread → determine beneficiary (developer vs Arena)
        const spreadResult = spreadCents > 0
          ? await this.devEarnings.recordSpread(spreadCents)
          : { beneficiary: 'ARENA' as const, developerGets: 0, arenaGets: 0 };

        const orderKey = Keys.order(order.orderId);
        await this.db.update({
          Key: { PK: orderKey.PK, SK: orderKey.SK },
          UpdateExpression: [
            'SET melhorEnvioOrderId = :m',
            'shippingLabelUrl = :l',
            'shippingTrackingCode = :t',
            'shippingCarrier = :c',
            'shippingService = :s',
            'shippingActualCostCents = :actual',
            'shippingSpreadCents = :spread',
            'spreadBeneficiary = :beneficiary',
            '#st = :shipped',
            'updatedAt = :now',
          ].join(', '),
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':m':           result.melhorEnvioOrderId,
            ':l':           result.labelUrl,
            ':t':           result.trackingCode,
            ':c':           result.carrier,
            ':s':           result.service,
            ':actual':      result.actualCostCents,
            ':spread':      spreadCents,
            ':beneficiary': spreadResult.beneficiary,
            ':shipped':     'SHIPPED',
            ':now':         new Date().toISOString(),
          },
        });

        this.logger.log(
          `Order ${order.orderId} shipped. Tracking: ${result.trackingCode}. ` +
          `Spread: R$${(spreadCents / 100).toFixed(2)} → ${spreadResult.beneficiary} ` +
          `(developer: R$${(spreadResult.developerGets / 100).toFixed(2)}, arena: R$${(spreadResult.arenaGets / 100).toFixed(2)})`
        );

        // Notify buyer that item was shipped
        void this.notifications.send(
          buyer?.expoPushToken,
          '📦 Seu pedido foi enviado!',
          `${order.teamName} está a caminho. Rastreio: ${result.trackingCode}`,
          { orderId: order.orderId, screen: 'OrderDetail' },
        );

        const shipData: OrderEmailData = {
          ...this.emailData(order),
          tracking: result.trackingCode,
          labelUrl: result.labelUrl,
        };
        const shippedMail = orderShippedBuyerEmail(shipData);
        void this.email.send(buyer?.email, shippedMail.subject, shippedMail.html);

        // The Correios label is bought automatically but was only reachable
        // inside the app — send it to the seller so they can just print it.
        const labelMail = shippingLabelEmail(shipData);
        void this.email.send(seller.email, labelMail.subject, labelMail.html);
      }
    } catch (err) {
      this.logger.error(`Label purchase failed for order ${order.orderId}`, err);
    }
  }
}
