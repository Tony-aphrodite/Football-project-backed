import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

export interface NfsePayload {
  ref:          string;
  data_emissao: string;
  prestador: {
    cnpj:                string;
    inscricao_municipal?: string;
    codigo_municipio:    string;
  };
  tomador: {
    cpf?:         string;
    cnpj?:        string;
    razao_social: string;
    email?:       string;
  };
  servico: {
    aliquota:                      number;
    base_calculo:                  number;
    codigo_tributario_municipio:   string;
    discriminacao:                 string;
    iss_retido:                    boolean;
    item_lista_servico:            string;
    valor_servicos:                number;
    valor_iss:                     number;
  };
}

export interface NfePayload {
  ref:              string;
  natureza_operacao: string;
  forma_pagamento:   number;
  emitente: {
    cnpj:               string;
    nome:               string;
    logradouro:         string;
    numero:             string;
    bairro:             string;
    municipio:          string;
    uf:                 string;
    cep:                string;
    inscricao_estadual: string;
    regime_tributario:  number;
  };
  destinatario: {
    cpf?:  string;
    cnpj?: string;
    nome:  string;
    email?: string;
  };
  items: Array<{
    numero_item:              number;
    codigo_produto:           string;
    descricao:                string;
    cfop:                     string;
    unidade_comercial:        string;
    quantidade_comercial:     number;
    valor_unitario_comercial: number;
    valor_total_bruto:        number;
    ncm:                      string;
    icms_origem:              number;
    icms_modalidade:          number;
    pis_modalidade:           number;
    cofins_modalidade:        number;
  }>;
  formas_pagamento: Array<{ forma_pagamento: number; valor: number }>;
}

export interface FocusNfeResponse {
  status:      string;
  ref?:        string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?:           string;
  caminho_pdf?:             string;
  mensagem_sefaz?:          string;
  erros?:                   Array<{ codigo: string; mensagem: string }>;
}

// Avance Labs fiscal data
const AVANCE_LABS = {
  cnpj:               '65543815000162',
  nome:               'Avance Labs Intermediacao e Promocao de Vendas LTDA',
  inscricao_municipal: '02201747', // CCM 0.220.174-7 São Paulo
  codigo_municipio:   '3550308', // São Paulo
  logradouro:         'Rua da Arena',
  numero:             '1',
  bairro:             'Centro',
  municipio:          'São Paulo',
  uf:                 'SP',
  cep:                '01310100',
  inscricao_estadual: 'ISENTO',
  regime_tributario:  1, // Simples Nacional
};

// Jersey NCM code and service codes
const JERSEY_NCM  = '61051000';  // Men's shirts, knit
const JERSEY_CFOP = '6102';      // Sales outside state
const ISS_RATE    = 2;           // 2% ISS on commissions
const ISS_SERVICE_CODE = '07169'; // Sales promotion service code (São Paulo)
const ISS_LIST_CODE    = '01.07'; // Service list item

@Injectable()
export class FocusNfeService {
  private readonly logger  = new Logger(FocusNfeService.name);
  private readonly token:   string | undefined;
  private readonly sandbox: boolean;
  private readonly baseUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.token   = config.get('focusNfe.token',   { infer: true });
    this.sandbox = config.get('focusNfe.sandbox', { infer: true });
    this.baseUrl = this.sandbox
      ? 'https://homologacao.focusnfe.com.br'
      : 'https://api.focusnfe.com.br';
  }

  get isConfigured(): boolean { return !!this.token; }

  private authHeader(): Record<string, string> {
    const encoded = Buffer.from(`${this.token}:`).toString('base64');
    return {
      'Content-Type':  'application/json',
      'Authorization': `Basic ${encoded}`,
    };
  }

  // ── NFS-e (commission service invoice) ────────────────────────────────────

  async emitNfse(payload: NfsePayload): Promise<FocusNfeResponse> {
    const res = await fetch(`${this.baseUrl}/v2/nfse?ref=${payload.ref}`, {
      method:  'POST',
      headers: this.authHeader(),
      body:    JSON.stringify(payload),
    });
    const data = await res.json() as FocusNfeResponse;
    this.logger.log(`NFS-e emit ref=${payload.ref} status=${data.status}`);
    return data;
  }

  async getNfseStatus(ref: string): Promise<FocusNfeResponse> {
    const res = await fetch(`${this.baseUrl}/v2/nfse/${ref}`, {
      headers: this.authHeader(),
    });
    return res.json() as Promise<FocusNfeResponse>;
  }

  // ── NF-e (product invoice) ────────────────────────────────────────────────

  async emitNfe(payload: NfePayload): Promise<FocusNfeResponse> {
    const res = await fetch(`${this.baseUrl}/v2/nfe?ref=${payload.ref}`, {
      method:  'POST',
      headers: this.authHeader(),
      body:    JSON.stringify(payload),
    });
    const data = await res.json() as FocusNfeResponse;
    this.logger.log(`NF-e emit ref=${payload.ref} status=${data.status}`);
    return data;
  }

  async getNfeStatus(ref: string): Promise<FocusNfeResponse> {
    const res = await fetch(`${this.baseUrl}/v2/nfe/${ref}`, {
      headers: this.authHeader(),
    });
    return res.json() as Promise<FocusNfeResponse>;
  }

  // ── Payload builders ──────────────────────────────────────────────────────

  buildNfsePayload(params: {
    ref:          string;
    sellerName:   string;
    sellerCpf?:   string;
    sellerCnpj?:  string;
    sellerEmail?: string;
    commissionBrl: number;  // 7% commission in BRL
  }): NfsePayload {
    const issValue = parseFloat((params.commissionBrl * (ISS_RATE / 100)).toFixed(2));
    return {
      ref:          params.ref,
      data_emissao: new Date().toISOString().slice(0, 10),
      prestador: {
        cnpj:                AVANCE_LABS.cnpj,
        inscricao_municipal: AVANCE_LABS.inscricao_municipal,
        codigo_municipio:    AVANCE_LABS.codigo_municipio,
      },
      tomador: {
        cpf:          params.sellerCpf,
        cnpj:         params.sellerCnpj,
        razao_social: params.sellerName,
        email:        params.sellerEmail,
      },
      servico: {
        aliquota:                    ISS_RATE,
        base_calculo:                params.commissionBrl,
        codigo_tributario_municipio: ISS_SERVICE_CODE,
        discriminacao:               `Comissão de intermediação de venda no marketplace Arena dos Mantos - 7% sobre R$${(params.commissionBrl / 0.07).toFixed(2)}`,
        iss_retido:                  false,
        item_lista_servico:          ISS_LIST_CODE,
        valor_servicos:              params.commissionBrl,
        valor_iss:                   issValue,
      },
    };
  }

  buildNfePayload(params: {
    ref:           string;
    buyerName:     string;
    buyerCpf?:     string;
    buyerEmail?:   string;
    teamName:      string;
    season:        string;
    priceBrl:      number;
  }): NfePayload {
    return {
      ref:               params.ref,
      natureza_operacao: 'VENDA DE MERCADORIA',
      forma_pagamento:   0,
      emitente: {
        cnpj:               AVANCE_LABS.cnpj,
        nome:               AVANCE_LABS.nome,
        logradouro:         AVANCE_LABS.logradouro,
        numero:             AVANCE_LABS.numero,
        bairro:             AVANCE_LABS.bairro,
        municipio:          AVANCE_LABS.municipio,
        uf:                 AVANCE_LABS.uf,
        cep:                AVANCE_LABS.cep,
        inscricao_estadual: AVANCE_LABS.inscricao_estadual,
        regime_tributario:  AVANCE_LABS.regime_tributario,
      },
      destinatario: {
        cpf:  params.buyerCpf,
        nome: params.buyerName,
        email: params.buyerEmail,
      },
      items: [{
        numero_item:              1,
        codigo_produto:           'CAMISA-MPC',
        descricao:                `Camisa de futebol - ${params.teamName} ${params.season}`,
        cfop:                     JERSEY_CFOP,
        unidade_comercial:        'UN',
        quantidade_comercial:     1,
        valor_unitario_comercial: params.priceBrl,
        valor_total_bruto:        params.priceBrl,
        ncm:                      JERSEY_NCM,
        icms_origem:              0,
        icms_modalidade:          90,   // Simples Nacional
        pis_modalidade:           7,    // Alíquota zero
        cofins_modalidade:        7,    // Alíquota zero
      }],
      formas_pagamento: [{ forma_pagamento: 17, valor: params.priceBrl }], // 17 = PIX
    };
  }
}
