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

      // 🚀 DICIONÁRIO ATUALIZADO: Tradução exata do payload da OpLab
      const tradutorAPI = {
        "SPOT": "close",
        "IV": "iv_current",
        "IV_RANK": "iv_1y_rank",
        "COMPANY_NAME": "name",
        "VARIATION": "variation",
        "IV_1Y_PCT": "iv_1y_percentile", // Corrigido!
        "IV_6M_PCT": "iv_6m_percentile", // Corrigido!
        "UPDATED_AT": "manual_timestamp",
        "TICKER": "manual_ticker"
      };

      // 🚀 CÉREBRO DE BACKUP: Se a API falhar, o robô usa isso.
      const fallbackSetor = {
        "NATU3": "COSMÉTICOS E PERFUMARIA",
        "BRAV3": "PETRÓLEO E GÁS"
      };

      const colunasDeTexto = ["TICKER", "COMPANY_NAME", "SECTOR", "ISIN"];
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
            const apiKey = tradutorAPI[label] || label.toLowerCase(); 

            if (label === 'TICKER') {
              linhaValores[index] = Sanitizador.textoPuro(ticker);
            } else if (label === 'UPDATED_AT') {
              linhaValores[index] = new Date(); 
            } else {
              let valorCru = dadosAPI[apiKey];
              
              // 🛡️ FALLBACK DE SETOR: Se for SECTOR e vier vazio, busca no cérebro interno
              if (label === 'SECTOR' && (valorCru === undefined || valorCru === null || valorCru === "")) {
                valorCru = fallbackSetor[ticker.toUpperCase()] || "";
              }
              
              // PASSA PELO SANITIZADOR
              if (valorCru !== undefined && valorCru !== null && valorCru !== "") {
                if (colunasDeTexto.includes(label)) {
                  linhaValores[index] = Sanitizador.textoPuro(valorCru);
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