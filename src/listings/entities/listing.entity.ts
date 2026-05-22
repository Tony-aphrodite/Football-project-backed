export type ListingKind      = 'TIME' | 'SELECAO';
export type ListingContinent = 'AMERICA' | 'EUROPA' | 'ASIA' | 'AFRICA' | 'OCEANIA';
export type ListingSupplier  =
  | 'ADIDAS' | 'NIKE' | 'PUMA'
  | 'UMBRO' | 'KAPPA' | 'LE_COQ_SPORTIF' | 'NEW_BALANCE'
  | 'UNDER_ARMOUR' | 'PENALTY' | 'TOPPER' | 'REUSCH' | 'LOTTO' | 'OUTRO';
export type ListingModel       = 'TITULAR' | 'RESERVA' | 'TERCEIRA' | 'GOLEIRO' | 'TREINO' | 'COMEMORATIVA';
export type ListingGarmentType = 'LOJA' | 'JOGO';
export type ListingSize        = 'PP' | 'P' | 'M' | 'G' | 'GG' | 'XGG' | '2XGG' | '3XGG';
export type ListingCondition   = 'COM_ETIQUETA' | 'PERFEITA' | 'EXCELENTE' | 'BOA' | 'REGULAR' | 'DESGASTADA';
export type ListingGender      = 'MASCULINO' | 'FEMININO';
export type ListingStatus      = 'DRAFT' | 'ACTIVE' | 'SOLD' | 'REMOVED';

export interface ListingRecord {
  PK: string;          // LISTING#{listingId}
  SK: 'METADATA';
  entityType: 'Listing';

  listingId:   string;
  sellerId:    string;
  sellerName:  string;

  kind:        ListingKind;
  teamName:    string;
  continent:   ListingContinent;
  country:     string;
  season:      string;
  supplier:    ListingSupplier;
  model:       ListingModel;
  garmentType: ListingGarmentType;
  size:        ListingSize;
  condition:   ListingCondition;
  gender:      ListingGender;
  priceCents:   number;
  description?: string;
  weightGrams?: number;
  sku?:         string;
  photoKeys:    string[];
  isMpc:        boolean;
  nonVerifiedSupplierAck: boolean;

  status:    ListingStatus;
  GSI1PK:   string;   // LISTING_FEED#{status}
  GSI1SK:   string;   // {createdAt}#{listingId}

  createdAt: string;
  updatedAt: string;
}

export interface ListingPublic {
  listingId:   string;
  sellerId:    string;
  sellerName:  string;
  kind:        ListingKind;
  teamName:    string;
  continent:   ListingContinent;
  country:     string;
  season:      string;
  supplier:    ListingSupplier;
  model:       ListingModel;
  garmentType: ListingGarmentType;
  size:        ListingSize;
  condition:   ListingCondition;
  gender:      ListingGender;
  priceCents:   number;
  description?: string;
  weightGrams?: number;
  sku?:         string;
  photoKeys:    string[];
  isMpc:        boolean;
  status:       ListingStatus;
  createdAt:   string;
}

export function toListingPublic(l: ListingRecord): ListingPublic {
  return {
    listingId:   l.listingId,
    sellerId:    l.sellerId,
    sellerName:  l.sellerName,
    kind:        l.kind,
    teamName:    l.teamName,
    continent:   l.continent,
    country:     l.country,
    season:      l.season,
    supplier:    l.supplier,
    model:       l.model,
    garmentType: l.garmentType,
    size:        l.size,
    condition:   l.condition,
    gender:      l.gender,
    priceCents:   l.priceCents,
    description:  l.description,
    weightGrams:  l.weightGrams,
    sku:          l.sku,
    photoKeys:    l.photoKeys,
    isMpc:       l.isMpc,
    status:      l.status,
    createdAt:   l.createdAt,
  };
}

export const VERIFIED_SUPPLIERS: ListingSupplier[] = ['ADIDAS', 'NIKE', 'PUMA', 'NEW_BALANCE'];
