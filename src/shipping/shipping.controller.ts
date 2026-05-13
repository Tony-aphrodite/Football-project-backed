import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Keys } from '../dynamodb/keys';
import { ShippingService, type MelhorEnvioWebhookPayload } from './shipping.service';
import type { OrderRecord } from '../orders/entities/order.entity';

@Controller('shipping')
export class ShippingController {
  private readonly logger = new Logger(ShippingController.name);

  constructor(
    private readonly db:       DynamoDbService,
    private readonly shipping: ShippingService,
  ) {}

  @Post('tracking-webhook')
  @HttpCode(200)
  async handleTrackingWebhook(@Body() payload: MelhorEnvioWebhookPayload) {
    const trackingCode = payload.tracking_number;
    if (!trackingCode) return { ok: true };

    const newStatus = this.shipping.mapTrackingStatus(payload.status);
    if (!newStatus) return { ok: true };

    // Find order by tracking code (scan — low volume endpoint)
    const orders = await this.db.scan<OrderRecord>({
      FilterExpression:          'shippingTrackingCode = :t',
      ExpressionAttributeValues: { ':t': trackingCode },
    });

    const order = orders[0];
    if (!order) {
      this.logger.warn(`Tracking webhook: no order found for tracking ${trackingCode}`);
      return { ok: true };
    }

    // Only advance status, never go backwards
    const STATUS_RANK: Record<string, number> = {
      PENDING_PAYMENT: 0, PAID: 1, SHIPPED: 2, DELIVERED: 3, COMPLETED: 4, CANCELLED: -1,
    };
    if ((STATUS_RANK[newStatus] ?? 0) <= (STATUS_RANK[order.status] ?? 0)) return { ok: true };

    const orderKey = Keys.order(order.orderId);
    await this.db.update({
      Key:                       { PK: orderKey.PK, SK: orderKey.SK },
      UpdateExpression:          'SET #s = :status, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: { ':status': newStatus, ':now': new Date().toISOString() },
    });

    this.logger.log(`Order ${order.orderId} → ${newStatus} via Melhor Envio webhook`);
    return { ok: true };
  }
}
