import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DynamoDbService } from '../dynamodb/dynamodb.service';
import { FocusNfeService } from './focus-nfe.service';
import {
  type InvoiceRecord,
  type InvoicePublic,
  type InvoiceType,
  toInvoicePublic,
} from './fiscal.entity';
import type { OrderRecord } from '../orders/entities/order.entity';
import type { UserRecord } from '../users/entities/user.entity';
import { Keys } from '../dynamodb/keys';

const COMMISSION_RATE = 0.07;
const MPC_SELLER_ID   = 'ADMIN_ARENA_DOS_MANTOS';

function invoiceKey(orderId: string, type: InvoiceType) {
  return { PK: `INVOICE#${orderId}#${type}`, SK: 'METADATA' as const };
}

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);

  constructor(
    private readonly db:       DynamoDbService,
    private readonly focusNfe: FocusNfeService,
  ) {}

  // ── NFS-e after every sale (7% commission) ────────────────────────────────

  async emitCommissionNfse(order: OrderRecord): Promise<void> {
    if (!this.focusNfe.isConfigured) {
      this.logger.warn('Focus NFe not configured — skipping NFS-e emission');
      return;
    }

    const commissionBrl = parseFloat(((order.priceCents * COMMISSION_RATE) / 100).toFixed(2));
    const ref           = `nfse-${order.orderId}-${randomUUID().slice(0, 8)}`;
    const ik            = invoiceKey(order.orderId, 'NFS-E');
    const now           = new Date().toISOString();

    // Load seller data for tomador
    const sellerKey = Keys.user(order.sellerId);
    const seller    = await this.db.get<UserRecord>(sellerKey.PK, sellerKey.SK);

    // Save PENDING record first
    const record: InvoiceRecord = {
      ...ik,
      entityType: 'Invoice',
      invoiceId:  `${order.orderId}-NFS-E`,
      orderId:    order.orderId,
      type:       'NFS-E',
      ref,
      status:     'PROCESSING',
      totalValue: commissionBrl,
      createdAt:  now,
      updatedAt:  now,
    };
    await this.db.put(record as unknown as Record<string, unknown>);

    try {
      const payload = this.focusNfe.buildNfsePayload({
        ref,
        sellerName:   order.sellerName,
        sellerCpf:    seller?.cpf,
        sellerEmail:  seller?.email,
        commissionBrl,
      });

      const result = await this.focusNfe.emitNfse(payload);
      await this.updateInvoiceStatus(ik, result);
      this.logger.log(`NFS-e emitted for order ${order.orderId} — commission R$${commissionBrl}`);
    } catch (err) {
      await this.db.update({
        Key:                       { PK: ik.PK, SK: ik.SK },
        UpdateExpression:          'SET #s = :e, errorMessage = :msg, updatedAt = :now',
        ExpressionAttributeNames:  { '#s': 'status' },
        ExpressionAttributeValues: { ':e': 'ERROR', ':msg': (err as Error).message, ':now': new Date().toISOString() },
      });
      this.logger.error(`NFS-e failed for order ${order.orderId}`, err);
    }
  }

  // ── NF-e for MPC sales ─────────────────────────────────────────────────────

  async emitMpcNfe(order: OrderRecord): Promise<void> {
    if (!this.focusNfe.isConfigured) {
      this.logger.warn('Focus NFe not configured — skipping NF-e emission');
      return;
    }

    // Only emit NF-e for Arena's own jerseys
    if (order.sellerId !== MPC_SELLER_ID) return;

    const priceBrl = order.priceCents / 100;
    const ref      = `nfe-${order.orderId}-${randomUUID().slice(0, 8)}`;
    const ik       = invoiceKey(order.orderId, 'NF-E');
    const now      = new Date().toISOString();

    // Load buyer data
    const buyerKey = Keys.user(order.buyerId);
    const buyer    = await this.db.get<UserRecord>(buyerKey.PK, buyerKey.SK);

    const record: InvoiceRecord = {
      ...ik,
      entityType: 'Invoice',
      invoiceId:  `${order.orderId}-NF-E`,
      orderId:    order.orderId,
      type:       'NF-E',
      ref,
      status:     'PROCESSING',
      totalValue: priceBrl,
      createdAt:  now,
      updatedAt:  now,
    };
    await this.db.put(record as unknown as Record<string, unknown>);

    try {
      const payload = this.focusNfe.buildNfePayload({
        ref,
        buyerName:   order.buyerName,
        buyerCpf:    buyer?.cpf,
        buyerEmail:  buyer?.email,
        teamName:    order.teamName,
        season:      order.season,
        priceBrl,
      });

      const result = await this.focusNfe.emitNfe(payload);
      await this.updateInvoiceStatus(ik, result);
      this.logger.log(`NF-e emitted for MPC order ${order.orderId} — R$${priceBrl}`);
    } catch (err) {
      await this.db.update({
        Key:                       { PK: ik.PK, SK: ik.SK },
        UpdateExpression:          'SET #s = :e, errorMessage = :msg, updatedAt = :now',
        ExpressionAttributeNames:  { '#s': 'status' },
        ExpressionAttributeValues: { ':e': 'ERROR', ':msg': (err as Error).message, ':now': new Date().toISOString() },
      });
      this.logger.error(`NF-e failed for order ${order.orderId}`, err);
    }
  }

  // ── Admin: list all invoices ───────────────────────────────────────────────

  async listInvoices(): Promise<InvoicePublic[]> {
    const records = await this.db.scan<InvoiceRecord>({
      FilterExpression:          'entityType = :t',
      ExpressionAttributeValues: { ':t': 'Invoice' },
    });
    return records
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toInvoicePublic);
  }

  async getInvoice(orderId: string, type: InvoiceType): Promise<InvoicePublic | null> {
    const ik     = invoiceKey(orderId, type);
    const record = await this.db.get<InvoiceRecord>(ik.PK, ik.SK);
    return record ? toInvoicePublic(record) : null;
  }

  async retryInvoice(orderId: string, type: InvoiceType): Promise<void> {
    const ik     = invoiceKey(orderId, type);
    const record = await this.db.get<InvoiceRecord>(ik.PK, ik.SK);
    if (!record) return;

    const orderKey = Keys.order(orderId);
    const order    = await this.db.get<OrderRecord>(orderKey.PK, orderKey.SK);
    if (!order) return;

    if (type === 'NFS-E') await this.emitCommissionNfse(order);
    else                   await this.emitMpcNfe(order);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async updateInvoiceStatus(
    ik:     { PK: string; SK: string },
    result: Awaited<ReturnType<FocusNfeService['emitNfse']>>,
  ): Promise<void> {
    const status = result.status === 'autorizado'    ? 'AUTHORIZED'
      : result.status === 'em_processamento'          ? 'PROCESSING'
      : result.status === 'cancelado'                 ? 'CANCELLED'
      : (result.erros?.length ?? 0) > 0              ? 'ERROR'
      : 'PENDING';

    const updateParts: string[] = ['SET #s = :status', 'focusStatus = :fs', 'updatedAt = :now'];
    const exprValues: Record<string, unknown> = {
      ':status': status,
      ':fs':     result.status ?? 'unknown',
      ':now':    new Date().toISOString(),
    };

    if (result.caminho_pdf || result.caminho_danfe) {
      updateParts.push('pdfUrl = :pdf');
      exprValues[':pdf'] = result.caminho_pdf ?? result.caminho_danfe;
    }
    if (result.caminho_xml_nota_fiscal) {
      updateParts.push('xmlUrl = :xml');
      exprValues[':xml'] = result.caminho_xml_nota_fiscal;
    }
    if (result.erros?.length) {
      updateParts.push('errorMessage = :err');
      exprValues[':err'] = result.erros.map((e) => `${e.codigo}: ${e.mensagem}`).join('; ');
    }

    await this.db.update({
      Key:                       { PK: ik.PK, SK: ik.SK },
      UpdateExpression:          updateParts.join(', '),
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: exprValues,
    });
  }
}
