import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [DynamoDbModule],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}
