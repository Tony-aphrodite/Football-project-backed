import { Injectable, NotFoundException } from '@nestjs/common';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Gsi, Keys } from '../dynamodb/keys';
import type { ReportRecord, ReportWithComment } from './entities/report.entity';
import type { CommentRecord } from '../comments/entities/comment.entity';
import { toPublic, type UserRecord, type UserPublic } from '../users/entities/user.entity';
import { toListingPublic, type ListingRecord, type ListingPublic } from '../listings/entities/listing.entity';
import { toOrderPublic, type OrderRecord, type OrderPublic } from '../orders/entities/order.entity';
import { ulid } from 'ulid';
import { ListingsService } from '../listings/listings.service';
import { QuizService } from '../quiz/quiz.service';
import type { CouponRecord } from '../coupons/entities/coupon.entity';
import type { CreateListingDto } from '../listings/dto/create-listing.dto';
import type { CreateQuizDto } from '../quiz/dto/create-quiz.dto';
import type { QuizRecord } from '../quiz/entities/quiz.entity';

export interface CreateCouponDto {
  code: string;
  discountPct: number;
  description: string;
  maxRedemptions: number;
}

export interface AdminStats {
  totalUsers: number;
  activeListings: number;
  totalOrders: number;
  pendingReports: number;
}

const ADMIN_SELLER_ID = 'ADMIN_ARENA_DOS_MANTOS';

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DynamoDbService,
    private readonly listings: ListingsService,
    private readonly quiz: QuizService,
  ) {}

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getStats(): Promise<AdminStats> {
    const [activeListings, pendingReports, totalUsers, totalOrders] = await Promise.all([
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
      this.db.scanCount({
        FilterExpression:          'entityType = :t',
        ExpressionAttributeValues: { ':t': 'User' },
      }),
      this.db.scanCount({
        FilterExpression:          'entityType = :t',
        ExpressionAttributeValues: { ':t': 'Order' },
      }),
    ]);

    return { totalUsers, activeListings, totalOrders, pendingReports };
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

  // ── Coupons ───────────────────────────────────────────────────────────────

  async createCoupon(dto: CreateCouponDto): Promise<CouponRecord> {
    const code = dto.code.trim().toUpperCase();
    const ck = Keys.coupon(code);
    const item: CouponRecord = {
      PK:              ck.PK,
      SK:              'METADATA' as const,
      entityType:      'Coupon',
      code,
      discountPct:     dto.discountPct,
      description:     dto.description,
      maxRedemptions:  dto.maxRedemptions,
      redemptionCount: 0,
      active:          true,
      createdAt:       new Date().toISOString(),
    };
    await this.db.put(item as unknown as Record<string, unknown>, {
      conditionExpression: 'attribute_not_exists(PK)',
    });
    return item;
  }

  async listCoupons(): Promise<CouponRecord[]> {
    return this.db.scan<CouponRecord>({
      FilterExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': 'Coupon' },
    });
  }

  async toggleCoupon(code: string): Promise<void> {
    const ck = Keys.coupon(code.toUpperCase());
    const coupon = await this.db.get<CouponRecord>(ck.PK, ck.SK);
    if (!coupon) throw new NotFoundException('Cupom não encontrado');
    await this.db.update({
      Key:                       { PK: ck.PK, SK: ck.SK },
      UpdateExpression:          'SET active = :v',
      ExpressionAttributeValues: { ':v': !coupon.active },
    });
  }

  // ── MPC Listings ──────────────────────────────────────────────────────────

  async createMpcListing(dto: CreateListingDto): Promise<ListingPublic> {
    const now       = new Date().toISOString();
    const listingId = ulid();
    const lk        = Keys.listing(listingId);
    const refKey    = Keys.userListingRef(ADMIN_SELLER_ID, now, listingId);

    const listing: ListingRecord = {
      PK:          lk.PK,
      SK:          'METADATA' as const,
      entityType:  'Listing',
      listingId,
      sellerId:    ADMIN_SELLER_ID,
      sellerName:  'Arena dos Mantos',
      kind:        dto.kind,
      teamName:    dto.teamName,
      continent:   dto.continent,
      country:     dto.country,
      season:      dto.season,
      supplier:    dto.supplier,
      model:       dto.model,
      garmentType: dto.garmentType,
      size:        dto.size,
      condition:   dto.condition,
      gender:      dto.gender,
      priceCents:  14900,
      description: dto.description,
      photoKeys:   [],
      isMpc:       true,
      nonVerifiedSupplierAck: true,
      status:      'ACTIVE',
      ...Gsi.listingFeed('ACTIVE'),
      ...Gsi.listingMpc('ACTIVE'),
      GSI1SK:      `${now}#${listingId}`,
      createdAt:   now,
      updatedAt:   now,
    };

    await this.db.transactWrite([
      { Put: { TableName: this.db.tableName, Item: listing as unknown as Record<string, unknown>, ConditionExpression: 'attribute_not_exists(PK)' } },
      { Put: { TableName: this.db.tableName, Item: { ...refKey, entityType: 'UserListingRef', listingId, status: 'ACTIVE' } } },
    ]);

    return toListingPublic(listing);
  }

  async listMpcListings(): Promise<ListingPublic[]> {
    return this.db.query<ListingRecord>({
      IndexName:                 'GSI2',
      KeyConditionExpression:    'GSI2PK = :pk',
      ExpressionAttributeValues: { ':pk': Gsi.listingMpc('ACTIVE').GSI2PK },
    }).then((rows) => rows.map(toListingPublic));
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────

  async createQuiz(dto: CreateQuizDto): Promise<QuizRecord> {
    return this.quiz.create(dto);
  }

  async listQuizzes(): Promise<QuizRecord[]> {
    return this.quiz.listAll();
  }

  async closeQuiz(quizId: string): Promise<void> {
    return this.quiz.close(quizId);
  }

  async getQuizResults(quizId: string) {
    return this.quiz.getResults(quizId);
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
