export type DeliveryMethod = 'CORREIOS' | 'ENTREGA_EM_MAOS';
export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';

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
  buyerCep?:   string;
  sellerCep?:  string;
  status:      OrderStatus;
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
  status:         OrderStatus;
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
    status: o.status, createdAt: o.createdAt, updatedAt: o.updatedAt,
  };
}
