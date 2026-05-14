import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Strongly-typed env contract validated at boot. Any missing or malformed
 * variable crashes the process before it begins serving traffic.
 */
class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  CORS_ORIGINS: string = '*';

  // ── JWT ────────────────────────────────────────────────────────────────────
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @Matches(/^\d+(s|m|h|d)$/)
  JWT_ACCESS_TTL: string = '15m';

  @IsString()
  @Matches(/^\d+(s|m|h|d)$/)
  JWT_REFRESH_TTL: string = '30d';

  // ── DynamoDB ───────────────────────────────────────────────────────────────
  @IsString()
  AWS_REGION!: string;

  @IsString()
  @IsOptional()
  AWS_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  AWS_SECRET_ACCESS_KEY?: string;

  @IsString()
  DYNAMODB_TABLE_NAME!: string;

  @IsString()
  @IsOptional()
  DYNAMODB_ENDPOINT?: string;

  // ── Google OAuth ───────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID_ANDROID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID_IOS?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID_WEB?: string;

  // ── Apple Sign In ──────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  APPLE_BUNDLE_ID?: string;

  @IsString()
  @IsOptional()
  APPLE_TEAM_ID?: string;

  @IsString()
  @IsOptional()
  APPLE_KEY_ID?: string;

  @IsString()
  @IsOptional()
  APPLE_PRIVATE_KEY?: string;

  // ── Twilio Verify ──────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  TWILIO_ACCOUNT_SID?: string;

  @IsString()
  @IsOptional()
  TWILIO_AUTH_TOKEN?: string;

  @IsString()
  @IsOptional()
  TWILIO_VERIFY_SERVICE_SID?: string;

  // ── LGPD ───────────────────────────────────────────────────────────────────
  @IsString()
  @MaxLength(64)
  LGPD_CONSENT_VERSION: string = '2026-04-29';

  @IsString()
  LGPD_PRIVACY_POLICY_URL!: string;

  // ── Cloudflare R2 ──────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  R2_ACCOUNT_ID?: string;

  @IsString()
  @IsOptional()
  R2_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  R2_SECRET_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  R2_BUCKET_NAME?: string;

  @IsString()
  @IsOptional()
  R2_PUBLIC_URL?: string;

  // ── Pagar.me ───────────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  PAGARME_API_KEY?: string;

  @IsString()
  @IsOptional()
  PAGARME_WEBHOOK_SECRET?: string;

  // ── Algolia ────────────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  ALGOLIA_APP_ID?: string;

  @IsString()
  @IsOptional()
  ALGOLIA_ADMIN_API_KEY?: string;

  @IsString()
  @IsOptional()
  ALGOLIA_SEARCH_API_KEY?: string;

  @IsString()
  @IsOptional()
  ALGOLIA_INDEX_NAME?: string;

  // ── Google Custom Search (SKU verification) ────────────────────────────────
  @IsString()
  @IsOptional()
  GOOGLE_SEARCH_API_KEY?: string;

  @IsString()
  @IsOptional()
  GOOGLE_SEARCH_CX?: string;

  // ── Melhor Envio ────────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  MELHOR_ENVIO_TOKEN?: string;

  @IsOptional()
  MELHOR_ENVIO_SANDBOX: boolean = true;
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const instance = plainToInstance(EnvVars, raw, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(instance, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment variables:\n${errors
        .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
        .join('\n')}`,
    );
  }
  return instance;
}

/** Shape consumed by ConfigService.get() throughout the app. */
export interface AppConfig {
  env: NodeEnv;
  port: number;
  cors: { origins: string[] };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  dynamo: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    tableName: string;
    endpoint?: string;
  };
  google: {
    clientIdAndroid?: string;
    clientIdIos?: string;
    clientIdWeb?: string;
  };
  apple: {
    bundleId?: string;
    teamId?: string;
    keyId?: string;
    privateKey?: string;
  };
  twilio: {
    accountSid?: string;
    authToken?: string;
    verifyServiceSid?: string;
  };
  lgpd: {
    consentVersion: string;
    privacyPolicyUrl: string;
  };
  r2: {
    accountId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucketName?: string;
    publicUrl?: string;
  };
  pagarme: {
    apiKey?: string;
    webhookSecret?: string;
  };
  algolia: {
    appId?: string;
    adminApiKey?: string;
    searchApiKey?: string;
    indexName: string;
  };
  melhorEnvio: {
    token?: string;
    sandbox: boolean;
  };
  googleSearch: {
    apiKey?: string;
    cx?: string;
  };
}

export default (): AppConfig => {
  const env = process.env;
  return {
    env: (env.NODE_ENV as NodeEnv) ?? NodeEnv.Development,
    port: parseInt(env.PORT ?? '3000', 10),
    cors: {
      origins: (env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET!,
      refreshSecret: env.JWT_REFRESH_SECRET!,
      accessTtl: env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: env.JWT_REFRESH_TTL ?? '30d',
    },
    dynamo: {
      region: env.AWS_REGION!,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      tableName: env.DYNAMODB_TABLE_NAME!,
      endpoint: env.DYNAMODB_ENDPOINT || undefined,
    },
    google: {
      clientIdAndroid: env.GOOGLE_CLIENT_ID_ANDROID,
      clientIdIos: env.GOOGLE_CLIENT_ID_IOS,
      clientIdWeb: env.GOOGLE_CLIENT_ID_WEB,
    },
    apple: {
      bundleId: env.APPLE_BUNDLE_ID,
      teamId: env.APPLE_TEAM_ID,
      keyId: env.APPLE_KEY_ID,
      privateKey: env.APPLE_PRIVATE_KEY,
    },
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      verifyServiceSid: env.TWILIO_VERIFY_SERVICE_SID,
    },
    lgpd: {
      consentVersion: env.LGPD_CONSENT_VERSION ?? '2026-04-29',
      privacyPolicyUrl: env.LGPD_PRIVACY_POLICY_URL!,
    },
    r2: {
      accountId:       env.R2_ACCOUNT_ID,
      accessKeyId:     env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucketName:      env.R2_BUCKET_NAME,
      publicUrl:       env.R2_PUBLIC_URL || undefined,
    },
    pagarme: {
      apiKey:        env.PAGARME_API_KEY,
      webhookSecret: env.PAGARME_WEBHOOK_SECRET,
    },
    algolia: {
      appId:        env.ALGOLIA_APP_ID,
      adminApiKey:  env.ALGOLIA_ADMIN_API_KEY,
      searchApiKey: env.ALGOLIA_SEARCH_API_KEY,
      indexName:    env.ALGOLIA_INDEX_NAME ?? 'listings',
    },
    melhorEnvio: {
      token:   env.MELHOR_ENVIO_TOKEN,
      sandbox: env.MELHOR_ENVIO_SANDBOX !== 'false',
    },
    googleSearch: {
      apiKey: env.GOOGLE_SEARCH_API_KEY,
      cx:     env.GOOGLE_SEARCH_CX,
    },
  };
};
