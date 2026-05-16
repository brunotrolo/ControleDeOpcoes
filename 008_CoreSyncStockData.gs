/**
 * @fileoverview CoreSyncStockData - v4.3 (Resilient Edition)
 * AÇÃO: Sincroniza dados, Mapeia Chaves Ocultas e aplica Fallbacks para falhas da API.
 */

const StockDataSync = {
  _serviceName: "StockDataSync_v4.3",

  run() {
    const inicio = Date.now();

  try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const abaAtivos = ss.getSheetByName(SYS_CONFIG.SHEETS.ASSETS);
      
      if (!abaAtivos) throw new Error("Aba de Ativos não encontrada.");

      const ultimaLinhaAtivos = abaAtivos.getLastRow();
      const ultimaColunaAtivos = abaAtivos.getLastColumn();
      
      if (ultimaLinhaAtivos < 2) {
        SysLogger.log(this._serviceName, "WARN", "Aba de ativos vazia. Nenhum ticker para buscar.");
        return;
      }

      const valoresAtivos = abaAtivos.getRange(2, 1, ultimaLinhaAtivos - 1, 1).getValues();
      const tickersExistentesSet = new Set(
        valoresAtivos.flat()
          .filter(t => t && String(t).trim() !== "" && t !== "ERRO_API" && t !== "N/A")
          .map(t => String(t).trim().toUpperCase())
      );

      // Coletar tickers do NECTON_IMPORT que ainda nao estao em DADOS_ATIVOS
      // A coluna TICKER do NECTON_IMPORT ja contem o ativo-mae (ex: CSAN3, PETR4).
      // Isso garante que novos ativos operados sejam sincronizados automaticamente.
      const tickersDoNecton = new Set();
      try {
        const abaNecton = ss.getSheetByName(SYS_CONFIG.SHEETS.IMPORT);
        if (abaNecton && abaNecton.getLastRow() > 1) {
          const headersNecton = abaNecton.getRange(1, 1, 1, abaNecton.getLastColumn()).getValues()[0];
          const colTicker = headersNecton.findIndex(h => String(h).trim().toUpperCase() === 'TICKER');
          if (colTicker >= 0) {
            const valoresNecton = abaNecton.getRange(2, colTicker + 1, abaNecton.getLastRow() - 1, 1).getValues();
            valoresNecton.flat().forEach(t => {
              const ticker = String(t || '').trim().toUpperCase();
              if (ticker && ticker !== '' && ticker !== 'UNDEFINED' && ticker !== 'NULL') {
                tickersDoNecton.add(ticker);
              }
            });
          }
        }
      } catch (eNecton) {
        SysLogger.log(this._serviceName, "WARN", "Nao foi possivel ler NECTON_IMPORT.", String(eNecton.message));
      }

      // Union: tickers existentes + novos do NECTON_IMPORT
      const tickersUnion = new Set([...tickersExistentesSet, ...tickersDoNecton]);
      const tickersNovos  = [...tickersDoNecton].filter(t => !tickersExistentesSet.has(t));

      if (tickersNovos.length > 0) {
        SysLogger.log(this._serviceName, "INFO",
          "Novos tickers detectados no NECTON_IMPORT: " + tickersNovos.join(', '),
          "Serao adicionados ao DADOS_ATIVOS apos sincronizacao."
        );
      }

      const tickersAlvo = [...tickersUnion];

      if (tickersAlvo.length === 0) return;

      const cabecalhosAtivos = abaAtivos.getRange(1, 1, 1, ultimaColunaAtivos).getValues()[0];
            
      const headerMap = {};
      cabecalhosAtivos.forEach((h, i) => { 
        if(h) headerMap[String(h).trim().toUpperCase()] = i; 
      });

      const idToRowMap = {};
      if (ultimaLinhaAtivos > 1) {
        const tickersExistentes = abaAtivos.getRange(2, 1, ultimaLinhaAtivos - 1, 1).getValues();
        tickersExistentes.forEach((linha, index) => {
          if (linha[0]) idToRowMap[String(linha[0]).trim().toUpperCase()] = index + 2;
        });
      }

      // Tradução: HEADER_DA_ABA → campo no payload da OpLab (apenas os que não batem no lowercase)
      const tradutorAPI = {
        "SPOT":         "close",
        "IV":           "iv_current",
        "IV_RANK":      "iv_1y_rank",
        "COMPANY_NAME": "name",
        "VARIATION":    "variation",
        "IV_1Y_PCT":    "iv_1y_percentile",
        "IV_6M_PCT":    "iv_6m_percentile",
        "EWMA_1Y_PCT":  "ewma_1y_percentile",
        "EWMA_6M_PCT":  "ewma_6m_percentile",
        "UPDATED_AT":   "manual_timestamp",
        "TICKER":       "manual_ticker"
      };

      // Extratores para campos aninhados (objetos dentro do payload)
      const extratoresEspeciais = {
        "M9_M21_VALUE":       function(d) { return (d.m9_m21       && d.m9_m21.value       != null) ? d.m9_m21.value       : null; },
        "M9_M21_TREND":       function(d) { return (d.m9_m21       && d.m9_m21.trend       != null) ? d.m9_m21.trend       : null; },
        "MSHORT_MLONG_VALUE": function(d) { return (d.mshort_mlong && d.mshort_mlong.value != null) ? d.mshort_mlong.value : null; },
        "MSHORT_MLONG_TREND": function(d) { return (d.mshort_mlong && d.mshort_mlong.trend != null) ? d.mshort_mlong.trend : null; },
        "OPLAB_SCORE":        function(d) { return (d.oplab_score  && d.oplab_score.value  != null) ? d.oplab_score.value  : null; }
      };

      // 🚀 CÉREBRO DE BACKUP: Se a API falhar, o robô usa isso.
      const fallbackSetor = {
        "NATU3": "COSMÉTICOS E PERFUMARIA",
        "BRAV3": "PETRÓLEO E GÁS"
      };

      const colunasDeTexto = ["TICKER", "COMPANY_NAME", "SECTOR", "TYPE", "ISIN", "CNPJ", "HAS_OPTIONS", "MARKET_MAKER"];
      const listaParaNovos = [];
      const updatesEmLote = [];

      tickersAlvo.forEach((ticker, i) => {
        // 1. LOG DO REQUEST: Registra qual ticker está sendo consultado
        // SysLogger.log(this._serviceName, "INFO", `API Request: Buscando dados para ${ticker}`);

        const dadosAPI = OplabService.getStockData(ticker);
        
        if (dadosAPI) {
          // 2. LOG DO RESPONSE (SUCESSO): Grava o payload retornado em formato texto
          // SysLogger.log(this._serviceName, "INFO", `API Response OK: ${ticker}`, JSON.stringify(dadosAPI));
          
          const linhaValores = new Array(ultimaColunaAtivos).fill("");

          for (const label in headerMap) {
            const index = headerMap[label];

            if (label === 'TICKER') {
              linhaValores[index] = Sanitizador.textoPuro(ticker);
            } else if (label === 'UPDATED_AT') {
              linhaValores[index] = new Date();
            } else {
              let valorCru;

              if (extratoresEspeciais[label]) {
                valorCru = extratoresEspeciais[label](dadosAPI);
              } else {
                const apiKey = tradutorAPI[label] || label.toLowerCase();
                valorCru = dadosAPI[apiKey];
              }

              // Fallback de setor quando a API retorna vazio
              if (label === 'SECTOR' && (valorCru === undefined || valorCru === null || valorCru === "")) {
                valorCru = fallbackSetor[ticker.toUpperCase()] || "";
              }

              if (valorCru !== undefined && valorCru !== null && valorCru !== "") {
                if (colunasDeTexto.includes(label)) {
                  linhaValores[index] = Sanitizador.textoPuro(String(valorCru));
                } else {
                  linhaValores[index] = Sanitizador.numeroPuro(valorCru);
                }
              }
            }
          }

            if (idToRowMap[ticker.toUpperCase()]) {
            updatesEmLote.push({ linha: idToRowMap[ticker.toUpperCase()], dados: linhaValores });
          } else {
            listaParaNovos.push(linhaValores);
          }
        } else {
          // 3. LOG DO RESPONSE (FALHA): Registra se a API não retornou dados
          // SysLogger.log(this._serviceName, "WARN", `API Response VAZIO/ERRO: Nenhum dado retornado para ${ticker}`);
        }
        
        if (tickersAlvo.length > 5 && i % 5 === 0) Utilities.sleep(600); 
      });

      updatesEmLote.forEach(update => {
        abaAtivos.getRange(update.linha, 1, 1, ultimaColunaAtivos).setValues([update.dados]);
      });

      if (listaParaNovos.length > 0) {
        abaAtivos.getRange(ultimaLinhaAtivos + 1, 1, listaParaNovos.length, ultimaColunaAtivos).setValues(listaParaNovos);
      }

      SysLogger.log(this._serviceName, "FINISH", ">>> SINCRONIA DE ATIVOS CONCLUÍDA <<<");
      SysLogger.flush();
      
    } catch (e) {
      SysLogger.log(this._serviceName, "CRITICO", "Falha no motor 007", String(e.message));
      SysLogger.flush();
    }
  }
};

// ============================================================================
// PONTO DE ENTRADA (Trigger Manual/Menu)
// ============================================================================

function atualizarDadosAtivos() {
  StockDataSync.run();
}

// ============================================================================
// SUÍTE DE HOMOLOGAÇÃO
// ============================================================================

function testSuiteStockDataSync007() {
  console.log("=== INICIANDO HOMOLOGAÇÃO: MOTOR 007 (v4.1) ===");
  const tickerTeste = "PETR4";
  const dados = OplabService.getStockData(tickerTeste);
  if (dados && dados.close !== undefined) {
    console.log(`✅ Conexão OK. Fechamento de ${tickerTeste}: ${Sanitizador.numeroPuro(dados.close)}`);
  }
}

// ============================================================================
// SETUP: Adiciona todos os novos headers na aba DADOS_ATIVOS (roda uma vez)
// ============================================================================

function setupColunasAtivos() {
  const COLUNAS_ESPERADAS = [
    'TICKER', 'UPDATED_AT', 'COMPANY_NAME', 'SECTOR', 'TYPE',
    'OPEN', 'HIGH', 'LOW', 'SPOT', 'PREVIOUS_CLOSE',
    'BID', 'ASK', 'BID_VOLUME', 'ASK_VOLUME',
    'VOLUME', 'FINANCIAL_VOLUME', 'TRADES', 'CONTRACT_SIZE',
    'BETA_IBOV', 'IV_RANK', 'IV', 'VARIATION',
    'IV_1Y_MAX', 'IV_1Y_MIN', 'IV_1Y_PCT', 'IV_1Y_RANK',
    'IV_6M_MAX', 'IV_6M_MIN', 'IV_6M_PCT', 'IV_6M_RANK',
    'EWMA_1Y_MAX', 'EWMA_1Y_MIN', 'EWMA_1Y_PCT', 'EWMA_1Y_RANK',
    'EWMA_6M_MAX', 'EWMA_6M_MIN', 'EWMA_6M_PCT', 'EWMA_6M_RANK', 'EWMA_CURRENT',
    'HAS_OPTIONS', 'MARKET_MAKER', 'SECURITY_CATEGORY', 'QUOTATION_FORM',
    'MIDDLE_TERM_TREND', 'SHORT_TERM_TREND',
    'SEMI_RETURN_1Y', 'STDV_1Y', 'STDV_5D', 'GARCH11_1Y',
    'CORREL_IBOV', 'ENTROPY',
    'M9_M21_VALUE', 'M9_M21_TREND',
    'MSHORT_MLONG_VALUE', 'MSHORT_MLONG_TREND', 'OPLAB_SCORE',
    'HIGHEST_OPTIONS_VOLUME_RANK', 'ISIN', 'CNPJ'
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(SYS_CONFIG.SHEETS.ASSETS);
  if (!aba) { console.error("Aba DADOS_ATIVOS não encontrada."); return; }

  const ultimaColuna = aba.getLastColumn();
  const headersExistentes = ultimaColuna > 0
    ? aba.getRange(1, 1, 1, ultimaColuna).getValues()[0].map(h => String(h).trim().toUpperCase())
    : [];

  const faltantes = COLUNAS_ESPERADAS.filter(col => !headersExistentes.includes(col));

  if (faltantes.length === 0) {
    console.log("✅ Todos os headers já existem na aba. Nenhuma alteração necessária.");
    return;
  }

  const novaColInicio = ultimaColuna + 1;
  aba.getRange(1, novaColInicio, 1, faltantes.length).setValues([faltantes]);
  console.log(`✅ ${faltantes.length} novos headers adicionados: ${faltantes.join(', ')}`);
}