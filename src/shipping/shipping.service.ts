import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

export interface ShippingOption {
  service:    string;
  company:    string;
  priceCents: number;
  days:       number;
}

export interface LabelResult {
  melhorEnvioOrderId:  string;
  trackingCode:        string;
  carrier:             string;
  service:             string;
  labelUrl:            string;
  actualCostCents:     number;   // actual amount paid to Melhor Envio
}

interface MelhorEnvioQuote {
  id:            number;
  name:          string;
  price:         string | null;
  discount:      string;
  delivery_time: number;
  error?:        string;
  company: { id: number; name: string };
}

interface CartItem {
  id:       string;
  service:  { id: number; name: string };
  tracking: string;
  carrier:  { name: string };
  link?:    string;
  price?:   string;   // actual cost charged by Melhor Envio
}

interface TrackingEvent {
  status:      string;
  description: string;
  location?:   string;
  updated_at:  string;
}

export interface MelhorEnvioWebhookPayload {
  shipment_id:     string;
  tracking_number: string;
  status:          string;
  tracking:        TrackingEvent[];
}

// Markup on top of carrier price (40%)
const SHIPPING_MARKUP = 1.4;

function fallback(toCep: string): ShippingOption[] {
  const region = parseInt(toCep.replace(/\D/g, '').slice(0, 2), 10);
  if (region >= 1 && region <= 28)
    return [
      { service: 'PAC',   company: 'Correios', priceCents: 1800, days: 6 },
      { service: 'SEDEX', company: 'Correios', priceCents: 3200, days: 2 },
    ];
  if (region >= 80 && region <= 99)
    return [
      { service: 'PAC',   company: 'Correios', priceCents: 2200, days: 7 },
      { service: 'SEDEX', company: 'Correios', priceCents: 3800, days: 3 },
    ];
  if (region >= 40 && region <= 79)
    return [
      { service: 'PAC',   company: 'Correios', priceCents: 2800, days: 10 },
      { service: 'SEDEX', company: 'Correios', priceCents: 5200, days: 4  },
    ];
  return [
    { service: 'PAC',   company: 'Correios', priceCents: 2000, days: 7 },
    { service: 'SEDEX', company: 'Correios', priceCents: 3500, days: 3 },
  ];
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  readonly token:   string | undefined;
  private readonly sandbox: boolean;
  readonly baseUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.token   = config.get('melhorEnvio.token', { infer: true });
    this.sandbox = config.get('melhorEnvio.sandbox', { infer: true });
    this.baseUrl = this.sandbox
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br';
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Authorization': `Bearer ${this.token}`,
      'User-Agent':    'ArenaDosMantosApp (contato@arenadosmantos.com.br)',
    };
  }

  // ── Shipping quote ──────────────────────────────────────────────────────────

  async estimate(fromCep: string, toCep: string, weightGrams = 300): Promise<ShippingOption[]> {
    if (!this.token) {
      this.logger.warn('MELHOR_ENVIO_TOKEN not set — using fallback estimates');
      return fallback(toCep);
    }
    try {
      const body = {
        from:    { postal_code: fromCep.replace(/\D/g, '') },
        to:      { postal_code: toCep.replace(/\D/g, '') },
        package: { height: 4, width: 25, length: 35, weight: Math.max(weightGrams / 1000, 0.1) },
        options: { receipt: false, own_hand: false },
      };
      const res = await fetch(`${this.baseUrl}/api/v2/me/shipment/calculate`, {
        method: 'POST', headers: this.headers, body: JSON.stringify(body),
      });
      if (!res.ok) { this.logger.warn(`Melhor Envio quote error ${res.status}`); return fallback(toCep); }
      const quotes = (await res.json()) as MelhorEnvioQuote[];
      const options = quotes
        .filter((q) => q.price && !q.error)
        .map((q) => ({
          service:    q.name,
          company:    q.company.name,
          priceCents: Math.round(parseFloat(q.price!) * SHIPPING_MARKUP * 100),
          days:       q.delivery_time,
        }))
        .sort((a, b) => a.priceCents - b.priceCents);
      return options.length > 0 ? options : fallback(toCep);
    } catch (err) {
      this.logger.error('Melhor Envio estimate failed', err);
      return fallback(toCep);
    }
  }

  // ── Label purchase ──────────────────────────────────────────────────────────

  async purchaseLabel(params: {
    orderId:      string;
    fromCep:      string;
    toCep:        string;
    fromName:     string;
    toName:       string;
    serviceId:    number;
    weightGrams:  number;
    productName:  string;
    productValue: number;
  }): Promise<LabelResult | null> {
    if (!this.token) {
      this.logger.warn('MELHOR_ENVIO_TOKEN not set — skipping label purchase');
      return null;
    }
    try {
      // Step 1: Add to cart
      const cartBody = {
        service:  params.serviceId,
        agency:   null,
        from: {
          name:        params.fromName,
          postal_code: params.fromCep.replace(/\D/g, ''),
        },
        to: {
          name:        params.toName,
          postal_code: params.toCep.replace(/\D/g, ''),
        },
        package: {
          height: 4,
          width:  25,
          length: 35,
          weight: Math.max(params.weightGrams / 1000, 0.1),
        },
        products: [{
          name:     params.productName,
          quantity: 1,
          unitary_value: params.productValue,
        }],
        options: {
          receipt:        false,
          own_hand:       false,
          reverse:        false,
          non_commercial: false,
          platform:       'Arena dos Mantos',
          tags: [{ tag: params.orderId, url: null }],
        },
      };

      const cartRes = await fetch(`${this.baseUrl}/api/v2/me/cart`, {
        method: 'POST', headers: this.headers, body: JSON.stringify(cartBody),
      });
      if (!cartRes.ok) {
        this.logger.error(`Melhor Envio cart error ${cartRes.status}: ${await cartRes.text()}`);
        return null;
      }
      const cartItem = (await cartRes.json()) as CartItem;

      // Step 2: Checkout (purchase label from wallet)
      const checkoutRes = await fetch(`${this.baseUrl}/api/v2/me/shipment/checkout`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ orders: [cartItem.id] }),
      });
      if (!checkoutRes.ok) {
        this.logger.error(`Melhor Envio checkout error ${checkoutRes.status}: ${await checkoutRes.text()}`);
        return null;
      }

      // Step 3: Get label print URL
      const printRes = await fetch(`${this.baseUrl}/api/v2/me/shipment/print`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ mode: 'private', orders: [cartItem.id] }),
      });
      const labelUrl = printRes.ok ? ((await printRes.json()) as { url: string }).url : '';

      const actualCostCents = cartItem.price
        ? Math.round(parseFloat(cartItem.price) * 100)
        : 0;

      this.logger.log(`Label purchased for order ${params.orderId}, tracking: ${cartItem.tracking}, cost: R$${cartItem.price ?? '?'}`);

      return {
        melhorEnvioOrderId: cartItem.id,
        trackingCode:       cartItem.tracking,
        carrier:            cartItem.carrier?.name ?? 'Correios',
        service:            cartItem.service?.name ?? '',
        labelUrl,
        actualCostCents,
      };
    } catch (err) {
      this.logger.error('Melhor Envio label purchase failed', err);
      return null;
    }
  }

  // ── Tracking status mapping ─────────────────────────────────────────────────

  mapTrackingStatus(meStatus: string): 'SHIPPED' | 'DELIVERED' | null {
    const s = meStatus.toLowerCase();
    if (['posted', 'in_transit', 'out_for_delivery'].some((k) => s.includes(k))) return 'SHIPPED';
    if (['delivered'].some((k) => s.includes(k))) return 'DELIVERED';
    return null;
  }
}
