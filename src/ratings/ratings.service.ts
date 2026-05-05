import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ulid } from 'ulid';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Keys } from '../dynamodb/keys';
import {
  RatingRecord,
  RatingPublic,
  UserRatingSummary,
  toRatingPublic,
} from './entities/rating.entity';
import type { CreateRatingDto } from './dto/create-rating.dto';
import type { UserRecord } from '../users/entities/user.entity';

@Injectable()
export class RatingsService {
  constructor(private readonly db: DynamoDbService) {}

  async create(raterId: string, dto: CreateRatingDto): Promise<RatingPublic> {
    // Validate scores length matches role
    const expectedLength = dto.raterRole === 'BUYER' ? 4 : 3;
    if (dto.scores.length !== expectedLength) {
      throw new BadRequestException(
        `Expected ${expectedLength} scores for raterRole=${dto.raterRole}`,
      );
    }

    const rateeKey = Keys.user(dto.rateeId);
    const ratee    = await this.db.get<UserRecord>(rateeKey.PK, rateeKey.SK);
    if (!ratee) throw new NotFoundException('Ratee user not found');

    const now      = new Date().toISOString();
    const ratingId = ulid();
    const rk       = Keys.ratingReceived(dto.rateeId, now, ratingId);

    const average = dto.scores.reduce((a, b) => a + b, 0) / dto.scores.length;

    const record: RatingRecord = {
      ...rk,
      entityType: 'Rating',
      ratingId,
      orderId:    dto.orderId,
      raterId,
      rateeId:    dto.rateeId,
      raterRole:  dto.raterRole,
      scores:     dto.scores,
      average,
      createdAt:  now,
    };

    // Compute updated running average for the ratee
    let updateExpr: string;
    let exprValues: Record<string, unknown>;

    if (dto.raterRole === 'BUYER') {
      // Buyer is rating the seller, so update seller stats
      const oldCount = ratee.ratingCountAsSeller;
      const oldAvg   = ratee.ratingAvgAsSeller ?? 0;
      const newCount = oldCount + 1;
      const newAvg   = (oldAvg * oldCount + average) / newCount;

      updateExpr = 'SET ratingCountAsSeller = :newCount, ratingAvgAsSeller = :newAvg, updatedAt = :now';
      exprValues = { ':newCount': newCount, ':newAvg': newAvg, ':now': now };
    } else {
      // Seller is rating the buyer, so update buyer stats
      const oldCount = ratee.ratingCountAsBuyer;
      const oldAvg   = ratee.ratingAvgAsBuyer ?? 0;
      const newCount = oldCount + 1;
      const newAvg   = (oldAvg * oldCount + average) / newCount;

      updateExpr = 'SET ratingCountAsBuyer = :newCount, ratingAvgAsBuyer = :newAvg, updatedAt = :now';
      exprValues = { ':newCount': newCount, ':newAvg': newAvg, ':now': now };
    }

    await this.db.transactWrite([
      {
        Put: {
          TableName: this.db.tableName,
          Item:      record as unknown as Record<string, unknown>,
        },
      },
      {
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK: rateeKey.PK, SK: rateeKey.SK },
          UpdateExpression:          updateExpr,
          ExpressionAttributeValues: exprValues,
        },
      },
    ]);

    return toRatingPublic(record);
  }

  async getSummary(userId: string): Promise<UserRatingSummary> {
    const userKey = Keys.user(userId);
    const user    = await this.db.get<UserRecord>(userKey.PK, userKey.SK);
    if (!user) throw new NotFoundException('User not found');

    return {
      asSeller: {
        average: user.ratingAvgAsSeller ?? 0,
        count:   user.ratingCountAsSeller,
      },
      asBuyer: {
        average: user.ratingAvgAsBuyer ?? 0,
        count:   user.ratingCountAsBuyer,
      },
    };
  }
}
