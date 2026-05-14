import { Module } from '@nestjs/common';
import { AlgoliaService } from './algolia.service';
import { SearchController } from './search.controller';

@Module({
  controllers: [SearchController],
  providers: [AlgoliaService],
  exports: [AlgoliaService],
})
export class SearchModule {}
