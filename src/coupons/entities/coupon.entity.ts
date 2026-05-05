export interface CouponRecord {
  PK: string;
  SK: 'METADATA';
  entityType: 'Coupon';
  code: string;
  discountPct: number;
  description: string;
  maxRedemptions: number;
  redemptionCount: number;
  active: boolean;
  createdAt: string;
}

export interface CouponRedemptionRecord {
  PK: string;
  SK: string;
  entityType: 'CouponRedemption';
  code: string;
  userId: string;
  discountPct: number;
  redeemedAt: string;
}

export interface RedeemResult {
  code: string;
  discountPct: number;
  description: string;
}
