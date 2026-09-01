import { Module } from '@nestjs/common';
import { AlgoliaService } from './algolia.service';
import { SearchController } from './search.controller';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [DynamoDbModule],
  controllers: [SearchController],
  providers: [AlgoliaService],
  exports: [AlgoliaService],
})
export class SearchModule {}
