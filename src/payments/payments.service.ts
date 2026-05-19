import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Keys } from '../dynamodb/keys';
import { OrderRecord } from '../orders/entities/order.entity';
import { PagarmeService } from './pagarme.service';
import { ShippingService } from '../shipping/shipping.service';
import { UsersService } from '../users/users.service';
import { DeveloperEarningsService } from '../developer-earnings/developer-earnings.service';
import { FiscalService } from '../fiscal/fiscal.service';
import type { AppConfig } from '../config/configuration';

export interface PixPaymentResult {
  orderId: string;
  pagarmeOrderId: string;
  pagarmeChargeId: string;
  pixQrCode: string;
  pixQrCodeUrl: string;
  pixExpiresAt: string;
  totalCents: number;
}

export interface PaymentStatusResult {
  orderId: string;
  status: string;
  pagarmeStatus: string | null;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly db:          DynamoDbService,
    private readonly pagarme:     PagarmeService,
    private readonly shipping:    ShippingService,
    private readonly users:       UsersService,
    private readonly devEarnings: DeveloperEarningsService,
    private readonly fiscal:      FiscalService,
    private readonly config:      ConfigService<AppConfig, true>,
  ) {}

  // ── Initiate PIX ─────────────────────────────────────────────────────────

  async initiatePixPayment(
    buyerId: string,
    orderId: string,
  ): Promise<PixPaymentResult> {
    const orderKey = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(orderKey.PK, orderKey.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');

    if (order.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException(
        `Order cannot be paid in status ${order.status}`,
      );
    }

    // Fetch buyer data — required by Pagar.me
    const buyerKey = Keys.user(buyerId);
    const buyer = await this.db.get<{ cpf?: string; displayName: string; phoneE164?: string; email?: string }>(
      buyerKey.PK,
      buyerKey.SK,
    );
    if (!buyer) throw new NotFoundException('Buyer profile not found');

    const cpf   = buyer.cpf ?? '00000000000';
    const phone = buyer.phoneE164 ?? '+5511999999999';

    // Load seller for recipient ID (split payment)
    const sellerKey = Keys.user(order.sellerId);
    const seller    = await this.db.get<{ pagarmeRecipientId?: string }>(sellerKey.PK, sellerKey.SK);
    const arenaRecipientId  = this.config.get('pagarme.arenaRecipientId', { infer: true });
    const sellerRecipientId = seller?.pagarmeRecipientId;

    const pagarmeOrder = await this.pagarme.createPixOrder({
      externalCode:     `ARENA-${orderId}`,
      amountCents:      order.totalCents,
      customerName:     buyer.displayName,
      customerCpf:      cpf,
      customerPhone:    phone,
      customerEmail:    buyer.email,
      itemDescription:  `Camisa ${order.teamName} — ${order.supplier} ${order.season}`,
      expiresInSeconds: 86_400,
      // Include split only when both recipient IDs are configured
      arenaRecipientId,
      sellerRecipientId,
      commissionPct: 7,
    });

    const charge = pagarmeOrder.charges?.[0];
    const tx     = charge?.last_transaction;

    if (!charge || !tx?.qr_code) {
      this.logger.error('Pagar.me response missing charge/qr_code', pagarmeOrder);
      throw new Error('Pagar.me returned an unexpected response');
    }

    const pixExpiresAt = tx.expires_at ?? new Date(Date.now() + 86_400_000).toISOString();
    const now = new Date().toISOString();

    await this.db.update({
      Key: { PK: orderKey.PK, SK: orderKey.SK },
      UpdateExpression: [
        'SET pagarmeOrderId = :poi',
        'pagarmeChargeId = :pci',
        'paymentMethod = :pm',
        'pixQrCode = :qr',
        'pixQrCodeUrl = :qru',
        'pixExpiresAt = :exp',
        'updatedAt = :now',
      ].join(', '),
      ExpressionAttributeValues: {
        ':poi': pagarmeOrder.id,
        ':pci': charge.id,
        ':pm':  'PIX',
        ':qr':  tx.qr_code,
        ':qru': tx.qr_code_url ?? '',
        ':exp': pixExpiresAt,
        ':now': now,
      },
    });

    return {
      orderId,
      pagarmeOrderId: pagarmeOrder.id,
      pagarmeChargeId: charge.id,
      pixQrCode: tx.qr_code,
      pixQrCodeUrl: tx.qr_code_url ?? '',
      pixExpiresAt,
      totalCents: order.totalCents,
    };
  }

  // ── Poll payment status ───────────────────────────────────────────────────

  async getPaymentStatus(
    userId: string,
    orderId: string,
  ): Promise<PaymentStatusResult> {
    const orderKey = Keys.order(orderId);
    const order = await this.db.get<OrderRecord & {
      pagarmeOrderId?: string;
    }>(orderKey.PK, orderKey.SK);

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not your order');
    }

    let pagarmeStatus: string | null = null;

    // If there's a Pagar.me order and our local status is still PENDING_PAYMENT,
    // sync with Pagar.me to catch payments that came in without a webhook.
    if (order.pagarmeOrderId && order.status === 'PENDING_PAYMENT') {
      try {
        const remote = await this.pagarme.getOrder(order.pagarmeOrderId);
        pagarmeStatus = remote.status;

        if (remote.status === 'paid') {
          await this.markPaid(orderId);
          return { orderId, status: 'PAID', pagarmeStatus };
        }
      } catch (err) {
        this.logger.warn(`Pagar.me poll failed for order ${orderId}:`, err);
      }
    }

    return { orderId, status: order.status, pagarmeStatus };
  }

  // ── Webhook handler ───────────────────────────────────────────────────────

  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    if (!this.pagarme.validateWebhookSignature(rawBody, signature)) {
      this.logger.warn('Webhook signature validation failed');
      return;
    }

    let event: { type: string; data: { id: string; order?: { code: string } } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      this.logger.warn('Webhook body is not valid JSON');
      return;
    }

    this.logger.log(`Webhook received: ${event.type}`);

    if (event.type === 'charge.paid') {
      // event.data.order.code = "ARENA-{orderId}"
      const orderCode = event.data.order?.code ?? '';
      const orderId = orderCode.replace('ARENA-', '');
      if (orderId) {
        await this.markPaid(orderId).catch((err) =>
          this.logger.error(`markPaid failed for ${orderId}:`, err),
        );
      }
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async markPaid(orderId: string): Promise<void> {
    const orderKey = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(orderKey.PK, orderKey.SK);
    if (!order || order.status !== 'PENDING_PAYMENT') return;

    const now = new Date().toISOString();
    // Escrow auto-releases 7 days after payment
    const escrowReleaseAt = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();

    await this.db.update({
      Key: { PK: orderKey.PK, SK: orderKey.SK },
      UpdateExpression: 'SET #s = :paid, escrowReleaseAt = :era, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':paid': 'PAID',
        ':era':  escrowReleaseAt,
        ':now':  now,
      },
    });

    this.logger.log(`Order ${orderId} marked PAID, escrow releases at ${escrowReleaseAt}`);

    // Async: fiscal invoices + shipping label (do not block payment confirmation)
    void this.fiscal.emitCommissionNfse(order);
    void this.fiscal.emitMpcNfe(order);
    if (order.deliveryMethod === 'CORREIOS' && order.buyerCep) {
      void this.purchaseLabelAsync(order);
    }
  }

  private async purchaseLabelAsync(order: OrderRecord): Promise<void> {
    try {
      const seller = await this.users.findById(order.sellerId).catch(() => null);
      const fromCep = seller?.sellerCep ?? order.sellerCep ?? '01310100';

      // Get listing for weight info
      const listingKey = Keys.listing(order.listingId);
      const listing = await this.db.get<{ weightGrams?: number }>(listingKey.PK, listingKey.SK);

      // Default service ID 1 = PAC, 2 = SEDEX (Melhor Envio Correios)
      const serviceId = 2; // SEDEX as default for speed; TODO: store selected service in order

      const result = await this.shipping.purchaseLabel({
        orderId:      order.orderId,
        fromCep,
        toCep:        order.buyerCep!,
        fromName:     order.sellerName,
        toName:       order.buyerName,
        serviceId,
        weightGrams:  listing?.weightGrams ?? 300,
        productName:  `${order.teamName} ${order.season}`,
        productValue: order.priceCents / 100,
      });

      if (result) {
        // Calculate spread: buyer paid shipping − actual Melhor Envio cost
        const spreadCents = Math.max(0, order.shippingCents - result.actualCostCents);

        // Record spread → determine beneficiary (developer vs Arena)
        const spreadResult = spreadCents > 0
          ? await this.devEarnings.recordSpread(spreadCents)
          : { beneficiary: 'ARENA' as const, developerGets: 0, arenaGets: 0 };

        const orderKey = Keys.order(order.orderId);
        await this.db.update({
          Key: { PK: orderKey.PK, SK: orderKey.SK },
          UpdateExpression: [
            'SET melhorEnvioOrderId = :m',
            'shippingLabelUrl = :l',
            'shippingTrackingCode = :t',
            'shippingCarrier = :c',
            'shippingService = :s',
            'shippingActualCostCents = :actual',
            'shippingSpreadCents = :spread',
            'spreadBeneficiary = :beneficiary',
            '#st = :shipped',
            'updatedAt = :now',
          ].join(', '),
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':m':           result.melhorEnvioOrderId,
            ':l':           result.labelUrl,
            ':t':           result.trackingCode,
            ':c':           result.carrier,
            ':s':           result.service,
            ':actual':      result.actualCostCents,
            ':spread':      spreadCents,
            ':beneficiary': spreadResult.beneficiary,
            ':shipped':     'SHIPPED',
            ':now':         new Date().toISOString(),
          },
        });

        this.logger.log(
          `Order ${order.orderId} shipped. Tracking: ${result.trackingCode}. ` +
          `Spread: R$${(spreadCents / 100).toFixed(2)} → ${spreadResult.beneficiary} ` +
          `(developer: R$${(spreadResult.developerGets / 100).toFixed(2)}, arena: R$${(spreadResult.arenaGets / 100).toFixed(2)})`
        );
      }
    } catch (err) {
      this.logger.error(`Label purchase failed for order ${order.orderId}`, err);
    }
  }
}
