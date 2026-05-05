import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Keys } from '../dynamodb/keys';
import type { CouponRecord, CouponRedemptionRecord, RedeemResult } from './entities/coupon.entity';
import type { RedeemCouponDto } from './dto/redeem-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly db: DynamoDbService) {}

  async redeem(userId: string, dto: RedeemCouponDto): Promise<RedeemResult> {
    const code = dto.code.trim().toUpperCase();
    const ck   = Keys.coupon(code);
    const rk   = Keys.couponRedemption(code, userId);

    const [coupon, existing] = await Promise.all([
      this.db.get<CouponRecord>(ck.PK, ck.SK),
      this.db.get<CouponRedemptionRecord>(rk.PK, rk.SK),
    ]);

    if (!coupon || !coupon.active) {
      throw new NotFoundException('Cupom inválido ou expirado');
    }
    if (coupon.redemptionCount >= coupon.maxRedemptions) {
      throw new BadRequestException('Cupom esgotado');
    }
    if (existing) {
      throw new BadRequestException('Você já utilizou este cupom');
    }

    const now = new Date().toISOString();

    await this.db.transactWrite([
      {
        Put: {
          TableName: this.db.tableName,
          Item: {
            ...rk,
            entityType:  'CouponRedemption',
            code,
            userId,
            discountPct: coupon.discountPct,
            redeemedAt:  now,
          } satisfies CouponRedemptionRecord,
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK: ck.PK, SK: ck.SK },
          UpdateExpression:          'SET redemptionCount = redemptionCount + :one',
          ConditionExpression:       'redemptionCount < maxRedemptions',
          ExpressionAttributeValues: { ':one': 1 },
        },
      },
    ]);

    return {
      code,
      discountPct: coupon.discountPct,
      description: coupon.description,
    };
  }
}
