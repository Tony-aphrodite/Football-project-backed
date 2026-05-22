import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

// ── Pagar.me v5 response shapes ──────────────────────────────────────────────

export interface PagarmeTransaction {
  id: string;
  status: string;
  qr_code?: string;
  qr_code_url?: string;
  expires_at?: string;
}

export interface PagarmeCharge {
  id: string;
  status: string;
  amount: number;
  last_transaction: PagarmeTransaction;
}

export interface PagarmeOrder {
  id: string;
  code: string;
  status: string;
  charges: PagarmeCharge[];
}

export interface CreatePixOrderParams {
  externalCode: string;
  amountCents: number;
  customerName: string;
  customerCpf: string;
  customerPhone?: string;
  customerEmail?: string;
  itemDescription: string;
  expiresInSeconds?: number;
  // Split payment recipients
  arenaRecipientId?: string;   // Arena dos Mantos recipient ID
  sellerRecipientId?: string;  // Seller's Pagar.me recipient ID
  commissionPct?: number;      // Arena commission % (default 7)
}

export interface CreateCardOrderParams {
  externalCode:    string;
  amountCents:     number;
  customerName:    string;
  customerCpf:     string;
  customerPhone?:  string;
  customerEmail?:  string;
  itemDescription: string;
  installments:    number;        // 1-12
  cardNumber:      string;        // raw digits
  cardHolderName:  string;
  cardExpMonth:    number;
  cardExpYear:     number;        // 4-digit
  cardCvv:         string;
  // Split payment recipients
  arenaRecipientId?:  string;
  sellerRecipientId?: string;
  commissionPct?:     number;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PagarmeService {
  private readonly logger = new Logger(PagarmeService.name);
  private readonly baseUrl = 'https://api.pagar.me/core/v5';

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get authHeader(): string {
    const apiKey = this.config.get('pagarme.apiKey', { infer: true });
    return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Pagar.me ${method} ${path} → ${res.status}: ${text}`);
      throw new Error(`Pagar.me API error ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  /** Creates a Pagar.me order with a PIX charge. */
  async createPixOrder(params: CreatePixOrderParams): Promise<PagarmeOrder> {
    const cpfDigits = params.customerCpf.replace(/\D/g, '');

    const phoneDigits = (params.customerPhone ?? '+5511999999999').replace(/\D/g, '');
    const areaCode    = phoneDigits.slice(2, 4);
    const number      = phoneDigits.slice(4);

    return this.request<PagarmeOrder>('POST', '/orders', {
      code: params.externalCode,
      customer: {
        name:          params.customerName,
        type:          'individual',
        document:      cpfDigits,
        document_type: 'CPF',
        email:         params.customerEmail ?? `${cpfDigits}@arenadosmantos.app`,
        phones: {
          mobile_phone: {
            country_code: '55',
            area_code:    areaCode || '11',
            number:       number || '999999999',
          },
        },
      },
      items: [
        {
          amount: params.amountCents,
          description: params.itemDescription,
          quantity: 1,
          code: params.externalCode,
        },
      ],
      payments: [
        {
          payment_method: 'pix',
          pix: {
            expires_in: params.expiresInSeconds ?? 86_400,
          },
          amount: params.amountCents,
          // Include split if both recipient IDs are available
          ...(params.arenaRecipientId && params.sellerRecipientId ? {
            split: this.buildSplit(
              params.amountCents,
              params.arenaRecipientId,
              params.sellerRecipientId,
              params.commissionPct ?? 7,
            ),
          } : {}),
        },
      ],
    });
  }

  /** Creates a Pagar.me order with a credit card charge (inline card — backend tokenization). */
  async createCardOrder(params: CreateCardOrderParams): Promise<PagarmeOrder> {
    const cpfDigits = params.customerCpf.replace(/\D/g, '');

    const phoneDigits = (params.customerPhone ?? '+5511999999999').replace(/\D/g, '');
    const areaCode    = phoneDigits.slice(2, 4);
    const number      = phoneDigits.slice(4);

    return this.request<PagarmeOrder>('POST', '/orders', {
      code: params.externalCode,
      customer: {
        name:          params.customerName,
        type:          'individual',
        document:      cpfDigits,
        document_type: 'CPF',
        email:         params.customerEmail ?? `${cpfDigits}@arenadosmantos.app`,
        phones: {
          mobile_phone: {
            country_code: '55',
            area_code:    areaCode || '11',
            number:       number || '999999999',
          },
        },
      },
      items: [
        {
          amount: params.amountCents,
          description: params.itemDescription,
          quantity: 1,
          code: params.externalCode,
        },
      ],
      payments: [
        {
          payment_method: 'credit_card',
          amount: params.amountCents,
          credit_card: {
            installments: params.installments,
            statement_descriptor: 'Arena dos Mantos',
            card: {
              number:      params.cardNumber.replace(/\D/g, ''),
              holder_name: params.cardHolderName,
              exp_month:   params.cardExpMonth,
              exp_year:    params.cardExpYear,
              cvv:         params.cardCvv,
            },
          },
          // Include split if both recipient IDs are available
          ...(params.arenaRecipientId && params.sellerRecipientId ? {
            split: this.buildSplit(
              params.amountCents,
              params.arenaRecipientId,
              params.sellerRecipientId,
              params.commissionPct ?? 7,
            ),
          } : {}),
        },
      ],
    });
  }

  /** Build split rules: Arena gets commission %, seller gets remainder.
   *  Pagar.me processing fee (4%) is charged to Arena's share. */
  private buildSplit(
    amountCents:       number,
    arenaRecipientId:  string,
    sellerRecipientId: string,
    commissionPct:     number,
  ) {
    const arenaAmount  = Math.round(amountCents * (commissionPct / 100));
    const sellerAmount = amountCents - arenaAmount;

    return [
      {
        recipient_id: arenaRecipientId,
        amount: arenaAmount,
        type: 'flat',
        options: {
          charge_processing_fee: true,  // Pagar.me fee comes from Arena's share
          liable:                true,
          charge_remainder_fee:  true,
        },
      },
      {
        recipient_id: sellerRecipientId,
        amount: sellerAmount,
        type: 'flat',
        options: {
          charge_processing_fee: false,
          liable:                false,
          charge_remainder_fee:  false,
        },
      },
    ];
  }

  /** Creates a Pagar.me recipient (seller bank account). */
  async createRecipient(params: {
    name: string;
    cpf: string;
    email: string;
    pixKey: string;
    pixKeyType: 'cpf' | 'email' | 'phone' | 'random';
  }): Promise<{ id: string; status: string }> {
    return this.request('POST', '/recipients', {
      name: params.name,
      email: params.email,
      description: `Vendedor Arena dos Mantos — ${params.name}`,
      document: params.cpf.replace(/\D/g, ''),
      document_type: 'CPF',
      type: 'individual',
      default_bank_account: {
        holder_name: params.name,
        holder_type: 'individual',
        holder_document: params.cpf.replace(/\D/g, ''),
        bank: '000',
        branch_number: '0001',
        branch_check_digit: '0',
        account_number: '00000000',
        account_check_digit: '0',
        type: 'checking',
      },
      transfer_settings: {
        transfer_enabled: true,
        transfer_interval: 'monthly',
        transfer_day: 5,
      },
      automatic_anticipation_settings: {
        enabled: false,
        type: 'full',
        volume_percentage: '0',
        delay: null,
      },
    });
  }

  /** Fetches a Pagar.me order by its Pagar.me order ID. */
  async getOrder(pagarmeOrderId: string): Promise<PagarmeOrder> {
    return this.request<PagarmeOrder>('GET', `/orders/${pagarmeOrderId}`);
  }

  /**
   * Validates the webhook signature.
   * Pagar.me signs with HMAC-SHA256 using the webhook secret.
   * Header: x-pagarme-signature
   * Payload: raw request body (string)
   */
  validateWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = this.config.get('pagarme.webhookSecret', { infer: true });
    if (!secret) return false;

    const { createHmac } = require('crypto') as typeof import('crypto');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return expected === signature;
  }
}
