/**
 * @fileoverview 019_Screener_Quantitativo.gs - v6.0
 * ═══════════════════════════════════════════════════════════════
 * FUNIL QUANTITATIVO — Trava de Alta com PUT
 *
 * ESTEIRA DE 6 PORTAS:
 *   PORTA 1 — Liquidez:    Top N ativos por vol. financeiro de PUT
 *   PORTA 2 — Tendência:   M9M21_TREND = 1 (média 9m acima da 21m)
 *   PORTA 3 — Correlação:  Dedup setorial via RANKING_CORREL_IBOV
 *   PORTA 4 — Opções:      Todas as PUTs dos elegíveis no SCANNER_OPCOES,
 *             classificadas VENDA ou COMPRA por distância dinâmica do spot.
 *             IV_RANK e PROFIT_RATE enriquecidos via BEST_RATES/DADOS_ATIVOS.
 *   PORTA 5 — Ordenação:   VENDA por score (IV_RANK 40%+PROFIT 35%+VOL 25%);
 *             COMPRA por distância ascendente (proteção mais próxima 1ª).
 *   PORTA 6 — Agrupamento: Só exibe grupos com VENDA + COMPRA do mesmo
 *             ticker+DTE (spreads completos).
 *
 * FONTES DE DADOS:
 *   Opções    → SCANNER_OPCOES (única fonte: CLOSE, DELTA, THETA, volume)
 *   Enrichment→ BEST_RATES (IV_RANK por ticker, PROFIT_RATE por opção)
 *   Fallback  → DADOS_ATIVOS (IV_RANK para tickers do portfólio)
 *
 * CHAVES CONFIG_GLOBAL (prefixo SCREENER_):
 *   SCREENER_TOP_VOLUME        | 20    Top N ativos — Porta 1
 *   SCREENER_MAX_RESULTADOS    | 60    Cap total de linhas no output
 *   SCREENER_DTE_MIN           | 15    DTE mínimo (dias)
 *   SCREENER_DTE_MAX           | 45    DTE máximo (dias)
 *   SCREENER_SSR_MAX           | 1.30  Distância máxima OTM
 *   SCREENER_SSR_VENDA_MAX     | 1.08  SSR ≤ este valor → VENDA | acima → COMPRA
 *   SCREENER_CORREL_MAX        | 0.70  Limiar correlação p/ dedup setorial
 *   SCREENER_DIST_MIN_FAIXA1   | 5.0   Dist. mín. % para SPOT < R$10
 *   SCREENER_DIST_MIN_FAIXA2   | 4.0   Dist. mín. % para R$10–R$35
 *   SCREENER_DIST_MIN_FAIXA3   | 3.0   Dist. mín. % para SPOT > R$35
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Defaults ────────────────────────────────────────────────────────────────
var SCREENER_CONFIG = {
  TOP_VOLUME:       40,
  MAX_RESULTADOS:   80,
  DTE_MIN:          15,
  DTE_MAX:          60,
  SSR_MAX:          1.30,
  SSR_VENDA_MAX:    1.08,
  CORREL_MAX:       0.70,
  PESO_IV_RANK:     40,
  PESO_PROFIT:      35,
  PESO_VOLUME:      25,
  TAG_IV_RANK_ALTO: 60,
};

var SCREENER_HEADERS = [
  'ORDEM', 'PAPEL',
  'TICKER', 'EMPRESA', 'SETOR', 'OPTION_TICKER',
  'VENCIMENTO', 'DTE', 'SPOT', 'STRIKE', 'DIST_SPOT_PCT',
  'PREMIO', 'PROFIT_RATE', 'IV_RANK',
  'DELTA', 'THETA',
  'M9M21_VALUE', 'VOL_FIN_OPCAO',
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
    TOP_VOLUME:       num('SCREENER_TOP_VOLUME',       SCREENER_CONFIG.TOP_VOLUME),
    MAX_RESULTADOS:   num('SCREENER_MAX_RESULTADOS',   SCREENER_CONFIG.MAX_RESULTADOS),
    DTE_MIN:          num('SCREENER_DTE_MIN',          SCREENER_CONFIG.DTE_MIN),
    DTE_MAX:          num('SCREENER_DTE_MAX',          SCREENER_CONFIG.DTE_MAX),
    SSR_MAX:          num('SCREENER_SSR_MAX',          SCREENER_CONFIG.SSR_MAX),
    SSR_VENDA_MAX:    num('SCREENER_SSR_VENDA_MAX',    SCREENER_CONFIG.SSR_VENDA_MAX),
    CORREL_MAX:       num('SCREENER_CORREL_MAX',       SCREENER_CONFIG.CORREL_MAX),
    PESO_IV_RANK:     num('SCREENER_PESO_IV_RANK',     SCREENER_CONFIG.PESO_IV_RANK),
    PESO_PROFIT:      num('SCREENER_PESO_PROFIT',      SCREENER_CONFIG.PESO_PROFIT),
    PESO_VOLUME:      num('SCREENER_PESO_VOLUME',      SCREENER_CONFIG.PESO_VOLUME),
    TAG_IV_RANK_ALTO: num('SCREENER_TAG_IV_RANK_ALTO', SCREENER_CONFIG.TAG_IV_RANK_ALTO),
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  SysLogger.log('Screener', 'START',
    '>>> SCREENER QUANTITATIVO v6.0 — TRAVA DE ALTA COM PUT <<<',
    JSON.stringify({ config: C, ts: new Date().toISOString() })
  );

  // ── 1. Pipeline de ativos (PORTAS 1–3) ────────────────────────────────────
  var mapaVolumes = _screener_lerMaioresVolumes(ss);
  var mapaM9Alta  = _screener_lerM9M21Alta(ss);
  var mapaCorrel  = _screener_lerCorrelIbov(ss);

  SysLogger.log('Screener', 'INFO',
    'Fontes de ativos: ' + Object.keys(mapaVolumes).length + ' (Volume) | ' +
    Object.keys(mapaM9Alta).length + ' (M9=Alta) | ' +
    Object.keys(mapaCorrel).length + ' (CorrelIbov)'
  );

  if (Object.keys(mapaVolumes).length === 0 || Object.keys(mapaM9Alta).length === 0) {
    SysLogger.log('Screener', 'AVISO', 'Abas de ativos vazias. Execute módulos 016–018 antes.');
    SysLogger.flush();
    return;
  }

  // PORTA 1: Top N por volume de PUT
  var topN = Object.keys(mapaVolumes)
    .map(function(tk) { return { ticker: tk, volPut: mapaVolumes[tk].volPut }; })
    .sort(function(a, b) { return b.volPut - a.volPut; })
    .slice(0, C.TOP_VOLUME)
    .map(function(a) { return a.ticker; });

  SysLogger.log('Screener', 'INFO', 'PORTA 1 — Top ' + topN.length + ': ' + topN.join(', '));

  // PORTA 2: M9M21_TREND = 1
  var aposM9 = topN.filter(function(tk) { return mapaM9Alta[tk] !== undefined; });
  SysLogger.log('Screener', 'INFO', 'PORTA 2 — M9=Alta: ' + aposM9.length + ': ' + aposM9.join(', '));

  if (aposM9.length === 0) {
    SysLogger.log('Screener', 'AVISO', 'Nenhum ativo em tendência de alta. Screener não atualizado.');
    SysLogger.flush();
    return;
  }

  // PORTA 3: Dedup setorial por correlação
  var aposCorrel = _screener_filtrarCorrelacao(aposM9, mapaVolumes, mapaCorrel, C.CORREL_MAX);
  SysLogger.log('Screener', 'INFO',
    'PORTA 3 — Dedup setorial: ' + aposCorrel.length + ' elegíveis: ' + aposCorrel.join(', ')
  );

  if (aposCorrel.length === 0) {
    SysLogger.log('Screener', 'AVISO', 'Todos eliminados pela correlação setorial.');
    SysLogger.flush();
    return;
  }

  var setElegivel = {};
  aposCorrel.forEach(function(tk) { setElegivel[tk] = mapaM9Alta[tk]; });

  // ── 2. Enrichment maps (BEST_RATES + DADOS_ATIVOS) ────────────────────────
  var enrichment = _screener_lerEnrichmentMaps(ss);
  var ivRankMap    = enrichment.ivRankMap;
  var profitRateMap = enrichment.profitRateMap;

  SysLogger.log('Screener', 'INFO',
    'Enrichment: ' + Object.keys(ivRankMap).length + ' tickers com IV_RANK | ' +
    Object.keys(profitRateMap).length + ' opções com PROFIT_RATE'
  );

  // ── 3. PORTA 4: Opções (SCANNER_OPCOES) ───────────────────────────────────
  var todasPuts = _screener_lerOpcoesPUT(ss);

  SysLogger.log('Screener', 'INFO',
    'PORTA 4 — ' + todasPuts.length + ' PUTs no SCANNER_OPCOES'
  );

  if (todasPuts.length === 0) {
    SysLogger.log('Screener', 'AVISO', 'SCANNER_OPCOES vazio. Execute módulo 012 antes.');
    SysLogger.flush();
    return;
  }

  // Filtra por ticker elegível + DTE + distância dinâmica
  var candidatas = todasPuts.filter(function(op) {
    if (!setElegivel.hasOwnProperty(op.ticker)) return false;
    if (op.dte < C.DTE_MIN || op.dte > C.DTE_MAX) return false;

    var distPct = (op.ssr - 1) * 100;
    if (distPct < _screener_distMinPct(op.spot)) return false;
    if (op.ssr > C.SSR_MAX) return false;

    // >>> AJUSTE DA MESA DE RISCO: CORTE ANTI-CEMITÉRIO PARA VENDAS <<<
    var papelTemp = (op.ssr <= C.SSR_VENDA_MAX) ? 'VENDA' : 'COMPRA';
    if (papelTemp === 'VENDA' && (op.volFin || 0) < 50000) {
      return false; // Rejeita sumariamente Vendas sem liquidez
    }
    // >>> ========================================================== <<<

    return true;
  });

  SysLogger.log('Screener', 'INFO',
    'Candidatas após filtro DTE/distância: ' + candidatas.length +
    ' (DTE ' + C.DTE_MIN + '–' + C.DTE_MAX + ' | dist.mín. dinâmica | SSR_MAX=' + C.SSR_MAX + ')'
  );

  if (candidatas.length === 0) {
    SysLogger.log('Screener', 'AVISO',
      'Nenhuma opção encontrada. Ajuste SCREENER_DTE_MAX ou SCREENER_SSR_MAX no CONFIG_GLOBAL.'
    );
    SysLogger.flush();
    return;
  }

  // Enriquece e classifica cada candidata
  candidatas.forEach(function(op) {
    op.ivRank = ivRankMap[op.ticker] || 0;
    // PROFIT_RATE calculado diretamente de premio/strike × 100 (métrica bruta consistente).
    // BEST_RATES e RETURN_ON_STRIKE são descartados aqui: ambos usam bases diferentes
    // por ativo (raw vs. anualizado por OPLab), gerando valores incomparáveis entre opções.
    op.profitRate = op.strike > 0 ? parseFloat((op.premio / op.strike * 100).toFixed(2)) : 0;
    op.m9Value   = 'Alta';
    op.papel     = (op.ssr <= C.SSR_VENDA_MAX) ? 'VENDA' : 'COMPRA';
    if (!op.empresa && mapaVolumes[op.ticker]) op.empresa = mapaVolumes[op.ticker].empresa;
    if (!op.setor   && mapaVolumes[op.ticker]) op.setor   = mapaVolumes[op.ticker].setor;
  });

  // ── 4. PORTA 5: Ordena pernas ─────────────────────────────────────────────
  var vendas  = candidatas.filter(function(op) { return op.papel === 'VENDA'; });
  var compras = candidatas.filter(function(op) { return op.papel === 'COMPRA'; });

  // Score para VENDAs: IV_RANK(40%) + PROFIT_RATE(35%) + VOL_FIN(25%)
  if (vendas.length > 0) {
    var maxIv     = Math.max.apply(null, vendas.map(function(o) { return o.ivRank    || 0; }));
    var maxProfit = Math.max.apply(null, vendas.map(function(o) { return o.profitRate || 0; }));
    var maxVol    = Math.max.apply(null, vendas.map(function(o) { return o.volFin     || 0; }));
    vendas.forEach(function(op) {
      var s = 0;
      if (maxIv     > 0) s += (op.ivRank     / maxIv)     * C.PESO_IV_RANK;
      if (maxProfit > 0) s += (op.profitRate  / maxProfit)  * C.PESO_PROFIT;
      if (maxVol    > 0) s += (op.volFin      / maxVol)     * C.PESO_VOLUME;
      op.score = parseFloat(s.toFixed(1));
    });
    vendas.sort(function(a, b) { return b.score - a.score; });
  }

  // COMPRAs: mais próxima primeiro (SSR asc = menor custo de proteção)
  compras.sort(function(a, b) { return a.ssr - b.ssr; });

  // ── 5. PORTA 6: Agrupa por ticker+DTE (somente spreads completos) ─────────
  var resultado = _screener_agruparPorTicker(vendas, compras, C.MAX_RESULTADOS);

  // Tags de observação
  resultado.forEach(function(op) {
    var tags = [];
    if (op.papel === 'VENDA') {
      if (op.ivRank >= C.TAG_IV_RANK_ALTO) tags.push('IV Alto');
      if (profitRateMap[op.optionTicker] !== undefined) tags.push('OPLab Top');
      tags.push('Tendência Alta');
    } else {
      tags.push('Proteção');
    }
    op.observacao = tags.join(' | ');
  });

  // ── 6. Grava resultado ────────────────────────────────────────────────────
  var sheet = _screener_garantirAba(ss);
  var ultimaLinha = sheet.getLastRow();
  if (ultimaLinha > 1) sheet.getRange(2, 1, ultimaLinha - 1, sheet.getLastColumn()).clearContent();

  var now = new Date();
  var tz  = Session.getScriptTimeZone();
  var linhas = resultado.map(function(op, i) {
    return [
      i + 1,                                                                    // ORDEM
      op.papel,                                                                 // PAPEL
      op.ticker,                                                                // TICKER
      op.empresa  || '',                                                        // EMPRESA
      op.setor    || '',                                                        // SETOR
      op.optionTicker,                                                          // OPTION_TICKER
      op.expiry ? Utilities.formatDate(op.expiry, tz, 'dd/MM/yyyy') : '',      // VENCIMENTO
      op.dte,                                                                   // DTE
      op.spot,                                                                  // SPOT
      op.strike,                                                                // STRIKE
      parseFloat(((op.ssr - 1) * 100).toFixed(2)),                             // DIST_SPOT_PCT
      parseFloat((op.premio    || 0).toFixed(2)),                              // PREMIO
      parseFloat((op.profitRate || 0).toFixed(2)),                             // PROFIT_RATE
      parseFloat((op.ivRank    || 0).toFixed(1)),                              // IV_RANK
      parseFloat((op.delta     || 0).toFixed(4)),                              // DELTA
      parseFloat((op.theta     || 0).toFixed(4)),                              // THETA
      op.m9Value,                                                               // M9M21_VALUE
      Math.round(op.volFin || 0),                                              // VOL_FIN_OPCAO
      op.observacao,                                                            // OBSERVACAO
      Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm')                        // ATUALIZADO_EM
    ];
  });

  if (linhas.length > 0) sheet.getRange(2, 1, linhas.length, SCREENER_HEADERS.length).setValues(linhas);
  SpreadsheetApp.flush();

  var nVenda  = resultado.filter(function(o) { return o.papel === 'VENDA';  }).length;
  var nCompra = resultado.filter(function(o) { return o.papel === 'COMPRA'; }).length;
  var duracao = ((Date.now() - tInicio) / 1000).toFixed(1);

  SysLogger.log('Screener', 'FINISH',
    '>>> CONCLUÍDO: ' + resultado.length + ' pernas (' + nVenda + ' VENDA + ' + nCompra + ' COMPRA) em ' + duracao + 's <<<',
    JSON.stringify({
      puts_scanner: todasPuts.length, apos_m9: aposM9.length,
      apos_correl: aposCorrel.length, candidatas: candidatas.length,
      vendas: nVenda, compras: nCompra, duracao_s: duracao
    })
  );
  SysLogger.flush();
}

// ─── Agrupamento por ticker+DTE — somente spreads completos ──────────────────
function _screener_agruparPorTicker(vendas, compras, maxResultados) {
  var MAX_VENDA_POR_GRUPO  = 3;
  var MAX_COMPRA_POR_GRUPO = 3;
  var grupos = {};

  var adicionar = function(op) {
    var chave = op.ticker + '|' + op.dte;
    if (!grupos[chave]) grupos[chave] = { ticker: op.ticker, dte: op.dte, vendas: [], compras: [] };
    if (op.papel === 'VENDA') grupos[chave].vendas.push(op);
    else                       grupos[chave].compras.push(op);
  };
  vendas.forEach(adicionar);
  compras.forEach(adicionar);

  // Ordena grupos: ticker alfabético, DTE crescente
  var chaves = Object.keys(grupos).sort(function(a, b) {
    var ga = grupos[a], gb = grupos[b];
    if (ga.ticker < gb.ticker) return -1;
    if (ga.ticker > gb.ticker) return  1;
    return ga.dte - gb.dte;
  });

  var resultado = [];
  chaves.forEach(function(chave) {
    var g = grupos[chave];
    // Spread completo obrigatório: ao menos 1 VENDA + 1 COMPRA
    if (g.vendas.length === 0 || g.compras.length === 0) return;

    // Pega as melhores Vendas limitadas pelo MAX_VENDA
    var melhoresVendas = g.vendas.slice(0, MAX_VENDA_POR_GRUPO);

    // Filtra as compras garantindo um spread mínimo de R$ 0,50 do Strike da melhor Venda
    var melhorVendaStrike = melhoresVendas[0].strike;
    var comprasSeguras = g.compras.filter(function(compra) {
      return (melhorVendaStrike - compra.strike) >= 0.50;
    });

    // Se após exigir 50 centavos de largura, não sobrar compra, descarta o grupo
    if (comprasSeguras.length === 0) return;

    melhoresVendas.forEach(function(op)  { resultado.push(op); });
    comprasSeguras.slice(0, MAX_COMPRA_POR_GRUPO).forEach(function(op) { resultado.push(op); });
  });

  return resultado.slice(0, maxResultados);
}

// ─── Porta 3: Deduplicação por correlação setorial ───────────────────────────
function _screener_filtrarCorrelacao(listaElegivel, mapaVolumes, mapaCorrel, correlMax) {
  var porSetor = {};
  listaElegivel.forEach(function(ticker) {
    var setor = (mapaCorrel[ticker] && mapaCorrel[ticker].setor) ||
                (mapaVolumes[ticker] && mapaVolumes[ticker].setor) || 'SEM_SETOR';
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
    // Mantém apenas o de maior volume de PUT
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
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var colMap = DataUtils.getColMap(sheet);
  if (colMap['TICKER'] === undefined || colMap['VOLUME_PUT'] === undefined) return {};
  var dados = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var mapa  = {};
  dados.forEach(function(row) {
    var ticker = String(row[colMap['TICKER']] || '').trim().toUpperCase();
    var volPut = parseFloat(row[colMap['VOLUME_PUT']]) || 0;
    var setor  = String(row[colMap['SECTOR']] || '').trim();
    // Exclui ETFs/índices sem setor definido (IBOV, BOVA11, etc.)
    if (ticker && volPut > 0 && setor) {
      mapa[ticker] = {
        volPut:  volPut,
        empresa: String(row[colMap['COMPANY_NAME']] || ''),
        setor:   setor
      };
    }
  });
  return mapa;
}

function _screener_lerM9M21Alta(ss) {
  var sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.RANK_M9M21);
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var colMap = DataUtils.getColMap(sheet);
  if (colMap['TICKER'] === undefined || colMap['M9M21_TREND'] === undefined) return {};
  var dados = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var mapa  = {};
  dados.forEach(function(row) {
    var ticker = String(row[colMap['TICKER']] || '').trim().toUpperCase();
    var trend  = parseFloat(row[colMap['M9M21_TREND']]) || 0;
    var m9Val  = parseFloat(row[colMap['M9M21_VALUE']]) || 0;
    if (ticker && trend === 1) mapa[ticker] = m9Val;
  });
  return mapa;
}

function _screener_lerCorrelIbov(ss) {
  var sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.RANK_CORREL_IBOV);
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var colMap = DataUtils.getColMap(sheet);
  if (colMap['TICKER'] === undefined) return {};
  var dados = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var mapa  = {};
  dados.forEach(function(row) {
    var ticker = String(row[colMap['TICKER']] || '').trim().toUpperCase();
    var correl = parseFloat(row[colMap['CORREL_VALUE']]) || 0;
    var setor  = String(row[colMap['SECTOR']] || '');
    if (ticker) mapa[ticker] = { correlValue: correl, setor: setor };
  });
  return mapa;
}

/**
 * Lê BEST_RATES e DADOS_ATIVOS para construir dois mapas de enrichment:
 *   ivRankMap     : TICKER → ivRank (0–100)
 *   profitRateMap : OPTION_TICKER → profitRate (%)
 */
function _screener_lerEnrichmentMaps(ss) {
  var ivRankMap    = {};
  var profitRateMap = {};

  // 1. BEST_RATES: IV_RANK por ticker + PROFIT_RATE por opção
  var sheetBR = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.BEST_RATES);
  if (sheetBR) {
    var lastRowBR = sheetBR.getLastRow();
    if (lastRowBR >= 2) {
      var cmBR    = DataUtils.getColMap(sheetBR);
      var dadosBR = sheetBR.getRange(2, 1, lastRowBR - 1, sheetBR.getLastColumn()).getValues();
      dadosBR.forEach(function(row) {
        var ticker    = String(row[cmBR['TICKER']]        || '').trim().toUpperCase();
        var optTicker = String(row[cmBR['OPTION_TICKER']] || '').trim();
        var ivRank    = parseFloat(row[cmBR['IV_RANK']])                  || 0;
        var profitRate = parseFloat(row[cmBR['PROFIT_RATE_IF_EXERCISED']]) || 0;
        if (ticker    && ivRank    > 0) ivRankMap[ticker]       = ivRank;
        if (optTicker && profitRate > 0) profitRateMap[optTicker] = profitRate;
      });
    }
  }

  // 2. DADOS_ATIVOS: complementa IV_RANK para tickers do portfólio não cobertos pelo BEST_RATES
  var sheetDA = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.ASSETS);
  if (sheetDA) {
    var lastRowDA = sheetDA.getLastRow();
    if (lastRowDA >= 2) {
      var cmDA    = DataUtils.getColMap(sheetDA);
      var dadosDA = sheetDA.getRange(2, 1, lastRowDA - 1, sheetDA.getLastColumn()).getValues();
      dadosDA.forEach(function(row) {
        var ticker = String(row[cmDA['TICKER']] || '').trim().toUpperCase();
        var ivRank = parseFloat(row[cmDA['IV_RANK']]) || 0;
        // Só sobrescreve se BEST_RATES não cobriu este ticker
        if (ticker && ivRank > 0 && !ivRankMap[ticker]) {
          ivRankMap[ticker] = ivRank;
        }
      });
    }
  }

  return { ivRankMap: ivRankMap, profitRateMap: profitRateMap };
}

/**
 * Lê SCANNER_OPCOES — fonte única de opções.
 * PREMIO = CLOSE se > 0, senão MID_PRICE.
 * Inclui DELTA, THETA e RETURN_ON_STRIKE para scoring e output.
 */
function _screener_lerOpcoesPUT(ss) {
  var sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.SELECTION_OPT);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var colMap = DataUtils.getColMap(sheet);
  var dados  = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  // Lê SELIC uma única vez fora do loop (evita sheet read por opção com theta corrompido)
  var cfgSelic = ConfigManager.get();
  var selicStr = String(cfgSelic['Taxa_Selic_Anual'] || '0.1075').replace(',', '.');
  var SELIC    = parseFloat(selicStr) || 0.1075;

  var result = [];

  dados.forEach(function(row) {
    if (String(row[colMap['CATEGORY']] || '').trim().toUpperCase() !== 'PUT') return;
    var opt    = String(row[colMap['OPTION_TICKER']] || '').trim();
    if (!opt) return;
    var spot   = parseFloat(row[colMap['SPOT']]) || parseFloat(row[colMap['SPOT_PRICE_API']]) || 0;
    var strike = parseFloat(row[colMap['STRIKE']]) || 0;
    if (!spot || !strike) return;

    var ssr    = parseFloat(row[colMap['MONEYNESS_RATIO']]) || (spot / strike);
    var close  = parseFloat(row[colMap['CLOSE']]) || 0;
    var mid    = parseFloat(row[colMap['MID_PRICE']]) || 0;
    var premio = close > 0 ? close : mid;  // preço real; fallback spread médio

    var expiryRaw = row[colMap['EXPIRY']];
    var expiry = (expiryRaw instanceof Date && !isNaN(expiryRaw)) ? expiryRaw : null;
    if (!expiry) {
      // Fallback: extrai data do CONTRACT_DESC (ex: "PETR4 ON, R$ 32.00, 19-06-2026")
      var m = String(row[colMap['CONTRACT_DESC']] || '').match(/(\d{2})-(\d{2})-(\d{4})/);
      if (m) expiry = new Date(+m[3], +m[2] - 1, +m[1]);
    }

    var dte    = parseFloat(row[colMap['DTE_CALENDAR']]) || 0;
    var delta  = parseFloat(row[colMap['DELTA']]) || 0;
    var theta  = parseFloat(row[colMap['THETA']]) || 0;

    // Recalcula THETA quando zerado OU quando a razão |theta|/premio > 10% por dia
    // (ex: -0.47 em prêmio R$2.06 = 22%/dia — fisicamente impossível, dado corrompido)
    var thetaRatio = premio > 0 ? Math.abs(theta) / premio : 0;
    if ((theta === 0 || thetaRatio > 0.10) && premio > 0 && spot > 0 && strike > 0 && dte > 0) {
      try {
        var T    = Math.max(dte, 1) / 252;
        var iv   = OptionMath.estimateIV(spot, strike, T, SELIC, premio, 'p');
        var bsGs = OptionMath.calculate(spot, strike, T, SELIC, iv, 'p');
        theta = bsGs.theta;
        if (delta === 0) delta = bsGs.delta;
      } catch (e) { /* opção sem mercado: mantém zeros */ }
    }

    result.push({
      optionTicker:   opt,
      ticker:         String(row[colMap['TICKER']] || '').trim().toUpperCase(),
      expiry:         expiry,
      dte:            dte,
      spot:           spot,
      strike:         strike,
      ssr:            ssr,
      premio:         premio,
      returnOnStrike: parseFloat(row[colMap['RETURN_ON_STRIKE']]) || 0,
      delta:          delta,
      theta:          theta,
      volFin:         parseFloat(row[colMap['VOLUME_FIN']]) || 0,
      empresa:        String(row[colMap['COMPANY_NAME']] || ''),
      setor:          String(row[colMap['SECTOR']]       || '')
    });
  });
  return result;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Distância mínima OTM (%) por faixa de preço do ativo.
 * Ações baratas: centavos = % relevante → exige mais colchão.
 */
function _screener_distMinPct(spot) {
  if (spot < 10)  return 5.0;  // SPOT < R$10
  if (spot <= 35) return 4.0;  // R$10–R$35 (zona de ouro)
  return 3.0;                  // SPOT > R$35 (pesos-pesados)
}

function _screener_garantirAba(ss) {
  var nome  = SYS_CONFIG.SHEETS.SCREENER_QUANT;
  var sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
    SysLogger.log('Screener', 'INFO', 'Aba "' + nome + '" criada.');
  }
  // Limpa cabeçalho inteiro para não deixar colunas órfãs de versões anteriores
  var lastCol = sheet.getLastColumn();
  if (lastCol > 0) sheet.getRange(1, 1, 1, lastCol).clearContent();
  sheet.getRange(1, 1, 1, SCREENER_HEADERS.length).setValues([SCREENER_HEADERS]);
  // Formata VOL_FIN_OPCAO (col 18) como inteiro
  sheet.getRange(2, 18, sheet.getMaxRows() - 1, 1).setNumberFormat('#,##0');
  return sheet;
}

// ─── Teste / Diagnóstico ─────────────────────────────────────────────────────
function testScreenerQuantitativo() {
  console.log('=== DIAGNÓSTICO 019_Screener_Quantitativo v6.0 ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var C  = _screener_lerConfig();

  console.log('Config: TOP=' + C.TOP_VOLUME + ' | DTE=' + C.DTE_MIN + '–' + C.DTE_MAX +
    ' | SSR_VENDA_MAX=' + C.SSR_VENDA_MAX + ' | SSR_MAX=' + C.SSR_MAX +
    ' | DIST_MIN dinâmica (5%/<R$10 | 4%/R$10–35 | 3%/>R$35)');

  // Pipeline de ativos
  var mapaVol  = _screener_lerMaioresVolumes(ss);
  var mapaM9   = _screener_lerM9M21Alta(ss);
  var mapaCorr = _screener_lerCorrelIbov(ss);
  var enrich   = _screener_lerEnrichmentMaps(ss);
  var puts     = _screener_lerOpcoesPUT(ss);

  var topN    = Object.keys(mapaVol)
    .map(function(tk) { return { ticker: tk, volPut: mapaVol[tk].volPut }; })
    .sort(function(a, b) { return b.volPut - a.volPut; })
    .slice(0, C.TOP_VOLUME).map(function(a) { return a.ticker; });
  var aposM9   = topN.filter(function(tk) { return mapaM9[tk] !== undefined; });
  var aposCorr = _screener_filtrarCorrelacao(aposM9, mapaVol, mapaCorr, C.CORREL_MAX);

  console.log('PORTA 1 (Top' + C.TOP_VOLUME + '): ' + topN.join(', '));
  console.log('PORTA 2 (M9=Alta): ' + aposM9.join(', '));
  console.log('PORTA 3 (Correl<' + C.CORREL_MAX + '): ' + aposCorr.join(', '));
  console.log('Enrichment: IV_RANK para ' + Object.keys(enrich.ivRankMap).length +
    ' tickers | PROFIT_RATE para ' + Object.keys(enrich.profitRateMap).length + ' opções');
  console.log('Total PUTs no SCANNER_OPCOES: ' + puts.length);

  var setElig = {};
  aposCorr.forEach(function(tk) { setElig[tk] = mapaM9[tk]; });

  var cands = puts.filter(function(op) {
    if (!setElig.hasOwnProperty(op.ticker)) return false;
    if (op.dte < C.DTE_MIN || op.dte > C.DTE_MAX) return false;
    var dist = (op.ssr - 1) * 100;
    return dist >= _screener_distMinPct(op.spot) && op.ssr <= C.SSR_MAX;
  });

  cands.forEach(function(op) {
    var papel    = op.ssr <= C.SSR_VENDA_MAX ? 'VENDA' : 'COMPRA';
    var ivRank   = enrich.ivRankMap[op.ticker] || 0;
    var profit   = enrich.profitRateMap[op.optionTicker] !== undefined
                   ? enrich.profitRateMap[op.optionTicker]
                   : op.returnOnStrike * 100;
    console.log('  [' + papel + '] ' + op.optionTicker + ' | ' + op.ticker +
      ' | DTE=' + op.dte + ' | dist=' + ((op.ssr-1)*100).toFixed(1) + '%' +
      ' | premio=R$' + (op.premio||0).toFixed(2) +
      ' | profit=' + profit.toFixed(2) + '%' +
      ' | IV_RANK=' + ivRank.toFixed(1) +
      ' | delta=' + (op.delta||0).toFixed(3) +
      ' | theta=' + (op.theta||0).toFixed(3) +
      ' | vol=R$' + Math.round(op.volFin).toLocaleString('pt-BR'));
  });

  var nVenda  = cands.filter(function(o) { return o.ssr <= C.SSR_VENDA_MAX; }).length;
  var nCompra = cands.filter(function(o) { return o.ssr >  C.SSR_VENDA_MAX; }).length;
  console.log('Candidatas: ' + cands.length + ' (' + nVenda + ' VENDA + ' + nCompra + ' COMPRA)');
  console.log('=== FIM ===');
}
