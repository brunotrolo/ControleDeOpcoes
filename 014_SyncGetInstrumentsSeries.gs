/**
 * @fileoverview OPLab_SeriesInstrumento.gs - v2.0
 * ═══════════════════════════════════════════════════════════════
 * RESPONSABILIDADE: Buscar séries de opções por ativo e gravar
 *   na aba SERIES_OPCOES_INSTRUMENTO (uma linha por opção).
 *
 * ENDPOINT:
 *   GET /market/instruments/series/{symbol}
 *   https://apidocs.oplab.com.br/#tag/Instrumentos/operation/GetInstrumentsSeries
 *
 * ESTRUTURA DO RESPONSE (3 níveis):
 *   root          → campos do ativo-mãe (cols 1-22)
 *   series[]      → vencimento + DTE (cols 23-24)
 *   strikes[].call/put → dados da opção (cols 25-40)
 *
 * INTEGRAÇÃO COM A INFRAESTRUTURA:
 *   000 → OplabService._getHeaders() + ApiClient._fetchData()
 *   001 → SYS_CONFIG.SHEETS.SERIES_INSTR
 *   003 → Sanitizador.numeroPuro() / textoPuro() / dataPura()
 *   004 → SysLogger.log() / SysLogger.flush()
 *         DataExtractorService.extractActiveCockpit()
 *   005 → _menuBridge()
 *
 * PATCH NECESSÁRIO EM 001_CoreServiceConfig.gs:
 *   Adicionar ao SYS_CONFIG.SHEETS:
 *   SERIES_INSTR: "SERIES_OPCOES_INSTRUMENTO"
 * ═══════════════════════════════════════════════════════════════
 */

// ─── Cabeçalho exato da aba (40 colunas) ─────────────────────────────────────
const SERIES_INSTR_HEADERS = [
  // Seção 1: Ativo-mãe (cols 1-22)
  'TICKER', 'COMPANY_NAME', 'OPEN', 'HIGH', 'LOW', 'CLOSE',
  'VARIATION', 'VOLUME_QTY', 'VOLUME_FIN', 'BID', 'ASK',
  'BID_VOL', 'ASK_VOL', 'UPDATED_AT', 'LAST_TRADE_AT',
  'CONTRACT_SIZE', 'SHORT_TERM_TREND', 'MID_TERM_TREND',
  'STDV_1Y', 'EWMA_CURRENT', 'IV_CURRENT', 'BETA_IBOV',
  // Seção 2: Série / vencimento (cols 23-24)
  'EXPIRY', 'DTE_CALENDAR',
  // Seção 3: Opção call/put (cols 25-40)
  'OPTION_TICKER', 'CATEGORY', 'STRIKE', 'MATURITY_TYPE',
  'OPTION_OPEN', 'OPTION_HIGH', 'OPTION_LOW', 'OPTION_CLOSE',
  'OPTION_BID', 'OPTION_ASK', 'OPTION_VOLUME_QTY', 'OPTION_VOLUME_FIN',
  'OPTION_VARIATION', 'OPTION_CONTRACT_SIZE', 'MARKET_MAKER', 'OPTION_UPDATED_AT'
];

// ─── Ponto de entrada ─────────────────────────────────────────────────────────
function SyncSeriesInstrumento_Menu() {
  _menuBridge('OPLab Series Instrumento', orquestrarSyncSeriesInstrumento);
}

// ─── Orquestrador ─────────────────────────────────────────────────────────────
function orquestrarSyncSeriesInstrumento() {
  const tInicio = Date.now();
  SysLogger.log('SeriesInstrumento', 'START',
    '>>> INICIANDO SYNC SÉRIES DE OPÇÕES (OPLab) <<<',
    JSON.stringify({ aba_destino: SYS_CONFIG.SHEETS.SERIES_INSTR, timestamp: new Date().toISOString() })
  );

  // ── 1. Fonte: DADOS_ATIVOS (todos os ativos monitorados) ───────────────────
  // Nota: NÃO usamos extractActiveCockpit() pois esse método retorna apenas
  // os tickers com posição ATIVA no COCKPIT. Para séries de opções queremos
  // TODOS os ativos da aba DADOS_ATIVOS, independente de posição aberta.
  const tickers = DataExtractorService.extractTodosAtivos();

  if (!tickers || tickers.length === 0) {
    SysLogger.log('SeriesInstrumento', 'AVISO',
      'Nenhum ticker encontrado na aba DADOS_ATIVOS.',
      `Aba esperada: ${SYS_CONFIG.SHEETS.ASSETS}`
    );
    return;
  }

  SysLogger.log('SeriesInstrumento', 'INFO',
    `${tickers.length} ticker(s) encontrado(s) em DADOS_ATIVOS.`,
    JSON.stringify({ tickers })
  );

  // ── 2. Garante aba de destino com cabeçalho ────────────────────────────────
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = _garantirAba(ss);
  SysLogger.log('SeriesInstrumento', 'INFO',
    `Aba destino pronta: "${SYS_CONFIG.SHEETS.SERIES_INSTR}" (${SERIES_INSTR_HEADERS.length} colunas).`
  );

  // ── 3. Limpa a aba UMA VEZ antes de começar ───────────────────────────────
  // Estratégia: gravar por ticker imediatamente após a coleta (batch incremental).
  // Vantagem vs bulk: distribui o I/O do Sheets ao longo da execução, evitando
  // o gargalo de 60s+ ao gravar 15k+ linhas de uma vez no final.
  _limparDados(sheet);
  let proximaLinha = 2; // cursor de escrita — avança a cada ticker gravado

  const erros  = [];
  const resumo = [];

  tickers.forEach((ticker, idx) => {
    const tTicker = Date.now();
    SysLogger.log('SeriesInstrumento', 'INFO',
      `[${idx + 1}/${tickers.length}] Buscando séries: ${ticker}...`
    );

    try {
      // ── 3a. Coleta via API ───────────────────────────────────────────────
      const linhas    = _buscarSeriesPorTicker(ticker);
      const tGravacao = Date.now(); // marco: API terminou, gravação começa

      // ── 3b. Grava imediatamente na aba (batch por ticker) ────────────────
      if (linhas.length > 0) {
        sheet
          .getRange(proximaLinha, 1, linhas.length, SERIES_INSTR_HEADERS.length)
          .setValues(linhas);
        proximaLinha += linhas.length;

        const tFim = Date.now(); // marco: gravação terminou

        // Tempos calculados com 3 marcos: tTicker → tGravacao → tFim
        const duracaoApi = ((tGravacao - tTicker) / 1000).toFixed(2);
        const duracaoGs  = ((tFim      - tGravacao) / 1000).toFixed(2);
        const duracaoTotal = ((tFim    - tTicker) / 1000).toFixed(2);

        const info = {
          ticker,
          opcoes:          linhas.length,
          duracao_api_s:   duracaoApi,
          duracao_gs_s:    duracaoGs,
          duracao_total_s: duracaoTotal,
          proxima_linha:   proximaLinha
        };
        resumo.push({ ticker, opcoes: linhas.length, duracao_s: duracaoTotal });

        SysLogger.log('SeriesInstrumento', 'SUCESSO',
          `[${idx + 1}/${tickers.length}] ${ticker}: ${linhas.length} opções gravadas. API: ${duracaoApi}s | GS: ${duracaoGs}s | Total: ${duracaoTotal}s`,
          JSON.stringify(info)
        );
      } else {
        const duracaoTotal = ((Date.now() - tTicker) / 1000).toFixed(2);
        SysLogger.log('SeriesInstrumento', 'AVISO',
          `[${idx + 1}/${tickers.length}] ${ticker}: 0 opções retornadas (API sem dados filtráveis).`
        );
        resumo.push({ ticker, opcoes: 0, duracao_s: duracaoTotal });
      }

    } catch (e) {
      const info = { ticker, erro: e.message };
      erros.push(info);
      SysLogger.log('SeriesInstrumento', 'ERRO',
        `[${idx + 1}/${tickers.length}] ${ticker}: falha na coleta.`,
        JSON.stringify(info)
      );
    }
  });

  // ── 4. Flush final ─────────────────────────────────────────────────────────
  SpreadsheetApp.flush();

  // ── 5. Validação do resultado ──────────────────────────────────────────────
  const totalOpcoes = proximaLinha - 2; // linhas gravadas = cursor - linha inicial

  if (totalOpcoes === 0) {
    SysLogger.log('SeriesInstrumento', 'AVISO',
      'Nenhuma linha gravada.',
      JSON.stringify({ tickers_com_erro: erros })
    );
    SysLogger.flush();
    return;
  }

  // ── 6. Log de encerramento ─────────────────────────────────────────────────
  const duracaoTotal = ((Date.now() - tInicio) / 1000).toFixed(1);
  const tickersOk    = resumo.filter(r => r.opcoes > 0).length;
  const tickersErro  = erros.length;

  SysLogger.log('SeriesInstrumento', 'FINISH',
    `>>> SYNC CONCLUÍDO: ${totalOpcoes} opções | ${tickersOk} tickers OK | ${tickersErro} erros | ${duracaoTotal}s <<<`,
    JSON.stringify({
      total_opcoes:      totalOpcoes,
      tickers_ok:        tickersOk,
      tickers_erro:      tickersErro,
      duracao_total_s:   duracaoTotal,
      resumo_por_ticker: resumo,
      erros:             erros.length > 0 ? erros : null
    })
  );
  SysLogger.flush();
}

// ─── Busca e expande a série de um ticker ─────────────────────────────────────
function _buscarSeriesPorTicker(ticker) {
  const url  = `${OplabService._baseUrl}/market/instruments/series/${encodeURIComponent(ticker)}`;
  SysLogger.log('SeriesInstrumento', 'INFO',
    `API call: GET /market/instruments/series/${ticker}`
  );

  const data = ApiClient._fetchData(url, { headers: OplabService._getHeaders() });

  if (!data)                   throw new Error('Resposta nula da API.');
  if (!Array.isArray(data.series)) throw new Error('Campo "series" ausente ou inválido.');

  const totalSeries  = data.series.length;
  const totalStrikes = data.series.reduce((s, serie) => s + (serie.strikes || []).length, 0);

  SysLogger.log('SeriesInstrumento', 'INFO',
    `${ticker}: ${totalSeries} vencimento(s), ~${totalStrikes} strike(s) no response.`,
    JSON.stringify({
      ticker,
      close:             data.close,
      iv_current:        data.iv_current,
      short_term_trend:  data.short_term_trend,
      middle_term_trend: data.middle_term_trend,
      series_count:      totalSeries,
      strikes_brutos:    totalStrikes
    })
  );

  // ── Campos do ativo-mãe (repetidos em cada linha) ────────────────────────
  const mae = [
    Sanitizador.textoPuro(data.symbol),                    // TICKER
    data.name              || '',                           // COMPANY_NAME
    Sanitizador.numeroPuro(data.open),                     // OPEN
    Sanitizador.numeroPuro(data.high),                     // HIGH
    Sanitizador.numeroPuro(data.low),                      // LOW
    Sanitizador.numeroPuro(data.close),                    // CLOSE
    Sanitizador.numeroPuro(data.variation),                // VARIATION
    Sanitizador.numeroPuro(data.volume),                   // VOLUME_QTY
    Sanitizador.numeroPuro(data.financial_volume),         // VOLUME_FIN
    Sanitizador.numeroPuro(data.bid),                      // BID
    Sanitizador.numeroPuro(data.ask),                      // ASK
    Sanitizador.numeroPuro(data.bid_volume),               // BID_VOL
    Sanitizador.numeroPuro(data.ask_volume),               // ASK_VOL
    Sanitizador.dataPura(data.time),                       // UPDATED_AT
    data.last_trade_at ? Sanitizador.dataPura(data.last_trade_at) : '', // LAST_TRADE_AT
    Sanitizador.numeroPuro(data.contract_size),            // CONTRACT_SIZE
    Sanitizador.numeroPuro(data.short_term_trend),         // SHORT_TERM_TREND
    Sanitizador.numeroPuro(data.middle_term_trend),        // MID_TERM_TREND
    Sanitizador.numeroPuro(data.stdv_1y),                  // STDV_1Y
    Sanitizador.numeroPuro(data.ewma_current),             // EWMA_CURRENT
    Sanitizador.numeroPuro(data.iv_current),               // IV_CURRENT
    Sanitizador.numeroPuro(data.beta_ibov),                // BETA_IBOV
  ];

  const linhas = [];

  // ── Itera series[] → strikes[] → call/put ────────────────────────────────
  data.series.forEach(serie => {
    const expiry = serie.due_date ? Sanitizador.dataSoData(serie.due_date) : '';
    const dte    = Sanitizador.numeroPuro(serie.days_to_maturity);

    const serieCampos = [expiry, dte]; // EXPIRY, DTE_CALENDAR

    (serie.strikes || []).forEach(strikeObj => {
      const strikeVal = Sanitizador.numeroPuro(strikeObj.strike);

      // Processa CALL e PUT do mesmo strike
      ['call', 'put'].forEach(lado => {
        const op = strikeObj[lado];
        if (!op) return; // strike pode não ter os dois lados

        linhas.push([
          ...mae,
          ...serieCampos,
          // Seção 3: Opção
          Sanitizador.textoPuro(op.symbol),              // OPTION_TICKER
          Sanitizador.textoPuro(op.category),            // CATEGORY
          strikeVal,                                     // STRIKE (do nível strikes[])
          Sanitizador.textoPuro(op.maturity_type),       // MATURITY_TYPE
          Sanitizador.numeroPuro(op.open),               // OPTION_OPEN
          Sanitizador.numeroPuro(op.high),               // OPTION_HIGH
          Sanitizador.numeroPuro(op.low),                // OPTION_LOW
          Sanitizador.numeroPuro(op.close),              // OPTION_CLOSE
          Sanitizador.numeroPuro(op.bid),                // OPTION_BID
          Sanitizador.numeroPuro(op.ask),                // OPTION_ASK
          Sanitizador.numeroPuro(op.volume),             // OPTION_VOLUME_QTY
          Sanitizador.numeroPuro(op.financial_volume),   // OPTION_VOLUME_FIN
          Sanitizador.numeroPuro(op.variation),          // OPTION_VARIATION
          Sanitizador.numeroPuro(op.contract_size),      // OPTION_CONTRACT_SIZE
          op.market_maker === true ? true : false,       // MARKET_MAKER
          op.time ? Sanitizador.dataPura(op.time) : ''  // OPTION_UPDATED_AT
        ]);
      });
    });
  });

  return linhas;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────
function _garantirAba(ss) {
  const nome  = 'SERIES_OPCOES_INSTRUMENTO';
  let   sheet = ss.getSheetByName(nome);

  if (!sheet) {
    sheet = ss.insertSheet(nome);
    SysLogger.log('SeriesInstrumento', 'INFO', `Aba "${nome}" criada.`);
  }

  // Garante cabeçalho atualizado sempre
  sheet
    .getRange(1, 1, 1, SERIES_INSTR_HEADERS.length)
    .setValues([SERIES_INSTR_HEADERS]);

  return sheet;
}

function _limparDados(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet
      .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
      .clearContent();
  }
}

// ─── Teste de homologação ─────────────────────────────────────────────────────
function testSeriesInstrumento() {
  console.log('=== HOMOLOGAÇÃO OPLab_SeriesInstrumento v2.0 ===');

  // Usa extractTodosAtivos — mesma fonte do orquestrador
  const tickers = DataExtractorService.extractTodosAtivos();

  if (tickers.length === 0) {
    console.log('Nenhum ticker encontrado em DADOS_ATIVOS.');
    return;
  }

  console.log(`Tickers disponíveis (${tickers.length}): ${tickers.join(', ')}`);

  // Testa apenas o primeiro para não gastar muita cota
  const ticker = tickers[0];
  console.log(`\nTestando API com: ${ticker}`);

  const linhas = _buscarSeriesPorTicker(ticker);
  console.log(`Linhas geradas: ${linhas.length}`);
  console.log(`Colunas por linha: ${linhas[0] ? linhas[0].length : 0} (esperado: ${SERIES_INSTR_HEADERS.length})`);

  if (linhas.length > 0) {
    const primeira = {};
    SERIES_INSTR_HEADERS.forEach((h, i) => { primeira[h] = linhas[0][i]; });
    console.log('Primeira linha (mapeada):');
    console.log(JSON.stringify(primeira, null, 2));
  }

  SysLogger.flush();
  console.log('=== FIM ===');
}