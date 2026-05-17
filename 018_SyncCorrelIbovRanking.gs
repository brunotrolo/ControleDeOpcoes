/**
 * @fileoverview 018_SyncCorrelIbovRanking.gs - v1.0
 * ═══════════════════════════════════════════════════════════════
 * ENDPOINT: GET /market/statistics/ranking/correl_ibov
 * ABA: RANKING_CORREL_IBOV
 * Ativos ranqueados pela correlação com o índice IBOV.
 *
 * RESPOSTA (8 campos flat):
 *   symbol, updated_at, cnpj, attribute (valor da correlação),
 *   attribute_name, short_name, name, sector
 *
 * ESTRATÉGIA: Busca dois rounds (maior correlação = bull mkt,
 * menor correlação = descorrelacionados/hedge) com deduplicação.
 *
 * DEPENDÊNCIA: _isAcaoBrasileira() definida em 017_SyncM9M21Ranking.gs.
 * ═══════════════════════════════════════════════════════════════
 */

const CORREL_018_SHEET         = SYS_CONFIG.SHEETS.RANK_CORREL_IBOV;
const CORREL_018_LIMIT         = 200;
const CORREL_018_FINANCIAL_MIN = 1000000; // R$ 1M/dia minimo de liquidez
const CORREL_018_DAYS          = 30;

const CORREL_018_HEADERS = [
  'TICKER', 'SHORT_NAME', 'COMPANY_NAME', 'SECTOR', 'CNPJ',
  'CORREL_VALUE', 'CORREL_ATTR_NAME',
  'UPDATED_AT'
];

function SyncCorrelIbovRanking_Menu() {
  _menuBridge('Ranking Correlação IBOV (OPLab)', orquestrarSyncCorrelIbov);
}

function orquestrarSyncCorrelIbov() {
  const tInicio = Date.now();
  SysLogger.log('CorrelIbov', 'START',
    '>>> INICIANDO SYNC RANKING CORRELACAO IBOV <<<',
    JSON.stringify({
      aba: CORREL_018_SHEET, limit: CORREL_018_LIMIT,
      financial_volume_min: CORREL_018_FINANCIAL_MIN,
      days: CORREL_018_DAYS,
      timestamp: new Date().toISOString()
    })
  );

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _garantirAba018Correl(ss);
  _limparAba018Correl(sheet);
  SysLogger.log('CorrelIbov', 'INFO',
    'Aba "' + CORREL_018_SHEET + '" pronta (' + CORREL_018_HEADERS.length + ' colunas).'
  );

  let proximaLinha = 2;
  const resumo = [];
  const erros  = [];
  const tickersGravados = new Set();

  [
    { sort: 'desc', label: 'MAIOR CORRELACAO' },
    { sort: 'asc',  label: 'MENOR CORRELACAO' }
  ].forEach(function(config) {
    var sort  = config.sort;
    var label = config.label;
    var tSort = Date.now();
    var url   = OplabService._baseUrl +
      '/market/statistics/ranking/correl_ibov?sort=' + sort +
      '&limit=' + CORREL_018_LIMIT +
      '&financial_volume_start=' + CORREL_018_FINANCIAL_MIN +
      '&days=' + CORREL_018_DAYS;

    SysLogger.log('CorrelIbov', 'INFO',
      'API call: GET /market/statistics/ranking/correl_ibov?sort=' + sort +
      '&limit=' + CORREL_018_LIMIT +
      '&financial_volume_start=' + CORREL_018_FINANCIAL_MIN +
      '&days=' + CORREL_018_DAYS +
      ' [' + label + ']'
    );

    try {
      var data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
      if (!data || !Array.isArray(data)) throw new Error('Resposta nula ou invalida.');

      SysLogger.log('CorrelIbov', 'INFO', '[' + label + '] ' + data.length + ' ativos retornados.');

      // Filtro: apenas acoes brasileiras puras (reutiliza _isAcaoBrasileira do 017)
      var filtrados = data.filter(function(item) { return _isAcaoBrasileira(item.symbol); });
      SysLogger.log('CorrelIbov', 'INFO',
        '[' + label + '] ' + filtrados.length + ' acoes BR apos filtro (' +
        (data.length - filtrados.length) + ' excluidos: BDR/ETF/Frac.).'
      );

      var linhas = filtrados.map(function(item) {
        return [
          Sanitizador.textoPuro(item.symbol),                         // TICKER
          item.short_name     || '',                                   // SHORT_NAME
          item.name           || '',                                   // COMPANY_NAME
          item.sector         || '',                                   // SECTOR
          item.cnpj           || '',                                   // CNPJ
          Sanitizador.numeroPuro(item.attribute),                     // CORREL_VALUE
          item.attribute_name || '',                                   // CORREL_ATTR_NAME
          item.updated_at ? Sanitizador.dataPura(item.updated_at) : new Date() // UPDATED_AT
        ];
      });

      // Deduplicacao entre rounds
      var linhasFiltradas = linhas.filter(function(l) { return !tickersGravados.has(l[0]); });
      linhasFiltradas.forEach(function(l) { tickersGravados.add(l[0]); });
      SysLogger.log('CorrelIbov', 'INFO',
        '[' + label + '] ' + linhasFiltradas.length + ' linhas unicas apos deduplicacao (' +
        (linhas.length - linhasFiltradas.length) + ' duplicatas removidas).'
      );

      var tGravacao = Date.now();
      if (linhasFiltradas.length > 0) {
        sheet.getRange(proximaLinha, 1, linhasFiltradas.length, CORREL_018_HEADERS.length)
          .setValues(linhasFiltradas);
        proximaLinha += linhasFiltradas.length;
      }
      var tFim = Date.now();

      var info = {
        sort: sort, label: label,
        api_retornou:    data.length,
        apos_filtro:     filtrados.length,
        apos_dedup:      linhasFiltradas.length,
        duracao_api_s:   ((tGravacao - tSort) / 1000).toFixed(2),
        duracao_gs_s:    ((tFim - tGravacao) / 1000).toFixed(2),
        duracao_total_s: ((tFim - tSort) / 1000).toFixed(2)
      };
      resumo.push(info);
      SysLogger.log('CorrelIbov', 'SUCESSO',
        '[' + label + '] ' + linhasFiltradas.length + ' acoes gravadas (' +
        data.length + ' API -> ' + filtrados.length + ' BR -> ' + linhasFiltradas.length + ' unicas). ' +
        'API: ' + info.duracao_api_s + 's | GS: ' + info.duracao_gs_s + 's',
        JSON.stringify(info)
      );

    } catch (e) {
      erros.push({ sort: sort, label: label, erro: e.message });
      SysLogger.log('CorrelIbov', 'ERRO', 'Falha ao buscar [' + label + '].', String(e.message));
    }
  });

  SpreadsheetApp.flush();

  var duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  SysLogger.log('CorrelIbov', 'FINISH',
    '>>> SYNC CONCLUIDO: ' + (proximaLinha - 2) + ' ativos | ' + duracaoTotal + 's <<<',
    JSON.stringify({
      total: proximaLinha - 2,
      duracao_total_s: duracaoTotal,
      resumo: resumo,
      erros: erros.length > 0 ? erros : null
    })
  );
  SysLogger.flush();
}

function _garantirAba018Correl(ss) {
  var sheet = ss.getSheetByName(CORREL_018_SHEET);
  if (!sheet) sheet = ss.insertSheet(CORREL_018_SHEET);
  sheet.getRange(1, 1, 1, CORREL_018_HEADERS.length).setValues([CORREL_018_HEADERS]);
  return sheet;
}

function _limparAba018Correl(sheet) {
  var lr = sheet.getLastRow();
  if (lr > 1) sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).clearContent();
}

function testCorrelIbovRanking() {
  console.log('=== HOMOLOGACAO 018_SyncCorrelIbovRanking ===');
  var url = OplabService._baseUrl +
    '/market/statistics/ranking/correl_ibov?sort=desc&limit=3' +
    '&financial_volume_start=' + CORREL_018_FINANCIAL_MIN +
    '&days=' + CORREL_018_DAYS;
  var data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
  console.log('Itens: ' + (data ? data.length : 'null'));
  if (data && data[0]) console.log('Primeiro (raw):', JSON.stringify(data[0]));
  console.log('=== FIM ===');
}
