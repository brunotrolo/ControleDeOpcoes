/**
 * @fileoverview 019_Screener_Quantitativo.gs - v7.0 (Caminho 4 — Modelo Adaptativo)
 * ═══════════════════════════════════════════════════════════════
 * FUNIL QUANTAMENTAL — Trava de Alta com PUT
 *
 * ESTEIRA DE 6 PORTAS:
 *   PORTA 1 — Liquidez:    Top N ativos por vol. financeiro de PUT
 *   PORTA 2 — Tendência:   M9M21_TREND = 1 (média 9m acima da 21m)
 *   PORTA 3 — Correlação:  Dedup setorial via RANKING_CORREL_IBOV
 *   PORTA 4 — Opções:      Filtro largo (sem exclusão por distância).
 *             VENDAs exigem volFin ≥ VOL_FIN_MIN_VENDA (anti-cemitério).
 *             Classificadas VENDA ou COMPRA por SSR_VENDA_MAX.
 *   PORTA 5 — Scoring:     Matriz Quantamental 0–100 por 3 Pilares:
 *             Técnico (40): distância OTM + força de tendência.
 *             Derivativos (40): eficiência de capital + IV_RANK.
 *             Sentimento (20): placeholder p/ API de notícias (padrão 15).
 *             VENDAs ordenadas por NOTA_QUANTAMENTAL desc; COMPRAs por
 *             distância asc (proteção mais próxima primeiro).
 *   PORTA 6 — Agrupamento: Só exibe spreads completos (VENDA + COMPRA,
 *             spread ≥ R$0,50 entre strikes). Grupos ordenados pela nota
 *             da melhor VENDA do grupo.
 *
 * FONTES DE DADOS:
 *   Opções    → SCANNER_OPCOES (única fonte: CLOSE, DELTA, THETA, volume)
 *   Enrichment→ BEST_RATES (IV_RANK por ticker; "OPLab Top" tag por opção)
 *   Fallback  → DADOS_ATIVOS (IV_RANK para tickers do portfólio)
 *
 * CHAVES CONFIG_GLOBAL (prefixo SCREENER_):
 *   SCREENER_TOP_VOLUME           | 20      Top N ativos — Porta 1
 *   SCREENER_MAX_RESULTADOS       | 60      Cap total de linhas no output
 *   SCREENER_DTE_MIN              | 15      DTE mínimo (dias)
 *   SCREENER_DTE_MAX              | 45      DTE máximo (dias)
 *   SCREENER_VOL_FIN_MIN_VENDA    | 15000   Vol. mín. para pernas de VENDA
 *   SCREENER_SSR_MAX              | 1.30    Distância máxima OTM
 *   SCREENER_SSR_VENDA_MAX        | 1.08    SSR ≤ este valor → VENDA
 *   SCREENER_CORREL_MAX           | 0.75    Limiar correlação setorial
 *   SCREENER_PESO_PILAR_TECNICO   | 40      Peso máx. Pilar Técnico
 *   SCREENER_PESO_PILAR_DERIVAT   | 40      Peso máx. Pilar Derivativos
 *   SCREENER_PESO_PILAR_SENTIM    | 20      Peso máx. Pilar Sentimento
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Defaults ────────────────────────────────────────────────────────────────
var SCREENER_CONFIG = {
  TOP_VOLUME:            20,     // Porta 1
  MAX_RESULTADOS:        60,     // Limite de linhas na planilha
  DTE_MIN:               15,     // Dias mínimos
  DTE_MAX:               45,     // Dias máximos
  VOL_FIN_MIN_VENDA:     15000,  // Filtro anti-fantasma largo
  SSR_MAX:               1.30,   // Corte máximo de distância
  SSR_VENDA_MAX:         1.08,   // Fronteira entre Venda/Compra (Spot/Strike)
  CORREL_MAX:            0.75,   // Limite de dedup setorial afrouxado

  // Pesos da Matriz Quantamental
  PESO_PILAR_TECNICO:    40,
  PESO_PILAR_DERIVAT:    40,
  PESO_PILAR_SENTIM:     20
};

var SCREENER_HEADERS = [
  'ORDEM', 'PAPEL',
  'TICKER', 'EMPRESA', 'SETOR', 'OPTION_TICKER',
  'VENCIMENTO', 'DTE', 'SPOT', 'STRIKE', 'DIST_SPOT_PCT',
  'PREMIO', 'PROFIT_RATE', 'IV_RANK',
  'DELTA', 'THETA',
  'NOTA_QUANTAMENTAL', 'VOL_FIN_OPCAO',
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
    TOP_VOLUME:         num('SCREENER_TOP_VOLUME',          SCREENER_CONFIG.TOP_VOLUME),
    MAX_RESULTADOS:     num('SCREENER_MAX_RESULTADOS',      SCREENER_CONFIG.MAX_RESULTADOS),
    DTE_MIN:            num('SCREENER_DTE_MIN',             SCREENER_CONFIG.DTE_MIN),
    DTE_MAX:            num('SCREENER_DTE_MAX',             SCREENER_CONFIG.DTE_MAX),
    VOL_FIN_MIN_VENDA:  num('SCREENER_VOL_FIN_MIN_VENDA',   SCREENER_CONFIG.VOL_FIN_MIN_VENDA),
    SSR_MAX:            num('SCREENER_SSR_MAX',             SCREENER_CONFIG.SSR_MAX),
    SSR_VENDA_MAX:      num('SCREENER_SSR_VENDA_MAX',       SCREENER_CONFIG.SSR_VENDA_MAX),
    CORREL_MAX:         num('SCREENER_CORREL_MAX',          SCREENER_CONFIG.CORREL_MAX),
    PESO_PILAR_TECNICO: num('SCREENER_PESO_PILAR_TECNICO',  SCREENER_CONFIG.PESO_PILAR_TECNICO),
    PESO_PILAR_DERIVAT: num('SCREENER_PESO_PILAR_DERIVAT',  SCREENER_CONFIG.PESO_PILAR_DERIVAT),
    PESO_PILAR_SENTIM:  num('SCREENER_PESO_PILAR_SENTIM',   SCREENER_CONFIG.PESO_PILAR_SENTIM),
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
    '>>> SCREENER QUANTITATIVO v7.0 — MODELO ADAPTATIVO (CAMINHO 4) <<<',
    JSON.stringify({ config: C, ts: new Date().toISOString() })
  );

  // ── 1. Pipeline de ativos (PORTAS 1–3) ────────────────────────────────────
  var mapaVolumes = _screener_lerMaioresVolumes(ss);
  var mapaM9Alta  = _screener_lerM9M21Alta(ss);
  var mapaCorrel  = _screener_lerCorrelIbov(ss);

  var nVol = Object.keys(mapaVolumes).length;
  var nM9  = Object.keys(mapaM9Alta).length;

  SysLogger.log('Screener', 'INFO',
    'Fontes de ativos: ' + nVol + ' (Volume) | ' +
    nM9 + ' (M9=Alta) | ' +
    Object.keys(mapaCorrel).length + ' (CorrelIbov)'
  );

  if (nVol === 0 || nM9 === 0) {
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
  var enrichment   = _screener_lerEnrichmentMaps(ss);
  var ivRankMap    = enrichment.ivRankMap;
  var profitRateMap = enrichment.profitRateMap;

  SysLogger.log('Screener', 'INFO',
    'Enrichment: ' + Object.keys(ivRankMap).length + ' tickers com IV_RANK | ' +
    Object.keys(profitRateMap).length + ' opções OPLab Top'
  );

  // ── 3. PORTA 4: Opções (filtro largo — sem exclusão por distância) ─────────
  var todasPuts = _screener_lerOpcoesPUT(ss);

  SysLogger.log('Screener', 'INFO',
    'PORTA 4 — ' + todasPuts.length + ' PUTs no SCANNER_OPCOES'
  );

  if (todasPuts.length === 0) {
    SysLogger.log('Screener', 'AVISO', 'SCANNER_OPCOES vazio. Execute módulo 012 antes.');
    SysLogger.flush();
    return;
  }

  var candidatas = todasPuts.filter(function(op) {
    if (!setElegivel.hasOwnProperty(op.ticker)) return false;
    if (op.dte < C.DTE_MIN || op.dte > C.DTE_MAX) return false;
    if (op.ssr > C.SSR_MAX) return false;

    // Corte anti-cemitério: apenas VENDAs sem liquidez mínima são eliminadas.
    // Distância não exclui mais — opções próximas do dinheiro passam para ser
    // avaliadas pelo score (Pilar Técnico penaliza elasticamente a proximidade).
    var papelTemp = (op.ssr <= C.SSR_VENDA_MAX) ? 'VENDA' : 'COMPRA';
    if (papelTemp === 'VENDA' && (op.volFin || 0) < C.VOL_FIN_MIN_VENDA) return false;

    return true;
  });

  SysLogger.log('Screener', 'INFO',
    'Candidatas após Porta 4 (filtro largo): ' + candidatas.length +
    ' (DTE ' + C.DTE_MIN + '–' + C.DTE_MAX +
    ' | VOL_MIN_VENDA=R$' + C.VOL_FIN_MIN_VENDA.toLocaleString() +
    ' | SSR_MAX=' + C.SSR_MAX + ')'
  );

  if (candidatas.length === 0) {
    SysLogger.log('Screener', 'AVISO',
      'Nenhuma opção encontrada. Ajuste SCREENER_DTE_MAX ou SCREENER_SSR_MAX no CONFIG_GLOBAL.'
    );
    SysLogger.flush();
    return;
  }

  // ── 4. PORTA 5: Enrichment + Matriz Quantamental ──────────────────────────
  candidatas.forEach(function(op) {
    op.ivRank     = ivRankMap[op.ticker] || 0;
    var oplabRate = profitRateMap[op.optionTicker];
    op.isOplabTop = oplabRate !== undefined;
    op.profitRate = op.isOplabTop
                    ? oplabRate
                    : (op.strike > 0 ? parseFloat((op.premio / op.strike * 100).toFixed(2)) : 0);
    op.papel      = (op.ssr <= C.SSR_VENDA_MAX) ? 'VENDA' : 'COMPRA';
    if (!op.empresa && mapaVolumes[op.ticker]) op.empresa = mapaVolumes[op.ticker].empresa;
    if (!op.setor   && mapaVolumes[op.ticker]) op.setor   = mapaVolumes[op.ticker].setor;

    op.notaQuantamental = _screener_calcularNotaQuantamental(op, C);
  });

  var vendas  = candidatas.filter(function(op) { return op.papel === 'VENDA'; });
  var compras = candidatas.filter(function(op) { return op.papel === 'COMPRA'; });

  // VENDAs: maior nota primeiro
  vendas.sort(function(a, b) { return b.notaQuantamental - a.notaQuantamental; });

  // COMPRAs: proteção mais próxima primeiro (menor custo de hedge)
  compras.sort(function(a, b) { return a.ssr - b.ssr; });

  // ── 5. PORTA 6: Agrupa por ticker+DTE — spreads completos, ordenados por nota
  var resultado = _screener_agruparPorTicker(vendas, compras, C.MAX_RESULTADOS);

  // Tags de observação + contadores para o log final
  var nVenda = 0, nCompra = 0;
  resultado.forEach(function(op) {
    var tags = [];
    if (op.papel === 'VENDA') {
      nVenda++;
      if (op.notaQuantamental >= 70) tags.push('Nota Alta');
      if (op.isOplabTop) tags.push('OPLab Top');
      tags.push('Tendência Alta');
    } else {
      nCompra++;
      tags.push('Proteção');
    }
    op.observacao = tags.join(' | ');
  });

  // ── 6. Grava resultado ────────────────────────────────────────────────────
  var sheet = _screener_garantirAba(ss);
  var ultimaLinha = sheet.getLastRow();
  if (ultimaLinha > 1) sheet.getRange(2, 1, ultimaLinha - 1, SCREENER_HEADERS.length).clearContent();

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
      parseFloat((op.premio     || 0).toFixed(2)),                             // PREMIO
      parseFloat((op.profitRate  || 0).toFixed(2)),                            // PROFIT_RATE
      parseFloat((op.ivRank     || 0).toFixed(1)),                             // IV_RANK
      parseFloat((op.delta      || 0).toFixed(4)),                             // DELTA
      parseFloat((op.theta      || 0).toFixed(4)),                             // THETA
      parseFloat((op.notaQuantamental || 0).toFixed(1)),                       // NOTA_QUANTAMENTAL
      Math.round(op.volFin || 0),                                              // VOL_FIN_OPCAO
      op.observacao,                                                            // OBSERVACAO
      Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm')                       // ATUALIZADO_EM
    ];
  });

  if (linhas.length > 0) sheet.getRange(2, 1, linhas.length, SCREENER_HEADERS.length).setValues(linhas);
  SpreadsheetApp.flush();

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

// ─── Motor de Pontuação Quantamental (0–100) ──────────────────────────────────
/**
 * Calcula a nota quantamental de uma opção candidata.
 *
 * PILAR TÉCNICO (max C.PESO_PILAR_TECNICO pts):
 *   70% → distância OTM: penalização elástica se abaixo da dist. ideal por SPOT.
 *   30% → força de tendência: M9M21_TREND=1 garante nota máxima do sub-pilar.
 *
 * PILAR DERIVATIVOS (max C.PESO_PILAR_DERIVAT pts):
 *   50% → eficiência de capital: premio/strike; 5% = nota máxima do sub-pilar.
 *   50% → IV_RANK: maior volatilidade implícita = venda mais vantajosa.
 *
 * PILAR SENTIMENTO (max C.PESO_PILAR_SENTIM pts):
 *   Placeholder para API de notícias. Padrão: 75% do pilar (nota neutra).
 */
function _screener_calcularNotaQuantamental(op, C) {
  // ── Pilar Técnico ────────────────────────────────────────────────────────
  var maxTecnico  = C.PESO_PILAR_TECNICO;
  var maxDistancia = maxTecnico * 0.70;
  var maxTendencia = maxTecnico * 0.30;

  var distIdeal = _screener_distMinPct(op.spot);
  var distReal  = (op.ssr - 1) * 100;
  var notaDist  = distReal >= distIdeal
    ? maxDistancia
    : Math.max(0, maxDistancia * (distReal / distIdeal));

  var notaTendencia = maxTendencia; // todos passaram Porta 2 (M9M21_TREND=1)

  var notaTecnica = notaDist + notaTendencia;

  // ── Pilar Derivativos ────────────────────────────────────────────────────
  var maxDeriv   = C.PESO_PILAR_DERIVAT;
  var maxEfic    = maxDeriv * 0.50;
  var maxIvRank  = maxDeriv * 0.50;

  // Eficiência: 5% de retorno sobre strike = nota máxima; proporcional abaixo
  var notaEfic   = Math.min(op.profitRate / 5.0, 1.0) * maxEfic;

  // IV_RANK: 0–100 → escala linear
  var notaIv     = (op.ivRank / 100) * maxIvRank;

  var notaDeriv  = notaEfic + notaIv;

  // ── Pilar Sentimento ─────────────────────────────────────────────────────
  // Placeholder: 75% do peso máximo como score neutro.
  // Integrar API de sentimento aqui quando disponível.
  var notaSentimento = C.PESO_PILAR_SENTIM * 0.75;

  return parseFloat((notaTecnica + notaDeriv + notaSentimento).toFixed(1));
}

// ─── Agrupamento por ticker+DTE — spreads completos, grupos por nota ──────────
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

  // Ordena grupos pela NOTA_QUANTAMENTAL da melhor VENDA (maior nota = grupo prioritário)
  var chaves = Object.keys(grupos).sort(function(a, b) {
    var notaA = grupos[a].vendas.length > 0 ? (grupos[a].vendas[0].notaQuantamental || 0) : 0;
    var notaB = grupos[b].vendas.length > 0 ? (grupos[b].vendas[0].notaQuantamental || 0) : 0;
    return notaB - notaA;
  });

  var resultado = [];
  chaves.forEach(function(chave) {
    var g = grupos[chave];
    if (g.vendas.length === 0 || g.compras.length === 0) return;

    var melhoresVendas = g.vendas.slice(0, MAX_VENDA_POR_GRUPO);

    // Spread mínimo de R$0,50 entre strike da melhor venda e strike da compra
    var melhorVendaStrike = melhoresVendas[0].strike;
    var comprasSeguras = g.compras.filter(function(compra) {
      return (melhorVendaStrike - compra.strike) >= 0.50;
    });

    if (comprasSeguras.length === 0) return;

    melhoresVendas.forEach(function(op) { resultado.push(op); });
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
    grupo.sort(function(a, b) {
      return ((mapaVolumes[b] && mapaVolumes[b].volPut) || 0) -
             ((mapaVolumes[a] && mapaVolumes[a].volPut) || 0);
    });
    resultado.push(grupo[0]);
  });
  return resultado;
}

// ─── Leitura de fontes (todas com getLastRow() cacheado) ─────────────────────

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
 * Lê BEST_RATES e DADOS_ATIVOS:
 *   ivRankMap     : TICKER → ivRank (0–100) para Pilar Derivativos
 *   profitRateMap : OPTION_TICKER → tag "OPLab Top" (opção curada pelo OPLab)
 */
function _screener_lerEnrichmentMaps(ss) {
  var ivRankMap    = {};
  var profitRateMap = {};

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

  var sheetDA = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.ASSETS);
  if (sheetDA) {
    var lastRowDA = sheetDA.getLastRow();
    if (lastRowDA >= 2) {
      var cmDA    = DataUtils.getColMap(sheetDA);
      var dadosDA = sheetDA.getRange(2, 1, lastRowDA - 1, sheetDA.getLastColumn()).getValues();
      dadosDA.forEach(function(row) {
        var ticker = String(row[cmDA['TICKER']] || '').trim().toUpperCase();
        var ivRank = parseFloat(row[cmDA['IV_RANK']]) || 0;
        if (ticker && ivRank > 0 && !ivRankMap[ticker]) ivRankMap[ticker] = ivRank;
      });
    }
  }

  return { ivRankMap: ivRankMap, profitRateMap: profitRateMap };
}

/**
 * Lê SCANNER_OPCOES — fonte única de opções.
 * PREMIO = CLOSE || MID_PRICE.
 * THETA recalculado via Black-Scholes quando zerado ou corrompido (|theta|/premio > 10%/dia).
 */
function _screener_lerOpcoesPUT(ss) {
  var sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.SELECTION_OPT);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var colMap = DataUtils.getColMap(sheet);
  var dados  = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  // SELIC lida uma única vez fora do loop
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
    var premio = close > 0 ? close : mid;

    var expiryRaw = row[colMap['EXPIRY']];
    var expiry = (expiryRaw instanceof Date && !isNaN(expiryRaw)) ? expiryRaw : null;
    if (!expiry) {
      var m = String(row[colMap['CONTRACT_DESC']] || '').match(/(\d{2})-(\d{2})-(\d{4})/);
      if (m) expiry = new Date(+m[3], +m[2] - 1, +m[1]);
    }

    var dte   = parseFloat(row[colMap['DTE_CALENDAR']]) || 0;
    var delta = parseFloat(row[colMap['DELTA']]) || 0;
    var theta = parseFloat(row[colMap['THETA']]) || 0;

    // Recalcula THETA quando zerado ou corrompido (|theta|/premio > 10%/dia)
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
 * Distância mínima OTM ideal (%) por faixa de preço do ativo.
 * Usada como referência no Pilar Técnico do scoring quantamental.
 */
function _screener_distMinPct(spot) {
  if (spot < 10)  return 5.0;
  if (spot <= 35) return 4.0;
  return 3.0;
}

function _screener_garantirAba(ss) {
  var nome  = SYS_CONFIG.SHEETS.SCREENER_QUANT;
  var sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
    SysLogger.log('Screener', 'INFO', 'Aba "' + nome + '" criada.');
  }
  var lastCol = sheet.getLastColumn();
  if (lastCol > 0) sheet.getRange(1, 1, 1, lastCol).clearContent();
  sheet.getRange(1, 1, 1, SCREENER_HEADERS.length).setValues([SCREENER_HEADERS]);
  var maxLinhas = SCREENER_CONFIG.MAX_RESULTADOS + 2;
  sheet.getRange(2, 17, maxLinhas, 1).setNumberFormat('0.0');   // NOTA_QUANTAMENTAL
  sheet.getRange(2, 18, maxLinhas, 1).setNumberFormat('#,##0'); // VOL_FIN_OPCAO
  return sheet;
}

// ─── Teste / Diagnóstico ─────────────────────────────────────────────────────
function testScreenerQuantitativo() {
  console.log('=== DIAGNÓSTICO 019_Screener_Quantitativo v7.0 (Caminho 4) ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var C  = _screener_lerConfig();

  console.log('Config: TOP=' + C.TOP_VOLUME + ' | DTE=' + C.DTE_MIN + '–' + C.DTE_MAX +
    ' | VOL_MIN_VENDA=R$' + C.VOL_FIN_MIN_VENDA +
    ' | Pilares: T=' + C.PESO_PILAR_TECNICO + ' D=' + C.PESO_PILAR_DERIVAT + ' S=' + C.PESO_PILAR_SENTIM);

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
    ' tickers | ' + Object.keys(enrich.profitRateMap).length + ' opções OPLab Top');
  console.log('Total PUTs no SCANNER_OPCOES: ' + puts.length);

  var setElig = {};
  aposCorr.forEach(function(tk) { setElig[tk] = mapaM9[tk]; });

  var cands = puts.filter(function(op) {
    if (!setElig.hasOwnProperty(op.ticker)) return false;
    if (op.dte < C.DTE_MIN || op.dte > C.DTE_MAX) return false;
    if (op.ssr > C.SSR_MAX) return false;
    var papelTemp = (op.ssr <= C.SSR_VENDA_MAX) ? 'VENDA' : 'COMPRA';
    if (papelTemp === 'VENDA' && (op.volFin || 0) < C.VOL_FIN_MIN_VENDA) return false;
    return true;
  });

  cands.forEach(function(op) {
    var papel  = op.ssr <= C.SSR_VENDA_MAX ? 'VENDA' : 'COMPRA';
    op.ivRank    = enrich.ivRankMap[op.ticker] || 0;
    op.profitRate = enrich.profitRateMap[op.optionTicker] !== undefined
                    ? enrich.profitRateMap[op.optionTicker]
                    : (op.strike > 0 ? parseFloat((op.premio / op.strike * 100).toFixed(2)) : 0);
    var nota   = _screener_calcularNotaQuantamental(op, C);
    console.log('  [' + papel + '] ' + op.optionTicker + ' | ' + op.ticker +
      ' | dist=' + ((op.ssr-1)*100).toFixed(1) + '%' +
      ' | premio=R$' + (op.premio||0).toFixed(2) +
      ' | profit=' + (op.profitRate||0).toFixed(2) + '%' +
      ' | IV_RANK=' + (op.ivRank||0).toFixed(1) +
      ' | NOTA=' + nota.toFixed(1) +
      ' | vol=R$' + Math.round(op.volFin).toLocaleString('pt-BR'));
  });

  var nV = cands.filter(function(o) { return o.ssr <= C.SSR_VENDA_MAX; }).length;
  var nC = cands.filter(function(o) { return o.ssr >  C.SSR_VENDA_MAX; }).length;
  console.log('Candidatas: ' + cands.length + ' (' + nV + ' VENDA + ' + nC + ' COMPRA)');
  console.log('=== FIM ===');
}
