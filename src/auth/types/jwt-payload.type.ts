/**
 * Payload baked into the access token. Keep this minimal — anything the API
 * consumer needs beyond identity should be looked up fresh on each request.
 */
export interface JwtPayload {
  sub: string;          // userId (ULID)
  phoneVerified: boolean;
  cpfVerified: boolean;
  lgpdAccepted: boolean;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;          // refresh-token id, used for rotation/denylist
}
