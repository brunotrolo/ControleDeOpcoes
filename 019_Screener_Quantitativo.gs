/**
 * @fileoverview 019_Screener_Quantitativo.gs - v4.0
 * ═══════════════════════════════════════════════════════════════
 * FUNIL QUANTITATIVO — Trava de Alta com PUT  (Arquitetura Gemini)
 *
 * ESTEIRA DE PRODUÇÃO (5 portas):
 *
 *  PORTA 1 — LIQUIDEZ     (SELECAO_MAIORES_VOLUMES)
 *    Top N ativos por volume financeiro de PUT.
 *    Garante que você conseguirá sair da operação.
 *
 *  PORTA 2 — TENDÊNCIA    (RANKING_TENDENCIA_M9M21)
 *    Mantém apenas ativos com M9M21_TREND = 1 (alta).
 *    Garante que você não operará contra a maré.
 *
 *  PORTA 3 — CORRELAÇÃO   (RANKING_CORREL_IBOV)
 *    Se dois ativos do mesmo setor tiverem CORREL_VALUE > limiar,
 *    mantém apenas o de maior volume de PUT.
 *    Protege contra queda sistêmica e concentração setorial.
 *
 *  PORTA 4 — PRÊMIO       (SELECAO_OPCOES_MAIORES_LUCROS)
 *    Extrai PUTs apenas dos ativos que passaram em tudo.
 *    Aplica filtros de DTE, distância OTM, liquidez e IV Rank.
 *
 *  PORTA 5 — SCORE        (cálculo interno)
 *    Normalização min-max em 5 dimensões → top 15 diversificados.
 *
 * CONFIGURAÇÃO DINÂMICA:
 *   Todos os parâmetros lidos da aba CONFIG_GLOBAL (prefixo SCREENER_).
 *   Valores em SCREENER_CONFIG = defaults quando a chave não existe.
 *
 * CHAVES ESPERADAS NA ABA CONFIG_GLOBAL (coluna A | coluna B):
 *   SCREENER_TOP_VOLUME        |  20    Top N ativos por vol. PUT
 *   SCREENER_MAX_RESULTADOS    |  15    Linhas no resultado final
 *   SCREENER_MAX_POR_ATIVO     |   2    Máx. PUTs do mesmo ativo
 *   SCREENER_DTE_MIN           |  15    DTE mínimo (dias)
 *   SCREENER_DTE_MAX           |  45    DTE máximo (dias)
 *   SCREENER_PROFIT_MIN        |   1    Lucro mínimo (%)
 *   SCREENER_SSR_MIN           |1.02    Distância mínima OTM (1.04=4%)
 *   SCREENER_SSR_MAX           |1.30    Distância máxima OTM
 *   SCREENER_VOL_FIN_MIN       |25000   Volume financeiro mín. da opção
 *   SCREENER_IV_RANK_MIN       |   5    IV Rank mínimo
 *   SCREENER_CORREL_MAX        |0.70    Limiar correlação p/ dedup setorial
 *   SCREENER_PESO_PROFIT       |  35    Peso score: profit rate
 *   SCREENER_PESO_IV_RANK      |  25    Peso score: IV Rank
 *   SCREENER_PESO_VE_STRIKE    |  20    Peso score: valor extrínseco/strike
 *   SCREENER_PESO_M9_TREND     |  10    Peso score: intensidade M9M21
 *   SCREENER_PESO_LIQUIDEZ     |  10    Peso score: liquidez do ativo
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Defaults (fallback quando a chave não existe no CONFIG_GLOBAL) ───────────
const SCREENER_CONFIG = {
  TOP_VOLUME:     20,
  MAX_RESULTADOS: 15,
  MAX_POR_ATIVO:  2,
  DTE_MIN:        15,
  DTE_MAX:        45,
  PROFIT_MIN:     1.0,
  SSR_MIN:        1.02,
  SSR_MAX:        1.30,
  VOL_FIN_MIN:    25000,
  IV_RANK_MIN:    5,
  CORREL_MAX:     0.70,
  PESO_PROFIT:    35,
  PESO_IV_RANK:   25,
  PESO_VE_STRIKE: 20,
  PESO_M9_TREND:  10,
  PESO_LIQUIDEZ:  10,
  TAG_IV_RANK_ALTO:    60,
  TAG_M9_FORTE:        1.03,
  TAG_DTE_IDEAL_MIN:   25,
  TAG_DTE_IDEAL_MAX:   45,
  TAG_OTM_PROXIMA_MAX: 1.08
};

const SCREENER_HEADERS = [
  'RANK', 'SCORE',
  'OPTION_TICKER', 'TICKER', 'EMPRESA', 'SETOR',
  'VENCIMENTO', 'DTE', 'SPOT', 'STRIKE', 'DIST_SPOT_PCT',
  'PROFIT_RATE', 'VE_OVER_STRIKE',
  'IV_RANK', 'IV_CURRENT',
  'M9M21_TREND', 'M9M21_VALUE',
  'VOL_PUT_ATIVO', 'VOL_FIN_OPCAO',
  'OBSERVACAO', 'ATUALIZADO_EM'
];

// ─── Leitura dinâmica do CONFIG_GLOBAL ───────────────────────────────────────

function _screener_lerConfig() {
  var cfg = ConfigManager.get();
  function num(key, fallback) {
    var v = cfg[key];
    return (v !== undefined && v !== '' && !isNaN(Number(v))) ? Number(v) : fallback;
  }
  return {
    TOP_VOLUME:          num('SCREENER_TOP_VOLUME',          SCREENER_CONFIG.TOP_VOLUME),
    MAX_RESULTADOS:      num('SCREENER_MAX_RESULTADOS',      SCREENER_CONFIG.MAX_RESULTADOS),
    MAX_POR_ATIVO:       num('SCREENER_MAX_POR_ATIVO',       SCREENER_CONFIG.MAX_POR_ATIVO),
    DTE_MIN:             num('SCREENER_DTE_MIN',             SCREENER_CONFIG.DTE_MIN),
    DTE_MAX:             num('SCREENER_DTE_MAX',             SCREENER_CONFIG.DTE_MAX),
    PROFIT_MIN:          num('SCREENER_PROFIT_MIN',          SCREENER_CONFIG.PROFIT_MIN),
    SSR_MIN:             num('SCREENER_SSR_MIN',             SCREENER_CONFIG.SSR_MIN),
    SSR_MAX:             num('SCREENER_SSR_MAX',             SCREENER_CONFIG.SSR_MAX),
    VOL_FIN_MIN:         num('SCREENER_VOL_FIN_MIN',         SCREENER_CONFIG.VOL_FIN_MIN),
    IV_RANK_MIN:         num('SCREENER_IV_RANK_MIN',         SCREENER_CONFIG.IV_RANK_MIN),
    CORREL_MAX:          num('SCREENER_CORREL_MAX',          SCREENER_CONFIG.CORREL_MAX),
    PESO_PROFIT:         num('SCREENER_PESO_PROFIT',         SCREENER_CONFIG.PESO_PROFIT),
    PESO_IV_RANK:        num('SCREENER_PESO_IV_RANK',        SCREENER_CONFIG.PESO_IV_RANK),
    PESO_VE_STRIKE:      num('SCREENER_PESO_VE_STRIKE',      SCREENER_CONFIG.PESO_VE_STRIKE),
    PESO_M9_TREND:       num('SCREENER_PESO_M9_TREND',       SCREENER_CONFIG.PESO_M9_TREND),
    PESO_LIQUIDEZ:       num('SCREENER_PESO_LIQUIDEZ',       SCREENER_CONFIG.PESO_LIQUIDEZ),
    TAG_IV_RANK_ALTO:    num('SCREENER_TAG_IV_RANK_ALTO',    SCREENER_CONFIG.TAG_IV_RANK_ALTO),
    TAG_M9_FORTE:        num('SCREENER_TAG_M9_FORTE',        SCREENER_CONFIG.TAG_M9_FORTE),
    TAG_DTE_IDEAL_MIN:   num('SCREENER_TAG_DTE_IDEAL_MIN',   SCREENER_CONFIG.TAG_DTE_IDEAL_MIN),
    TAG_DTE_IDEAL_MAX:   num('SCREENER_TAG_DTE_IDEAL_MAX',   SCREENER_CONFIG.TAG_DTE_IDEAL_MAX),
    TAG_OTM_PROXIMA_MAX: num('SCREENER_TAG_OTM_PROXIMA_MAX', SCREENER_CONFIG.TAG_OTM_PROXIMA_MAX),
  };
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────
function ScreenerQuantitativo_Menu() {
  _menuBridge('Screener Quantitativo (Trava de Alta PUT)', orquestrarScreener);
}

// ─── Orquestrador principal ───────────────────────────────────────────────────
function orquestrarScreener() {
  var tInicio = Date.now();
  var C = _screener_lerConfig();

  SysLogger.log('Screener', 'START',
    '>>> INICIANDO SCREENER QUANTITATIVO v4.0 — TRAVA DE ALTA COM PUT <<<',
    JSON.stringify({ aba: SYS_CONFIG.SHEETS.SCREENER_QUANT, config: C, timestamp: new Date().toISOString() })
  );

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── 1. Lê as 4 abas fonte ─────────────────────────────────────────────────
  var mapaVolumes = _screener_lerMaioresVolumes(ss);
  var mapaM9Alta  = _screener_lerM9M21Alta(ss);
  var mapaCorrel  = _screener_lerCorrelIbov(ss);
  var todasPuts   = _screener_lerOpcoesPUT(ss);

  SysLogger.log('Screener', 'INFO',
    'Fontes: ' + Object.keys(mapaVolumes).length + ' ativos (Volume) | ' +
    Object.keys(mapaM9Alta).length + ' ativos (M9=Alta) | ' +
    Object.keys(mapaCorrel).length + ' ativos (CorrelIbov) | ' +
    todasPuts.length + ' PUTs (BestRates)'
  );

  if (Object.keys(mapaVolumes).length === 0 || Object.keys(mapaM9Alta).length === 0 || todasPuts.length === 0) {
    SysLogger.log('Screener', 'AVISO', 'Abas fonte vazias. Execute módulos 015–018 antes do Screener.');
    SysLogger.flush();
    return;
  }

  // ── PORTA 1: Top N por volume de PUT ─────────────────────────────────────
  var topN = Object.keys(mapaVolumes)
    .map(function(tk) { return { ticker: tk, volPut: mapaVolumes[tk].volPut }; })
    .sort(function(a, b) { return b.volPut - a.volPut; })
    .slice(0, C.TOP_VOLUME)
    .map(function(a) { return a.ticker; });

  SysLogger.log('Screener', 'INFO', 'PORTA 1 — Top ' + topN.length + ' por vol. PUT: ' + topN.join(', '));

  // ── PORTA 2: Interseção com M9M21_TREND = 1 ──────────────────────────────
  var aposM9 = topN.filter(function(tk) { return mapaM9Alta[tk] !== undefined; });

  SysLogger.log('Screener', 'INFO',
    'PORTA 2 — M9M21=Alta: ' + aposM9.length + ' sobreviventes: ' + aposM9.join(', ')
  );

  if (aposM9.length === 0) {
    SysLogger.log('Screener', 'AVISO', 'Nenhum ativo com tendência de alta. Mercado em queda generalizada.');
    SysLogger.flush();
    return;
  }

  // ── PORTA 3: Deduplicação por correlação setorial ─────────────────────────
  var aposCorrel = _screener_filtrarCorrelacao(aposM9, mapaVolumes, mapaCorrel, C.CORREL_MAX);

  SysLogger.log('Screener', 'INFO',
    'PORTA 3 — Anti-correlação (limiar=' + C.CORREL_MAX + '): ' +
    aposCorrel.length + ' sobreviventes: ' + aposCorrel.join(', ') +
    ' (' + (aposM9.length - aposCorrel.length) + ' removidos por concentração setorial)'
  );

  if (aposCorrel.length === 0) {
    SysLogger.log('Screener', 'AVISO', 'Todos os ativos eliminados pela porta de correlação.');
    SysLogger.flush();
    return;
  }

  // ── PORTA 4: Filtro de qualidade sobre PUTs dos elegíveis ────────────────
  var setElegivel = {};
  aposCorrel.forEach(function(tk) { setElegivel[tk] = mapaM9Alta[tk]; });

  var candidatas = todasPuts.filter(function(op) {
    if (!setElegivel.hasOwnProperty(op.ticker)) return false;
    if (op.profitRate < C.PROFIT_MIN)           return false;
    if (op.dte        < C.DTE_MIN)              return false;
    if (op.dte        > C.DTE_MAX)              return false;
    if (op.ssr        < C.SSR_MIN)              return false;
    if (op.ssr        > C.SSR_MAX)              return false;
    if (op.volFin     < C.VOL_FIN_MIN)          return false;
    if (op.ivRank     < C.IV_RANK_MIN)          return false;
    return true;
  });

  SysLogger.log('Screener', 'INFO',
    'PORTA 4 — Filtros qualidade: ' + candidatas.length + ' PUTs passaram (de ' + todasPuts.length + ' totais)'
  );

  if (candidatas.length === 0) {
    SysLogger.log('Screener', 'AVISO',
      'Nenhuma PUT passou nos filtros. Ajuste SCREENER_DTE_MAX, SCREENER_SSR_MIN ' +
      'ou SCREENER_VOL_FIN_MIN na aba CONFIG_GLOBAL.'
    );
    SysLogger.flush();
    return;
  }

  // ── PORTA 5: Score e diversificação ──────────────────────────────────────
  candidatas.forEach(function(op) {
    op.m9Value     = setElegivel[op.ticker] || 1;
    op.volPutAtivo = (mapaVolumes[op.ticker] && mapaVolumes[op.ticker].volPut) || 0;
    if (!op.empresa && mapaVolumes[op.ticker]) op.empresa = mapaVolumes[op.ticker].empresa;
    if (!op.setor   && mapaVolumes[op.ticker]) op.setor   = mapaVolumes[op.ticker].setor;
  });

  var maxProfit = Math.max.apply(null, candidatas.map(function(o) { return o.profitRate; }));
  var maxIvRank = Math.max.apply(null, candidatas.map(function(o) { return o.ivRank; }));
  var maxVe     = Math.max.apply(null, candidatas.map(function(o) { return o.veOverStrike; }));
  var maxM9exc  = Math.max.apply(null, candidatas.map(function(o) { return Math.max(o.m9Value - 1, 0); }));
  var maxVolPut = Math.max.apply(null, candidatas.map(function(o) { return o.volPutAtivo; }));

  candidatas.forEach(function(op) {
    var s = 0;
    if (maxProfit > 0) s += (op.profitRate               / maxProfit) * C.PESO_PROFIT;
    if (maxIvRank > 0) s += (op.ivRank                   / maxIvRank) * C.PESO_IV_RANK;
    if (maxVe     > 0) s += (op.veOverStrike              / maxVe)     * C.PESO_VE_STRIKE;
    if (maxM9exc  > 0) s += (Math.max(op.m9Value - 1, 0) / maxM9exc)  * C.PESO_M9_TREND;
    if (maxVolPut > 0) s += (op.volPutAtivo               / maxVolPut) * C.PESO_LIQUIDEZ;
    op.score = parseFloat(s.toFixed(1));
  });

  candidatas.sort(function(a, b) { return b.score - a.score; });

  var contadorAtivo = {};
  var resultado = candidatas.filter(function(op) {
    var count = contadorAtivo[op.ticker] || 0;
    if (count < C.MAX_POR_ATIVO) { contadorAtivo[op.ticker] = count + 1; return true; }
    return false;
  }).slice(0, C.MAX_RESULTADOS);

  resultado.forEach(function(op) {
    var tags = [];
    if (op.ivRank  >= C.TAG_IV_RANK_ALTO)                                 tags.push('IV Alto');
    if (op.m9Value >= C.TAG_M9_FORTE)                                     tags.push('Tendência Forte');
    if (op.dte     >= C.TAG_DTE_IDEAL_MIN && op.dte <= C.TAG_DTE_IDEAL_MAX) tags.push('DTE Ideal');
    if (op.ssr     >= C.SSR_MIN && op.ssr <= C.TAG_OTM_PROXIMA_MAX)      tags.push('OTM Próxima');
    op.observacao = tags.length > 0 ? tags.join(' | ') : '—';
  });

  // ── Grava resultado ───────────────────────────────────────────────────────
  var sheet = _screener_garantirAba(ss);
  var ultimaLinha = sheet.getLastRow();
  if (ultimaLinha > 1) sheet.getRange(2, 1, ultimaLinha - 1, sheet.getLastColumn()).clearContent();

  var now = new Date();
  var linhas = resultado.map(function(op, i) {
    var distPct = parseFloat(((op.ssr - 1) * 100).toFixed(2));
    return [
      i + 1,           op.score,        op.optionTicker, op.ticker,
      op.empresa,      op.setor,        op.expiry,       op.dte,
      op.spot,         op.strike,       distPct,         op.profitRate,
      op.veOverStrike, op.ivRank,       op.ivCurrent,    op.m9Trend,
      op.m9Value,      op.volPutAtivo,  op.volFin,       op.observacao, now
    ];
  });

  if (linhas.length > 0) sheet.getRange(2, 1, linhas.length, SCREENER_HEADERS.length).setValues(linhas);
  SpreadsheetApp.flush();

  var duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  SysLogger.log('Screener', 'FINISH',
    '>>> SCREENER CONCLUÍDO: ' + resultado.length + ' oportunidades em ' + duracaoTotal + 's <<<',
    JSON.stringify({
      puts_totais: todasPuts.length, apos_m9: aposM9.length,
      apos_correl: aposCorrel.length, apos_filtros: candidatas.length,
      resultado_final: resultado.length,
      top3: resultado.slice(0, 3).map(function(o) {
        return o.optionTicker + ' (score=' + o.score + ', profit=' + o.profitRate.toFixed(1) + '%)';
      }),
      duracao_s: duracaoTotal
    })
  );
  SysLogger.flush();
}

// ─── Porta 3: Deduplicação por correlação setorial ───────────────────────────

/**
 * Remove duplicatas setoriais: se dois ativos do mesmo setor tiverem
 * CORREL_VALUE > correlMax, mantém apenas o de maior volume de PUT.
 */
function _screener_filtrarCorrelacao(listaElegivel, mapaVolumes, mapaCorrel, correlMax) {
  var porSetor = {};
  listaElegivel.forEach(function(ticker) {
    var setor = (mapaCorrel[ticker] && mapaCorrel[ticker].setor) ||
                (mapaVolumes[ticker] && mapaVolumes[ticker].setor) ||
                'SEM_SETOR';
    if (!porSetor[setor]) porSetor[setor] = [];
    porSetor[setor].push(ticker);
  });

  var resultado = [];
  Object.keys(porSetor).forEach(function(setor) {
    var grupo = porSetor[setor];
    if (grupo.length <= 1) { resultado = resultado.concat(grupo); return; }

    var altaCorrel = grupo.some(function(tk) {
      return mapaCorrel[tk] && Math.abs(mapaCorrel[tk].correlValue) > correlMax;
    });

    if (!altaCorrel) { resultado = resultado.concat(grupo); return; }

    // Mais de um ativo do mesmo setor com alta correlação → fica só o de maior vol
    grupo.sort(function(a, b) {
      return ((mapaVolumes[b] && mapaVolumes[b].volPut) || 0) -
             ((mapaVolumes[a] && mapaVolumes[a].volPut) || 0);
    });
    resultado.push(grupo[0]);
  });

  return resultado;
}

// ─── Leitura de fontes ────────────────────────────────────────────────────────

function _screener_lerMaioresVolumes(ss) {
  var sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.HIGHEST_VOL);
  if (!sheet || sheet.getLastRow() < 2) return {};
  var colMap = DataUtils.getColMap(sheet);
  if (colMap['TICKER'] === undefined || colMap['VOLUME_PUT'] === undefined) return {};
  var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var mapa  = {};
  dados.forEach(function(row) {
    var ticker = String(row[colMap['TICKER']] || '').trim().toUpperCase();
    var volPut = parseFloat(row[colMap['VOLUME_PUT']]) || 0;
    if (ticker && volPut > 0) {
      mapa[ticker] = {
        volPut:  volPut,
        empresa: String(row[colMap['COMPANY_NAME']] || ''),
        setor:   String(row[colMap['SECTOR']]       || '')
      };
    }
  });
  return mapa;
}

function _screener_lerM9M21Alta(ss) {
  var sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.RANK_M9M21);
  if (!sheet || sheet.getLastRow() < 2) return {};
  var colMap = DataUtils.getColMap(sheet);
  if (colMap['TICKER'] === undefined || colMap['M9M21_TREND'] === undefined) return {};
  var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var mapa  = {};
  dados.forEach(function(row) {
    var ticker = String(row[colMap['TICKER']] || '').trim().toUpperCase();
    var trend  = parseFloat(row[colMap['M9M21_TREND']]) || 0;
    var m9Val  = parseFloat(row[colMap['M9M21_VALUE']]) || 0;
    if (ticker && trend === 1) mapa[ticker] = m9Val;
  });
  return mapa;
}

/**
 * Lê RANKING_CORREL_IBOV → { ticker: { correlValue, setor } }
 */
function _screener_lerCorrelIbov(ss) {
  var sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.RANK_CORREL_IBOV);
  if (!sheet || sheet.getLastRow() < 2) return {};
  var colMap = DataUtils.getColMap(sheet);
  if (colMap['TICKER'] === undefined) return {};
  var dados = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var mapa  = {};
  dados.forEach(function(row) {
    var ticker = String(row[colMap['TICKER']] || '').trim().toUpperCase();
    var correl = parseFloat(row[colMap['CORREL_VALUE']]) || 0;
    var setor  = String(row[colMap['SECTOR']] || '');
    if (ticker) mapa[ticker] = { correlValue: correl, setor: setor };
  });
  return mapa;
}

function _screener_lerOpcoesPUT(ss) {
  var sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.BEST_RATES);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var colMap = DataUtils.getColMap(sheet);
  var campos = ['OPTION_TICKER','TICKER','EXPIRY','DTE_CALENDAR','SPOT','STRIKE',
                'SPOT_STRIKE_RATIO','PROFIT_RATE_IF_EXERCISED','VE_OVER_STRIKE',
                'IV_RANK','IV_CURRENT','M9M21_TREND','VOLUME_FIN','COMPANY_NAME','SECTOR'];
  campos.forEach(function(c) {
    if (colMap[c] === undefined) SysLogger.log('Screener', 'AVISO', 'Coluna ausente em BEST_RATES: ' + c);
  });
  var dados  = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var result = [];
  dados.forEach(function(row) {
    if (String(row[colMap['CATEGORY']] || '').trim().toUpperCase() !== 'PUT') return;
    var spot = parseFloat(row[colMap['SPOT']]) || 0;
    if (spot === 0) return;
    result.push({
      optionTicker: String(row[colMap['OPTION_TICKER']] || '').trim(),
      ticker:       String(row[colMap['TICKER']]        || '').trim().toUpperCase(),
      expiry:       row[colMap['EXPIRY']],
      dte:          parseFloat(row[colMap['DTE_CALENDAR']])             || 0,
      spot:         spot,
      strike:       parseFloat(row[colMap['STRIKE']])                   || 0,
      ssr:          parseFloat(row[colMap['SPOT_STRIKE_RATIO']])        || 0,
      profitRate:   parseFloat(row[colMap['PROFIT_RATE_IF_EXERCISED']]) || 0,
      veOverStrike: parseFloat(row[colMap['VE_OVER_STRIKE']])           || 0,
      ivRank:       parseFloat(row[colMap['IV_RANK']])                  || 0,
      ivCurrent:    parseFloat(row[colMap['IV_CURRENT']])               || 0,
      m9Trend:      parseFloat(row[colMap['M9M21_TREND']])              || 0,
      volFin:       parseFloat(row[colMap['VOLUME_FIN']])               || 0,
      empresa:      String(row[colMap['COMPANY_NAME']] || ''),
      setor:        String(row[colMap['SECTOR']]       || '')
    });
  });
  return result;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function _screener_garantirAba(ss) {
  var nome  = SYS_CONFIG.SHEETS.SCREENER_QUANT;
  var sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
    SysLogger.log('Screener', 'INFO', 'Aba "' + nome + '" criada automaticamente.');
  }
  sheet.getRange(1, 1, 1, SCREENER_HEADERS.length).setValues([SCREENER_HEADERS]);
  return sheet;
}

// ─── Teste de homologação ─────────────────────────────────────────────────────
function testScreenerQuantitativo() {
  console.log('=== HOMOLOGAÇÃO 019_Screener_Quantitativo v4.0 ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var C  = _screener_lerConfig();

  console.log('Config ativa: TOP=' + C.TOP_VOLUME + ' DTE=' + C.DTE_MIN + '-' + C.DTE_MAX +
    ' SSR=' + C.SSR_MIN + '-' + C.SSR_MAX + ' VOL=' + C.VOL_FIN_MIN +
    ' PROFIT>=' + C.PROFIT_MIN + ' CORREL_MAX=' + C.CORREL_MAX);

  var mapaVol   = _screener_lerMaioresVolumes(ss);
  var mapaM9    = _screener_lerM9M21Alta(ss);
  var mapaCorr  = _screener_lerCorrelIbov(ss);
  var puts      = _screener_lerOpcoesPUT(ss);

  console.log('MAIORES_VOLUMES : ' + Object.keys(mapaVol).length + ' ativos');
  console.log('M9M21 em alta   : ' + Object.keys(mapaM9).length  + ' ativos');
  console.log('CorrelIbov      : ' + Object.keys(mapaCorr).length + ' ativos');
  console.log('PUTs BestRates  : ' + puts.length + ' opções');

  var topN = Object.keys(mapaVol)
    .map(function(tk) { return { ticker: tk, volPut: mapaVol[tk].volPut }; })
    .sort(function(a, b) { return b.volPut - a.volPut; })
    .slice(0, C.TOP_VOLUME).map(function(a) { return a.ticker; });

  var aposM9    = topN.filter(function(tk) { return mapaM9[tk] !== undefined; });
  var aposCorr  = _screener_filtrarCorrelacao(aposM9, mapaVol, mapaCorr, C.CORREL_MAX);

  console.log('PORTA 1 (Top' + C.TOP_VOLUME + '): ' + topN.join(', '));
  console.log('PORTA 2 (M9=Alta): ' + aposM9.join(', '));
  console.log('PORTA 3 (Correl<' + C.CORREL_MAX + '): ' + aposCorr.join(', '));

  var candidatas = puts.filter(function(op) {
    return aposCorr.indexOf(op.ticker) !== -1 &&
           op.profitRate >= C.PROFIT_MIN &&
           op.dte >= C.DTE_MIN && op.dte <= C.DTE_MAX &&
           op.ssr >= C.SSR_MIN && op.ssr <= C.SSR_MAX &&
           op.volFin >= C.VOL_FIN_MIN && op.ivRank >= C.IV_RANK_MIN;
  });
  console.log('PORTA 4 (qualidade): ' + candidatas.length + ' PUTs');

  if (candidatas.length > 0) {
    console.log('Melhor candidata: ' + JSON.stringify({
      optionTicker: candidatas[0].optionTicker, ticker: candidatas[0].ticker,
      profitRate: candidatas[0].profitRate, dte: candidatas[0].dte,
      ssr: candidatas[0].ssr, volFin: candidatas[0].volFin
    }));
  }
  console.log('=== FIM ===');
}
