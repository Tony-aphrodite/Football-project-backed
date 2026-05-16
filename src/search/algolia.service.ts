import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { algoliasearch, type Algoliasearch } from 'algoliasearch';
import type { AppConfig } from '../config/configuration';

export interface ListingIndexRecord {
  objectID: string;       // listingId
  listingId: string;
  sellerId: string;
  sellerName: string;
  kind: string;
  teamName: string;
  continent: string;
  country: string;
  season: string;
  supplier: string;
  model: string;
  garmentType: string;
  size: string;
  condition: string;
  gender: string;
  priceCents: number;
  description?: string;
  photoKeys: string[];
  isMpc: boolean;
  status: string;
  createdAt: string;
  createdAtTimestamp: number; // unix seconds for range sort
}

@Injectable()
export class AlgoliaService implements OnModuleInit {
  private readonly logger = new Logger(AlgoliaService.name);
  private client: Algoliasearch | null = null;
  private indexName: string = 'listings';

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit() {
    const appId  = this.config.get('algolia.appId',       { infer: true });
    const apiKey = this.config.get('algolia.adminApiKey', { infer: true });
    this.indexName = this.config.get('algolia.indexName', { infer: true });

    if (!appId || !apiKey) {
      this.logger.warn(
        'Algolia credentials not configured — search indexing disabled',
      );
      return;
    }

    this.client = algoliasearch(appId, apiKey);
    this.logger.log(`Algolia connected (app=${appId}, index=${this.indexName})`);
  }

  private get isEnabled(): boolean {
    return this.client !== null;
  }

  /** Index or update a listing. Called on create + photo add + price change. */
  async upsert(record: ListingIndexRecord): Promise<void> {
    if (!this.isEnabled) return;
    try {
      await this.client!.saveObject({ indexName: this.indexName, body: record });
    } catch (err) {
      this.logger.error(`Algolia upsert failed for ${record.listingId}:`, err);
    }
  }

  /** Remove a listing from the index (on delete / REMOVED status). */
  async remove(listingId: string): Promise<void> {
    if (!this.isEnabled) return;
    try {
      await this.client!.deleteObject({ indexName: this.indexName, objectID: listingId });
    } catch (err) {
      this.logger.error(`Algolia delete failed for ${listingId}:`, err);
    }
  }

  /**
   * Search listings. Returns a minimal result shape the controller can forward.
   * The mobile can also call Algolia directly using the search-only API key.
   */
  async search(
    query: string,
    filters?: string,
    page = 0,
    hitsPerPage = 40,
  ): Promise<{ hits: ListingIndexRecord[]; nbHits: number; page: number; nbPages: number }> {
    if (!this.isEnabled) {
      return { hits: [], nbHits: 0, page: 0, nbPages: 0 };
    }
    try {
      const result = await this.client!.searchSingleIndex<ListingIndexRecord>({
        indexName: this.indexName,
        searchParams: {
          query,
          filters: filters || undefined,
          page,
          hitsPerPage,
          attributesToRetrieve: [
            'listingId', 'sellerId', 'sellerName', 'kind', 'teamName',
            'continent', 'country', 'season', 'supplier', 'model',
            'garmentType', 'size', 'condition', 'gender', 'priceCents',
            'description', 'photoKeys', 'isMpc', 'status', 'createdAt',
          ],
        },
      });
      return {
        hits: result.hits,
        nbHits: result.nbHits ?? 0,
        page: result.page ?? 0,
        nbPages: result.nbPages ?? 0,
      };
    } catch (err) {
      this.logger.error('Algolia search failed:', err);
      return { hits: [], nbHits: 0, page: 0, nbPages: 0 };
    }
  }

  /** Returns the public search-only API key and app ID for mobile SDK use. */
  getSearchCredentials(): { appId: string; searchApiKey: string; indexName: string } | null {
    const appId        = this.config.get('algolia.appId',        { infer: true });
    const searchApiKey = this.config.get('algolia.searchApiKey', { infer: true });
    if (!appId || !searchApiKey) return null;
    return { appId, searchApiKey, indexName: this.indexName };
  }
}
