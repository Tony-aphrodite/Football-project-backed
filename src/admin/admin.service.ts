import { Injectable, NotFoundException } from '@nestjs/common';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Gsi, Keys } from '../dynamodb/keys';
import type { ReportRecord, ReportWithComment } from './entities/report.entity';
import type { CommentRecord } from '../comments/entities/comment.entity';
import { toPublic, type UserRecord, type UserPublic } from '../users/entities/user.entity';
import { toListingPublic, type ListingRecord, type ListingPublic } from '../listings/entities/listing.entity';
import { toOrderPublic, type OrderRecord, type OrderPublic } from '../orders/entities/order.entity';

export interface AdminStats {
  totalUsers: number;
  activeListings: number;
  totalOrders: number;
  pendingReports: number;
}

@Injectable()
export class AdminService {
  constructor(private readonly db: DynamoDbService) {}

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getStats(): Promise<AdminStats> {
    const [activeListings, pendingReports] = await Promise.all([
      this.db.queryCount({
        IndexName:                 'GSI1',
        KeyConditionExpression:    'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': Gsi.listingFeed('ACTIVE').GSI1PK },
      }),
      this.db.queryCount({
        IndexName:                 'GSI1',
        KeyConditionExpression:    'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': Gsi.reportQueue('PENDING').GSI1PK },
      }),
    ]);

    return {
      totalUsers:      0,   // needs counter table — not yet implemented
      activeListings,
      totalOrders:     0,   // needs counter table — not yet implemented
      pendingReports,
    };
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(limit = 50): Promise<UserPublic[]> {
    const records = await this.db.scan<UserRecord>({
      FilterExpression:          'entityType = :type',
      ExpressionAttributeValues: { ':type': 'User' },
      Limit:                     limit,
    });
    return records.map(toPublic);
  }

  async suspendUser(userId: string): Promise<void> {
    await this.db.update({
      Key:                       Keys.user(userId),
      UpdateExpression:          'SET #s = :suspended, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':suspended': 'SUSPENDED',
        ':now':       new Date().toISOString(),
      },
    });
  }

  async restoreUser(userId: string): Promise<void> {
    await this.db.update({
      Key:                       Keys.user(userId),
      UpdateExpression:          'SET #s = :active, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':active': 'ACTIVE',
        ':now':    new Date().toISOString(),
      },
    });
  }

  // ── Listings ───────────────────────────────────────────────────────────────

  async listAllListings(limit = 50): Promise<ListingPublic[]> {
    const statuses = ['ACTIVE', 'REMOVED', 'SOLD'] as const;

    const results = await Promise.all(
      statuses.map(status =>
        this.db.query<ListingRecord>({
          IndexName:                 'GSI1',
          KeyConditionExpression:    'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': Gsi.listingFeed(status).GSI1PK },
          ScanIndexForward:          false,
          Limit:                     limit,
        }),
      ),
    );

    const combined = results.flat();
    combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return combined.slice(0, limit).map(toListingPublic);
  }

  async forceRemoveListing(listingId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.update({
      Key:                       Keys.listing(listingId),
      UpdateExpression:          'SET #s = :removed, GSI1PK = :gsi1pk, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':removed': 'REMOVED',
        ':gsi1pk':  Gsi.listingFeed('REMOVED').GSI1PK,
        ':now':     now,
      },
    });
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listAllOrders(limit = 50): Promise<OrderPublic[]> {
    const records = await this.db.scan<OrderRecord>({
      FilterExpression:          'entityType = :type',
      ExpressionAttributeValues: { ':type': 'Order' },
      Limit:                     limit,
    });
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return records.map(toOrderPublic);
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  async listPendingReports(): Promise<ReportWithComment[]> {
    const reports = await this.db.query<ReportRecord>({
      IndexName:                 'GSI1',
      KeyConditionExpression:    'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': Gsi.reportQueue('PENDING').GSI1PK },
      ScanIndexForward:          false,
    });

    const enriched = await Promise.all(
      reports.map(async (r): Promise<ReportWithComment> => {
        const comments = await this.db.query<CommentRecord>({
          KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
          FilterExpression:          'commentId = :cid',
          ExpressionAttributeValues: {
            ':pk':     `LISTING#${r.listingId}`,
            ':prefix': 'COMMENT#',
            ':cid':    r.commentId,
          },
        });

        const comment = comments[0] ?? null;

        return {
          reportId:   r.reportId,
          listingId:  r.listingId,
          commentId:  r.commentId,
          reporterId: r.reporterId,
          reason:     r.reason,
          createdAt:  r.createdAt,
          comment: comment
            ? {
                authorId:    comment.authorId,
                authorName:  comment.authorName,
                body:        comment.body,
                reportCount: comment.reportCount,
                createdAt:   comment.createdAt,
              }
            : null,
        };
      }),
    );

    return enriched;
  }

  async resolveReport(reportId: string): Promise<void> {
    const report = await this.findReport(reportId);
    const now    = new Date().toISOString();

    const comments = await this.db.query<CommentRecord>({
      KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
      FilterExpression:          'commentId = :cid',
      ExpressionAttributeValues: {
        ':pk':     `LISTING#${report.listingId}`,
        ':prefix': 'COMMENT#',
        ':cid':    report.commentId,
      },
    });

    const comment = comments[0];

    const items: Parameters<typeof this.db.transactWrite>[0] = [
      {
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK: report.PK, SK: report.SK },
          UpdateExpression:          'SET #s = :resolved, GSI1PK = :gsi1pk, updatedAt = :now',
          ExpressionAttributeNames:  { '#s': 'status' },
          ExpressionAttributeValues: {
            ':resolved': 'RESOLVED',
            ':gsi1pk':   Gsi.reportQueue('RESOLVED').GSI1PK,
            ':now':      now,
          },
        },
      },
    ];

    if (comment) {
      items.push({
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK: comment.PK, SK: comment.SK },
          UpdateExpression:          'SET #s = :removed, updatedAt = :now',
          ExpressionAttributeNames:  { '#s': 'status' },
          ExpressionAttributeValues: { ':removed': 'REMOVED', ':now': now },
        },
      });
    }

    await this.db.transactWrite(items);
  }

  async dismissReport(reportId: string): Promise<void> {
    const report = await this.findReport(reportId);
    const now    = new Date().toISOString();

    await this.db.update({
      Key:                       { PK: report.PK, SK: report.SK },
      UpdateExpression:          'SET #s = :dismissed, GSI1PK = :gsi1pk, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':dismissed': 'DISMISSED',
        ':gsi1pk':    Gsi.reportQueue('DISMISSED').GSI1PK,
        ':now':       now,
      },
    });
  }

  private async findReport(reportId: string): Promise<ReportRecord> {
    const results = await this.db.query<ReportRecord>({
      IndexName:                 'GSI1',
      KeyConditionExpression:    'GSI1PK = :pk',
      FilterExpression:          'reportId = :rid',
      ExpressionAttributeValues: {
        ':pk':  Gsi.reportQueue('PENDING').GSI1PK,
        ':rid': reportId,
      },
    });

    const report = results[0];
    if (!report) throw new NotFoundException('Report not found or already processed');
    return report;
  }
}
