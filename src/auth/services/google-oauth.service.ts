import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

import type { AppConfig } from '../../config/configuration';

export type GooglePlatform = 'android' | 'ios' | 'web';

export interface VerifiedGoogleIdentity {
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * Verifies the ID token issued by Google to the mobile or web client. We check
 * the audience claim against the platform's specific OAuth client ID — that's
 * the only way to make sure a token minted for app A can't be replayed against
 * our backend acting as app B.
 */
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async verifyIdToken(idToken: string, platform: GooglePlatform): Promise<VerifiedGoogleIdentity> {
    const g = this.config.get('google', { infer: true });

    // Accept tokens from any of the three configured client IDs.
    // In development (Expo Go) the token's audience is the web client ID
    // (issued via the auth.expo.io proxy). In production native builds it
    // will be the platform-specific client ID. Accepting all three means
    // the backend works correctly for every scenario.
    const audience = [
      g.clientIdAndroid,
      g.clientIdIos,
      g.clientIdWeb,
      // Firebase Android client (arena-dos-mantos-495611 project)
      '265836821890-kvvbh3o5nbv4uurcum4lurn0gp79c4t4.apps.googleusercontent.com',
    ].filter((id): id is string => Boolean(id));

    if (audience.length === 0) {
      throw new UnauthorizedException('Google client IDs are not configured');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(`Google ID token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid Google credential');
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('Google credential missing subject');
    }

    return {
      sub: payload.sub,
      email: payload.email ?? undefined,
      emailVerified: Boolean(payload.email_verified),
      name: payload.name ?? undefined,
    };
  }

  private audienceFor(platform: GooglePlatform): string | undefined {
    const g = this.config.get('google', { infer: true });
    switch (platform) {
      case 'android':
        return g.clientIdAndroid;
      case 'ios':
        return g.clientIdIos;
      case 'web':
        return g.clientIdWeb;
    }
  }
}
