import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { QuizService } from './quiz.service';
import { AnswerQuizDto } from './dto/answer-quiz.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

interface AuthReq { user: JwtPayload }

@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  // ── Public: get active quiz (optional auth to check if already answered) ──

  @Get('active')
  getActive(@Request() req: Partial<AuthReq>) {
    return this.quizService.getActive(req.user?.sub);
  }

  // ── Authenticated: submit answer ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post(':quizId/answer')
  answer(
    @Param('quizId') quizId: string,
    @Body() dto: AnswerQuizDto,
    @Request() req: AuthReq,
  ) {
    return this.quizService.answer(quizId, req.user.sub, dto);
  }
}
