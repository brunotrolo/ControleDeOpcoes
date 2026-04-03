/**
 * @fileoverview 019_SyncOplabScore.gs - v1.0
 * ═══════════════════════════════════════════════════════════════
 * ENDPOINT: GET /market/statistics/ranking/oplab_score
 * ABA: RANKING_OPLAB_SCORE
 * Ações ranqueadas pelo score proprietário OPLab (fundamentalista + MM).
 *
 * NOTA: 'oplab_score' é objeto aninhado — flatten em colunas separadas:
 *   value, ebit_var, revenue_var, cash_var, current_liabilities, mm_signal, date
 * ═══════════════════════════════════════════════════════════════
 */

const SCORE019_SHEET   = 'RANKING_OPLAB_SCORE';
const SCORE019_LIMIT   = 200;
const SCORE019_HEADERS = [
  'TICKER', 'SHORT_NAME', 'COMPANY_NAME', 'SECTOR', 'CNPJ',
  'VOLUME_FIN', 'STDV_5D',
  'SCORE_TOTAL', 'SCORE_EBIT_VAR', 'SCORE_REVENUE_VAR',
  'SCORE_CASH_VAR', 'SCORE_CURRENT_LIAB', 'SCORE_MM_SIGNAL',
  'SCORE_DATE', 'UPDATED_AT'
];

function SyncOplabScore_Menu() {
  _menuBridge('Ranking OPLab Score', orquestrarSyncOplabScore);
}

function orquestrarSyncOplabScore() {
  const tInicio = Date.now();
  SysLogger.log('OplabScore', 'START',
    '>>> INICIANDO SYNC RANKING OPLAB SCORE <<<',
    JSON.stringify({ aba: SCORE019_SHEET, limit: SCORE019_LIMIT, timestamp: new Date().toISOString() })
  );

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _garantirAba019(ss);
  SysLogger.log('OplabScore', 'INFO', `Aba "${SCORE019_SHEET}" pronta (${SCORE019_HEADERS.length} colunas).`);

  try {
    const url  = `${OplabService._baseUrl}/market/statistics/ranking/oplab_score?sort=desc&limit=${SCORE019_LIMIT}`;
    SysLogger.log('OplabScore', 'INFO',
      `API call: GET /market/statistics/ranking/oplab_score?sort=desc&limit=${SCORE019_LIMIT}`
    );

    const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
    if (!data || !Array.isArray(data)) throw new Error('Resposta nula ou inválida.');

    SysLogger.log('OplabScore', 'INFO', `${data.length} ativos retornados pela API.`);

    // Filtra registros individuais (tem symbol) vs agrupados por setor (só tem sector e date)
    const registros = data.filter(item => item.symbol);
    SysLogger.log('OplabScore', 'INFO',
      `${registros.length} registros individuais (filtrado de ${data.length} total).`
    );

    // Filtro: apenas ações brasileiras puras (sufixos 3/4/5/6, sem F, sem BDR/ETF)
    const acoesBR = registros.filter(item => _isAcaoBrasileira(item.symbol));
    SysLogger.log('OplabScore', 'INFO',
      `${acoesBR.length} ações BR após filtro (${registros.length - acoesBR.length} excluídos: BDR/ETF/Frac.).`
    );

    const now = new Date();
    const linhas = acoesBR.map(item => {
      const score = item.oplab_score || {};
      return [
        Sanitizador.textoPuro(item.symbol),               // TICKER
        item.short_name         || '',                    // SHORT_NAME
        item.name               || '',                    // COMPANY_NAME
        item.sector             || '',                    // SECTOR
        item.cnpj               || '',                    // CNPJ
        Sanitizador.numeroPuro(item.financial_volume),    // VOLUME_FIN
        Sanitizador.numeroPuro(item.stdv_5d),             // STDV_5D
        Sanitizador.numeroPuro(score.value),              // SCORE_TOTAL
        Sanitizador.numeroPuro(score.ebit_var),           // SCORE_EBIT_VAR
        Sanitizador.numeroPuro(score.revenue_var),        // SCORE_REVENUE_VAR
        Sanitizador.numeroPuro(score.cash_var),           // SCORE_CASH_VAR
        Sanitizador.numeroPuro(score.current_liabilities),// SCORE_CURRENT_LIAB
        Sanitizador.numeroPuro(score.mm_signal),          // SCORE_MM_SIGNAL
        score.date ? Sanitizador.dataSoData(score.date) : '',// SCORE_DATE
        item.updated_at ? Sanitizador.dataPura(item.updated_at) : now // UPDATED_AT
      ];
    });

    const tGravacao = Date.now();
    _limparAba019(sheet);
    if (linhas.length > 0) {
      sheet.getRange(2, 1, linhas.length, SCORE019_HEADERS.length).setValues(linhas);
    }
    SpreadsheetApp.flush();

    const tFim         = Date.now();
    const duracaoApi   = ((tGravacao - tInicio) / 1000).toFixed(2);
    const duracaoGs    = ((tFim - tGravacao) / 1000).toFixed(2);
    const duracaoTotal = ((tFim - tInicio) / 1000).toFixed(1);

    SysLogger.log('OplabScore', 'FINISH',
      `>>> SYNC CONCLUÍDO: ${linhas.length} ações BR | ${data.length} API → ${registros.length} individuais → ${acoesBR.length} BR | API: ${duracaoApi}s | GS: ${duracaoGs}s | Total: ${duracaoTotal}s <<<`,
      JSON.stringify({ total: linhas.length, api_retornou: data.length, individuais: registros.length, acoes_br: acoesBR.length, duracao_api_s: duracaoApi, duracao_gs_s: duracaoGs })
    );

  } catch (e) {
    SysLogger.log('OplabScore', 'ERRO', 'Falha na coleta.', String(e.message));
  }

  SysLogger.flush();
}

function _garantirAba019(ss) {
  let sheet = ss.getSheetByName(SCORE019_SHEET);
  if (!sheet) { sheet = ss.insertSheet(SCORE019_SHEET); }
  sheet.getRange(1, 1, 1, SCORE019_HEADERS.length).setValues([SCORE019_HEADERS]);
  return sheet;
}
function _limparAba019(sheet) {
  const lr = sheet.getLastRow();
  if (lr > 1) sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).clearContent();
}

function testOplabScore() {
  console.log('=== HOMOLOGAÇÃO 019_SyncOplabScore ===');
  const url  = `${OplabService._baseUrl}/market/statistics/ranking/oplab_score?sort=desc&limit=3`;
  const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
  console.log(`Itens retornados: ${data ? data.length : 'null'}`);
  if (data && data[0]) {
    console.log('Primeiro item (raw):', JSON.stringify(data[0], null, 2));
    console.log('oplab_score sub-campos:', JSON.stringify(data[0].oplab_score));
  }
  console.log('=== FIM ===');
}