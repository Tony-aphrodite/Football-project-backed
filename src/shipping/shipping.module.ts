import { Module } from '@nestjs/common';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';

@Module({
  imports:     [DynamoDbModule],
  controllers: [ShippingController],
  providers:   [ShippingService],
  exports:     [ShippingService],
})
export class ShippingModule {}
