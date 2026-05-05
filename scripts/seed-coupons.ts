/**
 * Run once to pre-load event coupons into DynamoDB:
 *   npx ts-node -r tsconfig-paths/register scripts/seed-coupons.ts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new DynamoDBClient({
  region:   process.env.AWS_REGION ?? 'us-east-1',
  endpoint: process.env.DYNAMO_ENDPOINT,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID ?? 'local',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'local',
  },
});

const doc       = DynamoDBDocumentClient.from(client);
const TABLE     = process.env.DYNAMO_TABLE_NAME ?? 'ArenaDosMantosLocal';
const now       = new Date().toISOString();

const coupons = [
  {
    code:           'NIGHTQUIZ20',
    discountPct:    20,
    description:    '20% de desconto — participante Night Quiz',
    maxRedemptions: 500,
  },
  {
    code:           'NIGHTQUIZ10',
    discountPct:    10,
    description:    '10% de desconto — participante Night Quiz',
    maxRedemptions: 500,
  },
];

async function seed() {
  for (const c of coupons) {
    await doc.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK:               `COUPON#${c.code}`,
        SK:               'METADATA',
        entityType:       'Coupon',
        code:             c.code,
        discountPct:      c.discountPct,
        description:      c.description,
        maxRedemptions:   c.maxRedemptions,
        redemptionCount:  0,
        active:           true,
        createdAt:        now,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
    console.log(`✓ ${c.code} (${c.discountPct}% off, max ${c.maxRedemptions} usos)`);
  }
  console.log('Seed completo.');
}

seed().catch((e) => { console.error(e); process.exit(1); });
