import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import type { MelhorEnvioWebhookPayload } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  private readonly logger = new Logger(ShippingController.name);

  /**
   * Melhor Envio tracking webhook. Nothing in the payload is checked, so it is
   * not allowed to change an order: anyone who knew a tracking code could mark
   * the parcel as delivered and start the countdown to the seller's payout.
   * Posting and delivery are applied by the hourly carrier sync
   * (OrdersService.syncCarrierStatus), which asks Melhor Envio with our token,
   * starts the buyer's 7-day window and notifies them.
   */
  @Post('tracking-webhook')
  @HttpCode(200)
  handleTrackingWebhook(@Body() payload: MelhorEnvioWebhookPayload) {
    this.logger.log(
      `Tracking webhook for ${payload?.tracking_number ?? '?'} (${payload?.status ?? '?'}) — left to the hourly sync`,
    );
    return { ok: true };
  }
}
