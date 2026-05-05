import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';
import { R2Module } from '../r2/r2.module';

@Module({
  imports: [DynamoDbModule, R2Module],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}
