/**
 * @fileoverview 020_SyncHistoricalOptions.gs - v1.0
 * ═══════════════════════════════════════════════════════════════
 * ENDPOINT: GET /market/historical/options/{spot}/{from}/{to}
 * ABA: HISTORICO_OPCOES
 * Histórico de gregas e prêmios por ativo e período.
 *
 * CONFIGURAÇÃO DINÂMICA (Config_Global):
 *   Historico_Opcoes_Dias = 30  → janela de dias retroativos
 *
 * FONTE DOS TICKERS: DataExtractorService.extractTodosAtivos()
 *   (mesma fonte do motor 014)
 *
 * NOTA: campo 'spot' é objeto {price, symbol} — achatado em SPOT + TICKER.
 * ═══════════════════════════════════════════════════════════════
 */

const HIST020_SHEET   = 'HISTORICO_OPCOES';
const HIST020_HEADERS = [
  'TICKER', 'SPOT',
  'OPTION_TICKER', 'CATEGORY', 'EXPIRY', 'DTE_CALENDAR',
  'STRIKE', 'OPTION_CLOSE', 'MATURITY_TYPE', 'MONEYNESS',
  'DELTA', 'GAMMA', 'VEGA', 'THETA', 'RHO',
  'IV_CALC', 'POE', 'BS_PRICE',
  'UPDATED_AT'
];

function SyncHistoricalOptions_Menu() {
  _menuBridge('Histórico de Opções', orquestrarSyncHistoricalOptions);
}

function orquestrarSyncHistoricalOptions() {
  const tInicio = Date.now();

  // ── Lê janela de datas da Config_Global ───────────────────────────────────
  const cfg  = ConfigManager.get();
  const dias = parseInt(cfg['Historico_Opcoes_Dias'] || 30, 10);

  const hoje  = new Date();
  const from  = new Date(hoje); from.setDate(from.getDate() - dias);
  const fmtData = (d) => d.toISOString().split('T')[0]; // yyyy-mm-dd
  const fromStr = fmtData(from);
  const toStr   = fmtData(hoje);

  SysLogger.log('HistoricalOptions', 'START',
    '>>> INICIANDO SYNC HISTÓRICO DE OPÇÕES <<<',
    JSON.stringify({
      aba: HIST020_SHEET, dias,
      from: fromStr, to: toStr,
      timestamp: new Date().toISOString()
    })
  );

  // ── Tickers de DADOS_ATIVOS ───────────────────────────────────────────────
  const tickers = DataExtractorService.extractTodosAtivos();
  if (!tickers || tickers.length === 0) {
    SysLogger.log('HistoricalOptions', 'AVISO', 'Nenhum ticker em DADOS_ATIVOS.');
    return;
  }

  SysLogger.log('HistoricalOptions', 'INFO',
    `${tickers.length} ticker(s) | janela: ${fromStr} → ${toStr} (${dias} dias).`,
    JSON.stringify({ tickers })
  );

  // ── Aba destino ───────────────────────────────────────────────────────────
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _garantirAba020(ss);
  _limparAba020(sheet);
  let proximaLinha = 2;

  const erros  = [];
  const resumo = [];

  tickers.forEach((ticker, idx) => {
    const tTicker = Date.now();
    SysLogger.log('HistoricalOptions', 'INFO',
      `[${idx + 1}/${tickers.length}] Buscando histórico: ${ticker} | ${fromStr} → ${toStr}`
    );

    try {
      const url  = `${OplabService._baseUrl}/market/historical/options/${encodeURIComponent(ticker)}/${fromStr}/${toStr}`;
      SysLogger.log('HistoricalOptions', 'INFO',
        `API call: GET /market/historical/options/${ticker}/${fromStr}/${toStr}`
      );

      const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
      if (!data || !Array.isArray(data)) throw new Error('Resposta nula ou inválida.');

      SysLogger.log('HistoricalOptions', 'INFO',
        `${ticker}: ${data.length} registros retornados.`
      );

      const linhas = data.map(item => {
        const spot = item.spot || {};
        return [
          Sanitizador.textoPuro(spot.symbol || ticker),     // TICKER
          Sanitizador.numeroPuro(spot.price),               // SPOT
          Sanitizador.textoPuro(item.symbol),               // OPTION_TICKER
          Sanitizador.textoPuro(item.type),                 // CATEGORY
          item.due_date ? Sanitizador.dataSoData(item.due_date) : '', // EXPIRY
          Sanitizador.numeroPuro(item.days_to_maturity),    // DTE_CALENDAR
          Sanitizador.numeroPuro(item.strike),              // STRIKE
          Sanitizador.numeroPuro(item.premium),             // OPTION_CLOSE
          Sanitizador.textoPuro(item.maturity_type),        // MATURITY_TYPE
          Sanitizador.textoPuro(item.moneyness),            // MONEYNESS
          Sanitizador.numeroPuro(item.delta),               // DELTA
          Sanitizador.numeroPuro(item.gamma),               // GAMMA
          Sanitizador.numeroPuro(item.vega),                // VEGA
          Sanitizador.numeroPuro(item.theta),               // THETA
          Sanitizador.numeroPuro(item.rho),                 // RHO
          Sanitizador.numeroPuro(item.volatility),          // IV_CALC
          Sanitizador.numeroPuro(item.poe),                 // POE
          Sanitizador.numeroPuro(item.bs),                  // BS_PRICE
          item.time ? Sanitizador.dataPura(item.time) : ''  // UPDATED_AT
        ];
      });

      const tGravacao = Date.now();
      if (linhas.length > 0) {
        sheet.getRange(proximaLinha, 1, linhas.length, HIST020_HEADERS.length).setValues(linhas);
        proximaLinha += linhas.length;
      }
      const tFim = Date.now();

      const info = {
        ticker, registros: linhas.length,
        duracao_api_s:   ((tGravacao - tTicker) / 1000).toFixed(2),
        duracao_gs_s:    ((tFim - tGravacao) / 1000).toFixed(2),
        duracao_total_s: ((tFim - tTicker) / 1000).toFixed(2)
      };
      resumo.push({ ticker, registros: linhas.length, duracao_s: info.duracao_total_s });

      SysLogger.log('HistoricalOptions', 'SUCESSO',
        `[${idx + 1}/${tickers.length}] ${ticker}: ${linhas.length} registros gravados. API: ${info.duracao_api_s}s | GS: ${info.duracao_gs_s}s`,
        JSON.stringify(info)
      );

    } catch (e) {
      erros.push({ ticker, erro: e.message });
      SysLogger.log('HistoricalOptions', 'ERRO',
        `[${idx + 1}/${tickers.length}] ${ticker}: falha na coleta.`,
        String(e.message)
      );
    }
  });

  SpreadsheetApp.flush();

  const duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  const totalRegistros = proximaLinha - 2;

  SysLogger.log('HistoricalOptions', 'FINISH',
    `>>> SYNC CONCLUÍDO: ${totalRegistros} registros | ${tickers.length} tickers | ${erros.length} erros | ${duracaoTotal}s <<<`,
    JSON.stringify({
      total_registros:   totalRegistros,
      tickers_ok:        resumo.length,
      tickers_erro:      erros.length,
      janela_dias:       dias,
      duracao_total_s:   duracaoTotal,
      resumo_por_ticker: resumo,
      erros:             erros.length > 0 ? erros : null
    })
  );
  SysLogger.flush();
}

function _garantirAba020(ss) {
  let sheet = ss.getSheetByName(HIST020_SHEET);
  if (!sheet) { sheet = ss.insertSheet(HIST020_SHEET); }
  sheet.getRange(1, 1, 1, HIST020_HEADERS.length).setValues([HIST020_HEADERS]);
  return sheet;
}
function _limparAba020(sheet) {
  const lr = sheet.getLastRow();
  if (lr > 1) sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).clearContent();
}

function testHistoricalOptions() {
  console.log('=== HOMOLOGAÇÃO 020_SyncHistoricalOptions ===');
  const tickers = DataExtractorService.extractTodosAtivos();
  console.log(`Tickers disponíveis: ${tickers.join(', ')}`);

  const cfg  = ConfigManager.get();
  const dias = parseInt(cfg['Historico_Opcoes_Dias'] || 30, 10);
  const hoje  = new Date();
  const from  = new Date(hoje); from.setDate(from.getDate() - dias);
  const fmtData = (d) => d.toISOString().split('T')[0];

  if (tickers.length === 0) { console.log('Nenhum ticker.'); return; }

  const ticker = tickers[0];
  const fromStr = fmtData(from);
  const toStr   = fmtData(hoje);
  console.log(`Testando: ${ticker} | ${fromStr} → ${toStr} (${dias} dias)`);

  const url  = `${OplabService._baseUrl}/market/historical/options/${ticker}/${fromStr}/${toStr}`;
  const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
  console.log(`Registros: ${data ? data.length : 'null'}`);
  if (data && data[0]) {
    console.log('Primeiro (raw):', JSON.stringify(data[0]));
    console.log('spot field:', JSON.stringify(data[0].spot));
  }
  SysLogger.flush();
  console.log('=== FIM ===');
}