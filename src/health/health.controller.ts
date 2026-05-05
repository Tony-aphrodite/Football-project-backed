import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Public health endpoint consumed by Railway's healthcheck (see railway.toml)
 * and any external monitoring. Skip throttling so the platform never gets
 * rate-limited probing us.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  ping(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
