import { Module } from '@nestjs/common';
import { DeveloperEarningsController } from './developer-earnings.controller';
import { DeveloperEarningsService } from './developer-earnings.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';

@Module({
  imports:     [DynamoDbModule],
  controllers: [DeveloperEarningsController],
  providers:   [DeveloperEarningsService],
  exports:     [DeveloperEarningsService],
})
export class DeveloperEarningsModule {}
