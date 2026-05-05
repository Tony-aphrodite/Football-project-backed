# Arena dos Mantos — Backend

NestJS API on Railway, backed by DynamoDB single-table.

## Local development

```bash
cp .env.example .env
# Generate JWT secrets:
openssl rand -hex 32   # paste into JWT_ACCESS_SECRET
openssl rand -hex 32   # paste into JWT_REFRESH_SECRET

npm install
npm run start:dev      # http://localhost:3000
curl http://localhost:3000/health
```

### Local DynamoDB

```bash
docker run -p 8000:8000 amazon/dynamodb-local
# In .env: DYNAMODB_ENDPOINT=http://localhost:8000
```

Create the table once with the layout described in `../docs/dynamodb-schema.md`:

```bash
aws dynamodb create-table --endpoint-url http://localhost:8000 \
  --table-name arena_dos_mantos \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S AttributeName=GSI1SK,AttributeType=S \
    AttributeName=GSI2PK,AttributeType=S AttributeName=GSI2SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    "IndexName=GSI1,KeySchema=[{AttributeName=GSI1PK,KeyType=HASH},{AttributeName=GSI1SK,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
    "IndexName=GSI2,KeySchema=[{AttributeName=GSI2PK,KeyType=HASH},{AttributeName=GSI2SK,KeyType=RANGE}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST
```

## Routes (Etapa 1)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | Railway healthcheck |
| GET | `/auth/lgpd/current` | public | Returns active LGPD version + privacy URL |
| POST | `/auth/google` | public | Verify Google ID token, issue session |
| POST | `/auth/apple` | public | Verify Apple identity token, issue session |
| POST | `/auth/phone/start` | bearer | Send SMS OTP via Twilio Verify |
| POST | `/auth/phone/verify` | bearer | Check OTP, attach phone to user |
| POST | `/auth/cpf/verify` | bearer | Validate mod-11, attach CPF to user |
| POST | `/auth/lgpd/consent` | bearer | Persist LGPD consent decision |
| POST | `/auth/refresh` | refresh-token in body | Rotate access/refresh pair |

## Source layout

```
src/
├── main.ts                       Bootstrap (helmet, CORS, validation, filters)
├── app.module.ts                 Root module + global throttler
├── config/configuration.ts       Typed env validation + ConfigService shape
├── common/
│   ├── filters/                  Global exception filter
│   ├── decorators/               @CurrentUser() — pulls JwtPayload off req
│   └── guards/                   JwtAuthGuard wraps Passport's 'jwt' strategy
├── health/                       /health endpoint
├── dynamodb/
│   ├── dynamodb.module.ts        DynamoDBDocumentClient provider
│   ├── dynamodb.service.ts       get / put / query / update / transactWrite
│   └── keys.ts                   PK/SK builders — ONLY place we mint key strings
├── users/
│   ├── users.service.ts          Profile + lookup-row management
│   └── entities/user.entity.ts   UserRecord shape and toPublic() projection
└── auth/
    ├── auth.controller.ts        REST endpoints (rate-limited)
    ├── auth.service.ts           Orchestration + JWT issuance
    ├── strategies/jwt.strategy.ts
    ├── services/
    │   ├── google-oauth.service.ts   ID token verification (per-platform aud)
    │   ├── apple-oauth.service.ts    JWKS-based RS256 verification
    │   ├── twilio-verify.service.ts  SMS OTP send & check
    │   └── cpf-validator.service.ts  Receita Federal mod-11
    └── dto/                          class-validator schemas for every endpoint
```

## Why these choices

- **DynamoDB Document client** with `removeUndefinedValues=true` so we can pass
  partial `UserRecord`s without manually pruning fields.
- **One secret per token type**. Refresh and access secrets are different so a
  refresh token leak cannot be replayed as an access token.
- **Lookup rows + transactional writes** make uniqueness enforcement the
  database's job, not the application's. No race window.
- **Per-route throttling** with stricter limits on `/auth/phone/*` because
  Twilio Verify costs money and abuse there hits the budget directly.
- **CPF on backend** even though the mobile already validates — never trust
  the client.

## Production deployment (Railway)

`railway.toml` builds the Dockerfile and points the healthcheck at `/health`.
Set every env var from `.env.example` in the Railway dashboard before the
first deploy.
