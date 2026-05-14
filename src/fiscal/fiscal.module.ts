import { Module } from '@nestjs/common';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';
import { FocusNfeService } from './focus-nfe.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';

@Module({
  imports:     [DynamoDbModule],
  controllers: [FiscalController],
  providers:   [FiscalService, FocusNfeService],
  exports:     [FiscalService],
})
export class FiscalModule {}
