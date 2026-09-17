import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

// ── Pagar.me v5 response shapes ──────────────────────────────────────────────

export interface PagarmeTransaction {
  id: string;
  status: string;
  // Why a card was declined — no card data, safe to log.
  acquirer_message?: string;
  acquirer_return_code?: string;
  gateway_response?: { code?: string; errors?: { message?: string }[] };
  antifraud_response?: { status?: string; reason?: string };
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

export interface CardBillingAddress { line1: string; zipCode: string; city: string; state: string }

function billingAddressBody(a: CardBillingAddress) {
  return { line_1: a.line1, zip_code: a.zipCode, city: a.city, state: a.state, country: 'BR' };
}

/** A card kept in Pagar.me's vault. We only ever store its id and display data. */
export interface PagarmeCard {
  id: string;
  brand?: string;
  last_four_digits: string;
  exp_month: number;
  exp_year: number;
  status?: string;
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
  shippingCents?: number;      // part of amountCents that is shipping — goes to Arena
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
  // Either a card stored in Pagar.me's vault (customerId + cardId)…
  customerId?:     string;
  cardId?:         string;
  // …or a single-use token the app created with the public key…
  cardToken?:      string;
  // …or the card typed in for this purchase only.
  cardNumber?:     string;        // raw digits
  cardHolderName?: string;
  cardExpMonth?:   number;
  cardExpYear?:    number;        // 4-digit
  cardCvv?:        string;
  // Split payment recipients
  arenaRecipientId?:  string;
  sellerRecipientId?: string;
  commissionPct?:     number;
  shippingCents?:     number;   // part of amountCents that is shipping — goes to Arena
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
      throw Object.assign(new Error(`Pagar.me API error ${res.status}`), { status: res.status, body: text });
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
              params.shippingCents ?? 0,
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

    const useVault = !!(params.customerId && params.cardId);

    return this.request<PagarmeOrder>('POST', '/orders', {
      code: params.externalCode,
      // A vault card belongs to a customer, so the order must name that customer.
      ...(useVault ? { customer_id: params.customerId } : {}),
      customer: useVault ? undefined : {
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
            // What shows on the card statement. Pagar.me allows 13 characters;
            // 'Arena dos Mantos' (16) is refused as an invalid soft descriptor.
            statement_descriptor: 'ARENAMANTOS',
            ...(useVault
              ? { card_id: params.cardId }
              : params.cardToken
              // card and card_token are mutually exclusive, so no billing address
              // here — same as the typed-card charge, which works without one.
              ? { card_token: params.cardToken }
              : {
                  card: {
                    number:      (params.cardNumber ?? '').replace(/\D/g, ''),
                    holder_name: params.cardHolderName,
                    exp_month:   params.cardExpMonth,
                    exp_year:    params.cardExpYear,
                    cvv:         params.cardCvv,
                  },
                }),
          },
          // Include split if both recipient IDs are available
          ...(params.arenaRecipientId && params.sellerRecipientId ? {
            split: this.buildSplit(
              params.amountCents,
              params.arenaRecipientId,
              params.sellerRecipientId,
              params.commissionPct ?? 7,
              params.shippingCents ?? 0,
            ),
          } : {}),
        },
      ],
    });
  }

  /** Build split rules: Arena gets commission %, seller gets remainder.
   *  Pagar.me processing fee (4%) is charged to Arena's share. */
  /**
   * Arena receives its commission on the jersey plus the whole shipping
   * amount — Arena pays the Correios label from its Melhor Envio wallet, so the
   * shipping money has to land with Arena, not with the seller. The seller
   * receives the jersey price minus the commission.
   */
  buildSplit(
    amountCents:       number,
    arenaRecipientId:  string,
    sellerRecipientId: string,
    commissionPct:     number,
    shippingCents = 0,
  ) {
    const shipping     = Math.min(Math.max(shippingCents, 0), amountCents);
    const itemCents    = amountCents - shipping;
    const commission   = Math.round(itemCents * (commissionPct / 100));
    const arenaAmount  = commission + shipping;
    const sellerAmount = itemCents - commission;

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
    bankCode: string;
    bankAgency: string;
    bankAgencyDigit?: string;
    bankAccount: string;
    bankAccountDigit: string;
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
        bank: params.bankCode,
        branch_number: params.bankAgency,
        branch_check_digit: params.bankAgencyDigit || '0',
        account_number: params.bankAccount,
        account_check_digit: params.bankAccountDigit,
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

  /**
   * Replaces the bank account of an existing recipient — no second recipient is
   * created. Pagar.me requires holder_document to equal the recipient's
   * document, so payouts can only ever go to an account in the seller's CPF.
   * Needs the server IP on Pagar.me's allow list, otherwise it answers
   * "Second authentication factor is necessary".
   */
  async updateRecipientBankAccount(recipientId: string, params: {
    name: string;
    cpf: string;
    bankCode: string;
    bankAgency: string;
    bankAgencyDigit?: string;
    bankAccount: string;
    bankAccountDigit: string;
  }): Promise<void> {
    await this.request('PATCH', `/recipients/${recipientId}/default-bank-account`, {
      bank_account: {
        holder_name: params.name,
        holder_type: 'individual',
        holder_document: params.cpf.replace(/\D/g, ''),
        bank: params.bankCode,
        branch_number: params.bankAgency,
        branch_check_digit: params.bankAgencyDigit || '0',
        account_number: params.bankAccount,
        account_check_digit: params.bankAccountDigit,
        type: 'checking',
      },
    });
  }

  // ── Saved cards (Pagar.me vault) ─────────────────────────────────────────
  // The card number and CVV stay with Pagar.me; we keep only the card id,
  // brand, last 4 digits and expiry.

  async createCustomer(params: { name: string; email: string; cpf: string; phoneE164?: string }): Promise<{ id: string }> {
    const cpf   = params.cpf.replace(/\D/g, '');
    const phone = (params.phoneE164 ?? '').replace(/\D/g, '');
    return this.request('POST', '/customers', {
      name:          params.name,
      email:         params.email,
      document:      cpf,
      document_type: 'CPF',
      type:          'individual',
      ...(phone.length >= 12 ? {
        phones: { mobile_phone: { country_code: '55', area_code: phone.slice(2, 4), number: phone.slice(4) } },
      } : {}),
    });
  }

  async createCustomerCard(customerId: string, card: (
    | { token: string }
    | { number: string; holderName: string; expMonth: number; expYear: number; cvv: string }
  ) & { billingAddress?: CardBillingAddress }): Promise<PagarmeCard> {
    const billing = card.billingAddress ? { billing_address: billingAddressBody(card.billingAddress) } : {};
    if ('token' in card) {
      return this.request('POST', `/customers/${customerId}/cards`, { token: card.token, ...billing });
    }
    return this.request('POST', `/customers/${customerId}/cards`, {
      number:      card.number.replace(/\D/g, ''),
      holder_name: card.holderName,
      exp_month:   card.expMonth,
      exp_year:    card.expYear,
      cvv:         card.cvv,
      ...billing,
    });
  }

  async deleteCustomerCard(customerId: string, cardId: string): Promise<void> {
    await this.request('DELETE', `/customers/${customerId}/cards/${cardId}`);
  }

  /** Recipients registered in the account the secret key belongs to. */
  async listRecipients(): Promise<{ id: string; name?: string; type?: string; status?: string; document?: string; default?: boolean }[]> {
    const data = await this.request<{ data?: { id: string; name?: string; type?: string; status?: string; document?: string; default_bank_account?: unknown; payment_mode?: string }[] }>(
      'GET', '/recipients?size=30',
    );
    return (data.data ?? []).map((r) => ({
      id:       r.id,
      name:     r.name,
      type:     r.type,
      status:   r.status,
      // Only the last digits, enough to tell whose recipient it is.
      document: r.document ? `•••${r.document.slice(-4)}` : undefined,
    }));
  }

  /** Whether a recipient id exists in the account the secret key belongs to. */
  async recipientExists(recipientId: string): Promise<{ exists: boolean; status?: string }> {
    try {
      const r = await this.request<{ status?: string }>('GET', `/recipients/${recipientId}`);
      return { exists: true, status: r.status };
    } catch (err) {
      if ((err as { status?: number }).status === 404) return { exists: false };
      throw err;
    }
  }

  /** Fetches available balance for a recipient. Returns amount in cents. */
  async getRecipientBalance(recipientId: string): Promise<{ available: number; waitingFunds: number }> {
    const data = await this.request<{ available?: { amount?: number }; waiting_funds?: { amount?: number } }>(
      'GET', `/recipients/${recipientId}/balance`,
    );
    return {
      available:    data.available?.amount    ?? 0,
      waitingFunds: data.waiting_funds?.amount ?? 0,
    };
  }

  /** Requests a withdrawal for a recipient. */
  async createWithdrawal(recipientId: string, amountCents: number): Promise<{ id: string; status: string; amount: number }> {
    return this.request('POST', `/recipients/${recipientId}/withdrawals`, { amount: amountCents });
  }

  /** Fetches withdrawal history for a recipient (most recent first, up to 20). */
  async getWithdrawals(recipientId: string): Promise<{ id: string; status: string; amount: number; createdAt: string }[]> {
    const data = await this.request<{
      data: { id: string; status: string; amount: number; created_at: string }[];
    }>('GET', `/recipients/${recipientId}/withdrawals?page=1&size=20`);
    return (data.data ?? []).map((w) => ({
      id:        w.id,
      status:    w.status,
      amount:    w.amount,
      createdAt: w.created_at,
    }));
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
