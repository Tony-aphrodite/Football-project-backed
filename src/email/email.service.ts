import { Injectable, Logger } from '@nestjs/common';

/**
 * Transactional email.
 *
 * Supports Brevo and Resend as plain REST calls — no SDK, nothing to keep in
 * sync. Brevo is used first unless EMAIL_PROVIDER says otherwise, and if the
 * first provider fails the other is tried automatically, so a misconfigured
 * key on one cannot take email down.
 *
 * Provider order used to be implicit — whichever key happened to exist, with
 * Resend winning. That silently moved sending onto a provider nobody had
 * verified. Order is explicit now, and the choice is visible at /health/email.
 *
 * Sending never throws: an email failing must not roll back an order or block
 * a signup. Failures are logged as errors so they are visible in Railway
 * rather than disappearing, which is how password-reset mail stayed broken
 * without anyone noticing.
 */

type Provider = 'brevo' | 'resend';

export interface SendResult {
  ok: boolean;
  provider: Provider | 'none';
  error?: string;
}

const FROM_NAME  = 'Arena dos Mantos';
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'noreply@arenadosmantos.app.br';
// Mail goes out from noreply@, which nobody reads. Replies are steered to the
// real inbox instead, so "responda este e-mail" is not a dead end.
const REPLY_TO   = process.env.EMAIL_REPLY_TO ?? 'contato@arenadosmantos.app.br';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private get resendKey(): string | undefined { return process.env.RESEND_API_KEY?.trim() || undefined; }
  private get brevoKey():  string | undefined { return process.env.BREVO_API_KEY?.trim()  || undefined; }

  /** Providers to try, in order. Brevo first unless EMAIL_PROVIDER overrides. */
  private get order(): Provider[] {
    const available: Provider[] = [];
    if (this.brevoKey)  available.push('brevo');
    if (this.resendKey) available.push('resend');

    const preferred = process.env.EMAIL_PROVIDER?.trim().toLowerCase() as Provider | undefined;
    if (preferred && available.includes(preferred)) {
      return [preferred, ...available.filter((p) => p !== preferred)];
    }
    return available;
  }

  get isEnabled(): boolean { return this.order.length > 0; }

  /** The provider that will be tried first. */
  get provider(): Provider | 'none' { return this.order[0] ?? 'none'; }

  /** Every configured provider, for diagnostics. */
  get configuredProviders(): Provider[] { return this.order; }

  /**
   * Send one email, falling back to the next provider if the first fails.
   * Resolves to a result rather than throwing so callers can fire-and-forget.
   */
  async send(to: string | undefined, subject: string, html: string): Promise<SendResult> {
    if (!to) {
      this.logger.warn(`Email "${subject}" skipped — recipient has no address`);
      return { ok: false, provider: this.provider, error: 'no recipient' };
    }

    const providers = this.order;
    if (providers.length === 0) {
      this.logger.error(
        `Email "${subject}" NOT SENT to ${to} — no BREVO_API_KEY or RESEND_API_KEY configured`,
      );
      return { ok: false, provider: 'none', error: 'not configured' };
    }

    let lastError = 'unknown';
    for (const provider of providers) {
      try {
        const res = provider === 'brevo'
          ? await this.sendViaBrevo(to, subject, html)
          : await this.sendViaResend(to, subject, html);

        if (res.ok) {
          this.logger.log(`Email "${subject}" sent to ${to} via ${provider}`);
          return { ok: true, provider };
        }

        lastError = `${res.status}: ${await res.text()}`;
        this.logger.error(`Email "${subject}" failed to ${to} via ${provider} — ${lastError}`);
      } catch (err) {
        lastError = String(err);
        this.logger.error(`Email "${subject}" failed to ${to} via ${provider}`, err);
      }
      // fall through and try the next provider
    }

    this.logger.error(
      `Email "${subject}" NOT DELIVERED to ${to} — all providers failed (${providers.join(', ')})`,
    );
    return { ok: false, provider: providers[0], error: lastError };
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
        reply_to: REPLY_TO,
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
        replyTo:     { name: FROM_NAME, email: REPLY_TO },
        to:          [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
  }
}
