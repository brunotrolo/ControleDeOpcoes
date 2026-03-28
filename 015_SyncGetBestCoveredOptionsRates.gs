/**
 * @fileoverview 015_SyncBestCoveredOptionsRates.gs - v1.0
 * ═══════════════════════════════════════════════════════════════
 * RESPONSABILIDADE: Buscar as melhores taxas de lucro em PUT e CALL
 *   e gravar na aba SELECAO_OPCOES_MAIORES_LUCROS (uma linha por opção).
 *
 * ENDPOINT:
 *   GET /market/statistics/realtime/best_covered_options_rates/{type}
 *   https://apidocs.oplab.com.br/#tag/Rankings/operation/GetBestCoveredOptionsRates
 *
 * PARÂMETROS:
 *   type  (obrigatório) → 'PUT' | 'CALL'
 *   limit (opcional)    → máx. itens retornados (padrão: 100)
 *
 * REGRA DE NEGÓCIO:
 *   - PUT  → opções OTM (ativo acima do strike) — relevante para vendedor de PUT
 *   - CALL → opções ITM — complementar ao portfólio Wheel
 *   - Executa PUT primeiro, depois CALL, grava tudo na mesma aba
 *   - Coluna CATEGORY distingue os dois grupos
 *
 * COLUNAS DA ABA (17):
 *   OPTION_TICKER | EXPIRY | VOLUME_FIN | PROFIT_RATE_IF_EXERCISED |
 *   CATEGORY | TICKER | UPDATED_AT | VE_OVER_STRIKE | DTE_CALENDAR |
 *   STRIKE | SPOT_STRIKE_RATIO | COMPANY_NAME | SECTOR |
 *   SPOT | IV_RANK | IV_CURRENT | M9M21_TREND
 *
 * INTEGRAÇÃO COM A INFRAESTRUTURA:
 *   000 → OplabService._getHeaders() + ApiClient._fetchData()
 *   001 → SYS_CONFIG.SHEETS.BEST_RATES
 *   003 → Sanitizador.numeroPuro() / textoPuro() / dataPura()
 *   004 → SysLogger.log() / SysLogger.flush()
 *   005 → _menuBridge()
 *
 * PATCH NECESSÁRIO EM 001_CoreServiceConfig.gs (se ainda não feito):
 *   BEST_RATES: "SELECAO_OPCOES_MAIORES_LUCROS"
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Configuração ─────────────────────────────────────────────────────────────
const BEST_RATES_CONFIG = {
  SHEET_NAME: 'SELECAO_OPCOES_MAIORES_LUCROS',
  LIMIT:      100,   // máx. itens por tipo (PUT + CALL = até 200 linhas)
};

// ─── Cabecalho exato da aba (17 colunas) ────────────────────────────────────
// As 4 ultimas (SPOT, IV_RANK, IV_CURRENT, M9M21_TREND) sao calculadas/buscadas
// dentro do proprio orquestrador, nao vem direto da API best_covered_options_rates.
const BEST_RATES_HEADERS = [
  'OPTION_TICKER',            // symbol
  'EXPIRY',                   // due_date
  'VOLUME_FIN',               // financial_volume
  'PROFIT_RATE_IF_EXERCISED', // profit_rate_if_excercised (typo da API mantido)
  'CATEGORY',                 // type: CALL | PUT
  'TICKER',                   // underlying
  'UPDATED_AT',               // updated_at
  'VE_OVER_STRIKE',           // ve_over_strike
  'DTE_CALENDAR',             // days_to_maturity
  'STRIKE',                   // strike
  'SPOT_STRIKE_RATIO',        // calculado: SPOT / STRIKE (campo da API vem sempre 0)
  'COMPANY_NAME',             // name
  'SECTOR',                   // sector
  'SPOT',                     // spot_price do ativo (via /market/stocks/{symbol})
  'IV_RANK',                  // iv_1y_rank do ativo  (via /market/stocks/{symbol})
  'IV_CURRENT',               // iv_current do ativo  (via /market/stocks/{symbol})
  'M9M21_TREND',              // tendencia MM9/MM21 (-1, 0, 1)
];

// ─── Ponto de entrada (padrão _menuBridge de 005) ─────────────────────────────
function SyncBestCoveredOptionsRates_Menu() {
  _menuBridge('Best Covered Options Rates', orquestrarSyncBestRates);
}

// ─── Orquestrador ─────────────────────────────────────────────────────────────
function orquestrarSyncBestRates() {
  var tInicio = Date.now();

  SysLogger.log('BestRates', 'START',
    '>>> INICIANDO SYNC MELHORES TAXAS DE LUCRO (OPLab) <<<',
    JSON.stringify({
      aba_destino:    BEST_RATES_CONFIG.SHEET_NAME,
      limit_por_tipo: BEST_RATES_CONFIG.LIMIT,
      timestamp:      new Date().toISOString()
    })
  );

  // ── 1. Garante aba com cabecalho ──────────────────────────────────────────
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = _garantirAbaBestRates(ss);
  SysLogger.log('BestRates', 'INFO',
    'Aba destino pronta: "' + BEST_RATES_CONFIG.SHEET_NAME + '" (' + BEST_RATES_HEADERS.length + ' colunas).'
  );

  // ── 2. Limpa dados anteriores (snapshot em tempo real) ────────────────────
  _limparDadosBestRates(sheet);
  var proximaLinha = 2;
  var erros        = [];
  var resumo       = [];
  var todasLinhas  = [];  // acumula PUT + CALL antes de enriquecer

  // ── 3. Busca PUT e CALL — acumula sem gravar ainda ────────────────────────
  ['PUT', 'CALL'].forEach(function(tipo) {
    var tTipo = Date.now();
    SysLogger.log('BestRates', 'INFO',
      'Buscando melhores taxas: ' + tipo + ' (limit=' + BEST_RATES_CONFIG.LIMIT + ')...'
    );

    try {
      var linhas = _buscarRatesPorTipo(tipo);
      todasLinhas = todasLinhas.concat(linhas);

      var info = {
        tipo:            tipo,
        opcoes:          linhas.length,
        duracao_api_s:   ((Date.now() - tTipo) / 1000).toFixed(2)
      };
      resumo.push(info);
      SysLogger.log('BestRates', 'INFO',
        tipo + ': ' + linhas.length + ' opcoes coletadas da API (' + info.duracao_api_s + 's).'
      );

    } catch (e) {
      erros.push({ tipo: tipo, erro: e.message });
      SysLogger.log('BestRates', 'ERRO', 'Falha ao coletar ' + tipo + ': ' + e.message);
    }
  });

  // ── 4. Enriquecimento: SPOT, IV_RANK, IV_CURRENT, M9M21_TREND ─────────────
  // Executa UMA vez para todos os tickers unicos (PUT + CALL) via fetchAll paralelo.
  // Resolve o bug do campo spot_strike_ratio = 0 que a API retorna.
  var tEnrich = Date.now();
  var mapaAtivos = _buscarMapaAtivosParalelo(todasLinhas);
  var mapaM9M21  = _lerMapaM9M21Local(ss);
  SysLogger.log('BestRates', 'INFO',
    'Enriquecimento: ' + Object.keys(mapaAtivos).length + ' tickers via API (' +
    ((Date.now() - tEnrich) / 1000).toFixed(2) + 's) | M9M21: ' +
    Object.keys(mapaM9M21).length + ' tickers da planilha.'
  );

  // ── 5. Injeta os 4 campos enriquecidos em cada linha ──────────────────────
  // Indices (0-based) no array de linha:
  //   [5]  TICKER          [9]  STRIKE   [10] SPOT_STRIKE_RATIO
  //   [13] SPOT            [14] IV_RANK  [15] IV_CURRENT  [16] M9M21_TREND
  var COL_TICKER = 5;
  var COL_STRIKE = 9;
  var COL_SSR    = 10;
  var COL_SPOT   = 13;
  var COL_IVRANK = 14;
  var COL_IVCUR  = 15;
  var COL_M9     = 16;

  todasLinhas.forEach(function(linha) {
    var ticker = String(linha[COL_TICKER] || '').trim().toUpperCase();
    var strike = parseFloat(linha[COL_STRIKE] || 0);
    var atv    = mapaAtivos[ticker] || {};
    var spot   = atv.spot      || 0;
    var ivRank = atv.iv_rank   !== undefined ? atv.iv_rank   : '';
    var ivCur  = atv.iv_current !== undefined ? atv.iv_current : '';
    var m9     = mapaM9M21[ticker] !== undefined ? mapaM9M21[ticker] : '';

    linha[COL_SSR]    = (spot > 0 && strike > 0) ? parseFloat((spot / strike).toFixed(4)) : 0;
    linha[COL_SPOT]   = spot;
    linha[COL_IVRANK] = ivRank;
    linha[COL_IVCUR]  = ivCur;
    linha[COL_M9]     = m9;
  });

  // ── 6. Grava tudo de uma vez (1 chamada ao Sheets) ────────────────────────
  if (todasLinhas.length > 0) {
    var tGs = Date.now();
    sheet
      .getRange(proximaLinha, 1, todasLinhas.length, BEST_RATES_HEADERS.length)
      .setValues(todasLinhas);
    SysLogger.log('BestRates', 'INFO',
      todasLinhas.length + ' linhas gravadas no Sheets (' +
      ((Date.now() - tGs) / 1000).toFixed(2) + 's).'
    );
  }

  // ── 7. Flush e encerramento ───────────────────────────────────────────────
  SpreadsheetApp.flush();

  var duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  SysLogger.log('BestRates', 'FINISH',
    '>>> SYNC CONCLUIDO: ' + todasLinhas.length + ' opcoes | ' +
    resumo.filter(function(r) { return r.opcoes > 0; }).length + ' tipos OK | ' +
    erros.length + ' erros | ' + duracaoTotal + 's <<<',
    JSON.stringify({
      total_opcoes:    todasLinhas.length,
      duracao_total_s: duracaoTotal,
      resumo_por_tipo: resumo,
      erros:           erros.length > 0 ? erros : null
    })
  );
  SysLogger.flush();
}

// ─── Busca e mapeia as opcoes de um tipo (PUT ou CALL) ────────────────────────
// Retorna array de 17 colunas: as 13 originais + 4 placeholders (preenchidos no orquestrador).
function _buscarRatesPorTipo(tipo) {
  var url  = OplabService._baseUrl + '/market/statistics/realtime/best_covered_options_rates/' +
             tipo + '?limit=' + BEST_RATES_CONFIG.LIMIT;
  var data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });

  if (!data)              throw new Error('Resposta nula da API.');
  if (!Array.isArray(data)) throw new Error('Resposta inesperada: ' + typeof data);

  SysLogger.log('BestRates', 'INFO', tipo + ': ' + data.length + ' itens retornados pela API.');

  return data.map(function(item) {
    return [
      Sanitizador.textoPuro(item.symbol),                         // [0]  OPTION_TICKER
      item.due_date ? Sanitizador.dataSoData(item.due_date) : '', // [1]  EXPIRY
      Sanitizador.numeroPuro(item.financial_volume),              // [2]  VOLUME_FIN
      Sanitizador.numeroPuro(item.profit_rate_if_excercised),     // [3]  PROFIT_RATE_IF_EXERCISED
      Sanitizador.textoPuro(item.type),                           // [4]  CATEGORY
      Sanitizador.textoPuro(item.underlying),                     // [5]  TICKER
      item.updated_at ? Sanitizador.dataPura(item.updated_at) : '',// [6]  UPDATED_AT
      Sanitizador.numeroPuro(item.ve_over_strike),                // [7]  VE_OVER_STRIKE
      Sanitizador.numeroPuro(item.days_to_maturity),              // [8]  DTE_CALENDAR
      Sanitizador.numeroPuro(item.strike),                        // [9]  STRIKE
      0,                                                          // [10] SPOT_STRIKE_RATIO (calculado no passo 5)
      item.name   || '',                                          // [11] COMPANY_NAME
      item.sector || '',                                          // [12] SECTOR
      0,                                                          // [13] SPOT        (enriquecido no passo 5)
      '',                                                         // [14] IV_RANK     (enriquecido no passo 5)
      '',                                                         // [15] IV_CURRENT  (enriquecido no passo 5)
      '',                                                         // [16] M9M21_TREND (enriquecido no passo 5)
    ];
  });
}

// ─── Utilitarios ──────────────────────────────────────────────────────────────

/**
 * Busca spot_price, iv_1y_rank e iv_current para todos os tickers unicos
 * presentes em todasLinhas, em paralelo via UrlFetchApp.fetchAll.
 * Resolve o bug: o endpoint best_covered_options_rates retorna spot_strike_ratio=0.
 *
 * @param  {Array} todasLinhas - Array de linhas (cada uma tem TICKER no indice 5)
 * @returns {Object} mapa { 'PETR4': { spot, iv_rank, iv_current }, ... }
 */
function _buscarMapaAtivosParalelo(todasLinhas) {
  var mapa = {};
  if (!todasLinhas || todasLinhas.length === 0) return mapa;

  // Coleta tickers unicos (coluna 5 = TICKER)
  var vistos = {};
  var tickers = [];
  todasLinhas.forEach(function(linha) {
    var tk = String(linha[5] || '').trim().toUpperCase();
    if (tk && !vistos[tk]) { vistos[tk] = true; tickers.push(tk); }
  });

  if (tickers.length === 0) return mapa;

  var token = PropertiesService.getScriptProperties().getProperty('OPLAB_ACCESS_TOKEN');
  if (!token) {
    SysLogger.log('BestRates', 'AVISO', 'OPLAB_ACCESS_TOKEN nao configurado — enriquecimento ignorado.');
    return mapa;
  }

  var baseUrl = OplabService._baseUrl + '/market/stocks/';
  var hdrs    = { 'Access-Token': token, 'Accept': 'application/json' };

  var requests = tickers.map(function(tk) {
    return { url: baseUrl + encodeURIComponent(tk), headers: hdrs, muteHttpExceptions: true };
  });

  var respostas;
  try {
    respostas = UrlFetchApp.fetchAll(requests);
  } catch (e) {
    SysLogger.log('BestRates', 'ERRO', 'fetchAll ativos falhou: ' + e.message);
    return mapa;
  }

  var ok = 0;
  for (var i = 0; i < respostas.length; i++) {
    var ticker = tickers[i];
    try {
      if (respostas[i].getResponseCode() !== 200) continue;
      var dados = JSON.parse(respostas[i].getContentText());
      mapa[ticker] = {
        spot:       parseFloat(dados.spot_price  || dados.close || 0),
        iv_rank:    parseFloat(dados.iv_1y_rank  || 0),
        iv_current: parseFloat(dados.iv_current  || 0)
      };
      ok++;
    } catch (e) {
      SysLogger.log('BestRates', 'AVISO', 'Parse falhou para ' + ticker + ': ' + e.message);
    }
  }

  SysLogger.log('BestRates', 'INFO',
    'fetchAll ativos: ' + ok + '/' + tickers.length + ' tickers enriquecidos.'
  );
  return mapa;
}

/**
 * Le o mapa de tendencia M9M21 diretamente da aba RANKING_TENDENCIA_M9M21
 * que ja existe na planilha (sincronizada pelo modulo 019).
 * Evita chamada de API adicional.
 *
 * @param  {Spreadsheet} ss
 * @returns {Object} mapa { 'PETR4': 1, 'MGLU3': -1, 'VALE3': 0, ... }
 */
function _lerMapaM9M21Local(ss) {
  var mapa  = {};
  var sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.RANK_M9M21);
  if (!sheet) return mapa;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return mapa;

  // Cabecalho: TICKER(1) SHORT_NAME(2) COMPANY_NAME(3) SECTOR(4) CNPJ(5)
  //            M9M21_VALUE(6) M9M21_TREND(7) M9M21_ATTR_NAME(8) UPDATED_AT(9)
  var dados = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  dados.forEach(function(row) {
    var ticker = String(row[0] || '').trim().toUpperCase();
    var trend  = row[6];
    if (ticker) {
      mapa[ticker] = (trend !== '' && trend !== null && trend !== undefined)
        ? parseFloat(trend) : 0;
    }
  });

  return mapa;
}

function _garantirAbaBestRates(ss) {
  var nome  = BEST_RATES_CONFIG.SHEET_NAME;
  var sheet = ss.getSheetByName(nome);

  if (!sheet) {
    sheet = ss.insertSheet(nome);
    SysLogger.log('BestRates', 'INFO', 'Aba "' + nome + '" criada automaticamente.');
  }

  // Atualiza cabeçalho sempre (garante consistência mesmo após mudanças)
  sheet
    .getRange(1, 1, 1, BEST_RATES_HEADERS.length)
    .setValues([BEST_RATES_HEADERS]);

  return sheet;
}

function _limparDadosBestRates(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet
      .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
      .clearContent();
  }
}

// ─── Teste de homologação ─────────────────────────────────────────────────────
function testBestCoveredOptionsRates() {
  console.log('=== HOMOLOGAÇÃO 015_SyncBestCoveredOptionsRates v1.0 ===');

  ['PUT', 'CALL'].forEach(function(tipo) {
    console.log('\nTestando tipo: ' + tipo);
    var linhas = _buscarRatesPorTipo(tipo);
    console.log('  Itens retornados: ' + linhas.length);
    console.log('  Colunas por linha: ' + (linhas[0] ? linhas[0].length : 0) + ' (esperado: ' + BEST_RATES_HEADERS.length + ')  [13 API + 4 enriquecimento]');

    if (linhas.length > 0) {
      var primeira = {};
      BEST_RATES_HEADERS.forEach(function(h, i) { primeira[h] = linhas[0][i]; });
      console.log('  Primeiro item mapeado:');
      console.log(JSON.stringify(primeira, null, 2));
    }
  });

  SysLogger.flush();
  console.log('\n=== FIM ===');
}