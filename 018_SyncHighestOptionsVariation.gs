/**
 * @fileoverview 017_SyncHighestOptionsVariation.gs - v1.0
 * ═══════════════════════════════════════════════════════════════
 * ENDPOINT: GET /market/statistics/realtime/highest_options_variation/{type}
 * ABA: SELECAO_MAIORES_VARIACOES
 * Opções com maiores variações de preço no dia (PUT + CALL).
 * ═══════════════════════════════════════════════════════════════
 */

const VAR017_SHEET   = 'SELECAO_MAIORES_VARIACOES';
const VAR017_LIMIT   = 100;
const VAR017_HEADERS = [
  'OPTION_TICKER', 'CATEGORY', 'TICKER', 'COMPANY_NAME', 'SECTOR',
  'EXPIRY', 'DTE_CALENDAR', 'STRIKE',
  'VARIATION', 'VOLUME_FIN', 'VE_OVER_STRIKE', 'PROFIT_RATE_IF_EXERCISED',
  'UPDATED_AT'
];

function SyncHighestOptionsVariation_Menu() {
  _menuBridge('Maiores Variações em Opções', orquestrarSyncHighestVariation);
}

function orquestrarSyncHighestVariation() {
  const tInicio = Date.now();
  SysLogger.log('HighestVariation', 'START',
    '>>> INICIANDO SYNC MAIORES VARIAÇÕES EM OPÇÕES <<<',
    JSON.stringify({ aba: VAR017_SHEET, limit: VAR017_LIMIT, timestamp: new Date().toISOString() })
  );

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _garantirAba017(ss);
  SysLogger.log('HighestVariation', 'INFO', `Aba "${VAR017_SHEET}" pronta (${VAR017_HEADERS.length} colunas).`);

  _limparAba017(sheet);
  let proximaLinha = 2;
  const erros  = [];
  const resumo = [];

  ['PUT', 'CALL'].forEach(tipo => {
    const tTipo = Date.now();
    SysLogger.log('HighestVariation', 'INFO',
      `API call: GET /market/statistics/realtime/highest_options_variation/${tipo}?limit=${VAR017_LIMIT}`
    );

    try {
      const url  = `${OplabService._baseUrl}/market/statistics/realtime/highest_options_variation/${tipo}?limit=${VAR017_LIMIT}`;
      const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });

      if (!data || !Array.isArray(data)) throw new Error('Resposta nula ou inválida.');

      SysLogger.log('HighestVariation', 'INFO', `${tipo}: ${data.length} itens retornados.`);

      const linhas = data.map(item => [
        Sanitizador.textoPuro(item.symbol),                       // OPTION_TICKER
        Sanitizador.textoPuro(item.type),                         // CATEGORY
        Sanitizador.textoPuro(item.underlying),                   // TICKER
        item.name   || '',                                        // COMPANY_NAME
        item.sector || '',                                        // SECTOR
        item.due_date ? Sanitizador.dataSoData(item.due_date) : '', // EXPIRY
        Sanitizador.numeroPuro(item.days_to_maturity),            // DTE_CALENDAR
        Sanitizador.numeroPuro(item.strike),                      // STRIKE
        Sanitizador.numeroPuro(item.variation),                   // VARIATION
        Sanitizador.numeroPuro(item.financial_volume),            // VOLUME_FIN
        Sanitizador.numeroPuro(item.ve_over_strike),              // VE_OVER_STRIKE
        Sanitizador.numeroPuro(item.profit_rate_if_excercised),   // PROFIT_RATE_IF_EXERCISED
        item.updated_at ? Sanitizador.dataPura(item.updated_at) : new Date() // UPDATED_AT
      ]);

      const tGravacao = Date.now();
      if (linhas.length > 0) {
        sheet.getRange(proximaLinha, 1, linhas.length, VAR017_HEADERS.length).setValues(linhas);
        proximaLinha += linhas.length;
      }
      const tFim = Date.now();

      const info = {
        tipo, opcoes: linhas.length,
        duracao_api_s: ((tGravacao - tTipo) / 1000).toFixed(2),
        duracao_gs_s:  ((tFim - tGravacao) / 1000).toFixed(2),
        duracao_total_s: ((tFim - tTipo) / 1000).toFixed(2)
      };
      resumo.push(info);
      SysLogger.log('HighestVariation', 'SUCESSO',
        `${tipo}: ${linhas.length} opções gravadas. API: ${info.duracao_api_s}s | GS: ${info.duracao_gs_s}s`,
        JSON.stringify(info)
      );
    } catch (e) {
      erros.push({ tipo, erro: e.message });
      SysLogger.log('HighestVariation', 'ERRO', `Falha em ${tipo}.`, String(e.message));
    }
  });

  SpreadsheetApp.flush();

  const duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  SysLogger.log('HighestVariation', 'FINISH',
    `>>> SYNC CONCLUÍDO: ${proximaLinha - 2} opções | ${duracaoTotal}s <<<`,
    JSON.stringify({ total: proximaLinha - 2, duracao_total_s: duracaoTotal, resumo, erros: erros.length > 0 ? erros : null })
  );
  SysLogger.flush();
}

function _garantirAba017(ss) {
  let sheet = ss.getSheetByName(VAR017_SHEET);
  if (!sheet) { sheet = ss.insertSheet(VAR017_SHEET); }
  sheet.getRange(1, 1, 1, VAR017_HEADERS.length).setValues([VAR017_HEADERS]);
  return sheet;
}
function _limparAba017(sheet) {
  const lr = sheet.getLastRow();
  if (lr > 1) sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).clearContent();
}

function testHighestOptionsVariation() {
  console.log('=== HOMOLOGAÇÃO 017_SyncHighestOptionsVariation ===');
  ['PUT', 'CALL'].forEach(tipo => {
    const url  = `${OplabService._baseUrl}/market/statistics/realtime/highest_options_variation/${tipo}?limit=3`;
    const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
    console.log(`${tipo}: ${data ? data.length : 'null'} itens`);
    if (data && data[0]) console.log('Primeiro:', JSON.stringify(data[0]));
  });
  console.log('=== FIM ===');
}