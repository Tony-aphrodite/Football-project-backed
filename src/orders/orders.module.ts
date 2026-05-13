import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports:     [DynamoDbModule, ShippingModule],
  controllers: [OrdersController],
  providers:   [OrdersService],
})
export class OrdersModule {}
