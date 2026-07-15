import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';
import { ShippingModule } from '../shipping/shipping.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports:     [DynamoDbModule, ShippingModule, NotificationsModule, UsersModule],
  controllers: [OrdersController],
  providers:   [OrdersService],
})
export class OrdersModule {}
