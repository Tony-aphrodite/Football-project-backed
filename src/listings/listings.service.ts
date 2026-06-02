import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ulid } from 'ulid';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Keys, Gsi } from '../dynamodb/keys';
import {
  ListingRecord,
  ListingPublic,
  toListingPublic,
  VERIFIED_SUPPLIERS,
} from './entities/listing.entity';
import type { CreateListingDto } from './dto/create-listing.dto';
import type { UpdatePriceDto } from './dto/update-price.dto';
import { AlgoliaService, type ListingIndexRecord } from '../search/algolia.service';

const LISTING_CAP = 20;

function getEffectiveCap(email?: string): number {
  const unlimited = (process.env.UNLIMITED_SELLER_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return email && unlimited.includes(email.toLowerCase()) ? 999999 : LISTING_CAP;
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly db: DynamoDbService,
    private readonly algolia: AlgoliaService,
  ) {}

  private toIndexRecord(listing: ListingRecord): ListingIndexRecord {
    return {
      objectID:           listing.listingId,
      listingId:          listing.listingId,
      sellerId:           listing.sellerId,
      sellerName:         listing.sellerName,
      kind:               listing.kind,
      teamName:           listing.teamName,
      continent:          listing.continent,
      country:            listing.country,
      season:             listing.season,
      supplier:           listing.supplier,
      model:              listing.model,
      garmentType:        listing.garmentType,
      size:               listing.size,
      condition:          listing.condition,
      gender:             listing.gender,
      priceCents:         listing.priceCents,
      description:        listing.description,
      photoKeys:          listing.photoKeys,
      isMpc:              listing.isMpc,
      status:             listing.status,
      createdAt:          listing.createdAt,
      createdAtTimestamp: Math.floor(new Date(listing.createdAt).getTime() / 1000),
    };
  }

  async create(sellerId: string, dto: CreateListingDto): Promise<{ listing: ListingPublic; listingsActiveCount: number }> {
    // Enforce cap atomically via conditional update on the user profile.
    const userKey = Keys.user(sellerId);
    const userItem = await this.db.get<{ listingsActiveCount: number; displayName: string; email?: string }>(userKey.PK, userKey.SK);
    if (!userItem) throw new NotFoundException('User not found');
    const effectiveCap = getEffectiveCap(userItem.email);
    if (userItem.listingsActiveCount >= effectiveCap) {
      throw new BadRequestException(`Limite de ${effectiveCap} anúncios atingido`);
    }

    // Non-verified supplier must have the ack flag set.
    if (!VERIFIED_SUPPLIERS.includes(dto.supplier) && !dto.nonVerifiedSupplierAck) {
      throw new BadRequestException('nonVerifiedSupplierAck must be true for non-verified suppliers');
    }

    const now       = new Date().toISOString();
    const listingId = ulid();
    const lk        = Keys.listing(listingId) as { PK: string; SK: 'METADATA' };
    const refKey    = Keys.userListingRef(sellerId, now, listingId);

    const listing: ListingRecord = {
      ...lk,
      entityType:            'Listing',
      listingId,
      sellerId,
      sellerName:            userItem.displayName,
      kind:                  dto.kind,
      teamName:              dto.teamName,
      continent:             dto.continent,
      country:               dto.country,
      season:                dto.season,
      supplier:              dto.supplier,
      model:                 dto.model,
      garmentType:           dto.garmentType,
      size:                  dto.size,
      condition:             dto.condition,
      gender:                dto.gender,
      priceCents:            dto.priceCents,
      description:           dto.description,
      weightGrams:           dto.weightGrams,
      sku:                   dto.sku,
      photoKeys:             [],
      isMpc:                 false,
      nonVerifiedSupplierAck: dto.nonVerifiedSupplierAck,
      status:                'ACTIVE',
      ...Gsi.listingFeed('ACTIVE'),
      GSI1SK:                `${now}#${listingId}`,
      createdAt:             now,
      updatedAt:             now,
    };

    const newCount = userItem.listingsActiveCount + 1;

    await this.db.transactWrite([
      {
        Put: {
          TableName: this.db.tableName,
          Item:      listing as unknown as Record<string, unknown>,
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: this.db.tableName,
          Item: { ...refKey, entityType: 'UserListingRef', listingId, status: 'ACTIVE' },
        },
      },
      {
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK: userKey.PK, SK: userKey.SK },
          UpdateExpression:          'SET listingsActiveCount = :n, updatedAt = :now',
          ConditionExpression:       'listingsActiveCount < :cap',
          ExpressionAttributeValues: { ':n': newCount, ':now': now, ':cap': effectiveCap },
        },
      },
    ]);

    void this.algolia.upsert(this.toIndexRecord(listing));

    return { listing: toListingPublic(listing), listingsActiveCount: newCount };
  }

  async feed(limit = 40): Promise<ListingPublic[]> {
    const records = await this.db.query<ListingRecord>({
      IndexName:                 'GSI1',
      KeyConditionExpression:    'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': Gsi.listingFeed('ACTIVE').GSI1PK },
      ScanIndexForward:          false,
      Limit:                     limit,
    });
    return records.map(toListingPublic);
  }

  async listMine(sellerId: string): Promise<ListingPublic[]> {
    interface Ref { listingId: string }
    const refs = await this.db.query<Ref>({
      KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `USER#${sellerId}`, ':prefix': 'LISTING#' },
      ScanIndexForward:          false,
    });

    if (refs.length === 0) return [];

    const records = await Promise.all(
      refs.map((r) => {
        const k = Keys.listing(r.listingId);
        return this.db.get<ListingRecord>(k.PK, k.SK);
      }),
    );

    return records
      .filter((r): r is ListingRecord => r !== undefined && r.status !== 'REMOVED')
      .map(toListingPublic);
  }

  async updatePrice(sellerId: string, listingId: string, dto: UpdatePriceDto): Promise<ListingPublic> {
    const k = Keys.listing(listingId) as { PK: string; SK: 'METADATA' };
    const record = await this.db.get<ListingRecord>(k.PK, k.SK);

    if (!record) throw new NotFoundException('Listing not found');
    if (record.sellerId !== sellerId) throw new ForbiddenException('Not your listing');
    if (record.status === 'REMOVED') throw new BadRequestException('Listing already removed');

    const now = new Date().toISOString();
    await this.db.update({
      Key:                       { PK: k.PK, SK: k.SK },
      UpdateExpression:          'SET priceCents = :p, updatedAt = :now',
      ExpressionAttributeValues: { ':p': dto.priceCents, ':now': now },
    });

    const updated = { ...record, priceCents: dto.priceCents, updatedAt: now };
    void this.algolia.upsert(this.toIndexRecord(updated));
    return toListingPublic(updated);
  }

  async setMpc(listingId: string, isMpc: boolean): Promise<ListingPublic> {
    const k = Keys.listing(listingId) as { PK: string; SK: 'METADATA' };
    const record = await this.db.get<ListingRecord>(k.PK, k.SK);
    if (!record) throw new NotFoundException('Listing not found');
    if (record.status === 'REMOVED') throw new BadRequestException('Listing is removed');
    const now = new Date().toISOString();
    await this.db.update({
      Key:                       { PK: k.PK, SK: k.SK },
      UpdateExpression:          'SET isMpc = :v, updatedAt = :now',
      ExpressionAttributeValues: { ':v': isMpc, ':now': now },
    });
    const updated = { ...record, isMpc, updatedAt: now };
    void this.algolia.upsert(this.toIndexRecord(updated));
    return toListingPublic(updated);
  }

  async listBySeller(sellerId: string): Promise<ListingPublic[]> {
    interface Ref { listingId: string }
    const refs = await this.db.query<Ref>({
      KeyConditionExpression:    'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `USER#${sellerId}`, ':prefix': 'LISTING#' },
      ScanIndexForward:          false,
    });

    if (refs.length === 0) return [];

    const records = await Promise.all(
      refs.map((r) => {
        const k = Keys.listing(r.listingId);
        return this.db.get<ListingRecord>(k.PK, k.SK);
      }),
    );

    return records
      .filter((r): r is ListingRecord => r !== undefined && r.status === 'ACTIVE')
      .map(toListingPublic);
  }

  async getRecord(listingId: string): Promise<ListingRecord | undefined> {
    const k = Keys.listing(listingId) as { PK: string; SK: 'METADATA' };
    return this.db.get<ListingRecord>(k.PK, k.SK);
  }

  async addPhotoKey(sellerId: string, listingId: string, key: string): Promise<ListingPublic> {
    const k = Keys.listing(listingId) as { PK: string; SK: 'METADATA' };
    const record = await this.db.get<ListingRecord>(k.PK, k.SK);
    if (!record) throw new NotFoundException('Listing not found');
    if (record.sellerId !== sellerId) throw new ForbiddenException('Not your listing');
    if (record.status === 'REMOVED') throw new BadRequestException('Listing already removed');

    const now = new Date().toISOString();
    const updated = [...record.photoKeys, key];
    await this.db.update({
      Key:                       { PK: k.PK, SK: k.SK },
      UpdateExpression:          'SET photoKeys = :keys, updatedAt = :now',
      ExpressionAttributeValues: { ':keys': updated, ':now': now },
    });
    return toListingPublic({ ...record, photoKeys: updated, updatedAt: now });
  }

  async removePhotoKey(sellerId: string, listingId: string, key: string): Promise<ListingPublic> {
    const k = Keys.listing(listingId) as { PK: string; SK: 'METADATA' };
    const record = await this.db.get<ListingRecord>(k.PK, k.SK);
    if (!record) throw new NotFoundException('Listing not found');
    if (record.sellerId !== sellerId) throw new ForbiddenException('Not your listing');

    const now = new Date().toISOString();
    const updated = record.photoKeys.filter((p) => p !== key);
    await this.db.update({
      Key:                       { PK: k.PK, SK: k.SK },
      UpdateExpression:          'SET photoKeys = :keys, updatedAt = :now',
      ExpressionAttributeValues: { ':keys': updated, ':now': now },
    });
    return toListingPublic({ ...record, photoKeys: updated, updatedAt: now });
  }

  async remove(sellerId: string, listingId: string): Promise<void> {
    const k = Keys.listing(listingId) as { PK: string; SK: 'METADATA' };
    const record = await this.db.get<ListingRecord>(k.PK, k.SK);

    if (!record) throw new NotFoundException('Listing not found');
    if (record.sellerId !== sellerId) throw new ForbiddenException('Not your listing');
    if (record.status === 'REMOVED') return;

    const userKey = Keys.user(sellerId);
    const now     = new Date().toISOString();

    // Mark listing as REMOVED — this must always succeed
    await this.db.update({
      Key:                       { PK: k.PK, SK: k.SK },
      UpdateExpression:          'SET #s = :removed, GSI1PK = :gsi1pk, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':removed': 'REMOVED',
        ':gsi1pk':  Gsi.listingFeed('REMOVED').GSI1PK,
        ':now':     now,
      },
    });

    // Decrement counter — best-effort, silently ignore if already 0 or field missing
    try {
      await this.db.update({
        Key:                       { PK: userKey.PK, SK: userKey.SK },
        UpdateExpression:          'SET listingsActiveCount = listingsActiveCount - :one, updatedAt = :now',
        ConditionExpression:       'listingsActiveCount > :zero',
        ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':now': now },
      });
    } catch { /* counter already at 0 or missing — listing is still removed */ }

    void this.algolia.remove(listingId);
  }

  async addPhotoKeyAndSync(sellerId: string, listingId: string, key: string): Promise<ListingPublic> {
    const result = await this.addPhotoKey(sellerId, listingId, key);
    const record = await this.getRecord(listingId);
    if (record) void this.algolia.upsert(this.toIndexRecord(record));
    return result;
  }
}
