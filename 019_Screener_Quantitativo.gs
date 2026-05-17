/**
 * @fileoverview 019_Screener_Quantitativo.gs - v5.0
 * ═══════════════════════════════════════════════════════════════
 * FUNIL QUANTITATIVO — Trava de Alta com PUT  (Arquitetura Gemini v2)
 *
 * ESTEIRA DE 5 PORTAS:
 *   PORTA 1 — Liquidez:     Top N ativos por vol. financeiro de PUT
 *   PORTA 2 — Tendência:    M9M21_TREND = 1 (média 9m acima da 21m)
 *   PORTA 3 — Correlação:   Dedup setorial via RANKING_CORREL_IBOV
 *   PORTA 4 — Classificação: Todas as PUTs dos elegíveis dentro do
 *             DTE e faixa OTM, rotuladas VENDA ou COMPRA conforme
 *             distância do spot. Sem hard-filter de profit/IV/volume.
 *   PORTA 5 — Ordenação:    VENDA ordenada por score; COMPRA por
 *             distância (proteção mais próxima primeiro).
 *
 * SAÍDA: uma linha por perna disponível (VENDA ou COMPRA).
 *        Cada ticker elegível pode ter múltiplas linhas.
 *        O usuário monta a trava combinando 1 VENDA + 1 COMPRA.
 *
 * CHAVES CONFIG_GLOBAL (prefixo SCREENER_):
 *   SCREENER_TOP_VOLUME        | 20    Top N ativos — Porta 1
 *   SCREENER_MAX_RESULTADOS    | 30    Cap total de linhas no output
 *   SCREENER_DTE_MIN           | 15    DTE mínimo (dias)
 *   SCREENER_DTE_MAX           | 45    DTE máximo (dias)
 *   SCREENER_DIST_MIN_FAIXA1    | 5.0   Distância mín. % para SPOT < R$10
 *   SCREENER_DIST_MIN_FAIXA2    | 4.0   Distância mín. % para R$10–R$35
 *   SCREENER_DIST_MIN_FAIXA3    | 3.0   Distância mín. % para SPOT > R$35
 *   SCREENER_SSR_MAX           | 1.30  Distância máxima OTM
 *   SCREENER_SSR_VENDA_MAX     | 1.08  SSR ≤ este valor → VENDA | acima → COMPRA
 *   SCREENER_CORREL_MAX        | 0.70  Limiar correlação p/ dedup setorial
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Defaults ────────────────────────────────────────────────────────────────
const SCREENER_CONFIG = {
  TOP_VOLUME:     20,
  MAX_RESULTADOS: 30,   // mais alto pois mostramos múltiplas pernas por ticker
  DTE_MIN:        15,
  DTE_MAX:        45,
  SSR_MAX:        1.30, // no máximo 30% OTM (distância mínima é dinâmica por faixa de SPOT)
  SSR_VENDA_MAX:  1.08, // ≤ 8% OTM → VENDA | > 8% OTM → COMPRA (proteção)
  CORREL_MAX:     0.70,
  // Pesos do score (usado para ordenar as pernas VENDA)
  PESO_PROFIT:    40,
  PESO_IV_RANK:   35,
  PESO_DISTANCIA: 25,
  TAG_IV_RANK_ALTO: 60,
  TAG_M9_FORTE:     1.03
};

const SCREENER_HEADERS = [
  'ORDEM', 'PAPEL',
  'OPTION_TICKER', 'TICKER', 'EMPRESA', 'SETOR',
  'VENCIMENTO', 'DTE', 'SPOT', 'STRIKE', 'DIST_SPOT_PCT',
  'PREMIO', 'PROFIT_RATE', 'IV_RANK', 'IV_CURRENT',
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
    TOP_VOLUME:     num('SCREENER_TOP_VOLUME',     SCREENER_CONFIG.TOP_VOLUME),
    MAX_RESULTADOS: num('SCREENER_MAX_RESULTADOS', SCREENER_CONFIG.MAX_RESULTADOS),
    DTE_MIN:        num('SCREENER_DTE_MIN',        SCREENER_CONFIG.DTE_MIN),
    DTE_MAX:        num('SCREENER_DTE_MAX',        SCREENER_CONFIG.DTE_MAX),
    SSR_MAX:        num('SCREENER_SSR_MAX',        SCREENER_CONFIG.SSR_MAX),
    SSR_VENDA_MAX:  num('SCREENER_SSR_VENDA_MAX',  SCREENER_CONFIG.SSR_VENDA_MAX),
    CORREL_MAX:     num('SCREENER_CORREL_MAX',     SCREENER_CONFIG.CORREL_MAX),
    PESO_PROFIT:    num('SCREENER_PESO_PROFIT',    SCREENER_CONFIG.PESO_PROFIT),
    PESO_IV_RANK:   num('SCREENER_PESO_IV_RANK',   SCREENER_CONFIG.PESO_IV_RANK),
    PESO_DISTANCIA: num('SCREENER_PESO_DISTANCIA', SCREENER_CONFIG.PESO_DISTANCIA),
    TAG_IV_RANK_ALTO: num('SCREENER_TAG_IV_RANK_ALTO', SCREENER_CONFIG.TAG_IV_RANK_ALTO),
    TAG_M9_FORTE:     num('SCREENER_TAG_M9_FORTE',     SCREENER_CONFIG.TAG_M9_FORTE),
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
    '>>> INICIANDO SCREENER QUANTITATIVO v5.0 — TRAVA DE ALTA COM PUT <<<',
    JSON.stringify({ aba: SYS_CONFIG.SHEETS.SCREENER_QUANT, config: C, timestamp: new Date().toISOString() })
  );

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── 1. Lê as 4 fontes ─────────────────────────────────────────────────────
  var mapaVolumes = _screener_lerMaioresVolumes(ss);
  var mapaM9Alta  = _screener_lerM9M21Alta(ss);
  var mapaCorrel  = _screener_lerCorrelIbov(ss);
  var todasPuts   = _screener_lerOpcoesPUT(ss);

  var nBestRates = todasPuts.filter(function(o) { return o.fonte === 'BEST_RATES'; }).length;
  var nScanner   = todasPuts.filter(function(o) { return o.fonte === 'SCANNER'; }).length;
  SysLogger.log('Screener', 'INFO',
    'Fontes: ' + Object.keys(mapaVolumes).length + ' ativos (Volume) | ' +
    Object.keys(mapaM9Alta).length + ' ativos (M9=Alta) | ' +
    Object.keys(mapaCorrel).length + ' ativos (CorrelIbov) | ' +
    nBestRates + ' PUTs BEST_RATES + ' + nScanner + ' PUTs SCANNER = ' + todasPuts.length + ' total'
  );

  if (Object.keys(mapaVolumes).length === 0 || Object.keys(mapaM9Alta).length === 0 || todasPuts.length === 0) {
    SysLogger.log('Screener', 'AVISO', 'Abas fonte vazias. Execute módulos 015–018 antes do Screener.');
    SysLogger.flush();
    return;
  }

  // ── PORTA 1: Top N por volume de PUT ──────────────────────────────────────
  var topN = Object.keys(mapaVolumes)
    .map(function(tk) { return { ticker: tk, volPut: mapaVolumes[tk].volPut }; })
    .sort(function(a, b) { return b.volPut - a.volPut; })
    .slice(0, C.TOP_VOLUME)
    .map(function(a) { return a.ticker; });

  SysLogger.log('Screener', 'INFO', 'PORTA 1 — Top ' + topN.length + ' por vol. PUT: ' + topN.join(', '));

  // ── PORTA 2: M9M21_TREND = 1 ──────────────────────────────────────────────
  var aposM9 = topN.filter(function(tk) { return mapaM9Alta[tk] !== undefined; });

  SysLogger.log('Screener', 'INFO',
    'PORTA 2 — M9M21=Alta: ' + aposM9.length + ' sobreviventes: ' + aposM9.join(', ')
  );

  if (aposM9.length === 0) {
    SysLogger.log('Screener', 'AVISO', 'Nenhum ativo com tendência de alta. Screener não atualizado.');
    SysLogger.flush();
    return;
  }

  // ── PORTA 3: Dedup setorial ────────────────────────────────────────────────
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

  // ── PORTA 4: Classificação de pernas (VENDA / COMPRA) ─────────────────────
  // Coleta TODAS as PUTs dos elegíveis dentro do DTE e faixa OTM.
  // Não aplica filtro de profit, IV ou volume — apenas distância do spot.
  var setElegivel = {};
  aposCorrel.forEach(function(tk) { setElegivel[tk] = mapaM9Alta[tk]; });

  var candidatas = todasPuts.filter(function(op) {
    if (!setElegivel.hasOwnProperty(op.ticker)) return false;
    if (op.dte < C.DTE_MIN || op.dte > C.DTE_MAX) return false;
    var distPct = (op.ssr - 1) * 100;
    if (distPct < _screener_distMinPct(op.spot)) return false;  // mínimo dinâmico por faixa de SPOT
    if (op.ssr > C.SSR_MAX) return false;
    // SCANNER_OPCOES entra apenas na zona COMPRA (proteção); VENDAs vêm só do BEST_RATES
    if (op.fonte === 'SCANNER' && op.ssr <= C.SSR_VENDA_MAX) return false;
    return true;
  });

  SysLogger.log('Screener', 'INFO',
    'PORTA 4 — Pernas disponíveis: ' + candidatas.length +
    ' (de ' + todasPuts.length + ' PUTs totais | DTE ' + C.DTE_MIN + '-' + C.DTE_MAX +
    ' | DIST_MIN dinâmica 3-5% por faixa | SSR_MAX=' + C.SSR_MAX + ')'
  );

  if (candidatas.length === 0) {
    SysLogger.log('Screener', 'AVISO',
      'Nenhuma opção dentro do DTE e faixa OTM definidos. ' +
      'Ajuste SCREENER_DTE_MAX ou SCREENER_SSR_MAX no CONFIG_GLOBAL.'
    );
    SysLogger.flush();
    return;
  }

  // ── Enriquece com M9M21_VALUE e dados do ativo ────────────────────────────
  candidatas.forEach(function(op) {
    op.m9Value     = (setElegivel[op.ticker] !== undefined) ? 'Alta' : '—';
    op.volPutAtivo = (mapaVolumes[op.ticker] && mapaVolumes[op.ticker].volPut) || 0;
    if (!op.empresa && mapaVolumes[op.ticker]) op.empresa = mapaVolumes[op.ticker].empresa;
    if (!op.setor   && mapaVolumes[op.ticker]) op.setor   = mapaVolumes[op.ticker].setor;
    // Labela perna: SSR ≤ SSR_VENDA_MAX → VENDA (perto do spot); acima → COMPRA (proteção)
    op.papel = (op.ssr <= C.SSR_VENDA_MAX) ? 'VENDA' : 'COMPRA';
  });

  // ── PORTA 5: Ordena pernas ─────────────────────────────────────────────────
  // VENDA: ordena por score composto (melhor prêmio + IV rank + distância)
  // COMPRA: ordena por SSR ascending (proteção mais próxima primeiro)
  var vendas  = candidatas.filter(function(op) { return op.papel === 'VENDA'; });
  var compras = candidatas.filter(function(op) { return op.papel === 'COMPRA'; });

  // Score normalizado para VENDA (min-max dentro do grupo)
  if (vendas.length > 0) {
    var maxProfit = Math.max.apply(null, vendas.map(function(o) { return o.profitRate; }));
    var maxIv     = Math.max.apply(null, vendas.map(function(o) { return o.ivRank; }));
    var maxDist   = Math.max.apply(null, vendas.map(function(o) { return o.ssr - 1; }));
    vendas.forEach(function(op) {
      var s = 0;
      if (maxProfit > 0) s += ((op.profitRate) / maxProfit) * C.PESO_PROFIT;
      if (maxIv     > 0) s += ((op.ivRank)     / maxIv)     * C.PESO_IV_RANK;
      if (maxDist   > 0) s += ((op.ssr - 1)    / maxDist)   * C.PESO_DISTANCIA;
      op.score = parseFloat(s.toFixed(1));
    });
    vendas.sort(function(a, b) { return b.score - a.score; });
  }

  // COMPRA: mais próxima primeiro (menor SSR = menor distância do spot = mais segura/barata)
  compras.sort(function(a, b) { return a.ssr - b.ssr; });

  // Intercala: para cada ticker mostra vendas e compras juntas (agrupa por ticker+DTE)
  var resultado = _screener_agruparPorTicker(vendas, compras, C.MAX_RESULTADOS);

  // ── Tags de OBSERVACAO ────────────────────────────────────────────────────
  resultado.forEach(function(op) {
    var tags = [];
    if (op.papel === 'VENDA') {
      if (op.ivRank  >= C.TAG_IV_RANK_ALTO)  tags.push('IV Alto');
      tags.push('Tendência Alta');
    } else {
      tags.push('Proteção');
    }
    op.observacao = tags.length > 0 ? tags.join(' | ') : '—';
  });

  // ── Grava resultado ───────────────────────────────────────────────────────
  var sheet = _screener_garantirAba(ss);
  var ultimaLinha = sheet.getLastRow();
  if (ultimaLinha > 1) sheet.getRange(2, 1, ultimaLinha - 1, sheet.getLastColumn()).clearContent();

  var now = new Date();
  var linhas = resultado.map(function(op, i) {
    return [
      i + 1,                                           // ORDEM
      op.papel,                                        // PAPEL
      op.optionTicker,                                 // OPTION_TICKER
      op.ticker,                                       // TICKER
      op.empresa,                                      // EMPRESA
      op.setor,                                        // SETOR
      op.expiry ? Utilities.formatDate(op.expiry, Session.getScriptTimeZone(), 'dd/MM/yyyy') : '', // VENCIMENTO
      op.dte,                                          // DTE
      op.spot,                                         // SPOT
      op.strike,                                       // STRIKE
      parseFloat(((op.ssr - 1) * 100).toFixed(2)),    // DIST_SPOT_PCT
      op.premio,                                       // PREMIO
      op.profitRate,                                   // PROFIT_RATE
      op.ivRank,                                       // IV_RANK
      op.ivCurrent,                                    // IV_CURRENT
      op.m9Value,                                      // M9M21_VALUE
      Math.round(op.volFin),                           // VOL_FIN_OPCAO
      op.observacao,                                   // OBSERVACAO
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') // ATUALIZADO_EM
    ];
  });

  if (linhas.length > 0) sheet.getRange(2, 1, linhas.length, SCREENER_HEADERS.length).setValues(linhas);
  SpreadsheetApp.flush();

  var vendaCount  = resultado.filter(function(o) { return o.papel === 'VENDA'; }).length;
  var compraCount = resultado.filter(function(o) { return o.papel === 'COMPRA'; }).length;
  var duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);

  SysLogger.log('Screener', 'FINISH',
    '>>> SCREENER CONCLUÍDO: ' + resultado.length + ' pernas (' +
    vendaCount + ' VENDA + ' + compraCount + ' COMPRA) em ' + duracaoTotal + 's <<<',
    JSON.stringify({
      puts_totais: todasPuts.length, apos_m9: aposM9.length,
      apos_correl: aposCorrel.length, candidatas: candidatas.length,
      vendas: vendaCount, compras: compraCount, duracao_s: duracaoTotal
    })
  );
  SysLogger.flush();
}

// ─── Agrupamento por ticker ───────────────────────────────────────────────────
/**
 * Intercala pernas VENDA e COMPRA agrupadas por ticker+DTE.
 * Dentro de cada grupo: VENDAs primeiro (melhores), depois COMPRAs.
 */
function _screener_agruparPorTicker(vendas, compras, maxResultados) {
  var MAX_COMPRA_POR_GRUPO = 3; // limita pernas de proteção por grupo ticker+DTE para não engolir outros tickers
  var MAX_VENDA_POR_GRUPO  = 4; // limita pernas de venda por grupo ticker+DTE (idem)
  var grupos = {};

  var adicionar = function(op) {
    var chave = op.ticker + '|' + op.dte;
    if (!grupos[chave]) grupos[chave] = { ticker: op.ticker, dte: op.dte, vendas: [], compras: [] };
    if (op.papel === 'VENDA')  grupos[chave].vendas.push(op);
    else                        grupos[chave].compras.push(op);
  };

  vendas.forEach(adicionar);
  compras.forEach(adicionar);

  // Ordena grupos: ticker alfabético, depois DTE crescente
  var chaves = Object.keys(grupos).sort(function(a, b) {
    var ga = grupos[a], gb = grupos[b];
    if (ga.ticker < gb.ticker) return -1;
    if (ga.ticker > gb.ticker) return  1;
    return ga.dte - gb.dte;
  });

  var resultado = [];
  chaves.forEach(function(chave) {
    var g = grupos[chave];
    // Só inclui grupos com spread completo: ao menos 1 VENDA + 1 COMPRA do mesmo ticker+DTE
    if (g.vendas.length === 0 || g.compras.length === 0) return;
    g.vendas.slice(0, MAX_VENDA_POR_GRUPO).forEach(function(op)  { resultado.push(op); });
    // COMPRAs mais próximas primeiro (SSR asc = proteção mais barata)
    g.compras.slice(0, MAX_COMPRA_POR_GRUPO).forEach(function(op) { resultado.push(op); });
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
  // === PARTE 1: BEST_RATES — candidatos VENDA (curados OPLab: IV_RANK + PROFIT_RATE reais) ===
  // Também constrói closeMap para corrigir PREMIO das opções encontradas aqui.
  var closeMap = {};
  var sheetScan = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.SELECTION_OPT);
  if (sheetScan && sheetScan.getLastRow() >= 2) {
    var cmScan    = DataUtils.getColMap(sheetScan);
    var dadosScan = sheetScan.getRange(2, 1, sheetScan.getLastRow() - 1, sheetScan.getLastColumn()).getValues();
    dadosScan.forEach(function(row) {
      var opt = String(row[cmScan['OPTION_TICKER']] || '').trim();
      var cl  = parseFloat(row[cmScan['CLOSE']]) || 0;
      if (opt && cl > 0) closeMap[opt] = cl;
    });
  }

  var opBestRates = [];
  var sheetBR = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.BEST_RATES);
  if (sheetBR && sheetBR.getLastRow() >= 2) {
    var cmBR    = DataUtils.getColMap(sheetBR);
    var dadosBR = sheetBR.getRange(2, 1, sheetBR.getLastRow() - 1, sheetBR.getLastColumn()).getValues();
    dadosBR.forEach(function(row) {
      if (String(row[cmBR['CATEGORY']] || '').trim().toUpperCase() !== 'PUT') return;
      var spot   = parseFloat(row[cmBR['SPOT']])   || 0;
      var strike = parseFloat(row[cmBR['STRIKE']]) || 0;
      if (!spot || !strike) return;
      var ssr       = parseFloat(row[cmBR['SPOT_STRIKE_RATIO']]) || (spot / strike);
      var optTicker = String(row[cmBR['OPTION_TICKER']] || '').trim();
      if (!optTicker) return;
      var veOverStr = parseFloat(row[cmBR['VE_OVER_STRIKE']]) || 0;
      // VE_OVER_STRIKE armazenado como percentual (ex: 4.19 = 4.19% → ratio 0.0419)
      var premioFallback = veOverStr / 100 * strike;
      var expiryRaw = row[cmBR['EXPIRY']];
      var expiry = (expiryRaw instanceof Date && !isNaN(expiryRaw)) ? expiryRaw : null;
      opBestRates.push({
        optionTicker: optTicker,
        ticker:       String(row[cmBR['TICKER']] || '').trim().toUpperCase(),
        expiry:       expiry,
        dte:          parseFloat(row[cmBR['DTE_CALENDAR']]) || 0,
        spot:         spot, strike: strike, ssr: ssr,
        premio:       closeMap[optTicker] || premioFallback,
        profitRate:   parseFloat(row[cmBR['PROFIT_RATE_IF_EXERCISED']]) || 0,
        ivRank:       parseFloat(row[cmBR['IV_RANK']])    || 0,
        ivCurrent:    parseFloat(row[cmBR['IV_CURRENT']]) || 0,
        volFin:       parseFloat(row[cmBR['VOLUME_FIN']]) || 0,
        empresa:      String(row[cmBR['COMPANY_NAME']] || ''),
        setor:        String(row[cmBR['SECTOR']]       || ''),
        fonte:        'BEST_RATES'
      });
    });
  }

  // === PARTE 2: SCANNER_OPCOES — candidatos COMPRA (pernas de proteção OTM profundas) ===
  // BEST_RATES contém apenas puts próximas ao ATM; o spread precisa de uma put mais longe.
  // SCANNER_OPCOES entra apenas na zona COMPRA (SSR > SSR_VENDA_MAX), filtrado em Gate 4.
  var opScanner = [];
  if (sheetScan && sheetScan.getLastRow() >= 2) {
    var cmScan2    = DataUtils.getColMap(sheetScan);
    var dadosScan2 = sheetScan.getRange(2, 1, sheetScan.getLastRow() - 1, sheetScan.getLastColumn()).getValues();
    dadosScan2.forEach(function(row) {
      if (String(row[cmScan2['CATEGORY']] || '').trim().toUpperCase() !== 'PUT') return;
      var opt = String(row[cmScan2['OPTION_TICKER']] || '').trim();
      if (!opt) return;
      var spot   = parseFloat(row[cmScan2['SPOT']]) || parseFloat(row[cmScan2['SPOT_PRICE_API']]) || 0;
      var strike = parseFloat(row[cmScan2['STRIKE']]) || 0;
      if (!spot || !strike) return;
      var ssr = parseFloat(row[cmScan2['MONEYNESS_RATIO']]) || (spot / strike);
      var cl  = parseFloat(row[cmScan2['CLOSE']]) || 0;
      var expiryRaw = row[cmScan2['EXPIRY']];
      var expiry = (expiryRaw instanceof Date && !isNaN(expiryRaw)) ? expiryRaw : null;
      if (!expiry) {
        var m = String(row[cmScan2['CONTRACT_DESC']] || '').match(/(\d{2})-(\d{2})-(\d{4})/);
        if (m) expiry = new Date(+m[3], +m[2] - 1, +m[1]);
      }
      opScanner.push({
        optionTicker: opt,
        ticker:       String(row[cmScan2['TICKER']] || '').trim().toUpperCase(),
        expiry:       expiry,
        dte:          parseFloat(row[cmScan2['DTE_CALENDAR']]) || 0,
        spot:         spot, strike: strike, ssr: ssr,
        premio:       cl,
        profitRate:   (parseFloat(row[cmScan2['RETURN_ON_STRIKE']]) || 0) * 100,
        ivRank:       0,
        ivCurrent:    parseFloat(row[cmScan2['IV_CALC']]) || 0,
        volFin:       parseFloat(row[cmScan2['VOLUME_FIN']]) || 0,
        empresa:      String(row[cmScan2['COMPANY_NAME']] || ''),
        setor:        String(row[cmScan2['SECTOR']]       || ''),
        fonte:        'SCANNER'
      });
    });
  }

  // SCANNER só entra na zona COMPRA — o Gate 4 fará o filtro, mas evitamos duplicação
  // de opções já cobertas pelo BEST_RATES na zona VENDA.
  return opBestRates.concat(opScanner);
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Distância mínima OTM (%) por faixa de preço do ativo.
 * Ações baratas precisam de % maior pois centavos já são % relevante.
 */
function _screener_distMinPct(spot) {
  if (spot < 10)  return 5.0;  // Abaixo de R$10: oscilação rápida em centavos
  if (spot <= 35) return 4.0;  // Zona de ouro R$10–R$35: faixa padrão
  return 3.0;                  // Pesos-pesados > R$35: R$2-3 de colchão é suficiente
}

function _screener_garantirAba(ss) {
  var nome  = SYS_CONFIG.SHEETS.SCREENER_QUANT;
  var sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
    SysLogger.log('Screener', 'INFO', 'Aba "' + nome + '" criada automaticamente.');
  }
  // Limpa linha de cabeçalho inteira antes de regravar para evitar colunas órfãs de versões anteriores
  var lastCol = sheet.getLastColumn();
  if (lastCol > 0) sheet.getRange(1, 1, 1, lastCol).clearContent();
  sheet.getRange(1, 1, 1, SCREENER_HEADERS.length).setValues([SCREENER_HEADERS]);
  // Formata coluna VOL_FIN_OPCAO como inteiro sem decimais
  sheet.getRange(2, 17, sheet.getMaxRows() - 1, 1).setNumberFormat('#,##0');
  return sheet;
}

// ─── Teste ───────────────────────────────────────────────────────────────────
function testScreenerQuantitativo() {
  console.log('=== HOMOLOGAÇÃO 019_Screener_Quantitativo v5.0 ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var C  = _screener_lerConfig();

  console.log('Config: TOP=' + C.TOP_VOLUME + ' DTE=' + C.DTE_MIN + '-' + C.DTE_MAX +
    ' SSR_MAX=' + C.SSR_MAX + ' SSR_VENDA_MAX=' + C.SSR_VENDA_MAX +
    ' DIST_MIN=dinâmica(3%/>R$35 | 4%/R$10-35 | 5%/<R$10)');

  var mapaVol  = _screener_lerMaioresVolumes(ss);
  var mapaM9   = _screener_lerM9M21Alta(ss);
  var mapaCorr = _screener_lerCorrelIbov(ss);
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

  var setElig = {};
  aposCorr.forEach(function(tk) { setElig[tk] = mapaM9[tk]; });

  var cands = puts.filter(function(op) {
    if (!setElig.hasOwnProperty(op.ticker)) return false;
    if (op.dte < C.DTE_MIN || op.dte > C.DTE_MAX) return false;
    var distPct = (op.ssr - 1) * 100;
    if (distPct < _screener_distMinPct(op.spot) || op.ssr > C.SSR_MAX) return false;
    if (op.fonte === 'SCANNER' && op.ssr <= C.SSR_VENDA_MAX) return false;
    return true;
  });

  var vendas  = cands.filter(function(op) { return op.ssr <= C.SSR_VENDA_MAX; });
  var compras = cands.filter(function(op) { return op.ssr >  C.SSR_VENDA_MAX; });

  console.log('PORTA 4 — Candidatas: ' + cands.length + ' (' + vendas.length + ' VENDA [BEST_RATES] + ' + compras.length + ' COMPRA [SCANNER])');
  cands.forEach(function(op) {
    var papel = op.ssr <= C.SSR_VENDA_MAX ? 'VENDA' : 'COMPRA';
    console.log('  [' + papel + '|' + op.fonte + '] ' + op.optionTicker + ' | ticker=' + op.ticker +
      ' | DTE=' + op.dte + ' | SSR=' + op.ssr.toFixed(4) +
      ' | dist=' + ((op.ssr-1)*100).toFixed(1) + '% | premio=R$' + (op.premio||0).toFixed(2) +
      ' | profit=' + (op.profitRate||0).toFixed(2) + ' | ivRank=' + (op.ivRank||0).toFixed(1) +
      ' | vol=R$' + Math.round(op.volFin).toLocaleString('pt-BR'));
  });

  console.log('=== FIM ===');
}
