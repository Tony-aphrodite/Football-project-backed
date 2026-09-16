import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

export interface ShippingOption {
  id:         number;   // Melhor Envio service ID
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

/** A complete Brazilian address, as Melhor Envio requires it to issue a label. */
export interface ShippingAddress {
  name:        string;
  phone?:      string;
  email?:      string;
  document?:   string;   // CPF
  postalCode:  string;
  address:     string;   // rua
  number:      string;
  complement?: string;
  district:    string;   // bairro
  city:        string;
  stateAbbr:   string;   // UF
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

// Markup on top of the carrier price (30%). Lowered from 40%: shipping felt
// expensive enough to push buyers away from checking out in the app.
const SHIPPING_MARKUP = 1.3;

function fallback(toCep: string): ShippingOption[] {
  const region = parseInt(toCep.replace(/\D/g, '').slice(0, 2), 10);
  if (region >= 1 && region <= 28)
    return [
      { id: 1, service: 'PAC',   company: 'Correios', priceCents: 1800, days: 6 },
      { id: 2, service: 'SEDEX', company: 'Correios', priceCents: 3200, days: 2 },
    ];
  if (region >= 80 && region <= 99)
    return [
      { id: 1, service: 'PAC',   company: 'Correios', priceCents: 2200, days: 7 },
      { id: 2, service: 'SEDEX', company: 'Correios', priceCents: 3800, days: 3 },
    ];
  if (region >= 40 && region <= 79)
    return [
      { id: 1, service: 'PAC',   company: 'Correios', priceCents: 2800, days: 10 },
      { id: 2, service: 'SEDEX', company: 'Correios', priceCents: 5200, days: 4  },
    ];
  return [
    { id: 1, service: 'PAC',   company: 'Correios', priceCents: 2000, days: 7 },
    { id: 2, service: 'SEDEX', company: 'Correios', priceCents: 3500, days: 3 },
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
          id:         q.id,
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

  /** Map our address shape onto the fields Melhor Envio expects. */
  private toMelhorEnvio(a: ShippingAddress) {
    const digits = (v?: string) => (v ?? '').replace(/\D/g, '');
    // Stored phones are E.164 (+55…); Melhor Envio wants the national number.
    let phone = digits(a.phone);
    if (phone.length > 11 && phone.startsWith('55')) phone = phone.slice(2);
    return {
      name:        a.name,
      phone:       phone || undefined,
      email:       a.email || undefined,
      document:    digits(a.document) || undefined,
      address:     a.address,
      complement:  a.complement || undefined,
      number:      a.number,
      district:    a.district,
      city:        a.city,
      state_abbr:  a.stateAbbr.toUpperCase(),
      country_id:  'BR',
      postal_code: digits(a.postalCode),
    };
  }

  async purchaseLabel(params: {
    orderId:      string;
    from:         ShippingAddress;
    to:           ShippingAddress;
    serviceId:    number;
    weightGrams:  number;
    productName:  string;
    productValue: number;
  }): Promise<LabelResult | null> {
    if (!this.token) {
      this.logger.warn('MELHOR_ENVIO_TOKEN not set — skipping label purchase');
      throw new Error('MELHOR_ENVIO_TOKEN não configurado');
    }
    try {
      // Step 1: Add to cart
      const cartBody = {
        service:  params.serviceId,
        agency:   null,
        // Only name + postal code used to be sent, so Melhor Envio rejected
        // every cart and no label was ever issued.
        from: this.toMelhorEnvio(params.from),
        to:   this.toMelhorEnvio(params.to),
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
          // Sellers are individuals posting without an NF-e, which Melhor Envio
          // only accepts as a non-commercial shipment (declaração de conteúdo).
          non_commercial: true,
          platform:       'Arena dos Mantos',
          tags: [{ tag: params.orderId, url: null }],
        },
      };

      const cartRes = await fetch(`${this.baseUrl}/api/v2/me/cart`, {
        method: 'POST', headers: this.headers, body: JSON.stringify(cartBody),
      });
      if (!cartRes.ok) {
        // The reason has to travel with the error: it ends up on the order, and
        // the server logs are not reachable from the app or admin.
        const body = await cartRes.text();
        this.logger.error(`Melhor Envio cart error ${cartRes.status}: ${body}`);
        throw new Error(`Melhor Envio carrinho ${cartRes.status}: ${body.slice(0, 300)}`);
      }
      const cartItem = (await cartRes.json()) as CartItem;

      // Step 2: Checkout (purchase label from wallet)
      const checkoutRes = await fetch(`${this.baseUrl}/api/v2/me/shipment/checkout`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ orders: [cartItem.id] }),
      });
      if (!checkoutRes.ok) {
        const body = await checkoutRes.text();
        this.logger.error(`Melhor Envio checkout error ${checkoutRes.status}: ${body}`);
        throw new Error(`Melhor Envio checkout ${checkoutRes.status}: ${body.slice(0, 300)}`);
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
      throw err;
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
