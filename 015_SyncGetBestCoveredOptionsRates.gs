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
 * COLUNAS DA ABA (13 — ordem definida pelo usuário):
 *   OPTION_TICKER | EXPIRY | VOLUME_FIN | PROFIT_RATE_IF_EXERCISED |
 *   CATEGORY | TICKER | UPDATED_AT | VE_OVER_STRIKE | DTE_CALENDAR |
 *   STRIKE | SPOT_STRIKE_RATIO | COMPANY_NAME | SECTOR
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

// ─── Cabeçalho exato da aba (13 colunas — ordem definida pelo usuário) ────────
const BEST_RATES_HEADERS = [
  'OPTION_TICKER',          // symbol
  'EXPIRY',                 // due_date
  'VOLUME_FIN',             // financial_volume
  'PROFIT_RATE_IF_EXERCISED', // profit_rate_if_excercised (typo na API mantido)
  'CATEGORY',               // type → CALL | PUT
  'TICKER',                 // underlying
  'UPDATED_AT',             // updated_at
  'VE_OVER_STRIKE',         // ve_over_strike
  'DTE_CALENDAR',           // days_to_maturity
  'STRIKE',                 // strike
  'SPOT_STRIKE_RATIO',      // spot_strike_ratio
  'COMPANY_NAME',           // name
  'SECTOR',                 // sector
];

// ─── Ponto de entrada (padrão _menuBridge de 005) ─────────────────────────────
function SyncBestCoveredOptionsRates_Menu() {
  _menuBridge('Best Covered Options Rates', orquestrarSyncBestRates);
}

// ─── Orquestrador ─────────────────────────────────────────────────────────────
function orquestrarSyncBestRates() {
  const tInicio = Date.now();

  SysLogger.log('BestRates', 'START',
    '>>> INICIANDO SYNC MELHORES TAXAS DE LUCRO (OPLab) <<<',
    JSON.stringify({
      aba_destino: BEST_RATES_CONFIG.SHEET_NAME,
      limit_por_tipo: BEST_RATES_CONFIG.LIMIT,
      timestamp: new Date().toISOString()
    })
  );

  // ── 1. Garante aba com cabeçalho ───────────────────────────────────────────
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _garantirAbaBestRates(ss);
  SysLogger.log('BestRates', 'INFO',
    `Aba destino pronta: "${BEST_RATES_CONFIG.SHEET_NAME}" (${BEST_RATES_HEADERS.length} colunas).`
  );

  // ── 2. Limpa dados anteriores (snapshot em tempo real) ─────────────────────
  _limparDadosBestRates(sheet);
  let proximaLinha = 2;

  const erros  = [];
  const resumo = [];

  // ── 3. Busca PUT e CALL sequencialmente ───────────────────────────────────
  ['PUT', 'CALL'].forEach(tipo => {
    const tTipo = Date.now();
    SysLogger.log('BestRates', 'INFO',
      `Buscando melhores taxas: ${tipo} (limit=${BEST_RATES_CONFIG.LIMIT})...`
    );
    SysLogger.log('BestRates', 'INFO',
      `API call: GET /market/statistics/realtime/best_covered_options_rates/${tipo}`
    );

    try {
      const linhas    = _buscarRatesPorTipo(tipo);
      const tGravacao = Date.now();

      if (linhas.length > 0) {
        sheet
          .getRange(proximaLinha, 1, linhas.length, BEST_RATES_HEADERS.length)
          .setValues(linhas);
        proximaLinha += linhas.length;
      }

      const tFim         = Date.now();
      const duracaoApi   = ((tGravacao - tTipo) / 1000).toFixed(2);
      const duracaoGs    = ((tFim - tGravacao) / 1000).toFixed(2);
      const duracaoTotal = ((tFim - tTipo) / 1000).toFixed(2);

      const info = {
        tipo,
        opcoes:          linhas.length,
        duracao_api_s:   duracaoApi,
        duracao_gs_s:    duracaoGs,
        duracao_total_s: duracaoTotal
      };
      resumo.push(info);

      SysLogger.log('BestRates', 'SUCESSO',
        `${tipo}: ${linhas.length} opções gravadas. API: ${duracaoApi}s | GS: ${duracaoGs}s | Total: ${duracaoTotal}s`,
        JSON.stringify(info)
      );

    } catch (e) {
      const info = { tipo, erro: e.message };
      erros.push(info);
      SysLogger.log('BestRates', 'ERRO',
        `Falha ao coletar ${tipo}.`,
        JSON.stringify(info)
      );
    }
  });

  // ── 4. Flush e encerramento ────────────────────────────────────────────────
  SpreadsheetApp.flush();

  const totalOpcoes  = proximaLinha - 2;
  const duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  const totalOk      = resumo.filter(r => r.opcoes > 0).length;
  const totalErros   = erros.length;

  SysLogger.log('BestRates', 'FINISH',
    `>>> SYNC CONCLUÍDO: ${totalOpcoes} opções | ${totalOk} tipos OK | ${totalErros} erros | ${duracaoTotal}s <<<`,
    JSON.stringify({
      total_opcoes:      totalOpcoes,
      tipos_ok:          totalOk,
      tipos_erro:        totalErros,
      duracao_total_s:   duracaoTotal,
      resumo_por_tipo:   resumo,
      erros:             erros.length > 0 ? erros : null
    })
  );
  SysLogger.flush();
}

// ─── Busca e mapeia as opções de um tipo (PUT ou CALL) ────────────────────────
function _buscarRatesPorTipo(tipo) {
  const url  = `${OplabService._baseUrl}/market/statistics/realtime/best_covered_options_rates/${tipo}?limit=${BEST_RATES_CONFIG.LIMIT}`;
  const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });

  if (!data)             throw new Error('Resposta nula da API.');
  if (!Array.isArray(data)) throw new Error(`Resposta inesperada — esperado array, recebido: ${typeof data}.`);

  SysLogger.log('BestRates', 'INFO',
    `${tipo}: ${data.length} itens retornados pela API.`
  );

  return data.map(item => [
    Sanitizador.textoPuro(item.symbol),                        // OPTION_TICKER
    item.due_date ? Sanitizador.dataSoData(item.due_date) : '',                              // EXPIRY
    Sanitizador.numeroPuro(item.financial_volume),             // VOLUME_FIN
    Sanitizador.numeroPuro(item.profit_rate_if_excercised),    // PROFIT_RATE_IF_EXERCISED
    Sanitizador.textoPuro(item.type),                          // CATEGORY
    Sanitizador.textoPuro(item.underlying),                    // TICKER
    item.updated_at ? Sanitizador.dataPura(item.updated_at) : '', // UPDATED_AT
    Sanitizador.numeroPuro(item.ve_over_strike),               // VE_OVER_STRIKE
    Sanitizador.numeroPuro(item.days_to_maturity),             // DTE_CALENDAR
    Sanitizador.numeroPuro(item.strike),                       // STRIKE
    Sanitizador.numeroPuro(item.spot_strike_ratio),            // SPOT_STRIKE_RATIO
    item.name              || '',                              // COMPANY_NAME
    item.sector            || '',                              // SECTOR
  ]);
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
function _garantirAbaBestRates(ss) {
  const nome  = BEST_RATES_CONFIG.SHEET_NAME;
  let   sheet = ss.getSheetByName(nome);

  if (!sheet) {
    sheet = ss.insertSheet(nome);
    SysLogger.log('BestRates', 'INFO', `Aba "${nome}" criada automaticamente.`);
  }

  // Atualiza cabeçalho sempre (garante consistência mesmo após mudanças)
  sheet
    .getRange(1, 1, 1, BEST_RATES_HEADERS.length)
    .setValues([BEST_RATES_HEADERS]);

  return sheet;
}

function _limparDadosBestRates(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet
      .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
      .clearContent();
  }
}

// ─── Teste de homologação ─────────────────────────────────────────────────────
function testBestCoveredOptionsRates() {
  console.log('=== HOMOLOGAÇÃO 015_SyncBestCoveredOptionsRates v1.0 ===');

  ['PUT', 'CALL'].forEach(tipo => {
    console.log(`\nTestando tipo: ${tipo}`);
    const linhas = _buscarRatesPorTipo(tipo);
    console.log(`  Itens retornados: ${linhas.length}`);
    console.log(`  Colunas por linha: ${linhas[0] ? linhas[0].length : 0} (esperado: ${BEST_RATES_HEADERS.length})`);

    if (linhas.length > 0) {
      const primeira = {};
      BEST_RATES_HEADERS.forEach((h, i) => { primeira[h] = linhas[0][i]; });
      console.log(`  Primeiro item mapeado:`);
      console.log(JSON.stringify(primeira, null, 2));
    }
  });

  SysLogger.flush();
  console.log('\n=== FIM ===');
}