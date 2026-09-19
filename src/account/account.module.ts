import { Module } from '@nestjs/common';

import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';
import { UsersModule } from '../users/users.module';
import { ListingsModule } from '../listings/listings.module';
import { PagarmeService } from '../payments/pagarme.service';

@Module({
  imports:     [DynamoDbModule, UsersModule, ListingsModule],
  controllers: [AccountController],
  providers:   [AccountService, PagarmeService],
})
export class AccountModule {}
