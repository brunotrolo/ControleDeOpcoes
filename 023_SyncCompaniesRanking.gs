/**
 * @fileoverview 022_SyncCompaniesRanking.gs - v1.0
 * =====================================================
 * ENDPOINT: GET /market/statistics/ranking/{attribute}
 * ABA: RANKING_FUNDAMENTALISTA
 * Ativos ranqueados por um atributo fundamentalista escolhido.
 *
 * O atributo e lido da Config_Global (chave: Ranking_Fundamentalista_Atributo).
 * Default: 'roic' (Retorno sobre Capital Investido).
 *
 * ATRIBUTOS DISPONIVEIS:
 *   roic, roe, roa, ebit, earnings, market_cap, gross_margin,
 *   ebit_margin, net_margin, current_ratio, interest_coverage_ratio,
 *   ev, ev_over_ebit, profit_per_share, price_over_profit_per_share,
 *   earnings_over_ebit, earnings_over_netrevenue, magic_formula,
 *   cash_and_equivalents, date
 *
 * RESPOSTA (FundamentalsRanking):
 *   symbol (array de tickers), symbol_prefix, name, short_name,
 *   sector, cnpj, date, attribute (valor), attribute_name
 *
 * NOTA: 'symbol' e um array com todos os tickers da empresa
 *   (ex: ['PETR3','PETR4']). Gravamos o symbol_prefix como TICKER
 *   e o array como TICKERS_JSON para consulta futura.
 * =====================================================
 */

const FUND_025_SHEET         = 'RANKING_FUNDAMENTALISTA';
const FUND_025_LIMIT         = 200;
const FUND_025_FINANCIAL_MIN = 1000000; // R$ 1M/dia
const FUND_025_ATTR_DEFAULT  = 'roic';

// Atributos validos -- usados para validacao
const FUND_025_ATRIBUTOS_VALIDOS = [
  'date', 'cash_and_equivalents', 'ebit', 'earnings', 'market_cap',
  'earnings_over_ebit', 'earnings_over_netrevenue', 'roic', 'roa', 'roe',
  'gross_margin', 'ebit_margin', 'net_margin', 'interest_coverage_ratio',
  'current_ratio', 'ev', 'ev_over_ebit', 'profit_per_share',
  'price_over_profit_per_share', 'magic_formula'
];

const FUND_025_HEADERS = [
  'TICKER', 'TICKERS_JSON', 'SHORT_NAME', 'COMPANY_NAME', 'SECTOR', 'CNPJ',
  'ATTR_NAME', 'ATTR_VALUE', 'ATTR_DATE',
  'UPDATED_AT'
];

function SyncCompaniesRanking_Menu() {
  _menuBridge('Ranking Fundamentalista (OPLab)', orquestrarSyncCompaniesRanking);
}

function orquestrarSyncCompaniesRanking() {
  const tInicio = Date.now();

  // Le atributo da Config_Global
  const cfg       = ConfigManager.get();
  var atributo    = String(cfg['Ranking_Fundamentalista_Atributo'] || FUND_025_ATTR_DEFAULT).trim().toLowerCase();

  // Valida atributo -- se invalido, usa o default
  if (FUND_025_ATRIBUTOS_VALIDOS.indexOf(atributo) === -1) {
    SysLogger.log('CompaniesRanking', 'AVISO',
      'Atributo "' + atributo + '" invalido. Usando default: ' + FUND_025_ATTR_DEFAULT + '.',
      JSON.stringify({ recebido: atributo, validos: FUND_025_ATRIBUTOS_VALIDOS })
    );
    atributo = FUND_025_ATTR_DEFAULT;
  }

  SysLogger.log('CompaniesRanking', 'START',
    '>>> INICIANDO SYNC RANKING FUNDAMENTALISTA <<<',
    JSON.stringify({
      aba: FUND_025_SHEET, atributo: atributo,
      limit: FUND_025_LIMIT, financial_volume_min: FUND_025_FINANCIAL_MIN,
      timestamp: new Date().toISOString()
    })
  );

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _garantirAba025(ss);
  _limparAba025(sheet);
  SysLogger.log('CompaniesRanking', 'INFO',
    'Aba "' + FUND_025_SHEET + '" pronta (' + FUND_025_HEADERS.length + ' colunas). Atributo: ' + atributo
  );

  // Busca top (maior) e bottom (menor) separadamente para cobertura completa
  var todasLinhas = [];
  var erros = [];

  [
    { sort: 'desc', label: 'MAIOR' },
    { sort: 'asc',  label: 'MENOR' }
  ].forEach(function(config) {
    var sort  = config.sort;
    var label = config.label;
    var tSort = Date.now();

    var url = OplabService._baseUrl +
      '/market/statistics/ranking/' + encodeURIComponent(atributo) +
      '?sort=' + sort +
      '&limit=' + FUND_025_LIMIT +
      '&financial_volume_start=' + FUND_025_FINANCIAL_MIN;

    SysLogger.log('CompaniesRanking', 'INFO',
      'API call: GET /market/statistics/ranking/' + atributo +
      '?sort=' + sort + '&limit=' + FUND_025_LIMIT + ' [' + label + ']'
    );

    try {
      var data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
      if (!data || !Array.isArray(data)) throw new Error('Resposta nula ou invalida.');

      SysLogger.log('CompaniesRanking', 'INFO',
        '[' + label + '] ' + data.length + ' registros retornados pela API.'
      );

      // Filtra apenas registros individuais (tem symbol como array, nao agrupados)
      var individuais = data.filter(function(item) {
        return item.symbol && Array.isArray(item.symbol);
      });
      SysLogger.log('CompaniesRanking', 'INFO',
        '[' + label + '] ' + individuais.length + ' registros individuais (' +
        (data.length - individuais.length) + ' agrupados ignorados).'
      );

      todasLinhas = todasLinhas.concat(individuais.map(function(item) {
        var tickers = Array.isArray(item.symbol) ? item.symbol : [item.symbol || ''];
        var prefixo = item.symbol_prefix || (tickers[0] ? tickers[0].replace(/\d+$/, '') : '');
        return [
          Sanitizador.textoPuro(prefixo),                              // TICKER (prefixo)
          JSON.stringify(tickers),                                     // TICKERS_JSON (['PETR3','PETR4'])
          item.short_name     || '',                                   // SHORT_NAME
          item.name           || '',                                   // COMPANY_NAME
          item.sector         || '',                                   // SECTOR
          item.cnpj           || '',                                   // CNPJ
          item.attribute_name || atributo,                            // ATTR_NAME
          Sanitizador.numeroPuro(item.attribute),                     // ATTR_VALUE
          Sanitizador.dataSoData(item.date),                          // ATTR_DATE (data do balanco)
          new Date()                                                   // UPDATED_AT
        ];
      }));

      var tFim = Date.now();
      SysLogger.log('CompaniesRanking', 'SUCESSO',
        '[' + label + '] ' + individuais.length + ' empresas. API: ' +
        ((tFim - tSort) / 1000).toFixed(2) + 's'
      );

    } catch (e) {
      erros.push({ sort: sort, label: label, erro: e.message });
      SysLogger.log('CompaniesRanking', 'ERRO',
        'Falha ao buscar [' + label + '].', String(e.message)
      );
    }
  });

  // Deduplicacao por prefixo de ticker
  var prefixosGravados = new Set();
  var linhasFinal = todasLinhas.filter(function(l) {
    if (prefixosGravados.has(l[0])) return false;
    prefixosGravados.add(l[0]);
    return true;
  });

  SysLogger.log('CompaniesRanking', 'INFO',
    linhasFinal.length + ' empresas unicas apos deduplicacao (' +
    (todasLinhas.length - linhasFinal.length) + ' duplicatas removidas).'
  );

  // Gravacao em lote
  var tGravacao = Date.now();
  if (linhasFinal.length > 0) {
    sheet.getRange(2, 1, linhasFinal.length, FUND_025_HEADERS.length).setValues(linhasFinal);
  }
  var tFimGs = Date.now();
  SpreadsheetApp.flush();

  var duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  SysLogger.log('CompaniesRanking', 'FINISH',
    '>>> SYNC CONCLUIDO: ' + linhasFinal.length + ' empresas | atributo: ' + atributo + ' | ' + duracaoTotal + 's <<<',
    JSON.stringify({
      total: linhasFinal.length,
      atributo: atributo,
      duracao_api_s:   ((tGravacao - tInicio) / 1000).toFixed(2),
      duracao_gs_s:    ((tFimGs - tGravacao) / 1000).toFixed(2),
      duracao_total_s: duracaoTotal,
      erros: erros.length > 0 ? erros : null
    })
  );
  SysLogger.flush();
}

function _garantirAba025(ss) {
  var sheet = ss.getSheetByName(FUND_025_SHEET);
  if (!sheet) sheet = ss.insertSheet(FUND_025_SHEET);
  sheet.getRange(1, 1, 1, FUND_025_HEADERS.length).setValues([FUND_025_HEADERS]);
  return sheet;
}

function _limparAba025(sheet) {
  var lr = sheet.getLastRow();
  if (lr > 1) sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).clearContent();
}

/**
 * Homologacao: testa com atributo 'roic', limit=3, sem gravar na aba.
 */
function testCompaniesRanking() {
  console.log('=== HOMOLOGACAO 025_SyncCompaniesRanking ===');
  var atributo = 'roic';
  var url = OplabService._baseUrl +
    '/market/statistics/ranking/' + atributo +
    '?sort=desc&limit=3&financial_volume_start=' + FUND_025_FINANCIAL_MIN;
  var data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
  console.log('Atributo: ' + atributo);
  console.log('Itens: ' + (data ? data.length : 'null'));
  if (data && data[0]) {
    console.log('Primeiro (raw):', JSON.stringify(data[0]));
    console.log('symbol tipo:', typeof data[0].symbol, '| valor:', JSON.stringify(data[0].symbol));
  }
  console.log('=== FIM ===');
}