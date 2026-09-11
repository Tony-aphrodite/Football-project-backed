import { Injectable, Logger } from '@nestjs/common';
import { JWT } from 'google-auth-library';

/**
 * Push notifications, sent straight to Firebase Cloud Messaging.
 *
 * FCM is the only delivery channel to an Android device, so a Google service
 * account is unavoidable — but we hold it ourselves rather than uploading it
 * to Expo's relay. One less intermediary, and nothing tied to a personal Expo
 * account at handover.
 *
 * Configure FCM_SERVICE_ACCOUNT_JSON on Railway with the service account key
 * downloaded from Firebase → Project Settings → Service Accounts.
 *
 * Sending never throws: a notification failing must not roll back an order.
 * Failures log as errors so they are visible instead of vanishing.
 */

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface ServiceAccount {
  project_id:   string;
  client_email: string;
  private_key:  string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private account: ServiceAccount | null = null;
  private jwt: JWT | null = null;
  private parsed = false;

  /** Parse the service account once; invalid JSON disables push rather than crashing boot. */
  private get serviceAccount(): ServiceAccount | null {
    if (this.parsed) return this.account;
    this.parsed = true;

    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
    if (!raw) {
      this.logger.warn('FCM_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
      return null;
    }
    try {
      // Accept both raw JSON and base64, since multi-line keys are awkward to
      // paste into a dashboard env var.
      const text = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const sa = JSON.parse(text) as ServiceAccount;
      if (!sa.project_id || !sa.client_email || !sa.private_key) {
        this.logger.error('FCM_SERVICE_ACCOUNT_JSON is missing project_id/client_email/private_key');
        return null;
      }
      // Env vars often arrive with literal \n rather than real newlines.
      sa.private_key = sa.private_key.replace(/\\n/g, '\n');
      this.account = sa;
      this.logger.log(`FCM configured for project ${sa.project_id}`);
    } catch (err) {
      this.logger.error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON', err);
    }
    return this.account;
  }

  get isEnabled(): boolean { return this.serviceAccount !== null; }
  get projectId(): string | null { return this.serviceAccount?.project_id ?? null; }

  /** OAuth2 access token for FCM. google-auth-library caches and refreshes it. */
  private async accessToken(): Promise<string | null> {
    const sa = this.serviceAccount;
    if (!sa) return null;

    this.jwt ??= new JWT({
      email:  sa.client_email,
      key:    sa.private_key,
      scopes: [SCOPE],
    });

    try {
      const { token } = await this.jwt.getAccessToken();
      return token ?? null;
    } catch (err) {
      this.logger.error('Could not obtain an FCM access token', err);
      return null;
    }
  }

  /**
   * Send to one device token. `token` is a raw FCM registration token from
   * expo-notifications' getDevicePushTokenAsync — not an ExponentPushToken.
   */
  async send(
    token: string | undefined,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (!token) return;

    const sa = this.serviceAccount;
    if (!sa) return;

    const accessToken = await this.accessToken();
    if (!accessToken) return;

    // FCM requires every data value to be a string.
    const stringData = Object.fromEntries(
      Object.entries(data ?? {}).map(([k, v]) => [k, String(v)]),
    );

    try {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
        {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: stringData,
              android: {
                priority: 'HIGH',
                notification: { sound: 'default', channelId: 'default' },
              },
            },
          }),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        // UNREGISTERED/INVALID_ARGUMENT means the app was uninstalled or the
        // token rotated — expected over time, not worth an error-level log.
        const stale = res.status === 404 || text.includes('UNREGISTERED');
        const line  = `FCM push failed ${res.status}: ${text.slice(0, 300)}`;
        if (stale) this.logger.warn(`${line} (stale token)`);
        else       this.logger.error(line);
      }
    } catch (err) {
      this.logger.error('FCM push error', err);
    }
  }

  async sendMany(
    tokens: (string | undefined)[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await Promise.all(tokens.map((t) => this.send(t, title, body, data)));
  }
}
