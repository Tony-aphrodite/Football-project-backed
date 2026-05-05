import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';

import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { RatingPublic, UserRatingSummary } from './entities/rating.entity';

@Controller()
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post('ratings')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRatingDto,
  ): Promise<RatingPublic> {
    return this.ratings.create(user.sub, dto);
  }

  @Get('users/:userId/rating')
  getSummary(@Param('userId') userId: string): Promise<UserRatingSummary> {
    return this.ratings.getSummary(userId);
  }
}
