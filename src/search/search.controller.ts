import { Controller, Get, Post, Query } from '@nestjs/common';
import { AlgoliaService, type ListingIndexRecord } from './algolia.service';
import { SearchListingsDto } from './dto/search-listings.dto';
import type { ListingPublic } from '../listings/entities/listing.entity';

@Controller('search')
export class SearchController {
  constructor(private readonly algolia: AlgoliaService) {}

  /** Full-text search — uses Algolia if configured, falls back to DB scan. */
  @Get('listings')
  async search(
    @Query() dto: SearchListingsDto,
  ): Promise<{ hits: ListingPublic[] | ListingIndexRecord[]; nbHits: number; page: number; nbPages: number }> {
    const result = await this.algolia.search(
      dto.q ?? '',
      dto.filters,
      dto.page ?? 0,
      dto.hitsPerPage ?? 40,
    );

    if (result.nbHits === 0 && !this.algolia['isEnabled']) {
      const hits = await this.algolia.searchDb(dto.q ?? '', dto.hitsPerPage ?? 40);
      return { hits, nbHits: hits.length, page: 0, nbPages: 1 };
    }

    return result;
  }

  /**
   * Returns the Algolia search-only credentials so the mobile client can
   * call Algolia directly (faster, lower latency).
   */
  @Get('credentials')
  credentials(): { appId: string; searchApiKey: string; indexName: string } | { error: string } {
    return this.algolia.getSearchCredentials() ?? { error: 'Algolia not configured' };
  }

  /** Re-index all active listings into Algolia. Call once after setting credentials. */
  @Post('reindex')
  async reindex(): Promise<{ indexed: number }> {
    const indexed = await this.algolia.reindexAll();
    return { indexed };
  }
}
