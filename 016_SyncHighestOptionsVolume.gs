/**
 * @fileoverview 016_SyncHighestOptionsVolume.gs - v1.0
 * ═══════════════════════════════════════════════════════════════
 * ENDPOINT: GET /market/statistics/realtime/highest_options_volume
 * ABA: SELECAO_MAIORES_VOLUMES
 * Maiores volumes financeiros negociados em opções por ativo.
 * ═══════════════════════════════════════════════════════════════
 */

const VOL016_SHEET   = 'SELECAO_MAIORES_VOLUMES';
const VOL016_LIMIT   = 100;
const VOL016_HEADERS = [
  'TICKER', 'COMPANY_NAME', 'SECTOR',
  'VOLUME_CALL', 'VOLUME_PUT', 'VOLUME_TOTAL',
  'UPDATED_AT'
];

function SyncHighestOptionsVolume_Menu() {
  _menuBridge('Maiores Volumes em Opções', orquestrarSyncHighestVolume);
}

function orquestrarSyncHighestVolume() {
  const tInicio = Date.now();
  SysLogger.log('HighestVolume', 'START',
    '>>> INICIANDO SYNC MAIORES VOLUMES EM OPÇÕES <<<',
    JSON.stringify({ aba: VOL016_SHEET, limit: VOL016_LIMIT, timestamp: new Date().toISOString() })
  );

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _garantirAba016(ss);
  SysLogger.log('HighestVolume', 'INFO', `Aba "${VOL016_SHEET}" pronta (${VOL016_HEADERS.length} colunas).`);

  try {
    SysLogger.log('HighestVolume', 'INFO',
      `API call: GET /market/statistics/realtime/highest_options_volume?limit=${VOL016_LIMIT}`
    );

    const url  = `${OplabService._baseUrl}/market/statistics/realtime/highest_options_volume?limit=${VOL016_LIMIT}`;
    const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });

    if (!data || !Array.isArray(data)) throw new Error('Resposta nula ou inválida da API.');

    SysLogger.log('HighestVolume', 'INFO', `${data.length} ativos retornados pela API.`);

    const now  = new Date();
    const linhas = data.map(item => [
      Sanitizador.textoPuro(item.symbol),          // TICKER
      item.name      || '',                         // COMPANY_NAME
      item.sector    || '',                         // SECTOR
      Sanitizador.numeroPuro(item.call),            // VOLUME_CALL
      Sanitizador.numeroPuro(item.put),             // VOLUME_PUT
      Sanitizador.numeroPuro(item.total),           // VOLUME_TOTAL
      now                                           // UPDATED_AT (local — API não retorna)
    ]);

    const tGravacao = Date.now();
    _limparAba016(sheet);
    if (linhas.length > 0) {
      sheet.getRange(2, 1, linhas.length, VOL016_HEADERS.length).setValues(linhas);
    }
    SpreadsheetApp.flush();

    const tFim         = Date.now();
    const duracaoApi   = ((tGravacao - tInicio) / 1000).toFixed(2);
    const duracaoGs    = ((tFim - tGravacao) / 1000).toFixed(2);
    const duracaoTotal = ((tFim - tInicio) / 1000).toFixed(1);

    SysLogger.log('HighestVolume', 'FINISH',
      `>>> SYNC CONCLUÍDO: ${linhas.length} ativos | API: ${duracaoApi}s | GS: ${duracaoGs}s | Total: ${duracaoTotal}s <<<`,
      JSON.stringify({ total_ativos: linhas.length, duracao_api_s: duracaoApi, duracao_gs_s: duracaoGs })
    );

  } catch (e) {
    SysLogger.log('HighestVolume', 'ERRO', 'Falha na coleta.', String(e.message));
  }

  SysLogger.flush();
}

function _garantirAba016(ss) {
  let sheet = ss.getSheetByName(VOL016_SHEET);
  if (!sheet) { sheet = ss.insertSheet(VOL016_SHEET); }
  sheet.getRange(1, 1, 1, VOL016_HEADERS.length).setValues([VOL016_HEADERS]);
  return sheet;
}
function _limparAba016(sheet) {
  const lr = sheet.getLastRow();
  if (lr > 1) sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).clearContent();
}

function testHighestOptionsVolume() {
  console.log('=== HOMOLOGAÇÃO 016_SyncHighestOptionsVolume ===');
  const url  = `${OplabService._baseUrl}/market/statistics/realtime/highest_options_volume?limit=5`;
  const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
  console.log(`Itens: ${data ? data.length : 'null'}`);
  if (data && data[0]) console.log('Primeiro:', JSON.stringify(data[0]));
  console.log('=== FIM ===');
}