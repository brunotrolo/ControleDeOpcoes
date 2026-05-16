/**
 * @fileoverview 014_SyncStockOptionsSelections - v6.5 (Greeks Pipeline Edition)
 * OBJETIVO: Varre o mercado buscando opções, e CALCULA AS GREGAS EM MEMÓRIA
 * antes de gravar, gerando uma tabela 100% enriquecida em lote único.
 * PADRÃO: Dicionário Universal de Dados + Auto-Headers.
 */

const CoreScannerOptions = {
  _serviceName: "CoreScanner_v6.5",
  _novasColunas: ["MID_PRICE", "SPREAD_PCT", "MONEYNESS", "MONEYNESS_RATIO", "BREAK_EVEN", "RETURN_ON_STRIKE", "IV_CALC", "DELTA", "GAMMA", "VEGA", "THETA", "RHO", "POE"],

  run() {
    const inicio = Date.now();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. LEITURA DE REGRAS E SELIC (Config_Global)
    const abaConfig = ss.getSheetByName("Config_Global");
    const dataConfig = abaConfig.getDataRange().getValues();
    const config = {};
    dataConfig.forEach(row => { if (row[0]) config[String(row[0]).trim()] = row[1]; });

    const vencimentoAlvo = config["Regra_Vencimento_Entrada_Opcoes"];
    const qtdMaxPUT      = parseInt(config["Regra_Qtd_Max_PUT"] || 10);
    const qtdMaxCALL     = parseInt(config["Regra_Qtd_Max_CALL"] || 10);

    // Captura a Selic com fallback seguro
    const selicStr = config["Taxa_Selic_Anual"] || "0.1075";
    const selic = Sanitizador.numeroPuro(String(selicStr).replace(',', '.')) || 0.1075;

    SysLogger.log(this._serviceName, "START", ">>> INICIANDO RADAR & GREGAS <<<", `Venc: ${vencimentoAlvo} | Selic: ${(selic*100).toFixed(2)}%`);

    if (!vencimentoAlvo) {
      SysLogger.log(this._serviceName, "ERRO_CRITICO", "Regra de vencimento vazia na Config_Global.", "");
      SysLogger.flush();
      return;
    }

    try {
      const abaAtivos = ss.getSheetByName(SYS_CONFIG.SHEETS.ASSETS);
      const abaSaida  = ss.getSheetByName(SYS_CONFIG.SHEETS.SELECTION_OPT);

      if (!abaAtivos || !abaSaida) throw new Error("Abas críticas não encontradas.");

      const tickers = this._getTickersAlvo(abaAtivos);
      if (tickers.length === 0) return;

      // 2. MAPA DE VOLATILIDADE FALLBACK (Para opções ilíquidas)
      const ativosData = abaAtivos.getDataRange().getValues();
      const colAtivoTicker = ativosData[0].indexOf("TICKER");
      const colAtivoIV = ativosData[0].indexOf("IV");
      const fallbackIVMap = {};

      if (colAtivoTicker > -1 && colAtivoIV > -1) {
        for (let i = 1; i < ativosData.length; i++) {
          let t = String(ativosData[i][colAtivoTicker]).trim();
          let ivVal = Sanitizador.numeroPuro(ativosData[i][colAtivoIV]);
          if (t && ivVal > 0) fallbackIVMap[t] = ivVal / 100; // Converte 40.89 para 0.4089
        }
      }

      // 3. AUTO-CRIAÇÃO DE COLUNAS (Verifica se as gregas já existem no cabeçalho)
      let headersOut = abaSaida.getRange(1, 1, 1, abaSaida.getLastColumn()).getValues()[0];
      let headersMudaram = false;

      this._novasColunas.forEach(col => {
        if (!headersOut.includes(col)) {
          headersOut.push(col);
          headersMudaram = true;
        }
      });

      if (headersMudaram) {
        abaSaida.getRange(1, 1, 1, headersOut.length).setValues([headersOut]);
      }

      // 4. LIMPEZA SEGURA DOS DADOS ANTERIORES
      const lastRowSaida = abaSaida.getLastRow();
      if (lastRowSaida > 1) {
        abaSaida.getRange(2, 1, lastRowSaida - 1, headersOut.length).clearContent();
      }

      let bufferFinal = [];
      const stats = { ativos: 0, puts: 0, calls: 0, erros: 0 };

      // 5. VARREDURA E ENRIQUECIMENTO (In-Memory)
      tickers.forEach((ticker, index) => {

        const opcoesAPI = OplabService.getOptionsByTicker(ticker);

        if (!opcoesAPI || !Array.isArray(opcoesAPI) || opcoesAPI.length === 0) {
          stats.erros++;
          return;
        }

        const filtradas = opcoesAPI.filter(op => op.due_date === vencimentoAlvo && op.spot_price > 0);
        if (filtradas.length === 0) return;

        const spot = Sanitizador.numeroPuro(filtradas[0].spot_price);
        stats.ativos++;

        // Grade Completa (Trazendo o "miolo" centralizado no Spot)
        let puts = filtradas.filter(op => op.category === "PUT");
        let calls = filtradas.filter(op => op.category === "CALL");

        puts.sort((a, b) => Math.abs(spot - a.strike) - Math.abs(spot - b.strike));
        calls.sort((a, b) => Math.abs(spot - a.strike) - Math.abs(spot - b.strike));

        let putsFinal = puts.slice(0, qtdMaxPUT).sort((a, b) => a.strike - b.strike);
        let callsFinal = calls.slice(0, qtdMaxCALL).sort((a, b) => a.strike - b.strike);

        stats.puts += putsFinal.length;
        stats.calls += callsFinal.length;

        const selecionadas = [...putsFinal, ...callsFinal];
        selecionadas.forEach(op => {
          bufferFinal.push(this._mapearParaDUD(ticker, op, spot, headersOut, selic, fallbackIVMap[ticker]));
        });

        if (index < tickers.length - 1) Utilities.sleep(700);
      });

      // 6. GRAVAÇÃO EM LOTE GLOBAL ÚNICO
      if (bufferFinal.length > 0) {
        abaSaida.getRange(2, 1, bufferFinal.length, headersOut.length).setValues(bufferFinal);
      }

      const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
      SysLogger.log(this._serviceName, "FINISH", `>>> SCANNER & GREGAS CONCLUÍDOS EM ${duracao}s <<<`, JSON.stringify({
        ativos_analisados: tickers.length,
        linhas_gravadas_com_gregas: bufferFinal.length
      }));
      SysLogger.flush();

    } catch (e) {
      SysLogger.log(this._serviceName, "CRITICO", "Falha no motor do Scanner Integrado", String(e.message));
      SysLogger.flush();
    }
  },

  _getTickersAlvo(aba) {
    const headers = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    const idx = headers.indexOf("TICKER");
    if (idx === -1) return [];
    return aba.getRange(2, idx + 1, aba.getLastRow() - 1, 1).getValues().flat().filter(t => t);
  },

  /**
   * Helper: Mapeamento Blindado e Injeção Matemática (v6.5)
   * Cobre todos os campos retornados por GET /v3/market/options/{ticker}.
   */
  _mapearParaDUD(ticker, op, spotReal, headers, selic, fallbackIV) {
    const S = Sanitizador.numeroPuro(spotReal);
    const K = Sanitizador.numeroPuro(op.strike);
    const dte = Sanitizador.numeroPuro(op.days_to_maturity);
    const bid = Sanitizador.numeroPuro(op.bid) || 0;
    const ask = Sanitizador.numeroPuro(op.ask) || 0;
    const flag = String(op.category).toLowerCase() === 'call' ? 'c' : 'p';

    // Inteligência de Precificação e Liquidez
    let midPrice = (bid > 0 && ask > 0) ? (bid + ask) / 2 : Math.max(bid, ask);
    const spreadPct = (midPrice > 0 && bid > 0 && ask > 0) ? (ask - bid) / midPrice : 0;
    const breakEven = flag === 'c' ? K + midPrice : K - midPrice;
    const returnOnStrike = K > 0 ? midPrice / K : 0;

    // Cálculo Nativo: Convocando o motor Black-Scholes Global
    const T_anos = Math.max(dte, 1) / OptionMath.DIAS_ANO;
    let ivCalc = fallbackIV || 0.35;
    let greeks = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0, poe: 0 };
    let moneynessCode = OptionMath.getMoneynessCode(S, K, flag);

    try {
      if (midPrice > 0.01 || !fallbackIV) {
        if (midPrice <= 0) midPrice = 0.05;
        ivCalc = OptionMath.estimateIV(S, K, T_anos, selic, midPrice, flag);
      }
      greeks = OptionMath.calculate(S, K, T_anos, selic, ivCalc, flag);
    } catch(e) {
      // Newton-Raphson falhou (normal em opções sem mercado), segue com zeros/fallback
    }

    // 🛡️ MAPA DEFINITIVO — cobre todos os campos da API + gregas calculadas
    const map = {
      "TICKER":          Sanitizador.textoPuro(ticker),
      "OPTION_TICKER":   Sanitizador.textoPuro(op.symbol),
      "CONTRACT_DESC":   Sanitizador.textoPuro(op.name),
      "CATEGORY":        Sanitizador.textoPuro(op.category),
      "TYPE":            Sanitizador.textoPuro(op.type || op.category),
      "STYLE":           Sanitizador.textoPuro(op.maturity_type),
      "EXCHANGE_ID":     Sanitizador.textoPuro(op.exchange_id),

      "OPEN":            Sanitizador.numeroPuro(op.open),
      "HIGH":            Sanitizador.numeroPuro(op.high),
      "LOW":             Sanitizador.numeroPuro(op.low),
      "CLOSE":           Sanitizador.numeroPuro(op.close),
      "SPOT":            S,
      "SPOT_PRICE_API":  Sanitizador.numeroPuro(op.spot_price),
      "STRIKE":          K,
      "STRIKE_EOD":      Sanitizador.numeroPuro(op.strike_eod),
      "VARIATION":       Sanitizador.numeroPuro(op.variation),

      "VOLUME_QTY":      Sanitizador.numeroPuro(op.volume),
      "VOLUME_FIN":      Sanitizador.numeroPuro(op.financial_volume),
      "TRADES":          Sanitizador.numeroPuro(op.trades),
      "BID":             bid,
      "ASK":             ask,
      "BID_VOL":         Sanitizador.numeroPuro(op.bid_volume),
      "ASK_VOL":         Sanitizador.numeroPuro(op.ask_volume),

      "LOT_SIZE":        Sanitizador.numeroPuro(op.contract_size),
      "DTE_CALENDAR":    dte,
      "ISIN":            Sanitizador.textoPuro(op.isin),
      "SECURITY_CAT":    Sanitizador.numeroPuro(op.security_category),
      "MM_FLAG":         op.market_maker ? "TRUE" : "FALSE",
      "CNPJ":            Sanitizador.textoPuro(op.cnpj),

      "EXCH_TIME": (() => {
        const val = op.time;
        if (!val || typeof val !== 'number' || val <= 0) return "";
        if (val > 946684800000) return new Date(val);
        return Sanitizador.dataPura(val);
      })(),
      "LAST_TRADE": (() => {
        const val = op.last_trade_at;
        if (!val || typeof val !== 'number' || val <= 0) return "";
        if (val > 946684800000) return new Date(val);
        return Sanitizador.dataPura(val);
      })(),
      "EXPIRY": (() => {
        let d = Sanitizador.dataPura(op.due_date);
        if (d instanceof Date) d.setHours(0, 0, 0, 0);
        return d;
      })(),
      "BLOCK_DATE":      Sanitizador.dataPura(op.block_date),
      "CREATED_AT":      Sanitizador.dataPura(op.created_at),
      "UPDATED_AT":      new Date(),

      // DADOS INJETADOS EM TEMPO DE EXECUÇÃO (Calculados — não vêm da API)
      "MID_PRICE":       Sanitizador.numeroPuro(midPrice),
      "SPREAD_PCT":      Sanitizador.numeroPuro(spreadPct),
      "MONEYNESS":       Sanitizador.textoPuro(moneynessCode),
      "MONEYNESS_RATIO": Sanitizador.numeroPuro(S / K),
      "BREAK_EVEN":      Sanitizador.numeroPuro(breakEven),
      "RETURN_ON_STRIKE":Sanitizador.numeroPuro(returnOnStrike),
      "IV_CALC":         Sanitizador.numeroPuro(ivCalc),
      "PRICE":           Sanitizador.numeroPuro(greeks.price),
      "DELTA":           Sanitizador.numeroPuro(greeks.delta),
      "GAMMA":           Sanitizador.numeroPuro(greeks.gamma),
      "VEGA":            Sanitizador.numeroPuro(greeks.vega),
      "THETA":           Sanitizador.numeroPuro(greeks.theta),
      "RHO":             Sanitizador.numeroPuro(greeks.rho),
      "POE":             Sanitizador.numeroPuro(greeks.poe)
    };

    return headers.map(h => {
      const label = String(h).trim().toUpperCase();
      if (map[label] !== undefined) return map[label];
      const valAPI = op[label.toLowerCase()];
      return (valAPI !== undefined && valAPI !== null) ? valAPI : "";
    });
  }
};

// ============================================================================
// PONTO DE ENTRADA (Trigger Dinâmico / Menu)
// ============================================================================

function atualizarScannerOpcoes() {
  CoreScannerOptions.run();
}
