// ─────────────────────────────────────────────────────────────────────────────
// POC_WhatsApp.gs  —  Prova de Conceito: envio de mensagem via CallMeBot
//
// ANTES DE RODAR:
//   1. Registrar o número no CallMeBot:
//      → Abrir WhatsApp e enviar "I allow callmebot to send me messages"
//        para o número +34 644 61 09 22
//      → O bot responde com a apikey (ex: 1234567)
//
//   2. Configurar em GAS: Project Settings > Script Properties:
//      CALLMEBOT_API_KEY  →  a apikey recebida (ex: 1234567)
//      WHATSAPP_NUMERO    →  seu número com DDI (ex: +5511999999999)
//
//   3. No editor GAS: selecionar testarEnvioWhatsApp e clicar Run
// ─────────────────────────────────────────────────────────────────────────────

function testarEnvioWhatsApp() {
  var props  = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('CALLMEBOT_API_KEY');
  var numero = props.getProperty('WHATSAPP_NUMERO');

  // Validação das props
  if (!apiKey || !numero) {
    var faltando = [];
    if (!apiKey) faltando.push('CALLMEBOT_API_KEY');
    if (!numero) faltando.push('WHATSAPP_NUMERO');
    console.error('❌ Script Properties não configuradas: ' + faltando.join(', '));
    console.info('→ Project Settings > Script Properties > adicionar as chaves acima');
    return;
  }

  var mensagem = '✅ ControleDeOpcoes — POC WhatsApp funcionando!\n'
               + 'Horário: ' + new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  var resultado = _callMeBotSend(numero, apiKey, mensagem);

  if (resultado.ok) {
    console.info('✅ Mensagem enviada com sucesso (HTTP ' + resultado.status + ')');
  } else {
    console.error('❌ Falha no envio (HTTP ' + resultado.status + '): ' + resultado.body);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Envio real via CallMeBot API
// Documentação: https://www.callmebot.com/blog/free-api-whatsapp-messages/
// ─────────────────────────────────────────────────────────────────────────────
function _callMeBotSend(numero, apiKey, texto) {
  var url = 'https://api.callmebot.com/whatsapp.php'
          + '?phone='  + encodeURIComponent(numero)
          + '&text='   + encodeURIComponent(texto)
          + '&apikey=' + encodeURIComponent(apiKey);

  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var status   = response.getResponseCode();
    var body     = response.getContentText();

    console.info('CallMeBot HTTP ' + status + ': ' + body.substring(0, 200));

    return { ok: status === 200, status: status, body: body };
  } catch (e) {
    console.error('Exceção ao chamar CallMeBot: ' + e.message);
    return { ok: false, status: 0, body: e.message };
  }
}
