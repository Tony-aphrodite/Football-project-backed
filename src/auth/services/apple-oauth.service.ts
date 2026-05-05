import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify, type JwtHeader, type SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

import type { AppConfig } from '../../config/configuration';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';

export interface VerifiedAppleIdentity {
  sub: string;
  email?: string;
  emailVerified: boolean;
}

interface AppleIdTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  email?: string;
  email_verified?: boolean | 'true' | 'false';
  is_private_email?: boolean | 'true' | 'false';
}

/**
 * Verifies the identity token issued by "Sign in with Apple". Apple does not
 * expose a JS SDK for verification — we fetch the rotating JWKS, look up the
 * key matching the token's `kid` header, and verify the RS256 signature
 * ourselves.
 */
@Injectable()
export class AppleOAuthService {
  private readonly logger = new Logger(AppleOAuthService.name);
  private readonly jwks = jwksClient({
    jwksUri: APPLE_JWKS_URI,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 24 * 60 * 60 * 1000,
    rateLimit: true,
  });

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async verifyIdToken(idToken: string): Promise<VerifiedAppleIdentity> {
    const audience = this.config.get('apple.bundleId', { infer: true });
    if (!audience) {
      throw new UnauthorizedException('Apple bundle id is not configured');
    }

    const claims = await this.verify(idToken, audience);

    return {
      sub: claims.sub,
      email: claims.email,
      // Apple sometimes ships these as strings instead of booleans.
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    };
  }

  private verify(idToken: string, audience: string): Promise<AppleIdTokenClaims> {
    return new Promise((resolve, reject) => {
      const getKey = (header: JwtHeader, cb: SigningKeyCallback) => {
        if (!header.kid) return cb(new Error('Apple ID token missing kid header'));
        this.jwks.getSigningKey(header.kid, (err, key) => {
          if (err || !key) return cb(err ?? new Error('Apple JWKS lookup failed'));
          cb(null, key.getPublicKey());
        });
      };

      verify(
        idToken,
        getKey,
        { algorithms: ['RS256'], audience, issuer: APPLE_ISSUER },
        (err, decoded) => {
          if (err) {
            this.logger.warn(`Apple token verification failed: ${err.message}`);
            return reject(new UnauthorizedException('Invalid Apple credential'));
          }
          if (!decoded || typeof decoded === 'string' || !decoded.sub) {
            return reject(new UnauthorizedException('Apple credential missing subject'));
          }
          resolve(decoded as unknown as AppleIdTokenClaims);
        },
      );
    });
  }
}
