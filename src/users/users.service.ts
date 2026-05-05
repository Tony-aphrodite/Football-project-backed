import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ulid } from 'ulid';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Keys } from '../dynamodb/keys';
import type { UserRecord } from './entities/user.entity';

interface CreateUserInput {
  displayName: string;
  email?: string;
  googleSub?: string;
  appleSub?: string;
  passwordHash?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DynamoDbService) {}

  async findById(userId: string): Promise<UserRecord | undefined> {
    const k = Keys.user(userId);
    return this.db.get<UserRecord>(k.PK, k.SK);
  }

  async getById(userId: string): Promise<UserRecord> {
    const u = await this.findById(userId);
    if (!u) throw new NotFoundException(`User ${userId} not found`);
    return u;
  }

  /**
   * Resolve a user from one of the lookup rows. Returns undefined if no user
   * has registered with that identifier yet.
   */
  async findByGoogleSub(sub: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupGoogle(sub).PK);
  }

  async findByAppleSub(sub: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupApple(sub).PK);
  }

  async findByPhone(e164: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupPhone(e164).PK);
  }

  async findByCpf(cpf: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupCpf(cpf).PK);
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    return this.findByLookup(Keys.lookupEmail(email.toLowerCase()).PK);
  }

  /**
   * Atomically create the user profile and one lookup row per provided
   * identifier. If any identifier is already taken, the entire transaction
   * rolls back and we surface a 409.
   */
  async create(input: CreateUserInput): Promise<UserRecord> {
    const now = new Date().toISOString();
    const userId = ulid();

    const profile: UserRecord = {
      ...Keys.user(userId),
      entityType: 'User',
      userId,
      displayName: input.displayName,
      email: input.email,
      googleSub: input.googleSub,
      appleSub: input.appleSub,
      passwordHash: input.passwordHash,
      ratingCountAsSeller: 0,
      ratingCountAsBuyer: 0,
      listingsActiveCount: 0,
      mpcPurchasesCount: 0,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    const transactItems: Parameters<typeof this.db.transactWrite>[0] = [
      {
        Put: {
          TableName: this.db.tableName,
          Item: profile as unknown as Record<string, unknown>,
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ];

    if (input.googleSub) {
      const k = Keys.lookupGoogle(input.googleSub);
      transactItems.push({
        Put: {
          TableName: this.db.tableName,
          Item: { ...k, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }
    if (input.appleSub) {
      const k = Keys.lookupApple(input.appleSub);
      transactItems.push({
        Put: {
          TableName: this.db.tableName,
          Item: { ...k, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }
    if (input.email) {
      const k = Keys.lookupEmail(input.email);
      transactItems.push({
        Put: {
          TableName: this.db.tableName,
          Item: { ...k, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }

    try {
      await this.db.transactWrite(transactItems);
    } catch (err: unknown) {
      // ConditionalCheckFailed inside a transaction surfaces as
      // TransactionCanceledException with reasons[].
      const name = (err as { name?: string }).name;
      if (name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException') {
        throw new ConflictException('Account already exists with one of the provided identifiers');
      }
      throw err;
    }

    return profile;
  }

  /**
   * Attach a verified phone number to a user. Writes the phone lookup row
   * atomically; the conditional expression rejects collisions with other users.
   */
  async attachPhone(userId: string, phoneE164: string): Promise<void> {
    const u = await this.getById(userId);
    if (u.phoneE164 === phoneE164) return;

    const lookup = Keys.lookupPhone(phoneE164);
    await this.db.transactWrite([
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: u.PK, SK: u.SK },
          UpdateExpression: 'SET phoneE164 = :p, updatedAt = :now',
          ExpressionAttributeValues: { ':p': phoneE164, ':now': new Date().toISOString() },
        },
      },
      {
        Put: {
          TableName: this.db.tableName,
          Item: { ...lookup, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
  }

  async attachCpf(userId: string, cpf: string): Promise<void> {
    const u = await this.getById(userId);
    if (u.cpf === cpf) return;

    const lookup = Keys.lookupCpf(cpf);
    await this.db.transactWrite([
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: u.PK, SK: u.SK },
          UpdateExpression: 'SET cpf = :c, updatedAt = :now',
          ExpressionAttributeValues: { ':c': cpf, ':now': new Date().toISOString() },
        },
      },
      {
        Put: {
          TableName: this.db.tableName,
          Item: { ...lookup, entityType: 'UserLookup', userId },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ]);
  }

  async recordLgpdConsent(userId: string, version: string): Promise<void> {
    const u = await this.getById(userId);
    await this.db.update({
      Key: { PK: u.PK, SK: u.SK },
      UpdateExpression: 'SET lgpdConsentAt = :a, lgpdConsentVersion = :v, updatedAt = :now',
      ExpressionAttributeValues: {
        ':a': new Date().toISOString(),
        ':v': version,
        ':now': new Date().toISOString(),
      },
    });
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private async findByLookup(lookupPk: string): Promise<UserRecord | undefined> {
    const lookup = await this.db.get<{ userId: string }>(lookupPk, 'USER');
    if (!lookup) return undefined;
    return this.findById(lookup.userId);
  }
}
