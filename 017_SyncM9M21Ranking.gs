/**
 * @fileoverview 017_SyncM9M21Ranking.gs - v1.0
 * ═══════════════════════════════════════════════════════════════
 * ENDPOINT: GET /market/statistics/ranking/m9_m21
 * ABA: RANKING_TENDENCIA_M9M21
 * Ativos ranqueados pela relação entre médias móveis 9 e 21 dias.
 *
 * NOTA: O campo 'attribute' é objeto aninhado {value, trend}.
 *   → attribute.value  = valor numérico da relação M9/M21
 *   → attribute.trend  = -1 (baixa) | 0 (neutro) | 1 (alta)
 *
 * DEPENDÊNCIA: _isAcaoBrasileira() definida aqui é usada também
 *   por 018_SyncCorrelIbovRanking.gs (carregado depois).
 * ═══════════════════════════════════════════════════════════════
 */

const M9M21_017_SHEET          = SYS_CONFIG.SHEETS.RANK_M9M21;
const M9M21_017_LIMIT          = 200;
const M9M21_017_FINANCIAL_MIN  = 1000000; // R$ 1M/dia — filtra ativos com liquidez relevante
const M9M21_017_DAYS           = 30;      // Só ativos atualizados nos últimos 30 dias

/**
 * Retorna true se o ticker é uma ação brasileira pura.
 * Aceita sufixos: 3, 4, 5, 6 (ON, PN, PNA, PNB...).
 * Exclui: BDRs (34, 35, 39, 31-33), ETFs/FIIs (11, 12...), Fracionários (F).
 * Exemplos aceitos:  PETR4, VALE3, BRKM5, GGBR4, CMIG3
 * Exemplos rejeitados: FCXO34, BIAG39, GOLD11, ITUB4F, BOVA11
 */
function _isAcaoBrasileira(ticker) {
  if (!ticker) return false;
  if (ticker.endsWith('F')) return false;
  const match = ticker.match(/(\d+)$/);
  if (!match) return false;
  const sufixo = parseInt(match[1], 10);
  return sufixo >= 3 && sufixo <= 6;
}

const M9M21_017_HEADERS = [
  'TICKER', 'SHORT_NAME', 'COMPANY_NAME', 'SECTOR', 'CNPJ',
  'M9M21_VALUE', 'M9M21_TREND', 'M9M21_ATTR_NAME',
  'UPDATED_AT'
];

function SyncM9M21Ranking_Menu() {
  _menuBridge('Ranking Tendência M9M21', orquestrarSyncM9M21);
}

function orquestrarSyncM9M21() {
  const tInicio = Date.now();
  SysLogger.log('M9M21Ranking', 'START',
    '>>> INICIANDO SYNC RANKING M9M21 <<<',
    JSON.stringify({
      aba: M9M21_017_SHEET, limit: M9M21_017_LIMIT,
      financial_volume_min: M9M21_017_FINANCIAL_MIN,
      days: M9M21_017_DAYS,
      timestamp: new Date().toISOString()
    })
  );

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _garantirAba017(ss);
  SysLogger.log('M9M21Ranking', 'INFO', `Aba "${M9M21_017_SHEET}" pronta (${M9M21_017_HEADERS.length} colunas).`);

  // Busca alta (asc) e baixa (desc) em sequência para ter o ranking completo
  _limparAba017(sheet);
  let proximaLinha = 2;
  const resumo = [];
  const erros  = [];
  const tickersGravados = new Set(); // controla duplicatas entre rounds ALTA/BAIXA

  [
    { sort: 'desc', label: 'ALTA'  },
    { sort: 'asc',  label: 'BAIXA' }
  ].forEach(({ sort, label }) => {
    const tSort = Date.now();
    const url   = `${OplabService._baseUrl}/market/statistics/ranking/m9_m21?sort=${sort}&limit=${M9M21_017_LIMIT}&financial_volume_start=${M9M21_017_FINANCIAL_MIN}&days=${M9M21_017_DAYS}`;
    SysLogger.log('M9M21Ranking', 'INFO',
      `API call: GET /market/statistics/ranking/m9_m21?sort=${sort}&limit=${M9M21_017_LIMIT}&financial_volume_start=${M9M21_017_FINANCIAL_MIN}&days=${M9M21_017_DAYS} [tendência de ${label}]`
    );

    try {
      const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
      if (!data || !Array.isArray(data)) throw new Error('Resposta nula ou inválida.');

      SysLogger.log('M9M21Ranking', 'INFO', `[${label}] ${data.length} ativos retornados.`);

      // ── Filtro: apenas ações brasileiras puras (sufixos 3/4/5/6, sem F) ──
      const filtrados = data.filter(item => _isAcaoBrasileira(item.symbol));
      SysLogger.log('M9M21Ranking', 'INFO',
        `[${label}] ${filtrados.length} ações BR após filtro (${data.length - filtrados.length} excluídos: BDR/ETF/Frac.).`
      );

      const linhas = filtrados.map(item => {
        const attr = item.attribute || {};
        return [
          Sanitizador.textoPuro(item.symbol),           // TICKER
          item.short_name || '',                        // SHORT_NAME
          item.name       || '',                        // COMPANY_NAME
          item.sector     || '',                        // SECTOR
          item.cnpj       || '',                        // CNPJ
          Sanitizador.numeroPuro(attr.value),           // M9M21_VALUE
          Sanitizador.numeroPuro(attr.trend),           // M9M21_TREND (-1/0/1)
          item.attribute_name || '',                    // M9M21_ATTR_NAME
          item.updated_at ? Sanitizador.dataPura(item.updated_at) : new Date() // UPDATED_AT
        ];
      });

      // ── Deduplicação: remove tickers já gravados em rounds anteriores ────
      const linhasFiltradas = linhas.filter(l => !tickersGravados.has(l[0]));
      linhasFiltradas.forEach(l => tickersGravados.add(l[0]));
      SysLogger.log('M9M21Ranking', 'INFO',
        `[${label}] ${linhasFiltradas.length} linhas únicas após deduplicação (${linhas.length - linhasFiltradas.length} duplicatas removidas).`
      );

      const tGravacao = Date.now();
      if (linhasFiltradas.length > 0) {
        sheet.getRange(proximaLinha, 1, linhasFiltradas.length, M9M21_017_HEADERS.length).setValues(linhasFiltradas);
        proximaLinha += linhasFiltradas.length;
      }
      const tFim = Date.now();

      const info = {
        sort, label,
        api_retornou:    data.length,
        apos_filtro:     filtrados.length,
        apos_dedup:      linhasFiltradas.length,
        duracao_api_s:   ((tGravacao - tSort) / 1000).toFixed(2),
        duracao_gs_s:    ((tFim - tGravacao) / 1000).toFixed(2),
        duracao_total_s: ((tFim - tSort) / 1000).toFixed(2)
      };
      resumo.push(info);
      SysLogger.log('M9M21Ranking', 'SUCESSO',
        `[${label}] ${linhasFiltradas.length} ações gravadas (${data.length} API → ${filtrados.length} BR → ${linhasFiltradas.length} únicas). API: ${info.duracao_api_s}s | GS: ${info.duracao_gs_s}s`,
        JSON.stringify(info)
      );
    } catch (e) {
      erros.push({ sort, label, erro: e.message });
      SysLogger.log('M9M21Ranking', 'ERRO', `Falha ao buscar tendência de ${label}.`, String(e.message));
    }
  });

  SpreadsheetApp.flush();

  const duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  SysLogger.log('M9M21Ranking', 'FINISH',
    `>>> SYNC CONCLUÍDO: ${proximaLinha - 2} ativos | ${duracaoTotal}s <<<`,
    JSON.stringify({ total: proximaLinha - 2, duracao_total_s: duracaoTotal, resumo, erros: erros.length > 0 ? erros : null })
  );
  SysLogger.flush();
}

function _garantirAba017(ss) {
  let sheet = ss.getSheetByName(M9M21_017_SHEET);
  if (!sheet) { sheet = ss.insertSheet(M9M21_017_SHEET); }
  sheet.getRange(1, 1, 1, M9M21_017_HEADERS.length).setValues([M9M21_017_HEADERS]);
  return sheet;
}
function _limparAba017(sheet) {
  const lr = sheet.getLastRow();
  if (lr > 1) sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).clearContent();
}

function testM9M21Ranking() {
  console.log('=== HOMOLOGAÇÃO 017_SyncM9M21Ranking ===');
  const url  = `${OplabService._baseUrl}/market/statistics/ranking/m9_m21?sort=desc&limit=3&financial_volume_start=${M9M21_017_FINANCIAL_MIN}&days=${M9M21_017_DAYS}`;
  const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });
  console.log(`Itens: ${data ? data.length : 'null'}`);
  if (data && data[0]) console.log('Primeiro (raw):', JSON.stringify(data[0]));
  console.log('=== FIM ===');
}
