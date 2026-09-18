import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersScheduler {
  private readonly logger = new Logger(OrdersScheduler.name);

  constructor(private readonly orders: OrdersService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCarrierSync(): Promise<void> {
    try {
      await this.orders.syncCarrierStatus();
    } catch (err) {
      this.logger.error('Carrier status sync failed', err);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoRelease(): Promise<void> {
    this.logger.log('Running escrow auto-release check');
    await this.orders.runAutoRelease();
    try {
      await this.orders.flagUndelivered();
    } catch (err) {
      this.logger.error('Undelivered order check failed', err);
    }
  }
}
