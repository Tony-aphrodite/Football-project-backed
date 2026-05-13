// USD $220 threshold — R$5.60/USD = R$1,232.00 = 123200 cents
export const DEVELOPER_THRESHOLD_CENTS = 123_200;

export interface DeveloperEarningsRecord {
  PK: 'DEVELOPER_EARNINGS';
  SK: 'METADATA';
  entityType: 'DeveloperEarnings';
  totalSpreadCents:          number;  // all spread generated ever
  developerAllocatedCents:   number;  // spread given to developer
  arenaAllocatedCents:       number;  // spread kept by Arena (after threshold)
  developerWithdrawnCents:   number;  // how much developer has withdrawn
  thresholdCents:            number;  // target = 123200 (~USD $220)
  status:                    'ACTIVE' | 'COMPLETED';
  lastUpdatedAt:             string;
}

export interface DeveloperWithdrawalRecord {
  PK: string;   // DEVELOPER_WITHDRAWAL#${id}
  SK: 'METADATA';
  entityType: 'DeveloperWithdrawal';
  withdrawalId: string;
  amountCents:  number;
  notes?:       string;
  createdAt:    string;
}

export interface DeveloperEarningsPublic {
  totalSpreadCents:          number;
  developerAllocatedCents:   number;
  developerWithdrawnCents:   number;
  developerAvailableCents:   number;   // allocated − withdrawn
  developerRemainingCents:   number;   // threshold − allocated
  arenaAllocatedCents:       number;
  thresholdCents:            number;
  thresholdReachedPct:       number;   // 0–100
  status:                    'ACTIVE' | 'COMPLETED';
  withdrawals:               DeveloperWithdrawalRecord[];
}
