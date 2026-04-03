/**
 * @fileoverview CoreSyncStockOptionsDataHistory - v2.0 (Incremental)
 * ACAO: Sincroniza historico diario de cotacoes de opcoes ativas da NECTON_IMPORT
 *       na aba DADOS_DETALHES_HISTORICO250D usando logica incremental pura.
 *
 * REGRAS DE NEGOCIO:
 *   1. Le NECTON_IMPORT e identifica opcoes ativas (EXPIRY >= hoje)
 *   2. Para cada OPTION_TICKER unico:
 *      - SE nao existe na aba de historico:
 *          FROM = EXPIRY - 250d  |  TO = ontem  (carga inicial)
 *      - SE ja existe:
 *          FROM = MAX(CANDLE_DATE) + 1d  |  TO = ontem  (append incremental)
 *      - SE FROM > TO ou FROM > EXPIRY: skip (ja atualizado ou expirado)
 *   3. Nunca sobrescreve linhas existentes -- apenas append
 *   4. Uma CANDLE_DATE nunca se repete por OPTION_TICKER
 *
 * CABECALHO DA ABA (24 colunas):
 *   ID_TRADE | UPDATED_AT | OPTION_TICKER | TICKER | OPTION_TYPE | DIRECTION |
 *   EXPIRY | STRIKE | MATURITY_TYPE | ORDER_DATE | ENTRY_PRICE |
 *   CANDLE_DATE | CLOSE | SPOT | DTE_CALENDAR | MONEYNESS_CODE |
 *   DELTA | GAMMA | VEGA | THETA | RHO | IV_HIST | POE | BS_PRICE
 *
 * PADROES DO PROJETO: ES5 puro, sem non-ASCII no codigo, Sanitizador, SysLogger.
 */

var OptionsHistorySync = {
  _serviceName: "OptionsHistorySync_v2.0",
  _diasJanela:  250,
  _sleepMs:     1200,

  // ============================================================================
  // PONTO DE ENTRADA PRINCIPAL
  // ============================================================================
  run: function() {
    var inicio = Date.now();
    var stats  = { ativos: 0, cargaInicial: 0, incremento: 0, skip: 0, erros: 0, linhasNovas: 0 };
    var errosDetalhe = [];
    var skipsDetalhe      = []; // acumula SKIPs -- log unico no FINISH
    var incrementosBuffer = []; // acumula INCREMENTOs -- log unico apos o loop

    SysLogger.log(this._serviceName, "START", ">>> INICIANDO HISTORICO INCREMENTAL DE OPCOES <<<", "");

    try {
      var ss          = SpreadsheetApp.getActiveSpreadsheet();
      var abaImport   = ss.getSheetByName(SYS_CONFIG.SHEETS.IMPORT);
      if (!abaImport) throw new Error("Aba NECTON_IMPORT nao encontrada.");

      var ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      ontem.setHours(0, 0, 0, 0);

      var hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // ------------------------------------------------------------------
      // PASSO 1: Ler NECTON_IMPORT -- mapa { OPTION_TICKER -> dadosOp }
      // ------------------------------------------------------------------
      var mapaAtivos    = this._lerNectonImport(abaImport, hoje);
      var tickersAtivos = Object.keys(mapaAtivos);
      stats.ativos      = tickersAtivos.length;

      if (tickersAtivos.length === 0) {
        SysLogger.log(this._serviceName, "INFO", "Nenhuma opcao ativa encontrada. Encerrando.", "");
        SysLogger.flush();
        return;
      }

      SysLogger.log(this._serviceName, "INFO",
        tickersAtivos.length + " opcoes ativas",
        tickersAtivos.join(", "));

      // ------------------------------------------------------------------
      // PASSO 2: Ler aba de historico -- cursor { OPTION_TICKER -> MAX(CANDLE_DATE) }
      // ------------------------------------------------------------------
      var abaHist = ss.getSheetByName(SYS_CONFIG.SHEETS.HIST_OPCOES_250D);
      if (!abaHist) {
        abaHist = ss.insertSheet(SYS_CONFIG.SHEETS.HIST_OPCOES_250D);
        SysLogger.log(this._serviceName, "INFO",
          "Aba criada: " + SYS_CONFIG.SHEETS.HIST_OPCOES_250D, "");
        this._gravarCabecalho(abaHist);
      } else if (abaHist.getLastRow() < 1) {
        this._gravarCabecalho(abaHist);
      }

      var cursores = this._lerCursores(abaHist);

      // ------------------------------------------------------------------
      // PASSO 3: Loop por ticker -- determina janela e chama API
      // ------------------------------------------------------------------
      var bufferNovas = [];

      for (var ti = 0; ti < tickersAtivos.length; ti++) {
        var optTicker = tickersAtivos[ti];
        var op        = mapaAtivos[optTicker];
        var fromDate, tipoSync;

        if (!cursores[optTicker]) {
          // CARGA INICIAL: comeca 250d antes do vencimento
          fromDate = new Date(op.expiry.getTime() - this._diasJanela * 86400000);
          fromDate.setHours(0, 0, 0, 0);
          tipoSync = "INICIAL";
          stats.cargaInicial++;
        } else {
          // INCREMENTO: come-a no dia seguinte ao ultimo candle gravado
          fromDate = new Date(cursores[optTicker].getTime() + 86400000);
          fromDate.setHours(0, 0, 0, 0);
          tipoSync = "INCREMENTO";
          stats.incremento++;
        }

        // Skip: ja atualizado ate ontem
        if (fromDate > ontem) {
          skipsDetalhe.push(optTicker);
          stats.skip++;
          continue;
        }

        // Skip: vencimento ultrapassado
        if (fromDate > op.expiry) {
          skipsDetalhe.push(optTicker + "(exp)");
          stats.skip++;
          continue;
        }

        // TO = min(ontem, EXPIRY)
        var toDate = ontem.getTime() < op.expiry.getTime() ? ontem : op.expiry;

        var fromStr = this._formatDateISO(fromDate);
        var toStr   = this._formatDateISO(toDate);

        // Acumula no buffer -- log unico apos o loop
        incrementosBuffer.push({ ticker: optTicker, tipo: tipoSync, from: fromStr, to: toStr });

        // Chamada API
        var resAPI = OplabService.getHistoricalOptions(
          op.spotTicker, fromStr, toStr, optTicker
        );

        if (!resAPI || !Array.isArray(resAPI) || resAPI.length === 0) {
          stats.erros++;
          errosDetalhe.push(optTicker + " [" + fromStr + "->" + toStr + "]");
          // Marca o buffer do incremento como sem dados
          if (incrementosBuffer.length) incrementosBuffer[incrementosBuffer.length-1].ok = false;
        } else {
          var filtrados = this._filtrarPorTicker(resAPI, optTicker);
          var linhas    = this._montarLinhas(op, filtrados);
          bufferNovas   = bufferNovas.concat(linhas);
          stats.linhasNovas += linhas.length;

          // Marca o buffer com resultado positivo
          if (incrementosBuffer.length) {
            incrementosBuffer[incrementosBuffer.length-1].ok = true;
            incrementosBuffer[incrementosBuffer.length-1].candles = linhas.length;
          }
        }

        if (ti < tickersAtivos.length - 1) {
          Utilities.sleep(this._sleepMs);
        }
      }

      // ------------------------------------------------------------------
      // PASSO 4: Append -- NUNCA sobrescreve linhas existentes
      // ------------------------------------------------------------------
      if (bufferNovas.length > 0) {
        var proximaLinha = abaHist.getLastRow() + 1;
        var numCols      = this._HEADERS().length;

        abaHist.getRange(proximaLinha, 1, bufferNovas.length, numCols).setValues(bufferNovas);

        abaHist.getRange(proximaLinha, 2,  bufferNovas.length, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
        abaHist.getRange(proximaLinha, 7,  bufferNovas.length, 1).setNumberFormat("dd/MM/yyyy");
        abaHist.getRange(proximaLinha, 10, bufferNovas.length, 1).setNumberFormat("dd/MM/yyyy");
        abaHist.getRange(proximaLinha, 12, bufferNovas.length, 1).setNumberFormat("dd/MM/yyyy");
        abaHist.getRange(proximaLinha, 11, bufferNovas.length, 1).setNumberFormat('"R$"#,##0.00');
        abaHist.getRange(proximaLinha, 13, bufferNovas.length, 2).setNumberFormat('"R$"#,##0.00');
        abaHist.getRange(proximaLinha, 17, bufferNovas.length, 8).setNumberFormat("#,##0.0000");
      }

      var duracao = ((Date.now() - inicio) / 1000).toFixed(1);
      // Log consolidado de INCREMENTOs: 1 linha com JSON de todos os intervalos
      if (incrementosBuffer.length > 0) {
        var nOk  = incrementosBuffer.filter(function(x) { return x.ok; }).length;
        var nAPI = incrementosBuffer.filter(function(x) { return !x.ok; }).length;
        SysLogger.log(this._serviceName, "INCREMENTO",
          incrementosBuffer.length + " consultados | " + nOk + " ok | " + nAPI + " sem dados",
          JSON.stringify(incrementosBuffer.map(function(x) {
            return x.ticker + (x.ok ? (" +" + x.candles + "c") : " (vazia)") + " [" + x.from + "->" + x.to + "]";
          })));
      }

      // SKIPs: lista vai direto no CONTEXT do FINISH -- sem linha separada

      var payload = {
        ativos:    stats.ativos,
        inicial:   stats.cargaInicial,
        increment: stats.incremento,
        skip:      stats.skip,
        gravadas:  stats.linhasNovas,
        api_vazia: errosDetalhe.length > 0 ? errosDetalhe : null,
        skip_list: skipsDetalhe.length > 0 ? skipsDetalhe : null
      };

      SysLogger.log(this._serviceName, "FINISH",
        ">>> CONCLUIDO EM " + duracao + "s | " +
        stats.ativos + " ativos | " + stats.linhasNovas + " gravadas | " +
        stats.erros + " erros <<<",
        JSON.stringify(payload));
      SysLogger.flush();

    } catch (e) {
      SysLogger.log(this._serviceName, "CRITICO",
        "Falha fatal no motor 013", String(e.message));
      SysLogger.flush();
    }
  },

  // ============================================================================
  // PASSO 1: Le NECTON_IMPORT e retorna mapa { OPTION_TICKER -> dadosOp }
  //          Filtra apenas opcoes com EXPIRY >= hoje
  // ============================================================================
  _lerNectonImport: function(abaImport, hoje) {
    var colI    = DataUtils.getColMap(abaImport);
    var valores = abaImport.getDataRange().getValues();
    var mapa    = {};

    for (var i = 1; i < valores.length; i++) {
      var linha      = valores[i];
      var optTicker  = String(linha[colI.OPTION_TICKER] || "").trim().toUpperCase();
      var spotTicker = String(linha[colI.TICKER]        || "").trim().toUpperCase();
      var idTrade    = String(linha[colI.ID_TRADE]      || "").trim();

      if (!optTicker || !spotTicker || !idTrade) continue;
      if (mapa[optTicker]) continue; // dedup por ticker

      var expiryRaw  = linha[colI.EXPIRY];
      var expiryDate = expiryRaw instanceof Date ? expiryRaw : new Date(expiryRaw);
      expiryDate.setHours(0, 0, 0, 0);
      if (isNaN(expiryDate.getTime())) continue;

      // Somente ativas
      if (expiryDate < hoje) continue;

      var orderRaw  = linha[colI.ORDER_DATE];
      var orderDate = orderRaw instanceof Date ? orderRaw : new Date(orderRaw);
      orderDate.setHours(0, 0, 0, 0);
      if (isNaN(orderDate.getTime())) {
        orderDate = new Date(expiryDate.getTime() - this._diasJanela * 86400000);
      }

      mapa[optTicker] = {
        idTrade:    idTrade,
        optTicker:  optTicker,
        spotTicker: spotTicker,
        expiry:     expiryDate,
        orderDate:  orderDate,
        entryPrice: Sanitizador.numeroPuro(linha[colI.ENTRY_PRICE]),
        direction:  String(linha[colI.SIDE]     || "").trim().toUpperCase(),
        optionType: String(linha[colI.CATEGORY] || "").trim().toUpperCase(),
        strike:     Sanitizador.numeroPuro(linha[colI.STRIKE])
      };
    }

    return mapa;
  },

  // ============================================================================
  // PASSO 2: Le aba de historico e retorna { OPTION_TICKER -> MAX(CANDLE_DATE) }
  // ============================================================================
  _lerCursores: function(abaHist) {
    var cursores = {};
    var lastRow  = abaHist.getLastRow();
    if (lastRow < 2) return cursores;

    var colH      = DataUtils.getColMap(abaHist);
    var idxTicker = colH["OPTION_TICKER"];
    var idxCandle = colH["CANDLE_DATE"];
    if (idxTicker === undefined || idxCandle === undefined) return cursores;

    var valores = abaHist.getRange(2, 1, lastRow - 1, abaHist.getLastColumn()).getValues();

    for (var i = 0; i < valores.length; i++) {
      var ticker = String(valores[i][idxTicker] || "").trim().toUpperCase();
      if (!ticker) continue;

      var rawDate    = valores[i][idxCandle];
      var candleDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (isNaN(candleDate.getTime())) continue;
      candleDate.setHours(0, 0, 0, 0);

      if (!cursores[ticker] || candleDate > cursores[ticker]) {
        cursores[ticker] = candleDate;
      }
    }

    return cursores;
  },

  // ============================================================================
  // Filtra registros da API pelo OPTION_TICKER exato
  // Fallback: retorna tudo se o campo symbol nao estiver presente
  // ============================================================================
  _filtrarPorTicker: function(resAPI, optTicker) {
    var filtrados = [];
    for (var i = 0; i < resAPI.length; i++) {
      if (String(resAPI[i].symbol || "").toUpperCase() === optTicker) {
        filtrados.push(resAPI[i]);
      }
    }
    return filtrados.length > 0 ? filtrados : resAPI;
  },

  // ============================================================================
  // Monta linhas do buffer a partir dos registros retornados pela API
  // ============================================================================
  _montarLinhas: function(op, registros) {
    var agora  = new Date();
    var linhas = [];

    for (var i = 0; i < registros.length; i++) {
      var r          = registros[i];
      var candleDate = Sanitizador.dataPura(r.time || r.date || "");
      var spotPrice  = (r.spot && r.spot.price) ? Sanitizador.numeroPuro(r.spot.price) : 0;

      linhas.push([
        Sanitizador.textoPuro(op.idTrade),
        agora,
        Sanitizador.textoPuro(op.optTicker),
        Sanitizador.textoPuro(op.spotTicker),
        Sanitizador.textoPuro(op.optionType || r.type  || ""),
        Sanitizador.textoPuro(op.direction),
        op.expiry,
        Sanitizador.numeroPuro(op.strike    || r.strike || 0),
        Sanitizador.textoPuro(r.maturity_type           || ""),
        op.orderDate,
        op.entryPrice,
        candleDate,
        Sanitizador.numeroPuro(r.premium),
        spotPrice,
        Sanitizador.numeroPuro(r.days_to_maturity),
        Sanitizador.textoPuro(r.moneyness              || ""),
        Sanitizador.numeroPuro(r.delta),
        Sanitizador.numeroPuro(r.gamma),
        Sanitizador.numeroPuro(r.vega),
        Sanitizador.numeroPuro(r.theta),
        Sanitizador.numeroPuro(r.rho),
        Sanitizador.numeroPuro(r.volatility),
        Sanitizador.numeroPuro(r.poe),
        Sanitizador.numeroPuro(r.bs)
      ]);
    }

    return linhas;
  },

  // ============================================================================
  // Grava cabecalho (chamado apenas na criacao da aba)
  // ============================================================================
  _gravarCabecalho: function(aba) {
    var headers = this._HEADERS();
    aba.getRange(1, 1, 1, headers.length).setValues([headers]);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, headers.length)
       .setFontWeight("bold")
       .setBackground("#4F46E5")
       .setFontColor("#FFFFFF");
  },

  // ============================================================================
  // Cabecalhos da aba (24 colunas)
  // ============================================================================
  _HEADERS: function() {
    return [
      "ID_TRADE", "UPDATED_AT", "OPTION_TICKER", "TICKER", "OPTION_TYPE", "DIRECTION",
      "EXPIRY", "STRIKE", "MATURITY_TYPE", "ORDER_DATE", "ENTRY_PRICE",
      "CANDLE_DATE", "CLOSE", "SPOT", "DTE_CALENDAR", "MONEYNESS_CODE",
      "DELTA", "GAMMA", "VEGA", "THETA", "RHO", "IV_HIST", "POE", "BS_PRICE"
    ];
  },

  // ============================================================================
  // Formata Date -> "YYYY-MM-DD" sem dependencia de bibliotecas
  // ============================================================================
  _formatDateISO: function(d) {
    var ano = d.getFullYear();
    var mes = String(d.getMonth() + 1).padStart(2, "0");
    var dia = String(d.getDate()).padStart(2, "0");
    return ano + "-" + mes + "-" + dia;
  }
};

// ============================================================================
// PONTO DE ENTRADA (Trigger / Menu)
// ============================================================================

function sincronizarHistoricoOpcoes() {
  OptionsHistorySync.run();
}

// ============================================================================
// SUITE DE HOMOLOGACAO (013)
// Rode testSuiteOptionsHistorySync013() no editor GAS antes de usar em producao.
// Troque SPOT_TESTE e OPTION_TESTE por tickers reais da sua NECTON_IMPORT.
// ============================================================================

function testSuiteOptionsHistorySync013() {
  console.log("=== HOMOLOGACAO: OPTIONS HISTORY SYNC v2.0 (013) ===");

  // T1: _formatDateISO
  var d = OptionsHistorySync._formatDateISO(new Date(2026, 3, 1));
  console.log("[T1] _formatDateISO: " + d + (d === "2026-04-01" ? " OK" : " ERRO"));

  // T2: OplabService.getHistoricalOptions
  // Troque pelos tickers reais da sua NECTON_IMPORT
  var SPOT_TESTE   = "PETR4";
  var OPTION_TESTE = "PETRC425";

  var hoje    = new Date();
  var from    = new Date(hoje.getTime() - 10 * 86400000);
  var fromStr = OptionsHistorySync._formatDateISO(from);
  var toStr   = OptionsHistorySync._formatDateISO(new Date(hoje.getTime() - 86400000));

  console.log("[T2] API: " + SPOT_TESTE + " / " + OPTION_TESTE +
              " [" + fromStr + " -> " + toStr + "]");

  var res = OplabService.getHistoricalOptions(SPOT_TESTE, fromStr, toStr, OPTION_TESTE);

  if (res && Array.isArray(res) && res.length > 0) {
    console.log("[T2] OK: " + res.length + " registros.");
    console.log("[T2] Estrutura do primeiro: " + JSON.stringify(res[0]).substring(0, 300));
  } else {
    console.warn("[T2] AVISO: API vazia para " + OPTION_TESTE + ". Troque o ticker de teste.");
    console.log("[T2] Retorno bruto: " + JSON.stringify(res));
  }

  // T3: carga incremental completa
  console.log("[T3] Executando run() completo...");
  OptionsHistorySync.run();

  console.log("=== FIM DA HOMOLOGACAO ===");
}