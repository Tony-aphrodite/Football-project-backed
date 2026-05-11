import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ListingsModule } from '../listings/listings.module';
import { QuizModule } from '../quiz/quiz.module';

@Module({
  imports:     [ListingsModule, QuizModule],
  controllers: [AdminController],
  providers:   [AdminService],
})
export class AdminModule {}
