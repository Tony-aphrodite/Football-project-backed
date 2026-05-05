import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';

import type { AppConfig } from '../../config/configuration';

// Development-mode bypass: any 6-digit code is accepted without Twilio.
const DEV_BYPASS_CODE = '123456';

@Injectable()
export class TwilioVerifyService {
  private readonly logger = new Logger(TwilioVerifyService.name);
  private readonly client?: Twilio;
  private readonly serviceSid?: string;
  private readonly isDev: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    this.isDev = config.get('env', { infer: true }) === 'development';

    const t = config.get('twilio', { infer: true });
    if (t.accountSid && t.authToken && t.verifyServiceSid) {
      this.client = twilio(t.accountSid, t.authToken);
      this.serviceSid = t.verifyServiceSid;
      this.logger.log('Twilio Verify configured.');
    } else {
      if (this.isDev) {
        this.logger.warn(
          `Twilio not configured — running in DEV bypass mode. ` +
          `Any phone number is accepted; use code "${DEV_BYPASS_CODE}" to verify.`,
        );
      } else {
        this.logger.warn(
          'Twilio Verify is not configured. Phone OTP endpoints will return 503.',
        );
      }
    }
  }

  /** Sends a 6-digit SMS OTP. In dev-bypass mode, just logs instead. */
  async startVerification(phoneE164: string): Promise<void> {
    if (this.isDev && !this.client) {
      this.logger.debug(
        `[DEV] Skipping SMS to ${phoneE164}. Use code "${DEV_BYPASS_CODE}" to verify.`,
      );
      return;
    }
    this.assertReady();
    try {
      await this.client!.verify.v2
        .services(this.serviceSid!)
        .verifications.create({ to: phoneE164, channel: 'sms' });
    } catch (err) {
      this.logger.warn(`Twilio start verification failed: ${(err as Error).message}`);
      throw new BadRequestException('Could not start phone verification');
    }
  }

  /** Checks the OTP. In dev-bypass mode, accepts DEV_BYPASS_CODE for any number. */
  async checkCode(phoneE164: string, code: string): Promise<boolean> {
    if (this.isDev && !this.client) {
      const ok = code === DEV_BYPASS_CODE;
      this.logger.debug(
        `[DEV] Code check for ${phoneE164}: "${code}" → ${ok ? 'APPROVED' : 'REJECTED'}`,
      );
      return ok;
    }
    this.assertReady();
    try {
      const check = await this.client!.verify.v2
        .services(this.serviceSid!)
        .verificationChecks.create({ to: phoneE164, code });
      return check.status === 'approved';
    } catch (err) {
      this.logger.warn(`Twilio code check failed: ${(err as Error).message}`);
      throw new BadRequestException('Could not verify code');
    }
  }

  private assertReady(): void {
    if (!this.client || !this.serviceSid) {
      throw new ServiceUnavailableException('Twilio Verify is not configured');
    }
  }
}
