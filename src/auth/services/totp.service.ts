import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

import { DynamoDbService } from '../../dynamodb/dynamodb.service';
import { Keys } from '../../dynamodb/keys';
import type { UserRecord } from '../../users/entities/user.entity';

@Injectable()
export class TotpService {
  constructor(private readonly db: DynamoDbService) {}

  async setup(userId: string): Promise<{ qrCodeDataUrl: string; secret: string }> {
    const k    = Keys.user(userId);
    const user = await this.db.get<UserRecord>(k.PK, k.SK);
    if (!user) throw new NotFoundException('User not found');
    if (user.totpEnabled) throw new BadRequestException('2FA já está ativo');

    const secret      = authenticator.generateSecret();
    const label       = user.email ?? user.displayName;
    const otpauthUrl  = authenticator.keyuri(label, 'Arena dos Mantos', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 280 });

    await this.db.update({
      Key: { PK: k.PK, SK: k.SK },
      UpdateExpression: 'SET totpPendingSecret = :s, updatedAt = :now',
      ExpressionAttributeValues: { ':s': secret, ':now': new Date().toISOString() },
    });

    return { qrCodeDataUrl, secret };
  }

  async activate(userId: string, code: string): Promise<void> {
    const k    = Keys.user(userId);
    const user = await this.db.get<UserRecord>(k.PK, k.SK);
    if (!user) throw new NotFoundException('User not found');
    if (user.totpEnabled) throw new BadRequestException('2FA já está ativo');
    if (!user.totpPendingSecret) throw new BadRequestException('Execute o setup primeiro');

    if (!authenticator.verify({ token: code, secret: user.totpPendingSecret })) {
      throw new UnauthorizedException('Código inválido. Verifique o app e tente novamente.');
    }

    await this.db.update({
      Key: { PK: k.PK, SK: k.SK },
      UpdateExpression:
        'SET totpEnabled = :t, totpSecret = :s, updatedAt = :now REMOVE totpPendingSecret',
      ExpressionAttributeValues: {
        ':t':   true,
        ':s':   user.totpPendingSecret,
        ':now': new Date().toISOString(),
      },
    });
  }

  async disable(userId: string, code: string): Promise<void> {
    const k    = Keys.user(userId);
    const user = await this.db.get<UserRecord>(k.PK, k.SK);
    if (!user) throw new NotFoundException('User not found');
    if (!user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('2FA não está ativo');
    }

    if (!authenticator.verify({ token: code, secret: user.totpSecret })) {
      throw new UnauthorizedException('Código inválido');
    }

    await this.db.update({
      Key: { PK: k.PK, SK: k.SK },
      UpdateExpression: 'SET totpEnabled = :f, updatedAt = :now REMOVE totpSecret',
      ExpressionAttributeValues: { ':f': false, ':now': new Date().toISOString() },
    });
  }

  verify(secret: string, code: string): boolean {
    return authenticator.verify({ token: code, secret });
  }
}
