/**
 * Transactional email templates.
 *
 * Table-based layout with inline styles — the only thing that renders
 * consistently in Gmail, Outlook and Apple Mail. Brand palette matches the
 * app: green #335336, gold #D4AF37, near-black #211B15.
 */

const VERDE   = '#335336';
const DOURADO = '#D4AF37';
const ESCURO  = '#211B15';
const TEXTO   = '#2E2A24';
const SUAVE   = '#6B6357';

const SITE = 'https://www.arenadosmantos.app.br';

function esc(v: string | number | undefined | null): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function shortId(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

function button(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
      <tr><td style="background:${DOURADO};border-radius:12px">
        <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;color:${ESCURO};
           font-weight:800;font-size:15px;text-decoration:none">${esc(label)}</a>
      </td></tr>
    </table>`;
}

/** Grey key/value box used for order summaries. */
function details(rows: [string, string][]): string {
  const body = rows.map(([k, v]) => `
    <tr>
      <td style="padding:7px 0;color:${SUAVE};font-size:14px">${esc(k)}</td>
      <td style="padding:7px 0;color:${TEXTO};font-size:14px;font-weight:700;text-align:right">${esc(v)}</td>
    </tr>`).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#F7F5F0;border:1px solid #E5DCC4;border-radius:12px;padding:16px 18px;margin:20px 0">
      ${body}
    </table>`;
}

function layout(heading: string, inner: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#EFEDE8">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFEDE8;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">

        <tr><td style="background:${VERDE};padding:22px 28px">
          <div style="color:${DOURADO};font-size:19px;font-weight:800;letter-spacing:1px">ARENA DOS MANTOS</div>
        </td></tr>

        <tr><td style="padding:28px">
          <h1 style="margin:0 0 14px;color:${ESCURO};font-size:21px;font-weight:800">${esc(heading)}</h1>
          ${inner}
        </td></tr>

        <tr><td style="background:#FAF8F4;border-top:1px solid #E5DCC4;padding:20px 28px">
          <p style="margin:0;color:${SUAVE};font-size:12px;line-height:18px">
            Arena dos Mantos — o marketplace de camisas de futebol.<br>
            <a href="${SITE}" style="color:${SUAVE}">arenadosmantos.app.br</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;color:${TEXTO};font-size:15px;line-height:23px">${text}</p>`;
}

export interface EmailContent { subject: string; html: string }

export interface OrderEmailData {
  orderId:    string;
  teamName:   string;
  season?:    string;
  priceCents: number;
  buyerName:  string;
  sellerName: string;
  tracking?:  string;
  labelUrl?:  string;
}

// ── Account ───────────────────────────────────────────────────────────────────

export function welcomeEmail(name: string): EmailContent {
  const first = name.split(' ')[0] || name;
  return {
    subject: 'Bem-vindo à Arena dos Mantos! ⚽',
    html: layout(`Bem-vindo, ${esc(first)}!`, `
      ${p('Sua conta foi criada. Você já faz parte da maior comunidade de colecionadores de camisas de futebol do Brasil.')}
      ${p('<strong>O que você pode fazer agora:</strong>')}
      <ul style="margin:0 0 12px;padding-left:20px;color:${TEXTO};font-size:15px;line-height:24px">
        <li>Buscar camisas por time, fornecedora, temporada e tamanho</li>
        <li>Anunciar as suas camisas e vender com pagamento protegido</li>
        <li>Avaliar e ser avaliado, construindo sua reputação na Arena</li>
      </ul>
      ${p(`Todo pagamento fica retido até o comprador confirmar o recebimento — segurança para os dois lados.`)}
      ${p(`<span style="color:${SUAVE};font-size:13px">Dúvidas? Basta responder este e-mail.</span>`)}
    `),
  };
}

export function passwordResetEmail(code: string): EmailContent {
  return {
    subject: 'Redefinição de senha — Arena dos Mantos',
    html: layout('Redefinição de senha', `
      ${p('Seu código de verificação é:')}
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:${DOURADO};
                  background:#FAF8F4;border:1px solid #E5DCC4;border-radius:12px;
                  padding:18px;text-align:center;margin:18px 0">${esc(code)}</div>
      ${p(`Este código expira em <strong>15 minutos</strong>.`)}
      ${p(`<span style="color:${SUAVE};font-size:13px">Se você não solicitou a redefinição, ignore este e-mail — sua senha continua a mesma.</span>`)}
    `),
  };
}

// ── Order flow ────────────────────────────────────────────────────────────────

/** Seller: a buyer paid. */
export function orderPaidSellerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `🛒 Nova venda! ${d.teamName} — pedido #${shortId(d.orderId)}`,
    html: layout('Você vendeu uma camisa!', `
      ${p(`<strong>${esc(d.buyerName)}</strong> comprou sua camisa e o pagamento já foi confirmado.`)}
      ${details([
        ['Camisa',  `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Valor',   brl(d.priceCents)],
        ['Comprador', d.buyerName],
        ['Pedido',  `#${shortId(d.orderId)}`],
      ])}
      ${p('<strong>Próximo passo:</strong> prepare a camisa para envio. A etiqueta de postagem é gerada automaticamente e chega para você por e-mail em instantes.')}
      ${p(`<span style="color:${SUAVE};font-size:13px">O valor fica retido com segurança e é liberado para saque após a confirmação de entrega.</span>`)}
    `),
  };
}

/** Seller: the Correios label is ready. */
export function shippingLabelEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `📮 Etiqueta de envio — pedido #${shortId(d.orderId)}`,
    html: layout('Sua etiqueta de envio está pronta', `
      ${p(`A etiqueta dos Correios do pedido <strong>#${esc(shortId(d.orderId))}</strong> foi gerada. Imprima, cole na embalagem e poste a camisa.`)}
      ${details([
        ['Camisa',      `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Comprador',   d.buyerName],
        ...(d.tracking ? [['Rastreio', d.tracking] as [string, string]] : []),
      ])}
      ${d.labelUrl ? button('Baixar etiqueta (PDF)', d.labelUrl) : p('<strong>A etiqueta está disponível no app, na tela do pedido.</strong>')}
      ${p(`<span style="color:${SUAVE};font-size:13px">Poste o quanto antes: o comprador acompanha o rastreio e o pagamento é liberado após a entrega.</span>`)}
    `),
  };
}

/** Buyer: it shipped. */
export function orderShippedBuyerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `📦 Seu pedido foi enviado — ${d.teamName}`,
    html: layout('Sua camisa está a caminho!', `
      ${p(`<strong>${esc(d.sellerName)}</strong> postou sua camisa.`)}
      ${details([
        ['Camisa',  `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Pedido',  `#${shortId(d.orderId)}`],
        ...(d.tracking ? [['Código de rastreio', d.tracking] as [string, string]] : []),
      ])}
      ${d.tracking
        ? button('Rastrear nos Correios', `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(d.tracking)}`)
        : ''}
      ${p('Assim que receber, <strong>confirme o recebimento no app</strong> — é isso que libera o pagamento para o vendedor.')}
    `),
  };
}

/** Seller: buyer confirmed delivery. */
export function deliveryConfirmedSellerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `✅ Recebimento confirmado — pedido #${shortId(d.orderId)}`,
    html: layout('Entrega confirmada!', `
      ${p(`<strong>${esc(d.buyerName)}</strong> confirmou o recebimento de <strong>${esc(d.teamName)}</strong>.`)}
      ${details([
        ['Camisa', `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Valor',  brl(d.priceCents)],
        ['Pedido', `#${shortId(d.orderId)}`],
      ])}
      ${p('O pagamento está sendo processado e será liberado para saque em instantes.')}
      ${p('Que tal <strong>avaliar o comprador</strong>? Avaliações constroem a confiança da comunidade.')}
    `),
  };
}

/** Both sides, after delivery: leave a rating. */
export function rateReminderEmail(d: OrderEmailData, rateeName: string): EmailContent {
  return {
    subject: `⭐ Como foi sua experiência com ${rateeName}?`,
    html: layout('Deixe sua avaliação', `
      ${p(`Seu pedido <strong>#${esc(shortId(d.orderId))}</strong> (${esc(d.teamName)}) foi concluído.`)}
      ${p(`Leve 30 segundos para avaliar <strong>${esc(rateeName)}</strong>. As avaliações são o que torna a Arena um lugar seguro para negociar.`)}
      ${p('Abra o app, vá em <strong>Meus pedidos</strong> e toque em <strong>Avaliar</strong>.')}
    `),
  };
}

/** Seller: escrow released. */
export function paymentReleasedSellerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `💰 Pagamento liberado — pedido #${shortId(d.orderId)}`,
    html: layout('Seu pagamento foi liberado!', `
      ${p(`O valor do pedido <strong>#${esc(shortId(d.orderId))}</strong> está disponível para saque.`)}
      ${details([
        ['Camisa', `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Valor',  brl(d.priceCents)],
      ])}
      ${p('Acesse <strong>Perfil → Financeiro</strong> no app para solicitar o saque.')}
    `),
  };
}

/** Buyer: order completed. */
export function orderCompletedBuyerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `✅ Pedido concluído — ${d.teamName}`,
    html: layout('Pedido concluído', `
      ${p(`Seu pedido de <strong>${esc(d.teamName)}</strong> foi concluído com sucesso. Esperamos que a camisa seja tudo o que você esperava!`)}
      ${details([
        ['Pedido', `#${shortId(d.orderId)}`],
        ['Valor',  brl(d.priceCents)],
      ])}
      ${p('Se ainda não avaliou o vendedor, abra o app e deixe sua avaliação.')}
    `),
  };
}

/** Seller: buyer opened a dispute — time-sensitive. */
export function disputeOpenedSellerEmail(d: OrderEmailData, reason: string): EmailContent {
  return {
    subject: `⚠️ Problema reportado — pedido #${shortId(d.orderId)}`,
    html: layout('Um problema foi reportado', `
      ${p(`O comprador abriu uma disputa no pedido <strong>#${esc(shortId(d.orderId))}</strong>.`)}
      ${details([
        ['Camisa',    `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Comprador', d.buyerName],
        ['Motivo',    reason],
      ])}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:14px 16px;margin:16px 0">
        <tr><td style="color:#92400E;font-size:14px;line-height:21px">
          <strong>O pagamento ficou retido</strong> até a resolução. Nossa equipe entrará em contato em breve.
        </td></tr>
      </table>
      ${p('Responda este e-mail com qualquer informação que ajude a resolver — comprovante de postagem, fotos do envio, conversas com o comprador.')}
    `),
  };
}
