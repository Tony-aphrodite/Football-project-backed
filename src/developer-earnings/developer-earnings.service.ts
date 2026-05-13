import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import {
  DEVELOPER_THRESHOLD_CENTS,
  type DeveloperEarningsRecord,
  type DeveloperWithdrawalRecord,
  type DeveloperEarningsPublic,
} from './developer-earnings.entity';

const PK = 'DEVELOPER_EARNINGS' as const;
const SK = 'METADATA' as const;

@Injectable()
export class DeveloperEarningsService {
  private readonly logger = new Logger(DeveloperEarningsService.name);

  constructor(private readonly db: DynamoDbService) {}

  // ── Initialize record if not exists ────────────────────────────────────────

  private async ensureRecord(): Promise<DeveloperEarningsRecord> {
    const existing = await this.db.get<DeveloperEarningsRecord>(PK, SK);
    if (existing) return existing;

    const record: DeveloperEarningsRecord = {
      PK,
      SK,
      entityType:              'DeveloperEarnings',
      totalSpreadCents:        0,
      developerAllocatedCents: 0,
      arenaAllocatedCents:     0,
      developerWithdrawnCents: 0,
      thresholdCents:          DEVELOPER_THRESHOLD_CENTS,
      status:                  'ACTIVE',
      lastUpdatedAt:           new Date().toISOString(),
    };
    await this.db.put(record as unknown as Record<string, unknown>, {
      conditionExpression: 'attribute_not_exists(PK)',
    });
    return record;
  }

  // ── Record spread after label purchase ─────────────────────────────────────

  async recordSpread(spreadCents: number): Promise<{
    beneficiary: 'DEVELOPER' | 'ARENA';
    developerGets: number;
    arenaGets: number;
  }> {
    if (spreadCents <= 0) return { beneficiary: 'ARENA', developerGets: 0, arenaGets: 0 };

    const record = await this.ensureRecord();

    if (record.status === 'COMPLETED') {
      // Threshold already reached — all spread goes to Arena
      await this.db.update({
        Key:                       { PK, SK },
        UpdateExpression:          'SET totalSpreadCents = totalSpreadCents + :s, arenaAllocatedCents = arenaAllocatedCents + :s, lastUpdatedAt = :now',
        ExpressionAttributeValues: { ':s': spreadCents, ':now': new Date().toISOString() },
      });
      return { beneficiary: 'ARENA', developerGets: 0, arenaGets: spreadCents };
    }

    // Developer still owed money — calculate split
    const remaining = record.thresholdCents - record.developerAllocatedCents;
    const developerGets = Math.min(spreadCents, remaining);
    const arenaGets     = spreadCents - developerGets;
    const newDeveloperTotal = record.developerAllocatedCents + developerGets;
    const isNowComplete = newDeveloperTotal >= record.thresholdCents;

    await this.db.update({
      Key: { PK, SK },
      UpdateExpression: [
        'SET totalSpreadCents = totalSpreadCents + :spread',
        'developerAllocatedCents = developerAllocatedCents + :devGets',
        'arenaAllocatedCents = arenaAllocatedCents + :arenaGets',
        '#status = :status',
        'lastUpdatedAt = :now',
      ].join(', '),
      ExpressionAttributeNames:  { '#status': 'status' },
      ExpressionAttributeValues: {
        ':spread':   spreadCents,
        ':devGets':  developerGets,
        ':arenaGets': arenaGets,
        ':status':   isNowComplete ? 'COMPLETED' : 'ACTIVE',
        ':now':      new Date().toISOString(),
      },
    });

    if (isNowComplete) {
      this.logger.log(`Developer earnings threshold reached! Total: R$${(newDeveloperTotal / 100).toFixed(2)}`);
    }

    return {
      beneficiary: developerGets > 0 ? 'DEVELOPER' : 'ARENA',
      developerGets,
      arenaGets,
    };
  }

  // ── Record withdrawal ───────────────────────────────────────────────────────

  async recordWithdrawal(amountCents: number, notes?: string): Promise<DeveloperWithdrawalRecord> {
    const record = await this.ensureRecord();
    const available = record.developerAllocatedCents - record.developerWithdrawnCents;
    if (amountCents > available) {
      throw new Error(`Cannot withdraw R$${amountCents / 100} — only R$${available / 100} available`);
    }

    const withdrawalId = randomUUID();
    const withdrawal: DeveloperWithdrawalRecord = {
      PK:          `DEVELOPER_WITHDRAWAL#${withdrawalId}`,
      SK:          'METADATA',
      entityType:  'DeveloperWithdrawal',
      withdrawalId,
      amountCents,
      notes,
      createdAt:   new Date().toISOString(),
    };

    await this.db.transactWrite([
      { Put: { TableName: this.db.tableName, Item: withdrawal as unknown as Record<string, unknown> } },
      {
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK, SK },
          UpdateExpression:          'SET developerWithdrawnCents = developerWithdrawnCents + :a, lastUpdatedAt = :now',
          ConditionExpression:       'developerAllocatedCents - developerWithdrawnCents >= :a',
          ExpressionAttributeValues: { ':a': amountCents, ':now': new Date().toISOString() },
        },
      },
    ]);

    this.logger.log(`Developer withdrawal recorded: R$${(amountCents / 100).toFixed(2)}`);
    return withdrawal;
  }

  // ── Get summary ─────────────────────────────────────────────────────────────

  async getSummary(): Promise<DeveloperEarningsPublic> {
    const record = await this.ensureRecord();

    const withdrawals = await this.db.scan<DeveloperWithdrawalRecord>({
      FilterExpression:          'entityType = :t',
      ExpressionAttributeValues: { ':t': 'DeveloperWithdrawal' },
    });

    const available  = record.developerAllocatedCents - record.developerWithdrawnCents;
    const remaining  = Math.max(0, record.thresholdCents - record.developerAllocatedCents);
    const pct        = Math.min(100, Math.round((record.developerAllocatedCents / record.thresholdCents) * 100));

    return {
      totalSpreadCents:         record.totalSpreadCents,
      developerAllocatedCents:  record.developerAllocatedCents,
      developerWithdrawnCents:  record.developerWithdrawnCents,
      developerAvailableCents:  available,
      developerRemainingCents:  remaining,
      arenaAllocatedCents:      record.arenaAllocatedCents,
      thresholdCents:           record.thresholdCents,
      thresholdReachedPct:      pct,
      status:                   record.status,
      withdrawals:              withdrawals.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }
}
