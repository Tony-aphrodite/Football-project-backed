import { Controller, Get, Header } from '@nestjs/common';

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Política de Privacidade — Arena dos Mantos</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #211B15;
      color: #EAEAEA;
      line-height: 1.7;
      padding: 0 16px 80px;
    }
    .wrap { max-width: 720px; margin: 0 auto; }
    header {
      background: #2A4429;
      margin: 0 -16px 40px;
      padding: 32px 16px 28px;
      border-bottom: 2px solid #D4AF37;
    }
    header .brand {
      font-size: 22px;
      font-weight: 900;
      color: #D4AF37;
      letter-spacing: 0.5px;
    }
    header h1 {
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      margin-top: 8px;
    }
    .version {
      font-size: 12px;
      color: #E1C16E;
      margin-top: 6px;
      opacity: 0.7;
    }
    h2 {
      font-size: 17px;
      font-weight: 700;
      color: #D4AF37;
      margin: 36px 0 10px;
    }
    p { margin-bottom: 12px; color: #CBCBCB; font-size: 15px; }
    ul { padding-left: 20px; margin-bottom: 12px; }
    li { color: #CBCBCB; font-size: 15px; margin-bottom: 6px; }
    a { color: #E1C16E; }
    .contact-box {
      background: #2A4429;
      border: 1px solid rgba(212,175,55,0.25);
      border-radius: 12px;
      padding: 20px;
      margin-top: 40px;
    }
    .contact-box p { margin: 0; font-size: 14px; }
    footer {
      margin-top: 60px;
      text-align: center;
      font-size: 12px;
      color: rgba(234,234,234,0.3);
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="brand">Arena dos Mantos</div>
      <h1>Política de Privacidade</h1>
      <div class="version">Versão 2026-04-29 — vigente a partir de 29 de abril de 2026</div>
    </div>
  </header>

  <div class="wrap">

    <p>
      A Arena dos Mantos Comércio Eletrônico Ltda. ("Arena dos Mantos", "nós") respeita sua
      privacidade e está comprometida com a proteção dos seus dados pessoais, em conformidade
      com a <strong>Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)</strong>.
    </p>

    <h2>1. Quem somos</h2>
    <p>
      A Arena dos Mantos é um marketplace de camisas autênticas de futebol que conecta
      compradores e vendedores no Brasil. Operamos o aplicativo móvel "Arena dos Mantos"
      disponível para Android e iOS.
    </p>

    <h2>2. Dados que coletamos</h2>
    <ul>
      <li><strong>Identificação:</strong> nome completo, e-mail e foto de perfil fornecidos pelo provedor de login (Google ou Apple).</li>
      <li><strong>Verificação de identidade:</strong> número de celular (verificado via SMS) e CPF (usado exclusivamente para validar identidade — nunca exibido publicamente).</li>
      <li><strong>Anúncios:</strong> fotos, descrições, preços e condições dos itens que você anuncia.</li>
      <li><strong>Transações:</strong> histórico de compras e vendas, avaliações e mensagens trocadas com outros usuários.</li>
      <li><strong>Dados técnicos:</strong> endereço IP, modelo do dispositivo, sistema operacional e logs de acesso para fins de segurança e diagnóstico.</li>
    </ul>

    <h2>3. Como usamos seus dados</h2>
    <ul>
      <li>Criar e manter sua conta no aplicativo.</li>
      <li>Verificar sua identidade e prevenir fraudes.</li>
      <li>Processar transações entre compradores e vendedores.</li>
      <li>Enviar notificações sobre suas compras, vendas e mensagens.</li>
      <li>Melhorar a experiência do usuário e a segurança da plataforma.</li>
      <li>Cumprir obrigações legais e regulatórias.</li>
    </ul>

    <h2>4. Compartilhamento de dados</h2>
    <p>Seus dados são compartilhados somente com:</p>
    <ul>
      <li><strong>Pagar.me (Stone Co.):</strong> processamento de pagamentos, sujeito à própria política de privacidade.</li>
      <li><strong>Correios / transportadoras:</strong> para viabilizar a entrega de itens comprados.</li>
      <li><strong>Amazon Web Services:</strong> infraestrutura de armazenamento e processamento (servidores localizados no Brasil — região sa-east-1).</li>
      <li><strong>Twilio Inc.:</strong> envio de SMS para verificação de número de celular.</li>
    </ul>
    <p>Não vendemos, alugamos nem compartilhamos seus dados com terceiros para fins de marketing.</p>

    <h2>5. Seus direitos (LGPD, art. 18)</h2>
    <p>Você pode, a qualquer momento, solicitar:</p>
    <ul>
      <li><strong>Confirmação e acesso</strong> aos dados que temos sobre você.</li>
      <li><strong>Correção</strong> de dados incompletos, inexatos ou desatualizados.</li>
      <li><strong>Anonimização, bloqueio ou eliminação</strong> de dados desnecessários.</li>
      <li><strong>Portabilidade</strong> dos seus dados a outro fornecedor de serviço.</li>
      <li><strong>Eliminação</strong> dos dados tratados com base no seu consentimento.</li>
      <li><strong>Revogação do consentimento</strong> a qualquer momento (o que implica encerramento da conta).</li>
      <li><strong>Informação</strong> sobre com quais entidades compartilhamos seus dados.</li>
    </ul>

    <h2>6. Retenção de dados</h2>
    <p>
      Mantemos seus dados pelo tempo necessário para a prestação do serviço e cumprimento de
      obrigações legais (ex.: registros fiscais por 5 anos, conforme legislação brasileira).
      Após o encerramento da conta, os dados são anonimizados ou excluídos em até 90 dias,
      salvo obrigação legal de retenção.
    </p>

    <h2>7. Segurança</h2>
    <p>
      Utilizamos criptografia em trânsito (TLS 1.2+) e em repouso, tokens JWT de curta duração,
      armazenamento seguro de credenciais e auditorias periódicas. Nenhum sistema é 100% seguro;
      em caso de incidente, notificaremos os titulares afetados nos prazos exigidos pela LGPD.
    </p>

    <h2>8. Cookies e rastreamento</h2>
    <p>
      O aplicativo móvel não utiliza cookies. Coletamos apenas dados técnicos mínimos
      necessários para o funcionamento do serviço.
    </p>

    <h2>9. Menores de idade</h2>
    <p>
      O serviço é destinado a maiores de 18 anos. Não coletamos intencionalmente dados de
      menores. Se identificarmos uma conta de menor, ela será encerrada imediatamente.
    </p>

    <h2>10. Alterações nesta política</h2>
    <p>
      Quando atualizarmos esta política, a versão exibida no aplicativo mudará e solicitaremos
      novo consentimento antes de você continuar usando o serviço.
    </p>

    <div class="contact-box">
      <h2 style="margin-top:0">11. Fale conosco / Encarregado (DPO)</h2>
      <p>
        Para exercer seus direitos ou tirar dúvidas sobre esta política, entre em contato:<br /><br />
        <strong>E-mail:</strong> <a href="mailto:privacidade@arenadosmantos.com.br">privacidade@arenadosmantos.com.br</a><br />
        <strong>Prazo de resposta:</strong> até 15 dias úteis, conforme art. 18, §3º da LGPD.
      </p>
    </div>

    <footer>
      © 2026 Arena dos Mantos — Todos os direitos reservados.<br />
      Esta política está em conformidade com a LGPD (Lei 13.709/2018).
    </footer>

  </div>
</body>
</html>`;

@Controller()
export class LegalController {
  @Get('privacidade')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  privacyPolicy(): string {
    return PRIVACY_HTML;
  }
}
