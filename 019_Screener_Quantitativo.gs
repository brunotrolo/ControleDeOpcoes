/**
 * @fileoverview 019_Screener_Quantitativo.gs - v3.0
 * ═══════════════════════════════════════════════════════════════
 * FUNIL QUANTITATIVO — Trava de Alta com PUT
 *
 * OBJETIVO: Identificar automaticamente as melhores PUTs para
 *   montar uma Trava de Alta (Bull PUT Spread) no mercado brasileiro.
 *
 * LÓGICA DO FUNIL (3 etapas):
 *   1. Top ativos por Volume de PUT  ← SELECAO_MAIORES_VOLUMES (016)
 *   2. ∩ Ativos em Tendência de Alta ← RANKING_TENDENCIA_M9M21  (017)
 *   3. Melhor PUT desse grupo         ← SELECAO_OPCOES_MAIORES_LUCROS (015)
 *
 * CONFIGURAÇÃO DINÂMICA (v3.0):
 *   Parâmetros lidos da aba CONFIG_GLOBAL (prefixo SCREENER_).
 *   Os valores em SCREENER_CONFIG são os defaults usados quando a
 *   chave não existe na planilha — nunca precisam ser alterados no código.
 *
 * CHAVES ESPERADAS NA ABA CONFIG_GLOBAL:
 *   Chave                      | Default | Descrição
 *   ─────────────────────────────────────────────────────────────
 *   SCREENER_TOP_VOLUME        |      30 | Candidatos iniciais por vol. PUT
 *   SCREENER_MAX_RESULTADOS    |      15 | Linhas no resultado final
 *   SCREENER_MAX_POR_ATIVO     |       2 | Máx. PUTs do mesmo ativo
 *   SCREENER_DTE_MIN           |      15 | DTE mínimo (dias)
 *   SCREENER_DTE_MAX           |      45 | DTE máximo (dias)
 *   SCREENER_PROFIT_MIN        |       1 | Profit rate mínimo (%)
 *   SCREENER_SSR_MIN           |    1.02 | Spot/Strike mínimo (distância OTM)
 *   SCREENER_SSR_MAX           |    1.30 | Spot/Strike máximo
 *   SCREENER_VOL_FIN_MIN       |   25000 | Volume financeiro mínimo da opção (R$)
 *   SCREENER_IV_RANK_MIN       |       5 | IV Rank mínimo
 *   SCREENER_PESO_PROFIT       |      35 | Peso score: profit rate
 *   SCREENER_PESO_IV_RANK      |      25 | Peso score: IV Rank
 *   SCREENER_PESO_VE_STRIKE    |      20 | Peso score: valor extrínseco/strike
 *   SCREENER_PESO_M9_TREND     |      10 | Peso score: intensidade M9M21
 *   SCREENER_PESO_LIQUIDEZ     |      10 | Peso score: liquidez do ativo
 *
 * SCORE COMPOSTO (0-100): normalização min-max dentro do grupo candidato.
 * SAÍDA: aba SCREENER_QUANTITATIVO com até MAX_RESULTADOS oportunidades.
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Defaults (fallback quando a chave não existe no CONFIG_GLOBAL) ───────────
const SCREENER_CONFIG = {
  // ── Funil ──────────────────────────────────────────────────
  TOP_VOLUME:     30,
  MAX_RESULTADOS: 15,
  MAX_POR_ATIVO:  2,

  // ── Filtros de qualidade ───────────────────────────────────
  DTE_MIN:        15,
  DTE_MAX:        45,
  PROFIT_MIN:     1.0,
  SSR_MIN:        1.02,
  SSR_MAX:        1.30,
  VOL_FIN_MIN:    25000,
  IV_RANK_MIN:    5,

  // ── Pesos do score (devem somar 100) ──────────────────────
  PESO_PROFIT:    35,
  PESO_IV_RANK:   25,
  PESO_VE_STRIKE: 20,
  PESO_M9_TREND:  10,
  PESO_LIQUIDEZ:  10,

  // ── Tags OBSERVACAO ───────────────────────────────────────
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

/**
 * Mescla os parâmetros do CONFIG_GLOBAL (prefixo SCREENER_) com os defaults
 * do SCREENER_CONFIG. Chave ausente na planilha → usa o fallback em código.
 */
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
  var C = _screener_lerConfig(); // lê CONFIG_GLOBAL e mescla com defaults

  SysLogger.log('Screener', 'START',
    '>>> INICIANDO SCREENER QUANTITATIVO — TRAVA DE ALTA COM PUT <<<',
    JSON.stringify({
      aba: SYS_CONFIG.SHEETS.SCREENER_QUANT,
      config: C,
      timestamp: new Date().toISOString()
    })
  );

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── 1. Lê as 3 abas fonte ─────────────────────────────────────────────────
  var mapaVolumes = _screener_lerMaioresVolumes(ss);
  var mapaM9Alta  = _screener_lerM9M21Alta(ss);
  var todasPuts   = _screener_lerOpcoesPUT(ss);

  SysLogger.log('Screener', 'INFO',
    'Fontes: ' + Object.keys(mapaVolumes).length + ' ativos (Volume) | ' +
    Object.keys(mapaM9Alta).length + ' ativos (M9M21=Alta) | ' +
    todasPuts.length + ' PUTs (BestRates)'
  );

  if (Object.keys(mapaVolumes).length === 0 ||
      Object.keys(mapaM9Alta).length === 0 ||
      todasPuts.length === 0) {
    SysLogger.log('Screener', 'AVISO',
      'Uma ou mais abas fonte estão vazias. Execute os módulos 015, 016 e 017 antes do Screener.'
    );
    SysLogger.flush();
    return;
  }

  // ── 2. Top N ativos por volume de PUT ─────────────────────────────────────
  var porVolume = Object.keys(mapaVolumes)
    .map(function(tk) { return { ticker: tk, volPut: mapaVolumes[tk].volPut }; })
    .sort(function(a, b) { return b.volPut - a.volPut; })
    .slice(0, C.TOP_VOLUME);

  SysLogger.log('Screener', 'INFO',
    'Top ' + porVolume.length + ' ativos por vol. PUT: ' +
    porVolume.map(function(a) { return a.ticker; }).join(', ')
  );

  // ── 3. Interseção: alto volume ∩ M9M21_TREND = 1 ─────────────────────────
  var setElegivel = {};
  porVolume.forEach(function(a) {
    if (mapaM9Alta[a.ticker] !== undefined) setElegivel[a.ticker] = mapaM9Alta[a.ticker];
  });

  var listaElegivel = Object.keys(setElegivel);
  SysLogger.log('Screener', 'INFO',
    'Interseção (vol. alto ∩ tendência de alta): ' + listaElegivel.length +
    ' ativos: ' + listaElegivel.join(', ')
  );

  if (listaElegivel.length === 0) {
    SysLogger.log('Screener', 'AVISO',
      'Nenhum ativo com alto volume de PUT E M9M21 em alta. ' +
      'Mercado pode estar em queda generalizada. Screener não atualizado.'
    );
    SysLogger.flush();
    return;
  }

  // ── 4. Filtra PUTs dos ativos elegíveis com critérios de qualidade ────────
  var candidatas = todasPuts.filter(function(op) {
    if (!setElegivel.hasOwnProperty(op.ticker)) return false;
    if (op.profitRate < C.PROFIT_MIN)           return false;
    if (op.dte < C.DTE_MIN)                     return false;
    if (op.dte > C.DTE_MAX)                     return false;
    if (op.ssr < C.SSR_MIN)                     return false;
    if (op.ssr > C.SSR_MAX)                     return false;
    if (op.volFin < C.VOL_FIN_MIN)              return false;
    if (op.ivRank < C.IV_RANK_MIN)              return false;
    return true;
  });

  SysLogger.log('Screener', 'INFO',
    'PUTs após filtros de qualidade: ' + candidatas.length +
    ' (de ' + todasPuts.length + ' totais)'
  );

  if (candidatas.length === 0) {
    SysLogger.log('Screener', 'AVISO',
      'Nenhuma PUT passou nos filtros. Ajuste os parâmetros SCREENER_* na aba CONFIG_GLOBAL ' +
      '(ex: aumente SCREENER_DTE_MAX, reduza SCREENER_SSR_MIN ou SCREENER_VOL_FIN_MIN).'
    );
    SysLogger.flush();
    return;
  }

  // ── 5. Enriquece candidatas com M9M21_VALUE e dados do ativo ─────────────
  candidatas.forEach(function(op) {
    op.m9Value     = setElegivel[op.ticker] || 1;
    op.volPutAtivo = (mapaVolumes[op.ticker] && mapaVolumes[op.ticker].volPut) || 0;
    if (!op.empresa && mapaVolumes[op.ticker]) op.empresa = mapaVolumes[op.ticker].empresa;
    if (!op.setor   && mapaVolumes[op.ticker]) op.setor   = mapaVolumes[op.ticker].setor;
  });

  // ── 6. Score composto normalizado (0-100) ─────────────────────────────────
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

  // ── 7. Ordena por score, aplica diversificação (máx. N por ativo) ─────────
  candidatas.sort(function(a, b) { return b.score - a.score; });

  var contadorAtivo = {};
  var diversificado = candidatas.filter(function(op) {
    var count = contadorAtivo[op.ticker] || 0;
    if (count < C.MAX_POR_ATIVO) { contadorAtivo[op.ticker] = count + 1; return true; }
    return false;
  });

  var resultado = diversificado.slice(0, C.MAX_RESULTADOS);

  // ── 8. Monta tags qualitativas de OBSERVACAO ──────────────────────────────
  resultado.forEach(function(op) {
    var tags = [];
    if (op.ivRank  >= C.TAG_IV_RANK_ALTO)                                    tags.push('IV Alto');
    if (op.m9Value >= C.TAG_M9_FORTE)                                        tags.push('Tendência Forte');
    if (op.dte >= C.TAG_DTE_IDEAL_MIN && op.dte <= C.TAG_DTE_IDEAL_MAX)      tags.push('DTE Ideal');
    if (op.ssr >= C.SSR_MIN           && op.ssr <= C.TAG_OTM_PROXIMA_MAX)    tags.push('OTM Próxima');
    op.observacao = tags.length > 0 ? tags.join(' | ') : '—';
  });

  // ── 9. Grava resultado na aba SCREENER_QUANTITATIVO ──────────────────────
  var sheet = _screener_garantirAba(ss);
  var ultimaLinha = sheet.getLastRow();
  if (ultimaLinha > 1) {
    sheet.getRange(2, 1, ultimaLinha - 1, sheet.getLastColumn()).clearContent();
  }

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

  if (linhas.length > 0) {
    sheet.getRange(2, 1, linhas.length, SCREENER_HEADERS.length).setValues(linhas);
  }
  SpreadsheetApp.flush();

  var duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  SysLogger.log('Screener', 'FINISH',
    '>>> SCREENER CONCLUÍDO: ' + resultado.length + ' oportunidades em ' + duracaoTotal + 's <<<',
    JSON.stringify({
      puts_totais:      todasPuts.length,
      ativos_elegiveis: listaElegivel.length,
      apos_filtros:     candidatas.length,
      resultado_final:  resultado.length,
      top3: resultado.slice(0, 3).map(function(o) {
        return o.optionTicker + ' (score=' + o.score + ', profit=' + o.profitRate.toFixed(1) + '%)';
      }),
      duracao_s: duracaoTotal
    })
  );
  SysLogger.flush();
}

// ─── Leitura de fontes ────────────────────────────────────────────────────────

/**
 * Lê SELECAO_MAIORES_VOLUMES → { ticker: { volPut, empresa, setor } }
 */
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

/**
 * Lê RANKING_TENDENCIA_M9M21 → { ticker: m9Value } apenas para TREND = 1 (alta).
 */
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
 * Lê SELECAO_OPCOES_MAIORES_LUCROS → array de objetos PUT.
 * Ignora opções com SPOT = 0 (enriquecimento falhou).
 */
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
  console.log('=== HOMOLOGAÇÃO 019_Screener_Quantitativo ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var C  = _screener_lerConfig();

  console.log('Config ativa (após CONFIG_GLOBAL):');
  console.log('  DTE: ' + C.DTE_MIN + '–' + C.DTE_MAX +
              ' | SSR: ' + C.SSR_MIN + '–' + C.SSR_MAX +
              ' | VOL_FIN_MIN: ' + C.VOL_FIN_MIN +
              ' | PROFIT_MIN: ' + C.PROFIT_MIN + '%');

  var mapaVol = _screener_lerMaioresVolumes(ss);
  var mapaM9  = _screener_lerM9M21Alta(ss);
  var puts    = _screener_lerOpcoesPUT(ss);

  console.log('MAIORES_VOLUMES : ' + Object.keys(mapaVol).length + ' ativos');
  console.log('M9M21 em alta   : ' + Object.keys(mapaM9).length  + ' ativos');
  console.log('PUTs BestRates  : ' + puts.length + ' opções');

  var top = Object.keys(mapaVol)
    .map(function(tk) { return { ticker: tk, volPut: mapaVol[tk].volPut }; })
    .sort(function(a, b) { return b.volPut - a.volPut; })
    .slice(0, C.TOP_VOLUME)
    .map(function(a) { return a.ticker; });

  var intersec = top.filter(function(tk) { return mapaM9[tk] !== undefined; });
  console.log('Interseção (Top' + C.TOP_VOLUME + ' ∩ M9 Alta): ' +
              intersec.length + ' ativos: ' + intersec.join(', '));

  var candidatas = puts.filter(function(op) {
    return intersec.indexOf(op.ticker) !== -1 &&
           op.profitRate >= C.PROFIT_MIN &&
           op.dte        >= C.DTE_MIN    && op.dte    <= C.DTE_MAX &&
           op.ssr        >= C.SSR_MIN    && op.ssr    <= C.SSR_MAX &&
           op.volFin     >= C.VOL_FIN_MIN &&
           op.ivRank     >= C.IV_RANK_MIN;
  });
  console.log('PUTs pré-qualificadas: ' + candidatas.length);

  if (candidatas.length > 0) {
    console.log('Melhor candidata (sem score): ' + JSON.stringify({
      optionTicker: candidatas[0].optionTicker,
      ticker:       candidatas[0].ticker,
      profitRate:   candidatas[0].profitRate,
      ivRank:       candidatas[0].ivRank,
      dte:          candidatas[0].dte,
      ssr:          candidatas[0].ssr,
      volFin:       candidatas[0].volFin
    }));
  }

  console.log('=== FIM ===');
}
