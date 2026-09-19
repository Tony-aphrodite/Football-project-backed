import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';

import type { UserRecord } from '../users/entities/user.entity';

/**
 * Re-authentication for sensitive changes (e-mail, bank account): a stolen
 * unlocked phone must not be enough. Asks for whatever the account has — the
 * password, the 2FA code, or both. Google/Apple accounts without 2FA have
 * neither; for those the session plus the follow-up notice e-mail is the check.
 *
 * 403, not 401: the session is fine, only this confirmation failed — a 401
 * makes the app refresh its session and silently resend the request.
 *
 * Uses the same otplib singleton as TotpService, which widens its window to ±30s.
 */
export async function assertReauthenticated(
  user: UserRecord,
  input: { password?: string; totpCode?: string },
): Promise<void> {
  if (user.passwordHash) {
    if (!input.password || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new ForbiddenException('Senha incorreta.');
    }
  }
  if (user.totpEnabled && user.totpSecret) {
    if (!input.totpCode || !authenticator.verify({ token: input.totpCode, secret: user.totpSecret })) {
      throw new ForbiddenException('Código de autenticação (2FA) inválido.');
    }
  }
}
