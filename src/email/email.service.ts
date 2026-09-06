import { Injectable, Logger } from '@nestjs/common';

/**
 * Transactional email.
 *
 * Supports Resend (preferred) and Brevo, chosen by whichever API key is
 * present, so delivery keeps working while the account is migrated. Both are
 * plain REST calls — no SDK, nothing to keep in sync.
 *
 * Sending never throws: an email failing must not roll back an order or block
 * a signup. Failures are logged as errors so they are visible in Railway
 * rather than disappearing, which is how password-reset mail stayed broken
 * without anyone noticing.
 */

export interface SendResult {
  ok: boolean;
  provider: 'resend' | 'brevo' | 'none';
  error?: string;
}

const FROM_NAME  = 'Arena dos Mantos';
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'noreply@arenadosmantos.app.br';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private get resendKey(): string | undefined { return process.env.RESEND_API_KEY; }
  private get brevoKey():  string | undefined { return process.env.BREVO_API_KEY; }

  /** True when at least one provider is configured. */
  get isEnabled(): boolean {
    return Boolean(this.resendKey ?? this.brevoKey);
  }

  get provider(): 'resend' | 'brevo' | 'none' {
    if (this.resendKey) return 'resend';
    if (this.brevoKey)  return 'brevo';
    return 'none';
  }

  /**
   * Send one email. Resolves to a result rather than throwing so callers can
   * fire-and-forget with `void`.
   */
  async send(to: string | undefined, subject: string, html: string): Promise<SendResult> {
    if (!to) {
      this.logger.warn(`Email "${subject}" skipped — recipient has no address`);
      return { ok: false, provider: this.provider, error: 'no recipient' };
    }
    if (!this.isEnabled) {
      this.logger.error(
        `Email "${subject}" NOT SENT to ${to} — no RESEND_API_KEY or BREVO_API_KEY configured`,
      );
      return { ok: false, provider: 'none', error: 'not configured' };
    }

    try {
      const res = this.resendKey
        ? await this.sendViaResend(to, subject, html)
        : await this.sendViaBrevo(to, subject, html);

      if (res.ok) {
        this.logger.log(`Email "${subject}" sent to ${to} via ${this.provider}`);
        return { ok: true, provider: this.provider };
      }

      const body = await res.text();
      this.logger.error(
        `Email "${subject}" FAILED to ${to} via ${this.provider} — ${res.status}: ${body}`,
      );
      return { ok: false, provider: this.provider, error: `${res.status}: ${body}` };
    } catch (err) {
      this.logger.error(`Email "${subject}" FAILED to ${to} via ${this.provider}`, err);
      return { ok: false, provider: this.provider, error: String(err) };
    }
  }

  private sendViaResend(to: string, subject: string, html: string): Promise<Response> {
    return fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${this.resendKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to:   [to],
        subject,
        html,
      }),
    });
  }

  private sendViaBrevo(to: string, subject: string, html: string): Promise<Response> {
    return fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': this.brevoKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: FROM_NAME, email: FROM_EMAIL },
        to:          [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
  }
}
