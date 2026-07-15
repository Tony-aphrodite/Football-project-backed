import { Injectable, Logger } from '@nestjs/common';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoMessage {
  to:    string;
  title: string;
  body:  string;
  data?: Record<string, unknown>;
  sound?: 'default';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async send(token: string | undefined, title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    if (!token || !token.startsWith('ExponentPushToken[')) return;

    const message: ExpoMessage = { to: token, title, body, sound: 'default', data };

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body:    JSON.stringify(message),
      });
      if (!res.ok) this.logger.warn(`Expo push failed ${res.status}: ${await res.text()}`);
    } catch (err) {
      this.logger.error('Expo push error', err);
    }
  }

  async sendMany(tokens: (string | undefined)[], title: string, body: string, data?: Record<string, unknown>): Promise<void> {
    await Promise.all(tokens.map((t) => this.send(t, title, body, data)));
  }
}
