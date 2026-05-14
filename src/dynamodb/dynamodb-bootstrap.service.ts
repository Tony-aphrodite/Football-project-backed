import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  waitUntilTableExists,
  BillingMode,
  ProjectionType,
} from '@aws-sdk/client-dynamodb';
import type { AppConfig } from '../config/configuration';

@Injectable()
export class DynamoDbBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DynamoDbBootstrapService.name);
  private readonly client: DynamoDBClient;
  private readonly tableName: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const dynamo = config.get('dynamo', { infer: true });
    this.tableName = dynamo.tableName;
    this.client = new DynamoDBClient({
      region: dynamo.region,
      endpoint: dynamo.endpoint || undefined,
      credentials:
        dynamo.accessKeyId && dynamo.secretAccessKey
          ? { accessKeyId: dynamo.accessKeyId, secretAccessKey: dynamo.secretAccessKey }
          : undefined,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureTable();
  }

  private async ensureTable(): Promise<void> {
    // Check if table already exists
    try {
      await this.client.send(new DescribeTableCommand({ TableName: this.tableName }));
      this.logger.log(`DynamoDB table "${this.tableName}" already exists — skipping creation`);
      return;
    } catch (err) {
      if (!(err instanceof ResourceNotFoundException)) {
        this.logger.warn(`Could not describe table: ${(err as Error).message}`);
        return;
      }
    }

    // Table doesn't exist — create it
    this.logger.log(`Creating DynamoDB table "${this.tableName}"...`);

    try {
      await this.client.send(new CreateTableCommand({
        TableName:            this.tableName,
        BillingMode:          BillingMode.PAY_PER_REQUEST,
        AttributeDefinitions: [
          { AttributeName: 'PK',     AttributeType: 'S' },
          { AttributeName: 'SK',     AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
          { AttributeName: 'GSI2PK', AttributeType: 'S' },
          { AttributeName: 'GSI2SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH'  },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH'  },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: ProjectionType.ALL },
          },
          {
            IndexName: 'GSI2',
            KeySchema: [
              { AttributeName: 'GSI2PK', KeyType: 'HASH'  },
              { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: ProjectionType.ALL },
          },
        ],
      }));

      // Wait until table is ACTIVE before serving traffic
      this.logger.log('Waiting for table to become ACTIVE...');
      await waitUntilTableExists(
        { client: this.client, maxWaitTime: 120 },
        { TableName: this.tableName },
      );

      this.logger.log(`✅ DynamoDB table "${this.tableName}" created successfully with GSI1 and GSI2`);
    } catch (err) {
      this.logger.error(`Failed to create DynamoDB table: ${(err as Error).message}`);
    }
  }
}
