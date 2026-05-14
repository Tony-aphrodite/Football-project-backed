import { Controller, Get, Query } from '@nestjs/common';
import { AlgoliaService, type ListingIndexRecord } from './algolia.service';
import { SearchListingsDto } from './dto/search-listings.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly algolia: AlgoliaService) {}

  /** Full-text search proxy (public — no auth required). */
  @Get('listings')
  search(
    @Query() dto: SearchListingsDto,
  ): Promise<{ hits: ListingIndexRecord[]; nbHits: number; page: number; nbPages: number }> {
    return this.algolia.search(
      dto.q ?? '',
      dto.filters,
      dto.page ?? 0,
      dto.hitsPerPage ?? 40,
    );
  }

  /**
   * Returns the Algolia search-only credentials so the mobile client can
   * call Algolia directly (faster, lower latency).
   */
  @Get('credentials')
  credentials(): { appId: string; searchApiKey: string; indexName: string } | { error: string } {
    return this.algolia.getSearchCredentials() ?? { error: 'Algolia not configured' };
  }
}
