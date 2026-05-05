import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ReportCommentDto } from './dto/report-comment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type { CommentPublic } from './entities/comment.entity';

@Controller('listings/:listingId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  list(@Param('listingId') listingId: string): Promise<CommentPublic[]> {
    return this.comments.list(listingId);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @Param('listingId') listingId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentPublic> {
    return this.comments.create(listingId, user.sub, dto);
  }

  @Post(':commentId/report')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async report(
    @Param('listingId') listingId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ReportCommentDto,
  ): Promise<void> {
    return this.comments.report(listingId, commentId, user.sub, dto);
  }
}
