import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';

import type { UserRecord } from '../users/entities/user.entity';

/**
 * Re-authentication for sensitive changes (e-mail, bank account): a stolen
 * unlocked phone must not be enough. Asks for whatever the account has — the
 * password, the 2FA code, or both. Google/Apple accounts without 2FA have
 * neither; for those the session plus the follow-up notice e-mail is the check.
 *
 * Uses the same otplib singleton as TotpService, which widens its window to ±30s.
 */
export async function assertReauthenticated(
  user: UserRecord,
  input: { password?: string; totpCode?: string },
): Promise<void> {
  if (user.passwordHash) {
    if (!input.password || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Senha incorreta.');
    }
  }
  if (user.totpEnabled && user.totpSecret) {
    if (!input.totpCode || !authenticator.verify({ token: input.totpCode, secret: user.totpSecret })) {
      throw new UnauthorizedException('Código de autenticação (2FA) inválido.');
    }
  }
}
