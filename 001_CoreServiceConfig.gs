/**
 * @fileoverview ConfigManager - v5.0 (Data Dictionary & Clean Architecture)
 * RESPONSABILIDADE: Centralizar o Dicionário Universal de Dados (DUD) e gerenciar o cache.
 * PADRÃO: Nomes de Planilha em UPPER_SNAKE_CASE | Chaves JSON em camelCase.
 */

const SYS_CONFIG = {
  // 1. MAPEAMENTO DE ABAS (Nomes exatos no Google Sheets)
  SHEETS: {
    IMPORT:         "NECTON_IMPORT",
    COCKPIT:        "COCKPIT",
    LOGS:           "LOGS",
    DETAILS:        "DADOS_DETALHES",
    ASSETS:         "DADOS_ATIVOS",
    GREEKS_API:     "DADOS_GREEKS",
    GREEKS_CALC:    "CALC_GREEKS",
    CONFIG:         "CONFIG_GLOBAL",
    HIST_250D:      "DADOS_ATIVOS_HISTORICO250D",
    TREND:          "DADOS_ATIVOS_HISTORICO_TENDENCIA",
    PREDICTIVE:     "PONTUACAO_PREDITIVA_CONSOLIDADA",
    ESTATISTICA:    "ANALISE_ESTATISTICA_ATIVOS",
    FUNDAMENTAL:    "ANALISE_FUNDAMENTALISTA_ATIVOS",
    HEATMAP:        "ANALISE_PREDITIVA_HEATMAP",
    SCANNER:        "SCANNER_OPORTUNIDADES",
    SCANNER_TREND:  "SCANNER_TENDENCIA_OPORTUNIDADES",
    SELECTION_OPT:  "SELECAO_OPCOES",
    SELECTION_STR:  "SELECAO_STRANGLES",
    MACRO:          "DADOS_MACRO_SETORIAL",
    SERIES_INSTR:   "SERIES_OPCOES_INSTRUMENTO",   // OPLab: séries de opções com strikes por ativo
    BEST_RATES:     "SELECAO_OPCOES_MAIORES_LUCROS", // OPLab: melhores taxas de lucro PUT + CALL
    VOL_OPCOES:     "SELECAO_MAIORES_VOLUMES",        // OPLab: maiores volumes em opções por ativo
    VAR_OPCOES:     "SELECAO_MAIORES_VARIACOES",      // OPLab: opções com maiores variações no dia
    RANK_M9M21:     "RANKING_TENDENCIA_M9M21",         // OPLab: ranking de tendência M9/M21
    RANK_SCORE:     "RANKING_OPLAB_SCORE",             // OPLab: ranking por score proprietário
    HIST_OPCOES:    "HISTORICO_OPCOES",                 // OPLab: histórico de gregas por período
    RANK_CORREL:    "RANKING_CORREL_IBOV",              // OPLab: ranking correlacao com IBOV
    RANK_FUND:      "RANKING_FUNDAMENTALISTA",              // OPLab: ranking fundamentalista por atributo
    CONSULTOR_HIST: "CONSULTOR_IA_HISTORICO"               // ConsultorIA 023: historico de analises Claude
  },

  // 2. DICIONÁRIO UNIVERSAL DE DADOS (DUD)
  // Mapeia o [Rótulo da Planilha] -> [Chave JSON para o Web App]
  DUD: {
    "ID_TRADE":       "tradeId",
    "ID_STRATEGY":    "strategyId",
    "TICKER":         "ticker",         // Ação (ex: PETR4)
    "OPTION_TICKER":  "optionTicker",   // Opção (ex: PETRC425)
    "SPOT":           "spot",           // Preço da Ação
    "STRIKE":         "strike",         // Preço de Exercício
    "EXPIRY":         "expiry",         // Vencimento
    "STATUS_OP":      "status",         // Status Operacional
    "SIDE":           "side",           // C ou V
    "QUANTITY":       "quantity",
    "ENTRY_PRICE":    "entryPrice",
    "LAST_PREMIUM":   "lastPremium",
    "UPDATED_AT":     "updatedAt",
    "DELTA":          "delta",
    "GAMMA":          "gamma",
    "THETA":          "theta",
    "VEGA":           "vega",
    "IV":             "iv",
    "IV_RANK":        "ivRank",
    "DTE":            "dte",
    "PL_PCT":         "plPct",
    "PL_VALUE":       "plValue",
    "MONEYNESS":      "moneyness",
    "SCORE":          "score",

    // ── Campos do Ativo-Mãe (InstrumentSeries — OPLab) ──────────────────────
    "COMPANY_NAME":         "companyName",        // Nome da empresa
    "LAST_TRADE_AT":        "lastTradeAt",         // Timestamp do último negócio
    "CONTRACT_SIZE":        "contractSize",        // Tamanho do lote mínimo
    "SHORT_TERM_TREND":     "shortTermTrend",      // Tendência curto prazo DMI (-1, 0, 1)
    "MID_TERM_TREND":       "midTermTrend",        // Tendência médio prazo DMI (-1, 0, 1)
    "STDV_1Y":              "stdv1y",              // Desvio padrão dos retornos 1 ano
    "EWMA_CURRENT":         "ewmaCurrent",         // Volatilidade EWMA atual
    "IV_CURRENT":           "ivCurrent",           // IV atual do ativo-mãe

    // ── Campos Complementares (SERIES_OPCOES_INSTRUMENTO) ────────────────────
    "DTE_CALENDAR":         "dteCalendar",         // Dias corridos até vencimento
    "MATURITY_TYPE":        "maturityType",        // AMERICAN / EUROPEAN
    "MARKET_MAKER":         "marketMaker",         // Formador de mercado (boolean)
    "OPTION_OPEN":          "optionOpen",
    "OPTION_HIGH":          "optionHigh",
    "OPTION_LOW":           "optionLow",
    "OPTION_CLOSE":         "optionClose",         // Prêmio atual da opção
    "OPTION_BID":           "optionBid",
    "OPTION_ASK":           "optionAsk",
    "OPTION_VOLUME_QTY":    "optionVolumeQty",
    "OPTION_VOLUME_FIN":    "optionVolumeFin",
    "OPTION_VARIATION":     "optionVariation",
    "OPTION_CONTRACT_SIZE": "optionContractSize",
    "OPTION_UPDATED_AT":    "optionUpdatedAt",

    // ── Campos Complementares (OPLAB_BEST_RATES) ─────────────────────────────
    "PROFIT_RATE_IF_EXERCISED": "profitRateIfExercised", // Taxa de lucro se exercido (%)
    "VE_OVER_STRIKE":           "veOverStrike",          // Valor extrínseco / strike
    "SPOT_STRIKE_RATIO":        "spotStrikeRatio",       // Spot / strike (moneyness aprox.)

    // ── Campos de Volume e Mercado (complementares ao DUD) ───────────────────
    "VOLUME_QTY":   "volumeQty",    // Volume em contratos
    "VOLUME_FIN":   "volumeFin",    // Volume financeiro
    "BID_VOL":      "bidVol",       // Volume da melhor oferta de compra
    "ASK_VOL":      "askVol",       // Volume da melhor oferta de venda
    "BETA_IBOV":    "betaIbov",     // Beta vs IBOV
    "OPEN":         "open",         // Abertura do dia
    "HIGH":         "high",         // Máxima do dia
    "LOW":          "low",          // Mínima do dia
    "CLOSE":        "close",        // Fechamento / último preço
    "VARIATION":    "variation",    // Variação % do dia
    "CATEGORY":     "category",     // CALL ou PUT
    "SECTOR":       "sector",        // Setor da empresa

    // ── Campos de Volume por Tipo (016_HighestOptionsVolume) ─────────────────
    "VOLUME_CALL":          "volumeCall",          // Volume financeiro CALL
    "VOLUME_PUT":           "volumePut",           // Volume financeiro PUT
    "VOLUME_TOTAL":         "volumeTotal",         // Volume financeiro CALL + PUT

    // ── Campos de Ranking (018_M9M21, 019_OplabScore) ────────────────────────
    "SHORT_NAME":           "shortName",           // Nome curto da companhia
    "CNPJ":                 "cnpj",                // CNPJ da companhia
    "M9M21_VALUE":          "m9m21Value",          // Valor relação M9/M21
    "M9M21_TREND":          "m9m21Trend",          // Tendência M9/M21 (-1/0/1)
    "M9M21_ATTR_NAME":      "m9m21AttrName",       // Nome do atributo M9/M21
    "STDV_5D":              "stdv5d",              // Desvio padrão retornos 5 dias

    // ── Campos OpLab Score (019 — flatten do objeto oplab_score aninhado) ────
    "SCORE_TOTAL":          "scoreTotal",          // Score total OPLab
    "SCORE_EBIT_VAR":       "scoreEbitVar",        // Score baseado no EBIT
    "SCORE_REVENUE_VAR":    "scoreRevenueVar",     // Score baseado na receita
    "SCORE_CASH_VAR":       "scoreCashVar",        // Score baseado no caixa
    "SCORE_CURRENT_LIAB":   "scoreCurrentLiab",    // Score passivo circulante
    "SCORE_MM_SIGNAL":      "scoreMmSignal",       // Score média móvel 9/21
    "SCORE_DATE":           "scoreDate",           // Data do cálculo do score

    // -- Config Consultor Claude (023_ConsultorIA.gs) ────────────────────────
    "IA_Meta_Lucro_Recompra":    "iaMetaLucroRecompra",
    "IA_DTE_Min_Entrada":        "iaDteMinEntrada",
    "IA_DTE_Max_Entrada":        "iaDteMaxEntrada",
    "IA_DTE_Alerta_Urgente":     "iaDteAlertaUrgente",
    "IA_Filtro_Score_Min":       "iaFiltroScoreMin",
    "IA_Filtro_M9M21_Tendencia": "iaFiltroM9M21Tendencia",
    "IA_Avaliar_Outros_Ativos":  "iaAvaliarOutrosAtivos",
    "IA_Volume_Min_Candidatos":  "iaVolumeMinCandidatos",

    // ── Campos Correlação IBOV (021_SyncCorrelIbovRanking) ──────────────────────
    "CORREL_VALUE":         "correlValue",         // Valor da correlacao com IBOV
    "CORREL_ATTR_NAME":     "correlAttrName",      // Nome do atributo (correl_ibov)

    // ── Campos Ranking Fundamentalista (022_SyncCompaniesRanking) ────────────────
    "TICKERS_JSON":         "tickersJson",          // Array de tickers da empresa (JSON)
    "ATTR_NAME":            "attrName",             // Nome do atributo fundamentalista
    "ATTR_VALUE":           "attrValue",            // Valor do atributo fundamentalista
    "ATTR_DATE":            "attrDate",             // Data do balanco

    // ── Campos Histórico de Opções (020_HistoricalOptions) ───────────────────
    "IV_CALC":              "ivCalc",              // IV implícita calculada (volatility)
    "POE":                  "poe",                 // Probabilidade de exercício (BS)
    "BS_PRICE":             "bsPrice"              // Preço teórico Black-Scholes
  }
};

/**
 * Gerenciador de Configurações com Cache de 3 Camadas
 */
const ConfigManager = {
  _memoryCache: null,
  _cacheKey: "APP_GLOBAL_CONFIGS_V5",
  _cacheTime: 21600, // 6 horas

  /**
   * Obtém configurações dinâmicas da aba CONFIG_GLOBAL.
   */
  get() {
    if (this._memoryCache) return this._memoryCache;

    const cache = CacheService.getScriptCache();
    const cachedData = cache.get(this._cacheKey);
    if (cachedData) {
      this._memoryCache = JSON.parse(cachedData);
      return this._memoryCache;
    }

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SYS_CONFIG.SHEETS.CONFIG);
      if (!sheet) return {};

      const data = sheet.getDataRange().getValues();
      const configs = {};
      
      for (let i = 1; i < data.length; i++) {
        const key = String(data[i][0]).trim();
        let val = data[i][1];
        if (key && !key.startsWith("//")) {
          // Limpeza de números via DataUtils
          configs[key] = (typeof val === 'string' && val.includes(',')) ? 
                          DataUtils.safeFloat(val) : val;
        }
      }

      this._memoryCache = configs;
      cache.put(this._cacheKey, JSON.stringify(configs), this._cacheTime);
      return configs;
    } catch (e) {
      console.error("[ConfigManager] Erro no I/O: " + (e.message));
      return {};
    }
  },

  /**
   * Invalida os caches.
   */
  clearCache() {
    CacheService.getScriptCache().remove(this._cacheKey);
    this._memoryCache = null;
  }
};

function obliterarCacheConfig() {
  // 1. Limpa a RAM temporária
  const cache = CacheService.getScriptCache();
  cache.removeAll(["CONFIG_GLOBAL_CACHE", "CONFIG_CACHE", "SYS_CONFIG"]);
  
  // 2. Limpa o Cofre Profundo
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty("CONFIG_GLOBAL_CACHE");
  props.deleteProperty("CONFIG_CACHE");
  
  console.log("💥 Nuke disparado! Todos os caches foram obliterados.");
}

function CSI_PlanilhaConfig() {
  console.log("=== 🕵️‍♂️ CSI: LENDO PLANILHA CRUA ===");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Config_Global");
  const data = sheet.getDataRange().getValues();
  
  let encontradas = 0;
  
  for(let i=0; i < data.length; i++) {
    const chave = String(data[i][0]).trim();
    if(chave === "Regra_Qtd_Max_PUT" || chave === "Regra_Qtd_Max_CALL") {
      console.log("🚨 FLAGRANTE na Linha " + (i + 1) + ": Chave = [" + (chave) + "] | Valor = [" + (data[i][1]) + "]");
      encontradas++;
    }
  }
  
  if(encontradas === 0) {
    console.error("❌ Nenhuma chave encontrada! Tem espaço em branco no nome?");
  }
  console.log("=== FIM DA INVESTIGAÇÃO ===");
}

// ============================================================================
// TESTES DE INTEGRAÇÃO (001)
// ============================================================================

function testConfigArchitectureV5() {
  ConfigManager.clearCache();
  const cfg = ConfigManager.get();
  const dudSize = Object.keys(SYS_CONFIG.DUD).length;
  
  console.log("=== HOMOLOGAÇÃO ARQUITETURA DE DADOS v5.0 ===");
  console.log("Abas Mapeadas: " + (Object.keys(SYS_CONFIG.SHEETS).length));
  console.log("Dicionário DUD: " + (dudSize) + " definições.");
  console.log("Chave SPOT: " + (SYS_CONFIG.DUD["SPOT"])); // Deve retornar "spot"
  
  if(dudSize > 0) {
    console.log("Status: ✅ DUD Integrado e Pronto para o Web App.");
  } else {
    console.error("Status: ❌ Erro na carga do Dicionário.");
  }
}