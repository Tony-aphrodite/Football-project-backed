import { Injectable } from '@nestjs/common';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import type { CartItemEntry, CartRecord } from './cart.entity';

@Injectable()
export class CartService {
  constructor(private readonly db: DynamoDbService) {}

  // ── key helpers ─────────────────────────────────────────────────────────────

  private key(userId: string) {
    return { PK: `USER#${userId}`, SK: 'CART' as const };
  }

  // ── public methods ──────────────────────────────────────────────────────────

  async getCart(userId: string): Promise<CartItemEntry[]> {
    const record = await this.db.get<CartRecord>(
      `USER#${userId}`,
      'CART',
    );
    return record?.items ?? [];
  }

  async addItem(userId: string, item: CartItemEntry): Promise<CartItemEntry[]> {
    const existing = await this.getCart(userId);

    // Deduplicate: if the listingId is already present, return current items as-is.
    if (existing.some((i) => i.listingId === item.listingId)) {
      return existing;
    }

    const updated = [...existing, item];
    await this.save(userId, updated);
    return updated;
  }

  async removeItem(userId: string, listingId: string): Promise<CartItemEntry[]> {
    const existing = await this.getCart(userId);
    const updated = existing.filter((i) => i.listingId !== listingId);
    await this.save(userId, updated);
    return updated;
  }

  async clearCart(userId: string): Promise<void> {
    await this.save(userId, []);
  }

  // ── private helpers ─────────────────────────────────────────────────────────

  private async save(userId: string, items: CartItemEntry[]): Promise<void> {
    const k = this.key(userId);
    const now = new Date().toISOString();
    await this.db.put({
      ...k,
      entityType: 'Cart',
      items,
      updatedAt: now,
    });
  }
}
