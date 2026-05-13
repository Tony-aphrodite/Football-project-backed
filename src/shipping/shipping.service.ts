import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

export interface ShippingOption {
  service:    string;
  company:    string;
  priceCents: number;
  days:       number;
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

// Markup applied on top of carrier price (40%)
const SHIPPING_MARKUP = 1.4;

// Fallback hardcoded estimates when token not configured
function fallback(toCep: string): ShippingOption[] {
  const region = parseInt(toCep.replace(/\D/g, '').slice(0, 2), 10);
  if (region >= 1 && region <= 28) {
    return [
      { service: 'PAC',   company: 'Correios', priceCents: 1800, days: 6 },
      { service: 'SEDEX', company: 'Correios', priceCents: 3200, days: 2 },
    ];
  }
  if (region >= 80 && region <= 99) {
    return [
      { service: 'PAC',   company: 'Correios', priceCents: 2200, days: 7 },
      { service: 'SEDEX', company: 'Correios', priceCents: 3800, days: 3 },
    ];
  }
  if (region >= 40 && region <= 79) {
    return [
      { service: 'PAC',   company: 'Correios', priceCents: 2800, days: 10 },
      { service: 'SEDEX', company: 'Correios', priceCents: 5200, days: 4  },
    ];
  }
  return [
    { service: 'PAC',   company: 'Correios', priceCents: 2000, days: 7 },
    { service: 'SEDEX', company: 'Correios', priceCents: 3500, days: 3 },
  ];
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  private readonly token:   string | undefined;
  private readonly sandbox: boolean;
  private readonly baseUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.token   = config.get('melhorEnvio.token', { infer: true });
    this.sandbox = config.get('melhorEnvio.sandbox', { infer: true });
    this.baseUrl = this.sandbox
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br';
  }

  async estimate(
    fromCep:      string,
    toCep:        string,
    weightGrams = 300,
  ): Promise<ShippingOption[]> {
    if (!this.token) {
      this.logger.warn('MELHOR_ENVIO_TOKEN not set — using fallback estimates');
      return fallback(toCep);
    }

    try {
      const body = {
        from:    { postal_code: fromCep.replace(/\D/g, '') },
        to:      { postal_code: toCep.replace(/\D/g, '') },
        package: {
          height: 4,
          width:  25,
          length: 35,
          weight: Math.max(weightGrams / 1000, 0.1),
        },
        options: { receipt: false, own_hand: false },
      };

      const res = await fetch(`${this.baseUrl}/api/v2/me/shipment/calculate`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Accept':        'application/json',
          'Authorization': `Bearer ${this.token}`,
          'User-Agent':    'ArenaDosMantosApp (contato@arenadosmantos.com.br)',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        this.logger.warn(`Melhor Envio API error ${res.status} — using fallback`);
        return fallback(toCep);
      }

      const quotes = (await res.json()) as MelhorEnvioQuote[];

      const options: ShippingOption[] = quotes
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
      this.logger.error('Melhor Envio request failed', err);
      return fallback(toCep);
    }
  }
}
