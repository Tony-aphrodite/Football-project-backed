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
// Mail is sent from noreply@, so every template points here instead.
const CONTATO = 'contato@arenadosmantos.app.br';
// Must be an absolute public URL — email clients cannot read bundled assets.
const LOGO = `${SITE}/stadium.png`;

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

        <tr><td style="background:${VERDE};padding:20px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;vertical-align:middle">
              <img src="${LOGO}" width="44" height="44" alt=""
                   style="display:block;width:44px;height:44px;border:0" />
            </td>
            <td style="vertical-align:middle">
              <!-- Text wordmark, not an image: most clients block images by
                   default, and the brand must still be visible when they do. -->
              <div style="color:${DOURADO};font-size:18px;font-weight:800;letter-spacing:1px;line-height:22px">ARENA DOS MANTOS</div>
              <div style="color:rgba(255,255,255,0.55);font-size:11px;letter-spacing:.5px">Em prol do colecionismo profissional</div>
            </td>
          </tr></table>
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
  totalCents?: number;   // what the buyer actually paid, shipping and discount included
  buyerName:  string;
  sellerName: string;
  tracking?:  string;
  labelUrl?:  string;
  deliveryMethod?: 'CORREIOS' | 'ENTREGA_EM_MAOS';
  photoUrl?:  string;   // first listing photo, public R2 URL
}

/** The jersey's photo at the top of order e-mails — people recognise it faster than a name. */
function jerseyPhoto(d: OrderEmailData): string {
  if (!d.photoUrl) return '';
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px">
      <tr><td align="center">
        <img src="${esc(d.photoUrl)}" width="200" alt="${esc(d.teamName)}"
             style="display:block;width:200px;max-width:100%;height:auto;border-radius:12px;border:1px solid #E5DCC4" />
      </td></tr>
    </table>`;
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
      ${p(`Todo pagamento fica retido até 7 dias após a entrega — segurança para os dois lados.`)}
      ${p(`<span style="color:${SUAVE};font-size:13px">Dúvidas? Escreva para <a href="mailto:${CONTATO}" style="color:${SUAVE}">${CONTATO}</a>.</span>`)}
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

/** Sent to the NEW address: typing the code back proves the person owns it. */
export function emailChangeCodeEmail(code: string): EmailContent {
  return {
    subject: 'Confirme seu novo e-mail — Arena dos Mantos',
    html: layout('Confirme seu novo e-mail', `
      ${p('Para trocar o e-mail da sua conta na Arena dos Mantos, digite este código no app:')}
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:${DOURADO};
                  background:#FAF8F4;border:1px solid #E5DCC4;border-radius:12px;
                  padding:18px;text-align:center;margin:18px 0">${esc(code)}</div>
      ${p(`Este código expira em <strong>15 minutos</strong>.`)}
      ${p(`<span style="color:${SUAVE};font-size:13px">Se você não pediu esta troca, ignore este e-mail — nada será alterado.</span>`)}
    `),
  };
}

/** Sent to the OLD address once the change is done, so a hijack does not go unnoticed. */
export function emailChangedNoticeEmail(maskedNewEmail: string): EmailContent {
  return {
    subject: 'O e-mail da sua conta foi alterado — Arena dos Mantos',
    html: layout('Seu e-mail foi alterado', `
      ${p(`O e-mail da sua conta na Arena dos Mantos foi alterado para <strong>${esc(maskedNewEmail)}</strong>.`)}
      ${p('A partir de agora, avisos de pedidos e o login por e-mail usam o novo endereço.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:14px 16px;margin:16px 0">
        <tr><td style="color:#92400E;font-size:14px;line-height:21px">
          <strong>Não foi você?</strong> Entre em contato imediatamente com
          <a href="mailto:contato@arenadosmantos.app.br" style="color:#92400E;font-weight:700">contato@arenadosmantos.app.br</a>.
        </td></tr>
      </table>
    `),
  };
}

/** Sent to the account e-mail after the payout bank account is replaced. */
export function bankChangedNoticeEmail(d: { bankCode: string; accountLast4: string; holdHours: number }): EmailContent {
  return {
    subject: 'Sua conta bancária foi alterada — Arena dos Mantos',
    html: layout('Conta bancária alterada', `
      ${p('A conta bancária que recebe os valores das suas vendas na Arena dos Mantos foi alterada.')}
      ${details([
        ['Banco', d.bankCode],
        ['Conta', `•••• ${d.accountLast4}`],
      ])}
      ${p(`Por segurança, novos saques ficam bloqueados por <strong>${d.holdHours} horas</strong>.`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:14px 16px;margin:16px 0">
        <tr><td style="color:#92400E;font-size:14px;line-height:21px">
          <strong>Não foi você?</strong> Entre em contato imediatamente com
          <a href="mailto:contato@arenadosmantos.app.br" style="color:#92400E;font-weight:700">contato@arenadosmantos.app.br</a>
          para bloquearmos a conta.
        </td></tr>
      </table>
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
      ${jerseyPhoto(d)}
      ${details([
        ['Camisa',  `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Valor',   brl(d.priceCents)],
        ['Comprador', d.buyerName],
        ['Pedido',  `#${shortId(d.orderId)}`],
      ])}
      ${p(d.deliveryMethod === 'ENTREGA_EM_MAOS'
        ? '<strong>Próximo passo:</strong> combine com o comprador o local e o horário da <strong>entrega em mãos</strong>. Na entrega, peça para ele confirmar o recebimento no app.'
        : '<strong>Próximo passo:</strong> prepare a camisa para envio. A etiqueta de postagem é gerada automaticamente e chega para você por e-mail em instantes.')}
      ${p(`<span style="color:${SUAVE};font-size:13px">O valor fica retido com segurança e é liberado para saque 7 dias após a entrega, se não houver disputa.</span>`)}
    `),
  };
}

/** Seller: the Correios label is ready. */
export function shippingLabelEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `📮 Etiqueta de envio — pedido #${shortId(d.orderId)}`,
    html: layout('Sua etiqueta de envio está pronta', `
      ${p(`A etiqueta dos Correios do pedido <strong>#${esc(shortId(d.orderId))}</strong> foi gerada. Imprima, cole na embalagem e poste a camisa.`)}
      ${jerseyPhoto(d)}
      ${details([
        ['Camisa',      `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Comprador',   d.buyerName],
        ...(d.tracking ? [['Rastreio', d.tracking] as [string, string]] : []),
      ])}
      ${d.labelUrl ? button('Baixar etiqueta (PDF)', d.labelUrl) : p('<strong>A etiqueta está disponível no app, na tela do pedido.</strong>')}
      ${p(`<span style="color:${SUAVE};font-size:13px">Poste o quanto antes: o comprador acompanha o rastreio e o pagamento é liberado 7 dias após a entrega.</span>`)}
    `),
  };
}

/** Buyer: it shipped. */
export function orderShippedBuyerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `📦 Seu pedido foi enviado — ${d.teamName}`,
    html: layout('Sua camisa está a caminho!', `
      ${p(`<strong>${esc(d.sellerName)}</strong> postou sua camisa.`)}
      ${jerseyPhoto(d)}
      ${details([
        ['Camisa',  `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Pedido',  `#${shortId(d.orderId)}`],
        ...(d.tracking ? [['Código de rastreio', d.tracking] as [string, string]] : []),
      ])}
      ${d.tracking
        ? button('Rastrear nos Correios', `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(d.tracking)}`)
        : ''}
      ${p('Assim que receber, <strong>confirme o recebimento no app</strong>. Você tem <strong>7 dias após a entrega</strong> para relatar qualquer problema; depois disso o pagamento é liberado ao vendedor.')}
    `),
  };
}

/** Seller: buyer confirmed delivery. */
export function deliveryConfirmedSellerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `✅ Recebimento confirmado — pedido #${shortId(d.orderId)}`,
    html: layout('Entrega confirmada!', `
      ${p(`<strong>${esc(d.buyerName)}</strong> confirmou o recebimento de <strong>${esc(d.teamName)}</strong>.`)}
      ${jerseyPhoto(d)}
      ${details([
        ['Camisa', `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Valor',  brl(d.priceCents)],
        ['Pedido', `#${shortId(d.orderId)}`],
      ])}
      ${p('O pagamento será liberado para saque em <strong>7 dias</strong>, prazo em que o comprador ainda pode relatar algum problema.')}
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
      ${jerseyPhoto(d)}
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
      ${jerseyPhoto(d)}
      ${details([
        ['Pedido', `#${shortId(d.orderId)}`],
        ['Valor',  brl(d.priceCents)],
      ])}
      ${p('Se ainda não avaliou o vendedor, abra o app e deixe sua avaliação.')}
    `),
  };
}

/** Seller: buyer opened a dispute — time-sensitive. */
export function disputeOpenedSellerEmail(d: OrderEmailData, reason: string, bySystem = false): EmailContent {
  return {
    subject: `⚠️ Problema reportado — pedido #${shortId(d.orderId)}`,
    html: layout('Um problema foi reportado', `
      ${p(bySystem
        ? `A entrega do pedido <strong>#${esc(shortId(d.orderId))}</strong> não foi registrada em 30 dias, então o pedido foi encaminhado para análise.`
        : `O comprador abriu uma disputa no pedido <strong>#${esc(shortId(d.orderId))}</strong>.`)}
      ${jerseyPhoto(d)}
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
      ${p(`Em até <strong>3 dias</strong>, envie para <a href="mailto:${CONTATO}" style="color:${TEXTO};font-weight:700">${CONTATO}</a> o que ajude a resolver — comprovante de postagem dos Correios, fotos da camisa e da embalagem.`)}
    `),
  };
}

/** Buyer: their dispute was received — what happens next and what to send. */
export function disputeOpenedBuyerEmail(d: OrderEmailData, reason: string, bySystem = false): EmailContent {
  return {
    subject: bySystem
      ? `Sua camisa chegou? — pedido #${shortId(d.orderId)}`
      : `Recebemos sua disputa — pedido #${shortId(d.orderId)}`,
    html: layout(bySystem ? 'Não registramos a entrega' : 'Recebemos sua disputa', `
      ${p(bySystem
        ? `A entrega do pedido <strong>#${esc(shortId(d.orderId))}</strong> não foi registrada em 30 dias. O pagamento ao vendedor está <strong>retido</strong> e nossa equipe vai analisar o caso.`
        : `Sua disputa no pedido <strong>#${esc(shortId(d.orderId))}</strong> foi aberta e o pagamento ao vendedor está <strong>retido</strong> até a resolução.`)}
      ${jerseyPhoto(d)}
      ${details([
        ['Camisa', `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Vendedor', d.sellerName],
        ['Motivo', reason],
      ])}
      ${p(bySystem
        ? `<strong>Se a camisa chegou</strong>, responda para <a href="mailto:${CONTATO}" style="color:${TEXTO};font-weight:700">${CONTATO}</a> avisando. <strong>Se não chegou</strong>, avise também — vamos verificar com os Correios.`
        : `<strong>Próximo passo:</strong> em até <strong>3 dias</strong>, envie para <a href="mailto:${CONTATO}" style="color:${TEXTO};font-weight:700">${CONTATO}</a> fotos da camisa, da etiqueta e da embalagem recebida. Sem evidências não é possível decidir a seu favor.`)}
      ${p(`<span style="color:${SUAVE};font-size:13px">Nossa equipe analisa o caso com as informações das duas partes e responde em até 48 horas.</span>`)}
    `),
  };
}

/** Internal: tells Arena a dispute needs mediation. */
export function disputeOpenedAdminEmail(d: OrderEmailData, reason: string, buyerEmail?: string, sellerEmail?: string): EmailContent {
  return {
    subject: `🚨 Nova disputa — pedido #${shortId(d.orderId)}`,
    html: layout('Nova disputa aberta', `
      ${p('Uma disputa foi aberta (veja o motivo abaixo). O pagamento está retido até a decisão.')}
      ${jerseyPhoto(d)}
      ${details([
        ['Pedido', `#${shortId(d.orderId)}`],
        ['ID completo', d.orderId],
        ['Camisa', `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Valor', brl(d.totalCents ?? d.priceCents)],
        ['Comprador', `${d.buyerName}${buyerEmail ? ` · ${buyerEmail}` : ''}`],
        ['Vendedor', `${d.sellerName}${sellerEmail ? ` · ${sellerEmail}` : ''}`],
        ['Motivo', reason],
      ])}
      ${p('As duas partes foram avisadas e orientadas a enviar evidências para este e-mail em até 3 dias.')}
    `),
  };
}

/** Buyer: 15 days after posting with no registered delivery. */
export function deliveryReminderBuyerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `📦 Sua camisa já chegou? — pedido #${shortId(d.orderId)}`,
    html: layout('Sua camisa já chegou?', `
      ${p(`Ainda não registramos a entrega de <strong>${esc(d.teamName)}</strong> (pedido #${esc(shortId(d.orderId))}).`)}
      ${p('<strong>Se já chegou</strong>, abra o app em <strong>Meus pedidos</strong> e toque em <strong>Confirmar recebimento</strong>.')}
      ${p('<strong>Se não chegou</strong>, toque em <strong>Tive um problema com este pedido</strong> — o pagamento ao vendedor continua retido até resolvermos.')}
    `),
  };
}

/** Buyer: the carrier reports the jersey delivered — the 7-day window starts. */
export function orderDeliveredBuyerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `📬 Sua camisa foi entregue — pedido #${shortId(d.orderId)}`,
    html: layout('Sua camisa chegou!', `
      ${p(`Os Correios registraram a entrega de <strong>${esc(d.teamName)}</strong>.`)}
      ${p('Confira a camisa com calma. Você tem <strong>7 dias</strong> para relatar qualquer problema pelo app (em <strong>Meus pedidos</strong> → <strong>Tive um problema com este pedido</strong>). Depois desse prazo, o pagamento é liberado ao vendedor.')}
      ${p(`<span style="color:${SUAVE};font-size:13px">Se você se arrependeu da compra, escreva para <a href="mailto:${CONTATO}" style="color:${SUAVE}">${CONTATO}</a> dentro desse prazo para iniciar a devolução.</span>`)}
    `),
  };
}

/**
 * Buyer: payment confirmed. A receipt, and also the fastest way for an account
 * owner to notice a purchase they did not make — no cards are stored, but an
 * account can still be misused with a stolen card.
 */
export function orderPaidBuyerEmail(d: OrderEmailData): EmailContent {
  return {
    subject: `✅ Compra confirmada — ${d.teamName}`,
    html: layout('Sua compra foi confirmada!', `
      ${p(`O pagamento do pedido <strong>#${esc(shortId(d.orderId))}</strong> foi aprovado.`)}
      ${jerseyPhoto(d)}
      ${details([
        ['Camisa',   `${d.teamName}${d.season ? ` · ${d.season}` : ''}`],
        ['Vendedor', d.sellerName],
        ['Total',    brl(d.totalCents ?? d.priceCents)],
        ['Pedido',   `#${shortId(d.orderId)}`],
      ])}
      ${p(d.deliveryMethod === 'ENTREGA_EM_MAOS'
        ? 'O vendedor já foi avisado. Combinem o local e o horário da <strong>entrega em mãos</strong> — ao receber a camisa, confirme o recebimento no app.'
        : 'O vendedor já foi avisado e vai preparar o envio. Você recebe o código de rastreio por e-mail assim que a camisa for postada.')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:14px 16px;margin:16px 0">
        <tr><td style="color:#92400E;font-size:14px;line-height:21px">
          <strong>Se você não fez esta compra</strong>, entre em contato agora com
          <a href="mailto:${CONTATO}" style="color:#92400E;font-weight:700">${CONTATO}</a>.
          O valor fica retido e ainda não foi repassado ao vendedor.
        </td></tr>
      </table>
    `),
  };
}
