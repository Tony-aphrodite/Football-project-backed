import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
  type QueryCommandInput,
  type ScanCommandInput,
  type TransactWriteCommandInput,
  type UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';

import { DYNAMO_DOC_CLIENT } from './tokens';
import type { AppConfig } from '../config/configuration';

/**
 * Thin wrapper around the AWS Document client that injects the table name and
 * exposes only the verbs the application uses. Callers build keys via the
 * helpers in `keys.ts` rather than constructing PK/SK strings inline.
 */
@Injectable()
export class DynamoDbService {
  readonly tableName: string;

  constructor(
    @Inject(DYNAMO_DOC_CLIENT) readonly doc: DynamoDBDocumentClient,
    config: ConfigService<AppConfig, true>,
  ) {
    this.tableName = config.get('dynamo.tableName', { infer: true });
  }

  async get<T>(pk: string, sk: string): Promise<T | undefined> {
    const out = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { PK: pk, SK: sk } }),
    );
    return out.Item as T | undefined;
  }

  async put(item: Record<string, unknown>, opts?: { conditionExpression?: string }): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: opts?.conditionExpression,
      }),
    );
  }

  async query<T>(input: Omit<QueryCommandInput, 'TableName'>): Promise<T[]> {
    const out = await this.doc.send(
      new QueryCommand({ ...input, TableName: this.tableName }),
    );
    return (out.Items ?? []) as T[];
  }

  async queryCount(input: Omit<QueryCommandInput, 'TableName' | 'Select'>): Promise<number> {
    const out = await this.doc.send(
      new QueryCommand({ ...input, TableName: this.tableName, Select: 'COUNT' }),
    );
    return out.Count ?? 0;
  }

  async scan<T>(input: Omit<ScanCommandInput, 'TableName'>): Promise<T[]> {
    const out = await this.doc.send(
      new ScanCommand({ ...input, TableName: this.tableName }),
    );
    return (out.Items ?? []) as T[];
  }

  async scanCount(input: Omit<ScanCommandInput, 'TableName' | 'Select'>): Promise<number> {
    const out = await this.doc.send(
      new ScanCommand({ ...input, TableName: this.tableName, Select: 'COUNT' }),
    );
    return out.Count ?? 0;
  }

  async update(input: Omit<UpdateCommandInput, 'TableName'>): Promise<void> {
    await this.doc.send(
      new UpdateCommand({ ...input, TableName: this.tableName }),
    );
  }

  /**
   * Used to write multiple items atomically — e.g., creating a User profile
   * together with its phone/CPF/Google lookup rows so a duplicate phone causes
   * the entire transaction to fail.
   */
  async transactWrite(items: TransactWriteCommandInput['TransactItems']): Promise<void> {
    await this.doc.send(
      new TransactWriteCommand({ TransactItems: items }),
    );
  }
}
