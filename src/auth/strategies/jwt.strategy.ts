import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AppConfig } from '../../config/configuration';
import type { JwtPayload } from '../types/jwt-payload.type';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt.accessSecret', { infer: true }),
    });
  }

  /** userId → status, re-read at most once a minute. */
  private readonly statusCache = new Map<string, { status: string; at: number }>();

  /**
   * Passport calls this after verifying the signature and TTL. A suspended
   * account is refused here, so a ban takes effect within a minute instead of
   * lasting until the access token expires — nothing downstream checked it.
   * The status is cached per user to avoid a database read on every request.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const cached = this.statusCache.get(payload.sub);
    let status = cached && Date.now() - cached.at < 60_000 ? cached.status : undefined;
    if (!status) {
      const user = await this.users.findById(payload.sub).catch(() => undefined);
      // An unreadable status (DB hiccup) must not lock everyone out.
      status = user?.status ?? 'ACTIVE';
      this.statusCache.set(payload.sub, { status, at: Date.now() });
    }
    if (status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${status.toLowerCase()}`);
    }
    return payload;
  }
}
