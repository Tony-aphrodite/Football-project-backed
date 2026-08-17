import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ulid } from 'ulid';

import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { Keys, Gsi } from '../dynamodb/keys';
import { OrderRecord, OrderPublic, toOrderPublic } from './entities/order.entity';
import type { ListingRecord } from '../listings/entities/listing.entity';
import type { CouponRecord } from '../coupons/entities/coupon.entity';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { ShippingEstimateDto } from './dto/shipping-estimate.dto';
import { ShippingService, type ShippingOption } from '../shipping/shipping.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly db:            DynamoDbService,
    private readonly shipping:      ShippingService,
    private readonly notifications: NotificationsService,
    private readonly users:         UsersService,
  ) {}

  async create(buyerId: string, dto: CreateOrderDto): Promise<OrderPublic> {
    // Fetch buyer
    const buyerKey = Keys.user(buyerId);
    const buyer = await this.db.get<{ displayName: string; cpf?: string }>(buyerKey.PK, buyerKey.SK);
    if (!buyer) throw new NotFoundException('Buyer not found');
    if (!buyer.cpf) throw new BadRequestException('CPF obrigatório para realizar uma compra. Preencha em Dados Pessoais.');

    // Fetch listing
    const listingKey = Keys.listing(dto.listingId);
    const listing = await this.db.get<ListingRecord>(listingKey.PK, listingKey.SK);
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'ACTIVE') throw new BadRequestException('Listing is not available');
    if (buyerId === listing.sellerId) throw new ForbiddenException('Cannot buy your own listing');

    // Fetch seller
    const sellerKey = Keys.user(listing.sellerId);
    const seller = await this.db.get<{ displayName: string; sellerCep?: string }>(sellerKey.PK, sellerKey.SK);
    const sellerName = seller?.displayName ?? 'Vendedor';
    const sellerCep  = seller?.sellerCep;

    // Use the shipping price the buyer saw at checkout; fall back to 0 for Em Mãos
    const shippingCents = dto.deliveryMethod === 'CORREIOS' ? (dto.shippingCents ?? 0) : 0;

    // Apply coupon discount if provided
    let discountPct   = 0;
    let discountCents = 0;
    let couponCode: string | undefined;

    if (dto.couponCode) {
      const code = dto.couponCode.trim().toUpperCase();
      const ck   = Keys.coupon(code);
      const coupon = await this.db.get<CouponRecord>(ck.PK, ck.SK);

      if (!coupon || !coupon.active) throw new BadRequestException('Cupom inválido ou expirado');
      if (coupon.redemptionCount >= coupon.maxRedemptions) throw new BadRequestException('Cupom esgotado');

      const rk = Keys.couponRedemption(code, buyerId);
      const existing = await this.db.get(rk.PK, rk.SK);
      if (existing) throw new BadRequestException('Você já utilizou este cupom');

      discountPct   = coupon.discountPct;
      discountCents = Math.round(listing.priceCents * (discountPct / 100));
      couponCode    = code;
    }

    const totalCents = listing.priceCents + shippingCents - discountCents;
    const now        = new Date().toISOString();
    const orderId    = ulid();
    const orderKey   = Keys.order(orderId) as { PK: string; SK: 'METADATA' };

    const order: OrderRecord = {
      ...orderKey,
      entityType:     'Order',
      orderId,
      buyerId,
      buyerName:      buyer.displayName,
      sellerId:       listing.sellerId,
      sellerName,
      listingId:      listing.listingId,
      teamName:       listing.teamName,
      supplier:       listing.supplier,
      season:         listing.season,
      size:           listing.size,
      condition:      listing.condition,
      priceCents:     listing.priceCents,
      photoKeys:      listing.photoKeys,
      deliveryMethod: dto.deliveryMethod,
      shippingCents,
      totalCents,
      buyerCep:          dto.buyerCep,
      shippingServiceId: dto.shippingServiceId,
      sellerCep,
      couponCode,
      discountPct:    discountPct || undefined,
      discountCents:  discountCents || undefined,
      status:         'PENDING_PAYMENT',
      GSI1PK:         Gsi.ordersAsBuyer(buyerId).GSI1PK,
      GSI1SK:         `${now}#${orderId}`,
      GSI2PK:         Gsi.ordersAsSeller(listing.sellerId).GSI2PK,
      GSI2SK:         `${now}#${orderId}`,
      createdAt:      now,
      updatedAt:      now,
    };

    const sellerKey2 = Keys.user(listing.sellerId);

    await this.db.transactWrite([
      {
        Put: {
          TableName: this.db.tableName,
          Item:      order as unknown as Record<string, unknown>,
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK: listingKey.PK, SK: listingKey.SK },
          UpdateExpression:          'SET #s = :sold, GSI1PK = :gsi1pk, updatedAt = :now',
          ConditionExpression:       '#s = :active',
          ExpressionAttributeNames:  { '#s': 'status' },
          ExpressionAttributeValues: {
            ':sold':   'SOLD',
            ':active': 'ACTIVE',
            ':gsi1pk': Gsi.listingFeed('SOLD').GSI1PK,
            ':now':    now,
          },
        },
      },
      {
        Update: {
          TableName:                 this.db.tableName,
          Key:                       { PK: sellerKey2.PK, SK: sellerKey2.SK },
          UpdateExpression:          'SET listingsActiveCount = listingsActiveCount - :one, updatedAt = :now',
          ConditionExpression:       'listingsActiveCount > :zero',
          ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':now': now },
        },
      },
      // Record coupon redemption if coupon was used
      ...(couponCode ? (() => {
        const ck = Keys.coupon(couponCode);
        const rk = Keys.couponRedemption(couponCode, buyerId);
        return [
          {
            Put: {
              TableName: this.db.tableName,
              Item: { ...rk, entityType: 'CouponRedemption', code: couponCode, userId: buyerId, discountPct, redeemedAt: now },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Update: {
              TableName:                 this.db.tableName,
              Key:                       { PK: ck.PK, SK: ck.SK },
              UpdateExpression:          'SET redemptionCount = redemptionCount + :one',
              ConditionExpression:       'redemptionCount < maxRedemptions',
              ExpressionAttributeValues: { ':one': 1 },
            },
          },
        ];
      })() : []),
    ]);

    return toOrderPublic(order);
  }

  async listMine(userId: string): Promise<OrderPublic[]> {
    const [buyerOrders, sellerOrders] = await Promise.all([
      this.db.query<OrderRecord>({
        IndexName:                 'GSI1',
        KeyConditionExpression:    'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': Gsi.ordersAsBuyer(userId).GSI1PK },
        ScanIndexForward:          false,
      }),
      this.db.query<OrderRecord>({
        IndexName:                 'GSI2',
        KeyConditionExpression:    'GSI2PK = :pk',
        ExpressionAttributeValues: { ':pk': Gsi.ordersAsSeller(userId).GSI2PK },
        ScanIndexForward:          false,
      }),
    ]);

    // Deduplicate by orderId
    const seen = new Set<string>();
    const combined: OrderRecord[] = [];
    for (const o of [...buyerOrders, ...sellerOrders]) {
      if (!seen.has(o.orderId)) {
        seen.add(o.orderId);
        combined.push(o);
      }
    }

    // Sort by createdAt desc
    combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return combined.map(toOrderPublic);
  }

  async findOne(userId: string, orderId: string): Promise<OrderPublic> {
    const k = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(k.PK, k.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not your order');
    }
    return toOrderPublic(order);
  }

  async confirmReceipt(buyerId: string, orderId: string): Promise<void> {
    const k = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(k.PK, k.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');
    if (order.status !== 'SHIPPED' && order.status !== 'PAID') {
      throw new BadRequestException('Order cannot be confirmed in its current status');
    }

    const now = new Date().toISOString();
    await this.db.update({
      Key:                       { PK: k.PK, SK: k.SK },
      UpdateExpression:          'SET #s = :delivered, escrowReleaseAt = :now, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: { ':delivered': 'DELIVERED', ':now': now },
    });

    // Notify seller that buyer confirmed
    const seller = await this.users.findById(order.sellerId).catch(() => null);
    void this.notifications.send(
      seller?.expoPushToken,
      '✅ Recebimento confirmado!',
      `${order.buyerName} confirmou o recebimento de ${order.teamName}. Pagamento sendo processado.`,
      { orderId: order.orderId, screen: 'OrderDetail' },
    );
  }

  async addTracking(sellerId: string, orderId: string, correiosTracking: string): Promise<OrderPublic> {
    const k = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(k.PK, k.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Not your order');
    if (order.status !== 'PAID' && order.status !== 'SHIPPED') {
      throw new BadRequestException('Tracking can only be added when order is PAID or SHIPPED');
    }

    const now = new Date().toISOString();
    // Reset escrow window to 7 days from actual ship date (seller may ship days after payment)
    const escrowReleaseAt = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
    await this.db.update({
      Key:                       { PK: k.PK, SK: k.SK },
      UpdateExpression:          'SET correiosTracking = :tracking, #s = :shipped, escrowReleaseAt = :era, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':tracking': correiosTracking.toUpperCase(),
        ':shipped':  'SHIPPED',
        ':era':      escrowReleaseAt,
        ':now':      now,
      },
    });

    const updated = toOrderPublic({ ...order, correiosTracking: correiosTracking.toUpperCase(), status: 'SHIPPED', updatedAt: now });

    // Notify buyer
    const buyer = await this.users.findById(order.buyerId).catch(() => null);
    void this.notifications.send(
      buyer?.expoPushToken,
      '📦 Seu pedido foi enviado!',
      `${order.teamName} está a caminho. Rastreio: ${correiosTracking.toUpperCase()}`,
      { orderId: order.orderId, screen: 'OrderDetail' },
    );

    return updated;
  }

  async disputeOrder(buyerId: string, orderId: string, reason: string): Promise<void> {
    const k = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(k.PK, k.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');
    if (!['PAID', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
      throw new BadRequestException('Dispute cannot be opened in the current order status');
    }

    const now = new Date().toISOString();
    await this.db.update({
      Key:                       { PK: k.PK, SK: k.SK },
      UpdateExpression:          'SET #s = :disputed, disputedAt = :now, disputeReason = :reason, escrowReleaseAt = :far, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':disputed': 'DISPUTED',
        ':now':      now,
        ':reason':   reason,
        ':far':      '2099-12-31T23:59:59.000Z',
      },
    });

    const seller = await this.users.findById(order.sellerId).catch(() => null);
    void this.notifications.send(
      seller?.expoPushToken,
      '⚠️ Problema reportado no pedido',
      `O comprador abriu uma disputa no pedido #${orderId.slice(-8).toUpperCase()}. Nossa equipe entrará em contato.`,
      { orderId, screen: 'OrderDetail' },
    );
  }

  async runAutoRelease(): Promise<void> {
    const now = new Date().toISOString();
    let released = 0;

    const candidates = await this.db.scan<OrderRecord>({
      FilterExpression:          '#s IN (:paid, :shipped, :delivered) AND escrowReleaseAt <= :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: { ':paid': 'PAID', ':shipped': 'SHIPPED', ':delivered': 'DELIVERED', ':now': now },
    });

    for (const order of candidates) {
      try {
        const k = Keys.order(order.orderId);
        await this.db.update({
          Key:                       { PK: k.PK, SK: k.SK },
          UpdateExpression:          'SET #s = :completed, updatedAt = :now',
          ConditionExpression:       '#s IN (:paid, :shipped, :delivered)',
          ExpressionAttributeNames:  { '#s': 'status' },
          ExpressionAttributeValues: {
            ':completed': 'COMPLETED',
            ':paid':      'PAID',
            ':shipped':   'SHIPPED',
            ':delivered': 'DELIVERED',
            ':now':       now,
          },
        });
        released++;

        const [buyer, seller] = await Promise.all([
          this.users.findById(order.buyerId).catch(() => null),
          this.users.findById(order.sellerId).catch(() => null),
        ]);

        void this.notifications.send(
          seller?.expoPushToken,
          '✅ Pagamento liberado!',
          `O valor do pedido #${order.orderId.slice(-8).toUpperCase()} foi liberado para saque.`,
          { orderId: order.orderId, screen: 'OrderDetail' },
        );
        void this.notifications.send(
          buyer?.expoPushToken,
          '✅ Pedido concluído',
          `Seu pedido de ${order.teamName} foi concluído com sucesso.`,
          { orderId: order.orderId, screen: 'OrderDetail' },
        );
      } catch (err) {
        this.logger.error(`Auto-release failed for order ${order.orderId}:`, err);
      }
    }

    if (released > 0) this.logger.log(`Auto-released ${released} order(s)`);
  }

  async estimateShipping(dto: ShippingEstimateDto): Promise<ShippingOption[]> {
    // Look up listing to get seller's CEP and package weight
    const listingKey = Keys.listing(dto.listingId);
    const listing = await this.db.get<ListingRecord>(listingKey.PK, listingKey.SK);
    if (!listing) throw new NotFoundException('Listing not found');

    // Look up seller to get their shipping origin CEP
    const sellerKey = Keys.user(listing.sellerId);
    const seller = await this.db.get<{ sellerCep?: string }>(sellerKey.PK, sellerKey.SK);
    const fromCep = seller?.sellerCep ?? '01310100'; // fallback to São Paulo

    const weightGrams = dto.weightGrams ?? listing.weightGrams ?? 300;
    return this.shipping.estimate(fromCep, dto.toCep, weightGrams);
  }
}
