import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShippingService } from '../shipping/shipping.service';

/**
 * Public health endpoint consumed by Railway's healthcheck (see railway.toml)
 * and any external monitoring. Skip throttling so the platform never gets
 * rate-limited probing us.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly email: EmailService,
    private readonly push: NotificationsService,
    private readonly shipping: ShippingService,
  ) {}

  @Get()
  ping(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Whether transactional email can actually be sent. Sending is deliberately
   * silent on failure — an email must never break an order — which once let
   * password-reset mail stay broken unnoticed. This makes the state checkable
   * without digging through logs. Never exposes the key itself.
   */
  @Get('email')
  emailStatus(): {
    configured: boolean;
    provider: string;
    fallbacks: string[];
    from: string;
    build: string;
  } {
    const order = this.email.configuredProviders;
    return {
      configured: this.email.isEnabled,
      provider:   this.email.provider,
      fallbacks:  order.slice(1),
      from:       process.env.EMAIL_FROM ?? 'noreply@arenadosmantos.app.br',
      // Lets us confirm which build is actually live, rather than assuming a
      // push to the deploy repo resulted in a deploy.
      build:      process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    };
  }

  /** Whether Melhor Envio labels can be bought. Never exposes the token. */
  @Get('shipping')
  shippingStatus(): Promise<unknown> {
    return this.shipping.health();
  }

  /** Whether push can actually be delivered. Never exposes the key. */
  @Get('push')
  pushStatus(): { configured: boolean; transport: string; projectId: string | null } {
    return {
      configured: this.push.isEnabled,
      transport:  'fcm-v1',
      projectId:  this.push.projectId,
    };
  }
}
