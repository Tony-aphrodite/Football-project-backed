import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersScheduler } from './orders.scheduler';
import { DynamoDbModule } from '../dynamodb/dynamodb.module';
import { ShippingModule } from '../shipping/shipping.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports:     [ScheduleModule.forRoot(), DynamoDbModule, ShippingModule, NotificationsModule, UsersModule],
  controllers: [OrdersController],
  providers:   [OrdersService, OrdersScheduler],
})
export class OrdersModule {}
