import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import type { OrderRecord } from '../orders/entities/order.entity';

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

    // A rating must come from one side of a delivered order and be about the
    // other side — otherwise anyone could rate anyone (fake reviews).
    const orderKey = Keys.order(dto.orderId);
    const order = await this.db.get<OrderRecord>(orderKey.PK, orderKey.SK);
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    const isBuyer  = dto.raterRole === 'BUYER'  && order.buyerId === raterId  && order.sellerId === dto.rateeId;
    const isSeller = dto.raterRole === 'SELLER' && order.sellerId === raterId && order.buyerId === dto.rateeId;
    if (!isBuyer && !isSeller) throw new ForbiddenException('Você não pode avaliar este pedido.');
    if (order.status !== 'DELIVERED' && order.status !== 'COMPLETED') {
      throw new BadRequestException('A avaliação fica disponível depois da entrega.');
    }
    const ratedField = isBuyer ? 'ratedByBuyerAt' : 'ratedBySellerAt';
    if (order[ratedField]) throw new ConflictException('Você já avaliou este pedido.');

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

    try {
      await this.db.transactWrite([
      {
        // Marks the order as rated by this side; the condition makes a second
        // rating fail even if two arrive at the same moment.
        Update: {
          TableName: this.db.tableName,
          Key: { PK: orderKey.PK, SK: orderKey.SK },
          UpdateExpression: `SET ${ratedField} = :now`,
          ConditionExpression: `attribute_not_exists(${ratedField})`,
          ExpressionAttributeValues: { ':now': now },
        },
      },
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
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'TransactionCanceledException') throw new ConflictException('Você já avaliou este pedido.');
      throw err;
    }

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
