import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ulid } from 'ulid';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Keys, Gsi } from '../dynamodb/keys';
import { CommentRecord, CommentPublic, toCommentPublic } from './entities/comment.entity';
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { ReportCommentDto } from './dto/report-comment.dto';

@Injectable()
export class CommentsService {
  constructor(private readonly db: DynamoDbService) {}

  async create(
    listingId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentPublic> {
    const userKey = Keys.user(authorId);
    const user = await this.db.get<{ displayName: string }>(userKey.PK, userKey.SK);
    if (!user) throw new NotFoundException('User not found');

    const now       = new Date().toISOString();
    const commentId = ulid();
    const ck        = Keys.comment(listingId, now, commentId);

    const record: CommentRecord = {
      ...ck,
      entityType:  'Comment',
      commentId,
      listingId,
      authorId,
      authorName:  user.displayName,
      body:        dto.body,
      status:      'ACTIVE',
      reportCount: 0,
      createdAt:   now,
      updatedAt:   now,
    };

    await this.db.put(record as unknown as Record<string, unknown>);
    return toCommentPublic(record);
  }

  async list(listingId: string): Promise<CommentPublic[]> {
    const records = await this.db.query<CommentRecord>({
      KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk':     `LISTING#${listingId}`,
        ':prefix': 'COMMENT#',
      },
      ScanIndexForward: true,
    });

    return records
      .filter((c) => c.status === 'ACTIVE')
      .map(toCommentPublic);
  }

  async report(
    listingId: string,
    commentId: string,
    reporterId: string,
    dto: ReportCommentDto,
  ): Promise<void> {
    // Find the comment — query by PK and SK prefix, then filter by commentId
    const candidates = await this.db.query<CommentRecord>({
      KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk':     `LISTING#${listingId}`,
        ':prefix': 'COMMENT#',
      },
    });

    const comment = candidates.find((c) => c.commentId === commentId);

    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.status === 'REMOVED') throw new BadRequestException('Comment is already removed');
    if (comment.authorId === reporterId) throw new ForbiddenException('Cannot report your own comment');

    const now      = new Date().toISOString();
    const reportId = ulid();
    const rk       = Keys.report(listingId, now, reportId);

    await this.db.transactWrite([
      {
        Put: {
          TableName: this.db.tableName,
          Item: {
            ...rk,
            entityType: 'Report',
            reportId,
            listingId,
            commentId,
            reporterId,
            reason:     dto.reason,
            status:     'PENDING',
            ...Gsi.reportQueue('PENDING'),
            GSI1SK:     `${now}#${reportId}`,
            createdAt:  now,
          },
        },
      },
      {
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK: comment.PK, SK: comment.SK },
          UpdateExpression:          'SET reportCount = reportCount + :one, updatedAt = :now',
          ExpressionAttributeValues: { ':one': 1, ':now': now },
        },
      },
    ]);
  }
}
