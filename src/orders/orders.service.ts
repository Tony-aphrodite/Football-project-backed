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
import { EmailService } from '../email/email.service';
import {
  deliveryConfirmedSellerEmail,
  disputeOpenedSellerEmail,
  disputeOpenedBuyerEmail,
  disputeOpenedAdminEmail,
  orderDeliveredBuyerEmail,
  orderCompletedBuyerEmail,
  orderShippedBuyerEmail,
  paymentReleasedSellerEmail,
  rateReminderEmail,
  type OrderEmailData,
} from '../email/email.templates';

/**
 * When the seller gets paid. The buyer has 7 days after delivery to report a
 * problem (or regret the purchase), so the money waits for that window. If
 * delivery is never registered — no confirmation and no carrier update — the
 * order still releases 30 days after posting instead of hanging forever.
 */
const DAY_MS = 24 * 3_600_000;
/** Where Arena is told about things that need a human (disputes). */
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL ?? 'contato@arenadosmantos.app.br';
const RELEASE_AFTER_DELIVERY_MS = 7 * DAY_MS;
const RELEASE_AFTER_SHIPPING_MS = 30 * DAY_MS;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly db:            DynamoDbService,
    private readonly shipping:      ShippingService,
    private readonly notifications: NotificationsService,
    private readonly users:         UsersService,
    private readonly email:         EmailService,
  ) {}

  /** Shape an order record for the email templates. */
  private emailData(order: OrderRecord): OrderEmailData {
    return {
      orderId:    order.orderId,
      teamName:   order.teamName,
      season:     order.season,
      priceCents: order.priceCents,
      buyerName:  order.buyerName,
      sellerName: order.sellerName,
      tracking:   order.correiosTracking,
    };
  }

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

    // A Correios order must carry a complete delivery address — without it no
    // label can be bought and the jersey cannot be posted.
    if (dto.deliveryMethod === 'CORREIOS') {
      const cep = (dto.buyerCep ?? '').replace(/\D/g, '');
      const incomplete =
        cep.length !== 8 ||
        !dto.buyerRua?.trim() || !dto.buyerNumero?.trim() ||
        !dto.buyerBairro?.trim() || !dto.buyerCidade?.trim() ||
        (dto.buyerEstado ?? '').trim().length !== 2;
      if (incomplete) {
        throw new BadRequestException(
          'Endereço de entrega incompleto. Atualize o app e preencha rua, número, bairro, cidade e UF.',
        );
      }
    }

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
      buyerRua:          dto.buyerRua?.trim(),
      buyerNumero:       dto.buyerNumero?.trim(),
      buyerComplemento:  dto.buyerComplemento?.trim() || undefined,
      buyerBairro:       dto.buyerBairro?.trim(),
      buyerCidade:       dto.buyerCidade?.trim(),
      buyerEstado:       dto.buyerEstado?.trim().toUpperCase(),
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

    return combined.map((o) => this.forViewer(o, userId));
  }

  /** The printable label is the seller's business; buyers only see the tracking code. */
  private forViewer(order: OrderRecord, userId: string): OrderPublic {
    const pub = toOrderPublic(order);
    return order.sellerId === userId ? pub : { ...pub, shippingLabelUrl: undefined };
  }

  /**
   * Mark as SHIPPED the paid orders whose label Melhor Envio now reports as
   * posted or delivered, and tell the buyer. Runs hourly; the seller can also
   * confirm by hand (addTracking), whichever happens first.
   */
  async syncCarrierStatus(): Promise<void> {
    const open = await this.db.scanAll<OrderRecord>({
      FilterExpression: 'entityType = :o AND #s IN (:paid, :shipped) AND attribute_exists(melhorEnvioOrderId)',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':o': 'Order', ':paid': 'PAID', ':shipped': 'SHIPPED' },
    });
    if (open.length === 0) return;

    const statuses = await this.shipping.trackingStatus(open.map((o) => o.melhorEnvioOrderId!));
    for (const order of open) {
      const s = statuses[order.melhorEnvioOrderId!]?.status;
      if (s !== 'posted' && s !== 'delivered') continue;
      try {
        if (order.status === 'PAID') {
          const code = order.shippingTrackingCode ?? statuses[order.melhorEnvioOrderId!]?.tracking;
          if (code) await this.addTracking(order.sellerId, order.orderId, code);
          else await this.markShipped(order.sellerId, order.orderId);
          this.logger.log(`Order ${order.orderId} posted per Melhor Envio — marked SHIPPED`);
        }
        if (s === 'delivered') await this.markDeliveredByCarrier(order.orderId);
      } catch (err) {
        this.logger.warn(`Could not apply carrier status '${s}' to ${order.orderId}`, err);
      }
    }
  }

  /** The Correios registered the delivery: the buyer's 7-day window starts now. */
  private async markDeliveredByCarrier(orderId: string): Promise<void> {
    const k = Keys.order(orderId);
    const now = new Date().toISOString();
    try {
      await this.db.update({
        Key: { PK: k.PK, SK: k.SK },
        UpdateExpression: 'SET #s = :delivered, deliveredAt = :now, escrowReleaseAt = :era, updatedAt = :now',
        ConditionExpression: '#s = :shipped',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':delivered': 'DELIVERED', ':shipped': 'SHIPPED', ':now': now,
          ':era': new Date(Date.now() + RELEASE_AFTER_DELIVERY_MS).toISOString(),
        },
      });
    } catch {
      return; // already delivered, disputed or confirmed by the buyer
    }
    const order = await this.db.get<OrderRecord>(k.PK, k.SK);
    if (!order) return;
    const buyer = await this.users.findById(order.buyerId).catch(() => null);
    void this.notifications.send(
      buyer?.expoPushToken,
      '📬 Sua camisa foi entregue!',
      `Confira ${order.teamName}. Você tem 7 dias para relatar qualquer problema.`,
      { orderId, screen: 'OrderDetail' },
    );
    const mail = orderDeliveredBuyerEmail(this.emailData(order));
    void this.email.send(buyer?.email, mail.subject, mail.html);
    this.logger.log(`Order ${orderId} delivered per Melhor Envio — releases in 7 days`);
  }

  async findOne(userId: string, orderId: string): Promise<OrderPublic> {
    const k = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(k.PK, k.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('Not your order');
    }
    return this.forViewer(order, userId);
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
      UpdateExpression:          'SET #s = :delivered, deliveredAt = :now, escrowReleaseAt = :era, updatedAt = :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':delivered': 'DELIVERED',
        ':now':       now,
        ':era':       new Date(Date.now() + RELEASE_AFTER_DELIVERY_MS).toISOString(),
      },
    });

    // Notify seller that buyer confirmed
    const seller = await this.users.findById(order.sellerId).catch(() => null);
    void this.notifications.send(
      seller?.expoPushToken,
      '✅ Recebimento confirmado!',
      `${order.buyerName} confirmou o recebimento de ${order.teamName}. O pagamento é liberado em 7 dias.`,
      { orderId: order.orderId, screen: 'OrderDetail' },
    );
    const confirmedMail = deliveryConfirmedSellerEmail(this.emailData(order));
    void this.email.send(seller?.email, confirmedMail.subject, confirmedMail.html);

    // Both sides can rate once delivery is confirmed — without a nudge here
    // almost nobody returns to the app to do it.
    const buyerForRating = await this.users.findById(order.buyerId).catch(() => null);
    const rateSeller = rateReminderEmail(this.emailData(order), order.sellerName);
    void this.email.send(buyerForRating?.email, rateSeller.subject, rateSeller.html);
    const rateBuyer = rateReminderEmail(this.emailData(order), order.buyerName);
    void this.email.send(seller?.email, rateBuyer.subject, rateBuyer.html);
  }

  /**
   * Seller confirms the package is with the Correios. Uses the label's tracking
   * code when there is one — Melhor Envio sometimes has none yet, and the sale
   * must not be stuck because of that.
   */
  async markShipped(sellerId: string, orderId: string): Promise<OrderPublic> {
    const k = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(k.PK, k.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.sellerId !== sellerId) throw new ForbiddenException('Not your order');
    if (order.shippingTrackingCode) return this.addTracking(sellerId, orderId, order.shippingTrackingCode);
    if (order.status !== 'PAID') throw new BadRequestException('Order is not awaiting shipment');

    const now = new Date().toISOString();
    await this.db.update({
      Key: { PK: k.PK, SK: k.SK },
      UpdateExpression: 'SET #s = :shipped, escrowReleaseAt = :era, updatedAt = :now',
      ConditionExpression: '#s = :paid',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':shipped': 'SHIPPED',
        ':paid':    'PAID',
        ':era':     new Date(Date.now() + RELEASE_AFTER_SHIPPING_MS).toISOString(),
        ':now':     now,
      },
    });

    const buyer = await this.users.findById(order.buyerId).catch(() => null);
    void this.notifications.send(
      buyer?.expoPushToken,
      '📦 Seu pedido foi enviado!',
      `${order.teamName} está a caminho.`,
      { orderId: order.orderId, screen: 'OrderDetail' },
    );
    const shippedMail = orderShippedBuyerEmail(this.emailData(order));
    void this.email.send(buyer?.email, shippedMail.subject, shippedMail.html);

    return toOrderPublic({ ...order, status: 'SHIPPED', updatedAt: now });
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
    // Released 7 days after delivery; this is only the fallback for a delivery
    // that is never registered.
    const escrowReleaseAt = new Date(Date.now() + RELEASE_AFTER_SHIPPING_MS).toISOString();
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
    const shippedMail = orderShippedBuyerEmail({
      ...this.emailData(order),
      tracking: correiosTracking.toUpperCase(),
    });
    void this.email.send(buyer?.email, shippedMail.subject, shippedMail.html);

    return updated;
  }

  async disputeOrder(buyerId: string, orderId: string, reason: string): Promise<void> {
    const k = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(k.PK, k.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId) throw new ForbiddenException('Not your order');
    if (!['PAID', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
      throw new BadRequestException('Não é possível abrir uma disputa neste pedido.');
    }
    // The window is the 7 days after delivery; once the money is due to the
    // seller, it is too late.
    if (order.status === 'DELIVERED' && order.escrowReleaseAt && new Date(order.escrowReleaseAt) <= new Date()) {
      throw new BadRequestException('O prazo de 7 dias após a entrega para relatar um problema terminou.');
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
    const disputeMail = disputeOpenedSellerEmail(this.emailData(order), reason);
    void this.email.send(seller?.email, disputeMail.subject, disputeMail.html);

    // The buyer gets a receipt with what to send, and Arena gets the alert —
    // before, only the seller was told anything.
    const buyer = await this.users.findById(order.buyerId).catch(() => null);
    const buyerMail = disputeOpenedBuyerEmail(this.emailData(order), reason);
    void this.email.send(buyer?.email, buyerMail.subject, buyerMail.html);
    const adminMail = disputeOpenedAdminEmail(this.emailData(order), reason, buyer?.email, seller?.email);
    void this.email.send(ADMIN_ALERT_EMAIL, adminMail.subject, adminMail.html);
  }

  /**
   * Close a dispute. Without this an order stays DISPUTED forever: the escrow
   * never releases and the seller is never paid.
   *
   * 'release' puts the order back on the delivered path so the money goes to
   * the seller; 'cancel' ends the order in the buyer's favour — the refund
   * itself is done in the Pagar.me dashboard, since only a human should decide
   * to give money back.
   */
  async resolveDispute(orderId: string, outcome: 'release' | 'cancel', note?: string): Promise<OrderPublic> {
    const k = Keys.order(orderId);
    const order = await this.db.get<OrderRecord>(k.PK, k.SK);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'DISPUTED') throw new BadRequestException(`Order is ${order.status}, not DISPUTED`);

    const now = new Date().toISOString();
    const status = outcome === 'release' ? 'DELIVERED' : 'CANCELLED';
    await this.db.update({
      Key: { PK: k.PK, SK: k.SK },
      UpdateExpression: 'SET #s = :st, escrowReleaseAt = :now, disputeResolvedAt = :now, disputeResolution = :r, updatedAt = :now',
      ConditionExpression: '#s = :disputed',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':st': status, ':disputed': 'DISPUTED', ':now': now,
        ':r': `${outcome}${note ? `: ${note.slice(0, 200)}` : ''}`,
      },
    });
    this.logger.log(`Dispute on ${orderId} resolved as ${outcome}`);

    const [buyer, seller] = await Promise.all([
      this.users.findById(order.buyerId).catch(() => null),
      this.users.findById(order.sellerId).catch(() => null),
    ]);
    const title = outcome === 'release' ? '✅ Disputa resolvida' : '❌ Pedido cancelado';
    const body = outcome === 'release'
      ? `A disputa do pedido #${order.orderId.slice(-8).toUpperCase()} foi encerrada e o pagamento será liberado ao vendedor.`
      : `O pedido #${order.orderId.slice(-8).toUpperCase()} foi cancelado. O reembolso será processado pela equipe.`;
    void this.notifications.send(buyer?.expoPushToken, title, body, { orderId, screen: 'OrderDetail' });
    void this.notifications.send(seller?.expoPushToken, title, body, { orderId, screen: 'OrderDetail' });

    return toOrderPublic({ ...order, status, updatedAt: now });
  }

  async runAutoRelease(): Promise<void> {
    const now = new Date().toISOString();
    let released = 0;

    // scanAll + entityType: a single scan page silently misses orders once the
    // table grows. A Correios order that was never posted is never released —
    // the seller has not shipped anything; hand delivery keeps a fallback.
    const candidates = (await this.db.scanAll<OrderRecord>({
      FilterExpression:          'entityType = :o AND #s IN (:paid, :shipped, :delivered) AND escrowReleaseAt <= :now',
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: { ':o': 'Order', ':paid': 'PAID', ':shipped': 'SHIPPED', ':delivered': 'DELIVERED', ':now': now },
    })).filter((o) => o.status !== 'PAID' || o.deliveryMethod === 'ENTREGA_EM_MAOS');

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

        const releasedMail  = paymentReleasedSellerEmail(this.emailData(order));
        void this.email.send(seller?.email, releasedMail.subject, releasedMail.html);
        const completedMail = orderCompletedBuyerEmail(this.emailData(order));
        void this.email.send(buyer?.email, completedMail.subject, completedMail.html);
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
