/**
 * @fileoverview CoreCalcGreeks - v6.2 (Performance In-Memory & Selic Dinâmica)
 * AÇÃO: Calcula Gregas e IV internamente via Black-Scholes (Newton-Raphson).
 * PROTEÇÃO: Sanitização estrita de Insumos para proteger a Matemática Pura.
 * PERFORMANCE: 100% In-Memory Update e Batch Write Real.
 */

// ============================================================================
// MOTOR MATEMÁTICO (Imutável — Não alterar)
// ============================================================================

const OptionMath = {
  DIAS_ANO: 252,
  T_MIN: 0.002,

  pdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); },

  cdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  },

  calculate(S, K, T, r, sigma, flag) {
    T = Math.max(T, this.T_MIN);
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - (sigma * sqrtT);

    const nd1 = this.pdf(d1);
    const Nd1 = this.cdf(d1);
    const Nd2 = this.cdf(d2);
    const expRT = Math.exp(-r * T);

    const isCall = (flag.toLowerCase() === 'c' || flag.toLowerCase() === 'call');

    return {
      price: isCall ? (S * Nd1 - K * expRT * Nd2) : (K * expRT * this.cdf(-d2) - S * this.cdf(-d1)),
      delta: isCall ? Nd1 : Nd1 - 1,
      gamma: nd1 / (S * sigma * sqrtT),
      vega:  (S * nd1 * sqrtT) / 100,
      theta: (isCall ?
              (-(S * nd1 * sigma) / (2 * sqrtT) - r * K * expRT * Nd2) :
              (-(S * nd1 * sigma) / (2 * sqrtT) + r * K * expRT * this.cdf(-d2))) / this.DIAS_ANO,
      rho:   (isCall ? (K * T * expRT * Nd2) : (-K * T * expRT * this.cdf(-d2))) / 100,
      poe:   isCall ? Nd2 : this.cdf(-d2)
    };
  },

  estimateIV(S, K, T, r, marketPrice, flag) {
    let sigma = 0.35;
    for (let i = 0; i < 50; i++) {
      const g    = this.calculate(S, K, T, r, sigma, flag);
      const diff = g.price - marketPrice;
      if (Math.abs(diff) < 0.0001) return sigma;
      const v = g.vega * 100;
      if (v < 0.0001) break;
      sigma -= diff / v;
      if (sigma < 0.01) return 0.01;
      if (sigma > 5.0)  return 5.0;
    }
    return sigma;
  },

  getMoneynessCode(S, K, flag) {
    const ratio  = S / K;
    if (ratio >= 0.975 && ratio <= 1.025) return 'ATM';
    const isCall = (String(flag).toLowerCase() === 'c' || String(flag).toLowerCase() === 'call');
    if ((isCall && ratio > 1.025) || (!isCall && ratio < 0.975)) return 'ITM';
    return 'OTM';
  }
};

// ============================================================================
// MOTOR DE CÁLCULO E SINCRONIZAÇÃO
// ============================================================================

const GreeksCalculator = {
  _serviceName: "GreeksCalculator_v6.2",

  run() {
    const inicio = Date.now();
    const ss     = SpreadsheetApp.getActiveSpreadsheet();

    const cacheCalculos = {};
    const stats = { lidos: 0, ativos: 0, gravados: 0, skip_expirado: 0, erros: 0, cache_hits: 0 };
    const errosDetalhes    = [];
    const tickersAtualizados = [];
    const tickersNovos       = [];

    SysLogger.log(this._serviceName, "START", ">>> INICIANDO CÁLCULO NATIVO (BS) <<<", "");

    try {
      const abaImport  = ss.getSheetByName(SYS_CONFIG.SHEETS.IMPORT);
      const abaCalc    = ss.getSheetByName(SYS_CONFIG.SHEETS.GREEKS_CALC);
      const abaDetails = ss.getSheetByName(SYS_CONFIG.SHEETS.DETAILS);
      const abaAssets  = ss.getSheetByName(SYS_CONFIG.SHEETS.ASSETS);
      const abaConfig  = ss.getSheetByName("Config_Global"); // Aba de configurações adicionada

      if (!abaCalc || !abaImport) throw new Error("Aba IMPORT ou CALC_GREEKS não encontrada.");

      // 🚀 NOVO: Captura Dinâmica da Selic
      let irate = 0.1075; // Fallback
      if (abaConfig) {
        const configData = abaConfig.getDataRange().getValues();
        configData.forEach(row => {
          if (String(row[0]).trim() === "Taxa_Selic_Anual") {
            irate = Sanitizador.numeroPuro(String(row[1]).replace(',', '.')) || 0.1075;
          }
        });
      }

      // Centralizado via DataUtils
      const colI       = DataUtils.getColMap(abaImport);
      const colC       = DataUtils.getColMap(abaCalc);
      const detailsMap = DataUtils.getDynamicMap(abaDetails, "ID_TRADE");
      const assetsMap  = DataUtils.getDynamicMap(abaAssets, "TICKER");

      const idToRowMap = {};
      const lastRowCalc = abaCalc.getLastRow();
      if (lastRowCalc > 1) {
        const ids = abaCalc.getRange(2, colC.ID_TRADE + 1, lastRowCalc - 1, 1).getValues();
        ids.forEach((l, i) => { if (l[0]) idToRowMap[String(l[0]).trim()] = i + 2; });
      }

      // SAQUE ÚNICO: lê toda a matriz de cálculo antes do loop
      const totalCols = abaCalc.getLastColumn();
      const totalRows = lastRowCalc;
      const matrizExistente = totalRows > 1
          ? abaCalc.getRange(2, 1, totalRows - 1, totalCols).getValues()
          : [];

      const valoresImport  = abaImport.getDataRange().getValues();
      const listaParaNovos = [];

      for (let i = 1; i < valoresImport.length; i++) {
        const linha       = valoresImport[i];
        const idTrade     = String(linha[colI.ID_TRADE]      || "").trim();
        const optTicker   = String(linha[colI.OPTION_TICKER] || "").trim();

        if (!idTrade || idTrade.length < 5) continue;
        stats.lidos++;

        var expiryValor = linha[colI.EXPIRY];
        var expiryDate = expiryValor instanceof Date ? expiryValor : new Date(expiryValor);
        expiryDate.setHours(0, 0, 0, 0);
        var hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (isNaN(expiryDate.getTime()) || expiryDate < hoje) {
          stats.skip_expirado++;
          continue;
        }
        stats.ativos++;

        const detail = detailsMap[idTrade];
        const asset  = detail ? assetsMap[detail.TICKER] : null;

        if (!detail || !asset) {
          stats.erros++;
          errosDetalhes.push(`${optTicker} (Falta Insumos)`);
          continue;
        }

        let resBS = cacheCalculos[optTicker] || null;

        if (!resBS) {
          // FIREWALL MATEMÁTICO: Impede NaN de entrar no cálculo
          const S            = Sanitizador.numeroPuro(asset.SPOT)          || 1;
          const K            = Sanitizador.numeroPuro(detail.STRIKE)       || 1;
          const T_dias       = Sanitizador.numeroPuro(detail.DTE_CALENDAR) || 1;
          const T_anos       = T_dias / OptionMath.DIAS_ANO;
          const flag         = String(detail.OPTION_TYPE || "c").toLowerCase() === 'call' ? 'c' : 'p';
          const precoMercado = Sanitizador.numeroPuro(detail.CLOSE) || 0.01;

          try {
            const iv   = OptionMath.estimateIV(S, K, T_anos, irate, precoMercado, flag);
            resBS      = OptionMath.calculate(S, K, T_anos, irate, iv, flag);
            resBS.volatility     = iv;
            resBS.moneyness_code = OptionMath.getMoneynessCode(S, K, detail.OPTION_TYPE);
            resBS.moneyness_val  = S / K;

            cacheCalculos[optTicker] = resBS;
          } catch (mathErr) {
            stats.erros++;
            errosDetalhes.push(`${optTicker} (Erro Newton-Raphson)`);
            continue;
          }
        } else {
          stats.cache_hits++;
        }

        if (resBS) {
          const rowNum = idToRowMap[idTrade];

          // USA A MATRIZ EM RAM
          let linhaFinal = rowNum
              ? matrizExistente[rowNum - 2].slice() // Clona a linha para modificar
              : new Array(totalCols).fill("");

          // MAPEAMENTO ABSOLUTO COM SANITIZAÇÃO PÓS-CÁLCULO
          const dadosMapeados = {
            ID_TRADE:        Sanitizador.textoPuro(idTrade),
            OPTION_TICKER:   Sanitizador.textoPuro(optTicker),
            ID_STRATEGY:     Sanitizador.textoPuro(linha[colI.ID_STRATEGY]),
            UPDATED_AT:      new Date(),
            DELTA:           Sanitizador.numeroPuro(resBS.delta),
            GAMMA:           Sanitizador.numeroPuro(resBS.gamma),
            VEGA:            Sanitizador.numeroPuro(resBS.vega),
            THETA:           Sanitizador.numeroPuro(resBS.theta),
            RHO:             Sanitizador.numeroPuro(resBS.rho),
            POE:             Sanitizador.numeroPuro(resBS.poe),
            PRICE:           Sanitizador.numeroPuro(resBS.price),
            IV_CALC:         Sanitizador.numeroPuro(resBS.volatility),
            MONEYNESS:       Sanitizador.textoPuro(resBS.moneyness_code),
            MONEYNESS_RATIO: Sanitizador.numeroPuro(resBS.moneyness_val),
            SPOT:            Sanitizador.numeroPuro(asset.SPOT),
            STRIKE:          Sanitizador.numeroPuro(detail.STRIKE)
          };

          for (const label in colC) {
            const idx = colC[label];
            if (dadosMapeados[label] !== undefined) {
              linhaFinal[idx] = dadosMapeados[label];
            }
          }

          // 🚀 NOVO: Atualiza direto na matriz ou prepara para inclusão
          if (rowNum) {
            matrizExistente[rowNum - 2] = linhaFinal; // Atualiza IN-MEMORY
            tickersAtualizados.push(optTicker);
          } else {
            listaParaNovos.push(linhaFinal);
            tickersNovos.push(optTicker);
            idToRowMap[idTrade] = totalRows + listaParaNovos.length; // Mantém o mapa atualizado
          }
          stats.gravados++;
        }
      }

      // 🚀 GRAVAÇÃO EM LOTE REAL (Alta Performance sem Timeout)
      if (matrizExistente.length > 0) {
        abaCalc.getRange(2, 1, matrizExistente.length, totalCols).setValues(matrizExistente);
      }

      if (listaParaNovos.length > 0) {
        // Usa o getLastRow da aba novamente para garantir o ponto exato de inserção
        abaCalc.getRange(abaCalc.getLastRow() + 1, 1, listaParaNovos.length, totalCols).setValues(listaParaNovos);
      }

      const duracaoFinal = ((Date.now() - inicio) / 1000).toFixed(1);

      const payloadLog = {
        metricas_gerais: {
          total_linhas_lidas:   stats.lidos,
          ignorados_expirados:  stats.skip_expirado,
          ativos_calculados:    stats.gravados,
          uso_de_cache:         stats.cache_hits,
          falhas:               stats.erros
        },
        detalhamento: {
          novos_inseridos:   tickersNovos.length      > 0 ? tickersNovos      : "Nenhum",
          atualizados:       tickersAtualizados.length > 0 ? tickersAtualizados : "Nenhum",
          erros_matematicos: errosDetalhes.length     > 0 ? errosDetalhes     : "Nenhum"
        }
      };

      SysLogger.log(this._serviceName, "FINISH", `>>> CÁLCULO NATIVO CONCLUÍDO EM ${duracaoFinal}s <<<`, JSON.stringify(payloadLog));
      SysLogger.flush();

    } catch (e) {
      SysLogger.log(this._serviceName, "CRITICO", "Falha catastrófica no motor nativo", String(e.message));
      SysLogger.flush();
    }
  }
};

// ============================================================================
// PONTO DE ENTRADA (Trigger Dinâmico / Menu)
// ============================================================================

function calcularGregasNativo() {
  GreeksCalculator.run();
}

