export type InvoiceType   = 'NFS-E' | 'NF-E';
export type InvoiceStatus = 'PENDING' | 'PROCESSING' | 'AUTHORIZED' | 'ERROR' | 'CANCELLED';

export interface InvoiceRecord {
  PK:           string;   // INVOICE#{orderId}#{type}
  SK:           'METADATA';
  entityType:   'Invoice';
  invoiceId:    string;   // same as PK without prefix
  orderId:      string;
  type:         InvoiceType;
  ref:          string;   // unique ref sent to Focus NFe
  status:       InvoiceStatus;
  focusStatus?: string;   // raw status from Focus NFe
  pdfUrl?:      string;
  xmlUrl?:      string;
  totalValue:   number;   // value in BRL (not cents)
  errorMessage?: string;
  createdAt:    string;
  updatedAt:    string;
}

export interface InvoicePublic {
  invoiceId:    string;
  orderId:      string;
  type:         InvoiceType;
  ref:          string;
  status:       InvoiceStatus;
  pdfUrl?:      string;
  xmlUrl?:      string;
  totalValue:   number;
  errorMessage?: string;
  createdAt:    string;
}

export function toInvoicePublic(i: InvoiceRecord): InvoicePublic {
  return {
    invoiceId:    i.invoiceId,
    orderId:      i.orderId,
    type:         i.type,
    ref:          i.ref,
    status:       i.status,
    pdfUrl:       i.pdfUrl,
    xmlUrl:       i.xmlUrl,
    totalValue:   i.totalValue,
    errorMessage: i.errorMessage,
    createdAt:    i.createdAt,
  };
}
