export type RaterRole = 'BUYER' | 'SELLER';

// Buyer rates seller on 4 criteria; seller rates buyer on 3
export const BUYER_CRITERIA = [
  'Camisa fiel à foto e informações do anúncio?',
  'Veio bem embalada?',
  'Vendedor enviou dentro do prazo combinado?',
  'Avaliação geral do vendedor',
] as const;

export const SELLER_CRITERIA = [
  'Comprador tirou dúvidas pertinentes?',
  'Pedidos do comprador foram atendidos?',
  'Avaliação geral do comprador',
] as const;

export interface RatingRecord {
  PK: string;  // USER#${rateeId}
  SK: string;  // RATING_RECEIVED#${createdAt}#${ratingId}
  entityType: 'Rating';
  ratingId:   string;
  orderId:    string;
  raterId:    string;
  rateeId:    string;
  raterRole:  RaterRole;
  scores:     number[];   // one per criterion, 1–5
  average:    number;
  createdAt:  string;
}

export interface RatingPublic {
  ratingId:   string;
  raterId:    string;
  raterRole:  RaterRole;
  scores:     number[];
  average:    number;
  createdAt:  string;
}

export interface UserRatingSummary {
  asSeller: { average: number; count: number };
  asBuyer:  { average: number; count: number };
}

export function toRatingPublic(r: RatingRecord): RatingPublic {
  return {
    ratingId:  r.ratingId,
    raterId:   r.raterId,
    raterRole: r.raterRole,
    scores:    r.scores,
    average:   r.average,
    createdAt: r.createdAt,
  };
}
