import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersScheduler {
  private readonly logger = new Logger(OrdersScheduler.name);

  constructor(private readonly orders: OrdersService) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleAutoRelease(): Promise<void> {
    this.logger.log('Running escrow auto-release check');
    await this.orders.runAutoRelease();
  }
}
