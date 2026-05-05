import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { DynamoDbService } from './dynamodb.service';
import { DYNAMO_DOC_CLIENT } from './tokens';
import type { AppConfig } from '../config/configuration';

@Global()
@Module({
  providers: [
    {
      provide: DYNAMO_DOC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const dynamo = config.get('dynamo', { infer: true });
        const base = new DynamoDBClient({
          region: dynamo.region,
          endpoint: dynamo.endpoint || undefined,
          credentials:
            dynamo.accessKeyId && dynamo.secretAccessKey
              ? {
                  accessKeyId: dynamo.accessKeyId,
                  secretAccessKey: dynamo.secretAccessKey,
                }
              : undefined,
        });
        return DynamoDBDocumentClient.from(base, {
          marshallOptions: {
            removeUndefinedValues: true,
            convertClassInstanceToMap: false,
          },
          unmarshallOptions: { wrapNumbers: false },
        });
      },
    },
    DynamoDbService,
  ],
  exports: [DYNAMO_DOC_CLIENT, DynamoDbService],
})
export class DynamoDbModule {}
