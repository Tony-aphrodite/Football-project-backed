import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentsScheduler {
  private readonly logger = new Logger(PaymentsScheduler.name);

  constructor(private readonly payments: PaymentsService) {}

  /** Give unpaid jerseys back to the sellers. */
  @Cron(CronExpression.EVERY_HOUR)
  async handleUnpaidOrders(): Promise<void> {
    try {
      await this.payments.expireUnpaidOrders();
    } catch (err) {
      this.logger.error('Unpaid order sweep failed', err);
    }
  }
}
