/**
 * @fileoverview 019_Screener_Quantitativo.gs - v2.0
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
 * RACIONAL DE NEGÓCIO — Trava de Alta com PUT:
 *   • Vende PUT próxima ao spot (strike alto) → recebe prêmio gordo.
 *   • Compra PUT mais abaixo (strike baixo)   → limita perda máxima.
 *   • Lucro máximo = crédito líquido recebido, se ativo fechar acima do
 *     strike vendido no vencimento.
 *   • Portanto: queremos ativo em ALTA, PUT OTM, IV alto, DTE ideal.
 *
 * SCORE COMPOSTO (0-100):
 *   Peso 35% → PROFIT_RATE_IF_EXERCISED (retorno se exercido)
 *   Peso 25% → IV_RANK                  (prêmio acima da média histórica)
 *   Peso 20% → VE_OVER_STRIKE           (valor extrínseco sobre strike)
 *   Peso 10% → M9M21_VALUE − 1          (intensidade da tendência de alta)
 *   Peso 10% → VOLUME_PUT_ATIVO         (liquidez do ativo subjacente)
 *
 * SAÍDA: aba SCREENER_QUANTITATIVO com até 15 oportunidades ranqueadas.
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Parâmetros do funil (editáveis sem tocar na lógica) ─────────────────────
const SCREENER_CONFIG = {
  SHEET_NAME:     SYS_CONFIG.SHEETS.SCREENER_QUANT,

  // ── Funil ──────────────────────────────────────────────────
  TOP_VOLUME:     30,     // Candidatos iniciais por vol. de PUT antes do cruzamento
  MAX_RESULTADOS: 15,     // Linhas no resultado final
  MAX_POR_ATIVO:  2,      // Máx. de PUTs do mesmo ativo (diversificação)

  // ── Filtros de qualidade ───────────────────────────────────
  DTE_MIN:        15,     // DTE mínimo em dias corridos
  DTE_MAX:        35,     // DTE máximo — foca no vencimento corrente (série com liquidez)
  PROFIT_MIN:     1.0,    // Profit rate mínimo (%) — corta negativos e próximos de 0
  SSR_MIN:        1.04,   // Spot/Strike mínimo (≥4% OTM: distância mínima de segurança)
  SSR_MAX:        1.30,   // Spot/Strike máximo (≤30% OTM: muito longe = prêmio ruim)
  VOL_FIN_MIN:    50000,  // Volume financeiro mínimo da opção (R$50k/dia — anti-deserto)
  IV_RANK_MIN:    5,      // IV Rank mínimo (elimina ações com prêmios paupérrimos)

  // ── Pesos do score (devem somar 100) ──────────────────────
  PESO_PROFIT:    35,
  PESO_IV_RANK:   25,
  PESO_VE_STRIKE: 20,
  PESO_M9_TREND:  10,
  PESO_LIQUIDEZ:  10,

  // ── Tags OBSERVACAO ───────────────────────────────────────
  TAG_IV_RANK_ALTO:    60,   // IV Rank ≥ 60 → "IV Alto"
  TAG_M9_FORTE:        1.03, // M9M21_VALUE ≥ 1.03 → "Tendência Forte"
  TAG_DTE_IDEAL_MIN:   25,   // DTE ≥ 25 → faixa ideal de theta decay
  TAG_DTE_IDEAL_MAX:   35,   // DTE ≤ 35 → "DTE Ideal" (alinhado ao DTE_MAX)
  TAG_OTM_PROXIMA_MAX: 1.10  // SSR ≤ 1.10 → "OTM Próxima" (4%-10% abaixo do spot)
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

// ─── Ponto de entrada ─────────────────────────────────────────────────────────
function ScreenerQuantitativo_Menu() {
  _menuBridge('Screener Quantitativo (Trava de Alta PUT)', orquestrarScreener);
}

// ─── Orquestrador principal ───────────────────────────────────────────────────
function orquestrarScreener() {
  var tInicio = Date.now();
  SysLogger.log('Screener', 'START',
    '>>> INICIANDO SCREENER QUANTITATIVO — TRAVA DE ALTA COM PUT <<<',
    JSON.stringify({ config: SCREENER_CONFIG, timestamp: new Date().toISOString() })
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
    .slice(0, SCREENER_CONFIG.TOP_VOLUME);

  SysLogger.log('Screener', 'INFO',
    'Top ' + porVolume.length + ' ativos por vol. PUT: ' +
    porVolume.map(function(a) { return a.ticker; }).join(', ')
  );

  // ── 3. Interseção: alto volume ∩ M9M21_TREND = 1 ─────────────────────────
  var setElegivel = {};  // { ticker: m9Value }
  porVolume.forEach(function(a) {
    if (mapaM9Alta[a.ticker] !== undefined) {
      setElegivel[a.ticker] = mapaM9Alta[a.ticker];
    }
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
    if (!setElegivel.hasOwnProperty(op.ticker))   return false; // não está no grupo
    if (op.profitRate < SCREENER_CONFIG.PROFIT_MIN) return false; // profit negativo/baixo
    if (op.dte < SCREENER_CONFIG.DTE_MIN)           return false; // vence cedo demais
    if (op.dte > SCREENER_CONFIG.DTE_MAX)           return false; // vence longe demais
    if (op.ssr < SCREENER_CONFIG.SSR_MIN)           return false; // ITM ou ATM
    if (op.ssr > SCREENER_CONFIG.SSR_MAX)           return false; // muito OTM
    if (op.volFin < SCREENER_CONFIG.VOL_FIN_MIN)    return false; // opção sem liquidez
    if (op.ivRank < SCREENER_CONFIG.IV_RANK_MIN)    return false; // prêmio pobre
    return true;
  });

  SysLogger.log('Screener', 'INFO',
    'PUTs após filtros de qualidade: ' + candidatas.length +
    ' (de ' + todasPuts.length + ' totais)'
  );

  if (candidatas.length === 0) {
    SysLogger.log('Screener', 'AVISO',
      'Nenhuma PUT passou nos filtros. Mercado pode estar sem prêmio adequado. ' +
      'Considere relaxar DTE_MAX ou SSR_MAX em SCREENER_CONFIG.'
    );
    SysLogger.flush();
    return;
  }

  // ── 5. Enriquece candidatas com M9M21_VALUE e dados do ativo ─────────────
  candidatas.forEach(function(op) {
    op.m9Value     = setElegivel[op.ticker] || 1;
    op.volPutAtivo = (mapaVolumes[op.ticker] && mapaVolumes[op.ticker].volPut) || 0;
    // Preenche empresa/setor se vieram vazios do BestRates
    if (!op.empresa && mapaVolumes[op.ticker]) op.empresa = mapaVolumes[op.ticker].empresa;
    if (!op.setor   && mapaVolumes[op.ticker]) op.setor   = mapaVolumes[op.ticker].setor;
  });

  // ── 6. Score composto normalizado (0-100) ─────────────────────────────────
  // Normalização min-max dentro do grupo de candidatas.
  // Isso garante que o score seja relativo ao conjunto atual, não absoluto.
  var maxProfit = Math.max.apply(null, candidatas.map(function(o) { return o.profitRate; }));
  var maxIvRank = Math.max.apply(null, candidatas.map(function(o) { return o.ivRank; }));
  var maxVe     = Math.max.apply(null, candidatas.map(function(o) { return o.veOverStrike; }));
  var maxM9exc  = Math.max.apply(null, candidatas.map(function(o) { return Math.max(o.m9Value - 1, 0); }));
  var maxVolPut = Math.max.apply(null, candidatas.map(function(o) { return o.volPutAtivo; }));

  candidatas.forEach(function(op) {
    var s = 0;
    if (maxProfit > 0) s += (op.profitRate              / maxProfit) * SCREENER_CONFIG.PESO_PROFIT;
    if (maxIvRank > 0) s += (op.ivRank                  / maxIvRank) * SCREENER_CONFIG.PESO_IV_RANK;
    if (maxVe     > 0) s += (op.veOverStrike             / maxVe)     * SCREENER_CONFIG.PESO_VE_STRIKE;
    if (maxM9exc  > 0) s += (Math.max(op.m9Value - 1, 0) / maxM9exc)  * SCREENER_CONFIG.PESO_M9_TREND;
    if (maxVolPut > 0) s += (op.volPutAtivo              / maxVolPut)  * SCREENER_CONFIG.PESO_LIQUIDEZ;
    op.score = parseFloat(s.toFixed(1));
  });

  // ── 7. Ordena por score, aplica diversificação (máx. N por ativo) ─────────
  candidatas.sort(function(a, b) { return b.score - a.score; });

  var contadorAtivo = {};
  var diversificado = candidatas.filter(function(op) {
    var count = contadorAtivo[op.ticker] || 0;
    if (count < SCREENER_CONFIG.MAX_POR_ATIVO) {
      contadorAtivo[op.ticker] = count + 1;
      return true;
    }
    return false;
  });

  var resultado = diversificado.slice(0, SCREENER_CONFIG.MAX_RESULTADOS);

  // ── 8. Monta tags qualitativas de OBSERVACAO ──────────────────────────────
  resultado.forEach(function(op) {
    var tags = [];
    if (op.ivRank  >= SCREENER_CONFIG.TAG_IV_RANK_ALTO)   tags.push('IV Alto');
    if (op.m9Value >= SCREENER_CONFIG.TAG_M9_FORTE)        tags.push('Tendência Forte');
    if (op.dte     >= SCREENER_CONFIG.TAG_DTE_IDEAL_MIN &&
        op.dte     <= SCREENER_CONFIG.TAG_DTE_IDEAL_MAX)   tags.push('DTE Ideal');
    if (op.ssr     >= SCREENER_CONFIG.SSR_MIN &&
        op.ssr     <= SCREENER_CONFIG.TAG_OTM_PROXIMA_MAX) tags.push('OTM Próxima');
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
      i + 1,             // RANK
      op.score,          // SCORE (0-100)
      op.optionTicker,   // OPTION_TICKER
      op.ticker,         // TICKER
      op.empresa,        // EMPRESA
      op.setor,          // SETOR
      op.expiry,         // VENCIMENTO (data)
      op.dte,            // DTE (dias)
      op.spot,           // SPOT (preço ativo)
      op.strike,         // STRIKE (exercício)
      distPct,           // DIST_SPOT_PCT (% abaixo do spot)
      op.profitRate,     // PROFIT_RATE (% lucro se exercido)
      op.veOverStrike,   // VE_OVER_STRIKE (valor extrínseco/strike)
      op.ivRank,         // IV_RANK (0-100)
      op.ivCurrent,      // IV_CURRENT (IV atual)
      op.m9Trend,        // M9M21_TREND (1=alta, -1=baixa)
      op.m9Value,        // M9M21_VALUE (valor bruto da média)
      op.volPutAtivo,    // VOL_PUT_ATIVO (R$ no ativo)
      op.volFin,         // VOL_FIN_OPCAO (R$ na opção)
      op.observacao,     // OBSERVACAO (tags)
      now                // ATUALIZADO_EM
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
      puts_totais:        todasPuts.length,
      ativos_elegiveis:   listaElegivel.length,
      apos_filtros:       candidatas.length,
      resultado_final:    resultado.length,
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
    if (ticker && trend === 1) {
      mapa[ticker] = m9Val;
    }
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
  for (var i = 0; i < campos.length; i++) {
    if (colMap[campos[i]] === undefined) {
      SysLogger.log('Screener', 'AVISO', 'Coluna ausente em BEST_RATES: ' + campos[i]);
    }
  }

  var dados  = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var result = [];
  dados.forEach(function(row) {
    var category = String(row[colMap['CATEGORY']] || '').trim().toUpperCase();
    if (category !== 'PUT') return;

    var spot = parseFloat(row[colMap['SPOT']]) || 0;
    if (spot === 0) return; // enriquecimento falhou, dado sem confiabilidade

    result.push({
      optionTicker: String(row[colMap['OPTION_TICKER']] || '').trim(),
      ticker:       String(row[colMap['TICKER']]        || '').trim().toUpperCase(),
      expiry:       row[colMap['EXPIRY']],
      dte:          parseFloat(row[colMap['DTE_CALENDAR']])          || 0,
      spot:         spot,
      strike:       parseFloat(row[colMap['STRIKE']])                || 0,
      ssr:          parseFloat(row[colMap['SPOT_STRIKE_RATIO']])     || 0,
      profitRate:   parseFloat(row[colMap['PROFIT_RATE_IF_EXERCISED']]) || 0,
      veOverStrike: parseFloat(row[colMap['VE_OVER_STRIKE']])        || 0,
      ivRank:       parseFloat(row[colMap['IV_RANK']])               || 0,
      ivCurrent:    parseFloat(row[colMap['IV_CURRENT']])            || 0,
      m9Trend:      parseFloat(row[colMap['M9M21_TREND']])           || 0,
      volFin:       parseFloat(row[colMap['VOLUME_FIN']])            || 0,
      empresa:      String(row[colMap['COMPANY_NAME']] || ''),
      setor:        String(row[colMap['SECTOR']]       || '')
    });
  });
  return result;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function _screener_garantirAba(ss) {
  var nome  = SCREENER_CONFIG.SHEET_NAME;
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

  var mapaVol = _screener_lerMaioresVolumes(ss);
  var mapaM9  = _screener_lerM9M21Alta(ss);
  var puts    = _screener_lerOpcoesPUT(ss);

  console.log('MAIORES_VOLUMES : ' + Object.keys(mapaVol).length + ' ativos');
  console.log('M9M21 em alta   : ' + Object.keys(mapaM9).length  + ' ativos');
  console.log('PUTs BestRates  : ' + puts.length + ' opções');

  var top30 = Object.keys(mapaVol)
    .map(function(tk) { return { ticker: tk, volPut: mapaVol[tk].volPut }; })
    .sort(function(a, b) { return b.volPut - a.volPut; })
    .slice(0, SCREENER_CONFIG.TOP_VOLUME)
    .map(function(a) { return a.ticker; });

  var intersec = top30.filter(function(tk) { return mapaM9[tk] !== undefined; });
  console.log('Interseção (Top30 ∩ M9 Alta): ' + intersec.length + ' ativos: ' + intersec.join(', '));

  var candidatas = puts.filter(function(op) {
    return intersec.indexOf(op.ticker) !== -1 &&
           op.profitRate >= SCREENER_CONFIG.PROFIT_MIN &&
           op.dte >= SCREENER_CONFIG.DTE_MIN && op.dte <= SCREENER_CONFIG.DTE_MAX &&
           op.ssr >= SCREENER_CONFIG.SSR_MIN && op.ssr <= SCREENER_CONFIG.SSR_MAX;
  });
  console.log('PUTs pré-qualificadas: ' + candidatas.length);

  if (candidatas.length > 0) {
    console.log('Melhor candidata (sem score): ' + JSON.stringify({
      optionTicker: candidatas[0].optionTicker,
      ticker:       candidatas[0].ticker,
      profitRate:   candidatas[0].profitRate,
      ivRank:       candidatas[0].ivRank,
      dte:          candidatas[0].dte,
      ssr:          candidatas[0].ssr
    }));
  }

  console.log('=== FIM ===');
}
