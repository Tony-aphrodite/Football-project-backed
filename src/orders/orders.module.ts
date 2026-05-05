import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [DynamoDbModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
