export interface CartItemEntry {
  listingId:  string;
  sellerId:   string;
  sellerName: string;
  teamName:   string;
  supplier:   string;
  season:     string;
  size:       string;
  priceCents: number;
  photoKeys:  string[];
  addedAt:    string;
}

export interface CartRecord {
  PK:        string;
  SK:        'CART';
  entityType: 'Cart';
  items:     CartItemEntry[];
  updatedAt: string;
}
