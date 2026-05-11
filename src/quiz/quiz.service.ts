import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import type { CreateQuizDto } from './dto/create-quiz.dto';
import type { AnswerQuizDto } from './dto/answer-quiz.dto';
import type {
  QuizRecord,
  QuizAnswerRecord,
  QuizPublicDto,
  QuizResultDto,
} from './entities/quiz.entity';

const PK  = (id: string) => `QUIZ#${id}`;
const APK = (id: string) => `QUIZ_ANSWER#${id}`;
const ASK = (uid: string) => `USER#${uid}`;

@Injectable()
export class QuizService {
  constructor(private readonly db: DynamoDbService) {}

  // ── Admin ─────────────────────────────────────────────────────────────────

  async create(dto: CreateQuizDto): Promise<QuizRecord> {
    if (dto.correctIndex >= dto.options.length) {
      throw new BadRequestException('correctIndex exceeds options length');
    }
    const quizId = randomUUID();
    const now    = new Date().toISOString();
    const item: QuizRecord = {
      PK:           PK(quizId),
      SK:           'METADATA',
      entityType:   'Quiz',
      quizId,
      question:     dto.question,
      options:      dto.options,
      correctIndex: dto.correctIndex,
      status:       'ACTIVE',
      answerCounts: new Array(dto.options.length).fill(0) as number[],
      totalAnswers: 0,
      createdAt:    now,
      expiresAt:    dto.expiresAt,
    };
    await this.db.put(item as unknown as Record<string, unknown>);
    return item;
  }

  async close(quizId: string): Promise<void> {
    await this.getRecord(quizId);
    await this.db.update({
      Key:                       { PK: PK(quizId), SK: 'METADATA' },
      UpdateExpression:          'SET #s = :closed',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: { ':closed': 'CLOSED' },
    });
  }

  async listAll(): Promise<QuizRecord[]> {
    return this.db.scan<QuizRecord>({
      FilterExpression: 'entityType = :t',
      ExpressionAttributeValues: { ':t': 'Quiz' },
    });
  }

  async getResults(quizId: string): Promise<QuizResultDto> {
    const quiz = await this.getRecord(quizId);
    return this.toResultDto(quiz);
  }

  // ── Public ────────────────────────────────────────────────────────────────

  async getActive(userId?: string): Promise<QuizPublicDto | QuizResultDto | null> {
    const all = await this.listAll();
    const active = all
      .filter((q) => q.status === 'ACTIVE')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    if (!active) return null;

    if (userId) {
      const existing = await this.db.get<QuizAnswerRecord>(APK(active.quizId), ASK(userId));
      if (existing) {
        return { ...this.toResultDto(active), userAnswer: { chosenIndex: existing.chosenIndex, correct: existing.correct } };
      }
    }

    return {
      quizId:       active.quizId,
      question:     active.question,
      options:      active.options,
      status:       active.status,
      expiresAt:    active.expiresAt,
      totalAnswers: active.totalAnswers,
    } satisfies QuizPublicDto;
  }

  async answer(quizId: string, userId: string, dto: AnswerQuizDto): Promise<QuizResultDto> {
    const quiz = await this.getRecord(quizId);

    if (quiz.status !== 'ACTIVE') throw new BadRequestException('Quiz encerrado');
    if (dto.chosenIndex >= quiz.options.length) throw new BadRequestException('Opção inválida');
    if (quiz.expiresAt && new Date(quiz.expiresAt) < new Date()) throw new BadRequestException('Quiz expirado');

    const existing = await this.db.get<QuizAnswerRecord>(APK(quizId), ASK(userId));
    if (existing) throw new ConflictException('Você já respondeu este quiz');

    const correct      = dto.chosenIndex === quiz.correctIndex;
    const updatedCounts = [...quiz.answerCounts];
    updatedCounts[dto.chosenIndex] = (updatedCounts[dto.chosenIndex] ?? 0) + 1;

    const answerRecord: QuizAnswerRecord = {
      PK:          APK(quizId),
      SK:          ASK(userId),
      entityType:  'QuizAnswer',
      quizId,
      userId,
      chosenIndex: dto.chosenIndex,
      correct,
      answeredAt:  new Date().toISOString(),
    };

    await this.db.transactWrite([
      { Put: { TableName: this.db.tableName, Item: answerRecord as unknown as Record<string, unknown> } },
      {
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK: PK(quizId), SK: 'METADATA' },
          UpdateExpression:          'SET totalAnswers = totalAnswers + :one, answerCounts = :counts',
          ExpressionAttributeValues: { ':one': 1, ':counts': updatedCounts },
        },
      },
    ]);

    return { ...this.toResultDto({ ...quiz, totalAnswers: quiz.totalAnswers + 1, answerCounts: updatedCounts }), userAnswer: { chosenIndex: dto.chosenIndex, correct } };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async getRecord(quizId: string): Promise<QuizRecord> {
    const record = await this.db.get<QuizRecord>(PK(quizId), 'METADATA');
    if (!record) throw new NotFoundException('Quiz não encontrado');
    return record;
  }

  private toResultDto(quiz: QuizRecord): QuizResultDto {
    return {
      quizId:       quiz.quizId,
      question:     quiz.question,
      options:      quiz.options,
      status:       quiz.status,
      expiresAt:    quiz.expiresAt,
      totalAnswers: quiz.totalAnswers,
      correctIndex: quiz.correctIndex,
      answerCounts: quiz.answerCounts,
    };
  }
}
