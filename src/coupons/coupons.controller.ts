import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CouponsService } from './coupons.service';
import { RedeemCouponDto } from './dto/redeem-coupon.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { RedeemResult } from './entities/coupon.entity';

@Controller('coupons')
@UseGuards(JwtAuthGuard)
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post('redeem')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  redeem(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RedeemCouponDto,
  ): Promise<RedeemResult> {
    return this.coupons.redeem(user.sub, dto);
  }
}
