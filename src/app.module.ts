import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import configuration, { validateEnv } from './config/configuration';
import { DynamoDbModule } from './dynamodb/dynamodb.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { LegalModule } from './legal/legal.module';
import { ListingsModule } from './listings/listings.module';
import { CouponsModule } from './coupons/coupons.module';
import { AdminModule } from './admin/admin.module';
import { CommentsModule } from './comments/comments.module';
import { RatingsModule } from './ratings/ratings.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { SearchModule } from './search/search.module';
import { QuizModule } from './quiz/quiz.module';
import { DeveloperEarningsModule } from './developer-earnings/developer-earnings.module';
import { FiscalModule } from './fiscal/fiscal.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      cache: true,
    }),

    // Default rate-limit for the whole API. Auth endpoints add stricter limits
    // on top via per-route @Throttle decorators.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 60 },
    ]),

    DynamoDbModule,
    UsersModule,
    AuthModule,
    HealthModule,
    LegalModule,
    ListingsModule,
    CouponsModule,
    AdminModule,
    CommentsModule,
    RatingsModule,
    OrdersModule,
    PaymentsModule,
    SearchModule,
    QuizModule,
    DeveloperEarningsModule,
    FiscalModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
