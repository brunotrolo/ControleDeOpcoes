/**
 * @fileoverview CoreUpdatePortfolio - v4.2.1 (Bulletproof Edition)
 * AÇÃO: Sincronia de ativos com Lavanderia de Dados.
 * CORREÇÃO: Remoção de colunas calculadas para proteger as ArrayFormulas do banco.
 */

const PortfolioUpdater = {
  _serviceName: "PortfolioUpdater_v4.2.1",

  syncPortfolioData() {
    const inicio = Date.now();
    
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const aba = ss.getSheetByName(SYS_CONFIG.SHEETS.IMPORT);
      if (!aba) throw new Error(`Aba não encontrada: ${SYS_CONFIG.SHEETS.IMPORT}`);

      const maxRows = aba.getLastRow();
      if (maxRows < 2) {
        SysLogger.log(this._serviceName, "AVISO", "Aba vazia ou apenas cabeçalho.", "Linhas: " + maxRows);
        return;
      }

      // 1. SCAN DINÂMICO DE CABEÇALHOS
      const headers = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
      const col = {};
      headers.forEach((label, index) => {
        if (label) col[String(label).trim().toUpperCase()] = index + 1;
      });

      // Validação de colunas obrigatórias
      const req = ["OPTION_TICKER", "ID_TRADE", "TICKER", "STATUS_OP"];
      req.forEach(key => {
        if (!col[key]) throw new Error(`Coluna obrigatória '${key}' não encontrada na aba.`);
      });

      const dataFull = aba.getRange(2, 1, maxRows - 1, aba.getLastColumn()).getValues();
      const linhasParaProcessar = [];
      const tickersSucesso = [];
      let contagemErro = 0;

      // 2. FASE DE MAPEAMENTO
      for (let i = 0; i < dataFull.length; i++) {
        const linhaPlanilha = i + 2; 
        const rowData = dataFull[i];
        
        const optionTicker = Sanitizador.textoPuro(rowData[col["OPTION_TICKER"] - 1]);
        const idTrade      = rowData[col["ID_TRADE"] - 1];         
        const jaEnriquecido = rowData[col["TICKER"] - 1]; 

        if (optionTicker && idTrade && !jaEnriquecido) {
          linhasParaProcessar.push({ linha: linhaPlanilha, optionTicker: optionTicker });
        }
      }

      SysLogger.log(this._serviceName, "INFO", `Mapeamento: ${linhasParaProcessar.length} ativos pendentes.`, `Total analisado: ${maxRows}`);

      // 3. FASE DE EXECUÇÃO (LOOP BLINDADO)
      // Mesmo sem novas linhas para enriquecer, segue para a Fase 2 (strikes ATIVO)
      linhasParaProcessar.forEach((item) => {
        try {
          const dadosNovos = this._fetchOptionData(item.optionTicker);
          
          if (dadosNovos) {
            // A) GRAVA OS DADOS ENRIQUECIDOS PUROS
            const rangeEnriquecido = aba.getRange(item.linha, col["TICKER"], 1, 5);
            rangeEnriquecido.setValues([dadosNovos]);
            
            // B) APLICA MÁSCARA VISUAL NO STRIKE E VENCIMENTO
            // STRIKE em formato plain (0.00) — idêntico às linhas antigas (ex: 69.30)
            try {
              aba.getRange(item.linha, col["TICKER"] + 2).setNumberFormat('0.00');
              aba.getRange(item.linha, col["TICKER"] + 1).setNumberFormat('dd/MM/yyyy');
            } catch(eVisual) { }

            // C) NORMALIZA OS DADOS SUJOS DA CORRETORA (LAVANDERIA ATIVA)
            this._normalizarDadosImportados(aba, item.linha, col);

            tickersSucesso.push(item.optionTicker);
            if (linhasParaProcessar.length > 5) Utilities.sleep(600);
            SysLogger.log(this._serviceName, "SUCESSO", `Linha ${item.linha}: ${item.optionTicker} normalizada.`, JSON.stringify(dadosNovos));
          } else {
            aba.getRange(item.linha, col["TICKER"], 1, 1).setValue("ERRO_API");
            contagemErro++;
            SysLogger.log(this._serviceName, "ERRO", `Falha na API para ${item.optionTicker}`, "Retornou null");
          }
        } catch (erroLinha) {
          contagemErro++;
          SysLogger.log(this._serviceName, "ERRO_CRITICO", `Falha fatal na linha ${item.linha}`, erroLinha.message);
        }
      });

      // 4. FASE DE ATUALIZAÇÃO DE STRIKES (linhas já enriquecidas com STATUS_OP = ATIVO)
      SysLogger.log(this._serviceName, "INFO", "Iniciando fase 2: atualização de strikes ATIVO...");
      this._atualizarStrikesAtivos(aba, col, dataFull);

      const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
      SysLogger.log(this._serviceName, "FINISH", `>>> CICLO FINALIZADO EM ${duracao}s <<<`, JSON.stringify({
        total: linhasParaProcessar.length,
        sucesso: tickersSucesso.length,
        erros: contagemErro
      }));
      SysLogger.flush();

    } catch (e) {
      SysLogger.log(this._serviceName, "CRITICO", "FALHA NO MOTOR 006", String(e.message));
      SysLogger.flush();
    }
  },

    /**
     * Busca dados na API e garante que o Vencimento venha sem hora.
     */
    _fetchOptionData(optionTicker) {
      try {
        const data = OplabService.getOptionDetails(optionTicker);
        if (!data) return null;

        // 🚀 ZERANDO A HORA: Captura a data e reseta o relógio para 00:00:00
        let vencimentoRaw = Sanitizador.dataPura(data.due_date || data.expiration);
        if (vencimentoRaw instanceof Date) {
          vencimentoRaw.setHours(0, 0, 0, 0); 
        }

        return [
          Sanitizador.textoPuro(data.parent_symbol || data.symbol),
          vencimentoRaw, // Agora é um objeto Date purificado (apenas dia/mês/ano)
          Sanitizador.numeroPuro(data.strike),                     
          Sanitizador.textoPuro(data.category || data.type),
          "ATIVO" 
        ];
      } catch (e) {
        return null;
      }
    },

    /**
     * Fase 2: re-consulta a API OPLab para cada linha com STATUS_OP = "ATIVO"
     * e corrige o STRIKE caso tenha sido alterado por ajuste corporativo.
     * Somente a célula STRIKE é tocada — nenhuma outra coluna é modificada.
     */
    _atualizarStrikesAtivos(aba, col, dataFull) {
      if (!col["STRIKE"] || !col["STATUS_OP"] || !col["OPTION_TICKER"] || !col["TICKER"]) {
        SysLogger.log(this._serviceName, "AVISO", "Fase 2 abortada: coluna obrigatória ausente (STRIKE/STATUS_OP/OPTION_TICKER/TICKER).");
        return;
      }

      const round2 = v => Math.round(Number(v) * 100) / 100;

      const linhasAtivas = [];
      for (let i = 0; i < dataFull.length; i++) {
        const rowData  = dataFull[i];
        const statusOp = Sanitizador.textoPuro(rowData[col["STATUS_OP"] - 1]);
        const ticker   = rowData[col["TICKER"] - 1];
        const optTicker = Sanitizador.textoPuro(rowData[col["OPTION_TICKER"] - 1]);
        if (statusOp === "ATIVO" && ticker && optTicker) {
          linhasAtivas.push({
            linha:        i + 2,
            optionTicker: optTicker,
            strikeAtual:  round2(Sanitizador.numeroPuro(rowData[col["STRIKE"] - 1]))
          });
        }
      }

      SysLogger.log(this._serviceName, "INFO", `Fase 2: ${linhasAtivas.length} linha(s) ATIVO para verificar.`);
      if (linhasAtivas.length === 0) return;

      let qtdAtualizado  = 0;
      let qtdSemAlteracao = 0;
      let qtdErro        = 0;

      linhasAtivas.forEach((item, idx) => {
        try {
          if (idx > 0 && idx % 5 === 0) Utilities.sleep(600);

          const dadosApi = OplabService.getOptionDetails(item.optionTicker);
          if (!dadosApi) {
            qtdErro++;
            SysLogger.log(this._serviceName, "AVISO",
              `Fase 2: sem retorno API para ${item.optionTicker}`, `Linha ${item.linha}`);
            return;
          }

          const strikeNovo = round2(Sanitizador.numeroPuro(dadosApi.strike));

          if (strikeNovo !== item.strikeAtual) {
            const cel = aba.getRange(item.linha, col["STRIKE"]);
            cel.setValue(strikeNovo);
            try { cel.setNumberFormat('0.00'); } catch(ef) {}
            qtdAtualizado++;
            SysLogger.log(this._serviceName, "SUCESSO",
              `Fase 2: strike atualizado — ${item.optionTicker}`,
              `${item.strikeAtual} → ${strikeNovo} (linha ${item.linha})`);
          } else {
            qtdSemAlteracao++;
            SysLogger.log(this._serviceName, "INFO",
              `Fase 2: strike OK — ${item.optionTicker}`,
              `${item.strikeAtual} (sem alteração, linha ${item.linha})`);
          }
        } catch (e) {
          qtdErro++;
          SysLogger.log(this._serviceName, "ERRO",
            `Fase 2: falha na linha ${item.linha} (${item.optionTicker})`, e.message);
        }
      });

      SysLogger.log(this._serviceName, "FINISH",
        `Fase 2 concluída: ${qtdAtualizado} atualizados, ${qtdSemAlteracao} sem alteração, ${qtdErro} erros.`);
    },

    /**
    * 🧹 NORMALIZAÇÃO RETROATIVA: Varre os dados que você colou da corretora.
    */
    _normalizarDadosImportados(aba, linha, colMap) {
      // Formato PLAIN (sem "R$" nem separador de milhar) para ficar idêntico às
      // linhas antigas e garantir que as fórmulas (ex: TOTAL_PREMIUM) leiam números.
      const colunasAlvo = [
        { nome: "ENTRY_PRICE",  tipo: "numero", mascara: '0.00' },
        { nome: "LAST_PREMIUM", tipo: "numero", mascara: '0.00' },
        { nome: "LIMIT_PRICE",  tipo: "numero", mascara: '0.00' },
        { nome: "STRIKE",       tipo: "numero", mascara: '0.00' },
        { nome: "QUANTITY",     tipo: "numero", mascara: '0' },
        { nome: "ORDER_DATE",   tipo: "data",   mascara: 'dd/MM/yyyy HH:mm:ss' },
        { nome: "EXPIRY",       tipo: "data",   mascara: 'dd/MM/yyyy' }
      ];

      const alvosAtivos = colunasAlvo.filter(a => colMap[a.nome]);
      if (alvosAtivos.length === 0) return;

      // ⚠️ Escreve SOMENTE nas colunas-alvo, célula a célula. NUNCA gravar um
      // range contíguo (span): entre as colunas-alvo (QUANTITY..STRIKE) existem
      // colunas de FÓRMULA (TOTAL_PREMIUM, ID_TRADE, ID_STRATEGY = P, Q, R) que
      // seriam destruídas por um setValues de span. Só tocamos no que é alvo.
      alvosAtivos.forEach(alvo => {
        const cel = aba.getRange(linha, colMap[alvo.nome]);
        if (cel.getFormula() !== "") return;            // não toca em fórmula
        const valorBruto = cel.getValue();
        if (valorBruto === "" || valorBruto === null) return;

        cel.setValue((alvo.tipo === "data")
          ? Sanitizador.dataPura(valorBruto)
          : Sanitizador.numeroPuro(valorBruto));
        try { cel.setNumberFormat(alvo.mascara); } catch(e) {}
      });
    }
};


// ============================================================================
// PONTO DE ENTRADA (Trigger Manual/Menu)
// ============================================================================

function atualizarNecton() { 
  PortfolioUpdater.syncPortfolioData(); 
}

