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
  itemDescription: string;
  expiresInSeconds?: number;
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

    return this.request<PagarmeOrder>('POST', '/orders', {
      code: params.externalCode,
      customer: {
        name: params.customerName,
        type: 'individual',
        document: cpfDigits,
        document_type: 'CPF',
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
        },
      ],
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
