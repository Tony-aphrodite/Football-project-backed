export type DeliveryMethod = 'CORREIOS' | 'ENTREGA_EM_MAOS';
export type PaymentMethod  = 'PIX' | 'CREDIT_CARD';
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OrderRecord {
  PK: string;          // ORDER#${orderId}
  SK: 'METADATA';
  entityType: 'Order';
  orderId:     string;
  buyerId:     string;
  buyerName:   string;
  sellerId:    string;
  sellerName:  string;
  listingId:   string;
  // Listing snapshot at order time
  teamName:    string;
  supplier:    string;
  season:      string;
  size:        string;
  condition:   string;
  priceCents:  number;
  photoKeys:   string[];
  deliveryMethod: DeliveryMethod;
  shippingCents:  number;
  totalCents:     number;
  buyerCep?:     string;
  sellerCep?:    string;
  couponCode?:   string;
  discountPct?:  number;
  discountCents?: number;
  status:        OrderStatus;
  // Payment fields (set when payment is initiated)
  paymentMethod?:   PaymentMethod;
  pagarmeOrderId?:  string;
  pagarmeChargeId?: string;
  pixQrCode?:       string;
  pixQrCodeUrl?:    string;
  pixExpiresAt?:    string;
  // Credit card payment fields
  cardChargeId?:  string;
  cardLast4?:     string;
  installments?:  number;
  escrowReleaseAt?: string;
  correiosTracking?: string;
  melhorEnvioOrderId?:      string;
  shippingLabelUrl?:        string;
  shippingTrackingCode?:    string;
  shippingCarrier?:         string;
  shippingService?:         string;
  shippingActualCostCents?: number;   // actual cost paid to Melhor Envio
  shippingSpreadCents?:     number;   // buyer paid − actual cost = spread
  spreadBeneficiary?:       'DEVELOPER' | 'ARENA';
  GSI1PK:      string;   // ORDER_BUYER#${buyerId}
  GSI1SK:      string;   // ${createdAt}#${orderId}
  GSI2PK:      string;   // ORDER_SELLER#${sellerId}
  GSI2SK:      string;   // ${createdAt}#${orderId}
  createdAt:   string;
  updatedAt:   string;
}

export interface OrderPublic {
  orderId:        string;
  buyerId:        string;
  buyerName:      string;
  sellerId:       string;
  sellerName:     string;
  listingId:      string;
  teamName:       string;
  supplier:       string;
  season:         string;
  size:           string;
  condition:      string;
  priceCents:     number;
  photoKeys:      string[];
  deliveryMethod: DeliveryMethod;
  shippingCents:  number;
  totalCents:     number;
  buyerCep?:      string;
  sellerCep?:     string;
  couponCode?:    string;
  discountPct?:   number;
  discountCents?: number;
  status:         OrderStatus;
  paymentMethod?:   PaymentMethod;
  pagarmeOrderId?:  string;
  pixQrCode?:       string;
  pixQrCodeUrl?:    string;
  pixExpiresAt?:    string;
  // Credit card payment fields
  cardChargeId?:  string;
  cardLast4?:     string;
  installments?:  number;
  escrowReleaseAt?: string;
  correiosTracking?: string;
  melhorEnvioOrderId?:      string;
  shippingLabelUrl?:        string;
  shippingTrackingCode?:    string;
  shippingCarrier?:         string;
  shippingService?:         string;
  shippingActualCostCents?: number;
  shippingSpreadCents?:     number;
  spreadBeneficiary?:       'DEVELOPER' | 'ARENA';
  createdAt:      string;
  updatedAt:      string;
}

export function toOrderPublic(o: OrderRecord): OrderPublic {
  return {
    orderId: o.orderId, buyerId: o.buyerId, buyerName: o.buyerName,
    sellerId: o.sellerId, sellerName: o.sellerName, listingId: o.listingId,
    teamName: o.teamName, supplier: o.supplier, season: o.season,
    size: o.size, condition: o.condition, priceCents: o.priceCents,
    photoKeys: o.photoKeys, deliveryMethod: o.deliveryMethod,
    shippingCents: o.shippingCents, totalCents: o.totalCents,
    buyerCep: o.buyerCep, sellerCep: o.sellerCep,
    couponCode: o.couponCode, discountPct: o.discountPct, discountCents: o.discountCents,
    status: o.status,
    paymentMethod:    o.paymentMethod,
    pagarmeOrderId:   o.pagarmeOrderId,
    pixQrCode:        o.pixQrCode,
    pixQrCodeUrl:     o.pixQrCodeUrl,
    pixExpiresAt:     o.pixExpiresAt,
    cardChargeId:     o.cardChargeId,
    cardLast4:        o.cardLast4,
    installments:     o.installments,
    escrowReleaseAt:       o.escrowReleaseAt,
    correiosTracking:      o.correiosTracking,
    melhorEnvioOrderId:       o.melhorEnvioOrderId,
    shippingLabelUrl:         o.shippingLabelUrl,
    shippingTrackingCode:     o.shippingTrackingCode,
    shippingCarrier:          o.shippingCarrier,
    shippingService:          o.shippingService,
    shippingActualCostCents:  o.shippingActualCostCents,
    shippingSpreadCents:      o.shippingSpreadCents,
    spreadBeneficiary:        o.spreadBeneficiary,
    createdAt: o.createdAt, updatedAt: o.updatedAt,
  };
}
