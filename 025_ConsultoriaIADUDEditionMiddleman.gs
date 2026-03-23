/**
 * @fileoverview 013_ConsultoriaIA - v5.0 (DUD Edition & Middleman)
 * OBJETIVO: Middleware entre o Front-end e o Motor Gemini. 
 * AÇÃO: Formata dados, aplica a Persona (via ConfigManager) e roteia o JSON.
 */

const ConsultoriaIA = {
  _serviceName: "ConsultoriaIA_v5.0",

  /**
   * Ponto de entrada chamado pelo Front-end (Web App)
   * @param {Array} operacoes - Array de objetos representando a carteira na tela.
   */
  analisarCarteira(operacoes) {
    if (!operacoes || operacoes.length === 0) {
      SysLogger.log(this._serviceName, "AVISO", "Nenhuma operação recebida do front-end.");
      SysLogger.flush();
      return { success: false, error: "Nenhuma operação recebida para análise." };
    }

    SysLogger.log(this._serviceName, "INFO", `Montando Super-Prompt para ${operacoes.length} ativos.`);

    try {
      // Função segura para buscar dados no objeto (Case Insensitive e Aceita Multi-rótulos)
      const getSafe = (obj, chavesAceitas) => {
        if (!obj) return "N/D";
        const keysObj = Object.keys(obj).map(k => k.toUpperCase());
        for (const chaveDesejada of chavesAceitas) {
          const c = chaveDesejada.toUpperCase();
          const objKeyOriginal = Object.keys(obj).find(k => k.toUpperCase() === c);
          if (objKeyOriginal && obj[objKeyOriginal] !== "" && obj[objKeyOriginal] !== null) {
            return obj[objKeyOriginal];
          }
        }
        return "N/D";
      };

      // 1. LIMPEZA E OTIMIZAÇÃO DE TOKENS (DUD Aligned)
      const carteiraLimpa = operacoes.map((op, index) => {
        return {
          _id_temp: index, // OBRIGATÓRIO PARA O MAPEAMENTO DA IA DE VOLTA AO FRONT
          Ativo: getSafe(op, ["OPTION_TICKER", "TICKER", "Código"]),
          Acao: getSafe(op, ["TICKER", "Ativo_Objeto"]),
          Side: getSafe(op, ["SIDE", "Venda/Compra"]),
          Dias_Venc: getSafe(op, ["DTE", "DTE_CALENDAR", "Vencimento_Dias"]),
          Moneyness: getSafe(op, ["MONEYNESS", "Moneyness_Code"]),
          Lucro_Pct: getSafe(op, ["PL_PCT", "P/L TOTAL %", "Lucro_Atual"]),
          Delta: getSafe(op, ["DELTA"]),
          Tendencia: getSafe(op, ["TREND", "Tendencia", "Veredito_Tendencia"])
        };
      });

      // 2. A PERSONA DINÂMICA (Lida via ConfigManager v5.0 do arquivo 001)
      const configs = ConfigManager.get();
      
      // Descobre o perfil ou cai pro padrão
      const perfilAtivo = String(configs["IA_PERFIL_CONSULTOR"] || "EQUILIBRADO").trim().toUpperCase();
      const regrasGerais = configs["PROMPT_REGRAS_GERAIS"] || "Atue como um Gestor de Risco frio e calculista.";
      const promptPerfil = configs[`PROMPT_SISTEMA_${perfilAtivo}`] || "Foque em gestão de risco.";

      // 3. O CÉREBRO DA IA (System Instruction)
      const systemInstruction = `
${regrasGerais}

${promptPerfil}

REGRA DE ISOLAMENTO E ESTRUTURAÇÃO:
1. PROIBIDO AGRUPAR: Avalie cada "_id_temp" de forma 100% isolada.
2. ESTRUTURA OBRIGATÓRIA DA ANÁLISE: Para cada ativo, você deve obrigatoriamente seguir este modelo de texto (Use Markdown básico para negrito):
   - **O QUE**: [Ação clara: MANTER, RECOMPRAR, ROLAR ou ASSUMIR]
   - **QUANDO**: [Timing exato: AGORA, PRÓXIMOS DIAS ou NO VENCIMENTO]
   - **POR QUE**: [Racional técnico denso citando Delta, Lucro Pct, Tendência ou DTE]

3. FORMATO DE SAÍDA: Retorne estritamente um array de objetos JSON mapeando o "id" ao "_id_temp" e "analise" contendo a estrutura acima.
   Exemplo: [{"id": 0, "analise": "- **O QUE**: RECOMPRAR\\n- **QUANDO**: AGORA\\n- **POR QUE**: Lucro de 94% atingido..."}]
      `.trim();

      // 4. O PROMPT DO USUÁRIO (O que a IA vai ler)
      const promptUser = `
Audite a seguinte carteira de opções e retorne o JSON mapeado pelo "_id_temp".
Carteira Atual:
${JSON.stringify(carteiraLimpa, null, 2)}
      `.trim();

      // 5. CHAMADA AO MOTOR GEMINI (012_CoreServiceIA)
      SysLogger.log(this._serviceName, "INFO", `Disparando Gemini. Perfil: ${perfilAtivo}. Qtd Itens: ${carteiraLimpa.length}`);
      
      const t0 = Date.now();
      const respostaIA = GeminiService.generate(promptUser, systemInstruction, true);
      const t1 = Date.now();

      if (!respostaIA || !Array.isArray(respostaIA)) {
        throw new Error("O motor Gemini não retornou o Array JSON esperado.");
      }

      // 6. SUCESSO E RETORNO PARA O FRONT-END
      SysLogger.log(this._serviceName, "SUCESSO", `Consultoria gerada em ${(t1-t0)/1000}s.`, `${respostaIA.length} análises retornadas.`);
      SysLogger.flush(); 
      
      return { 
        success: true, 
        data: respostaIA 
      };

    } catch (e) {
      SysLogger.log(this._serviceName, "CRITICO", "Falha na geração da consultoria IA.", String(e.message));
      SysLogger.flush();
      return { success: false, error: String(e.message) };
    }
  }
};

// ============================================================================
// PONTO DE ENTRADA DO WEB APP (Comunicação com o JS do Front)
// ============================================================================
function apiAnalisarOperacoesAtivas(operacoesJson) {
  // Se o Front mandar string, converte. Se mandar objeto, usa direto.
  let ops = typeof operacoesJson === 'string' ? JSON.parse(operacoesJson) : operacoesJson;
  return ConsultoriaIA.analisarCarteira(ops);
}

// ============================================================================
// SUÍTE DE HOMOLOGAÇÃO (Teste Unitário Sem Front-end)
// ============================================================================

/**
 * Roda um Mock (Simulação) de como o Front-end envia os dados para testar toda a cadeia.
 */
function testSuiteConsultoriaIA013() {
  console.log("=== INICIANDO TESTE UNITÁRIO: CONSULTORIA IA (013) ===");

  // MOCK: Simulando o pacote JSON que o Front-end enviaria
  const mockFrontEndData = [
    {
      OPTION_TICKER: "PETRC425",
      TICKER: "PETR4",
      SIDE: "V",
      DTE: 12,
      MONEYNESS: "OTM",
      PL_PCT: "92%",
      DELTA: "-0.15",
      TREND: "ALTA"
    },
    {
      OPTION_TICKER: "VALEP650",
      TICKER: "VALE3",
      SIDE: "V",
      DTE: 3,
      MONEYNESS: "ITM",
      PL_PCT: "-45%",
      DELTA: "-0.85",
      TREND: "BAIXA"
    }
  ];

  console.log("1. Simulando envio de dados do Front-end (2 Operações)...");
  
  const resultado = apiAnalisarOperacoesAtivas(mockFrontEndData);

  if (resultado.success) {
    console.log(`✅ SUCESSO: A IA processou e devolveu um Array com ${resultado.data.length} itens.`);
    console.log("\n--- AMOSTRA DA ANÁLISE (ITEM 0) ---");
    console.log(`ID Temporário: ${resultado.data[0].id}`);
    console.log(`Texto IA:\n${resultado.data[0].analise}`);
    console.log("-----------------------------------");
  } else {
    console.error(`❌ FALHA NO MIDDLEWARE: ${resultado.error}`);
  }

  console.log("\n⚠️ Verifique a aba 'LOGS' para checar o registro da operação.");
  console.log("=== FIM DO TESTE ===");
}


// ==========================================
// MÓDULO: CO-PILOTO DIDÁTICO (DASHBOARDS)
// ==========================================

/**
 * Recebe os dados resumidos do gráfico de Liquidez e solicita
 * à IA do Gemini uma explicação pedagógica sobre a cadeia de opções.
 * Utiliza o Motor Centralizado (GeminiService).
 * * @param {Object} payload Contém ativo, spot, tipo (CALL/PUT) e o Top 3 Strikes de volume.
 * @returns {String} HTML formatado com a resposta da IA.
 */
function apiGerarInsightLiquidez(payload) {
  const _serviceName = "ConsultoriaIA_Dashboards";
  try {
    SysLogger.log(_serviceName, "INFO", `Gerando insight de liquidez para ${payload.ativo}`);

    // A persona (Instrução de Sistema) para a IA
    const systemInstruction = "Você é um professor e estrategista especialista em Opções no mercado brasileiro (B3).";
    
    // O prompt estruturado com os dados recebidos do Front-End
    const prompt = `
      Atue como um Trader Quantitativo Sênior da B3 falando com outro operador.
      Analise este Mapa de Liquidez de forma ULTRA RÁPIDA, DIRETA E EM TÓPICOS. Nenhuma introdução ou firula.
      
      DADOS DO ATIVO:
      - Ticker: ${payload.ativo} (Spot: R$ ${payload.spot})
      - Tipo da Opção: ${payload.tipo}
      - Top 3 Muros de Volume na Tela:
        1º) R$ ${payload.strikesMaisLiquidos[0]?.strike || 'N/A'} (Maior Muro)
        2º) R$ ${payload.strikesMaisLiquidos[1]?.strike || 'N/A'}
        3º) R$ ${payload.strikesMaisLiquidos[2]?.strike || 'N/A'}

      O QUE VOCÊ DEVE RETORNAR (Exatamente esta estrutura):
      
      <div style="margin-bottom: 12px;">
        <span style="color: var(--text-primary); font-weight: bold; font-size: 14px;">🎯 Leitura de Tela</span><br>
        [Apenas 1 frase curta dizendo onde os grandes institucionais montaram defesa (se for PUT) ou teto de resistência (se for CALL) em relação ao Spot atual.]
      </div>
      
      <div style="margin-bottom: 12px;">
        <span style="color: var(--brand-indigo); font-weight: bold; font-size: 14px;">⚡ Ação Prática (Setup)</span><br>
        [Apenas 1 frase curta recomendando o que fazer. Ex: "Para Venda de ${payload.tipo}, o strike X.XX oferece o melhor escudo de volume institucional."]
      </div>
      
      REGRAS RÍGIDAS:
      - NUNCA use as palavras: "Olá", "Ao observar", "Lembre-se", "Na prática".
      - NUNCA escreva parágrafos longos. Seja telegráfico.
      - Retorne o HTML exato solicitado acima.
    `;

    // Chama o seu motor centralizado
    // O parâmetro isJsonResponse é FALSE, pois queremos HTML puro, não um array de objetos.
    const respostaIA = GeminiService.generate(prompt, systemInstruction, false);

    if (!respostaIA) {
      throw new Error("O Gemini retornou vazio ou falhou na conexão.");
    }

    SysLogger.log(_serviceName, "SUCESSO", "Insight de liquidez gerado com sucesso.");
    SysLogger.flush();
    
    return respostaIA;

  } catch (error) {
    SysLogger.log(_serviceName, "ERRO_IA", "Falha ao gerar o insight didático", error.message);
    SysLogger.flush();
    return `<span style="color:#ff0055"><b>Erro de Conexão:</b> Não foi possível gerar o insight inteligente. Motivo: ${error.message}</span>`;
  }
}

/**
 * Recebe os dados de Volatilidade e solicita explicação pedagógica à IA.
 */
function apiGerarInsightSkew(payload) {
  const _serviceName = "ConsultoriaIA_Skew";
  try {
    SysLogger.log(_serviceName, "INFO", `Analisando Skew para ${payload.ativo}`);

    const systemInstruction = "Você é um professor e estrategista especialista em Opções no mercado brasileiro (B3).";
    
    const prompt = `
      Atue como um Trader Institucional de Volatilidade.
      Analise o Sorriso de Volatilidade (Skew) de forma ULTRA RÁPIDA, DIRETA E EM TÓPICOS. Nenhuma introdução.
      
      DADOS DO ATIVO (${payload.ativo} - Spot R$ ${payload.spot}):
      - Volatilidade ATM (No dinheiro): ${(payload.ivAtm * 100).toFixed(1)}%
      - Volatilidade OTM Extrema (Pânico - Strike R$ ${payload.strikeExtremoPut}): ${(payload.ivExtremaPut * 100).toFixed(1)}%

      O QUE VOCÊ DEVE RETORNAR (Estrutura Tática):
      
      <div style="margin-bottom: 12px;">
        <span style="color: var(--brand-rose); font-weight: bold; font-size: 14px;">🌡️ Termômetro do Medo (Efeito Skew)</span><br>
        [Apenas 1 frase comparando a diferença entre a Volatilidade Extrema e a ATM. Diga se o mercado está em pânico pagando caro por proteção ou se a curva está normalizada.]
      </div>
      
      <div style="margin-bottom: 12px;">
        <span style="color: var(--brand-amber); font-weight: bold; font-size: 14px;">⚡ Oportunidade Tática</span><br>
        [Apenas 1 frase recomendando vender PUTs bem OTM para capturar esse prêmio inflado pelo medo, atuando como uma "seguradora".]
      </div>
      
      REGRAS RÍGIDAS:
      - NUNCA use as palavras: "Olá", "Ao observar", "Na prática".
      - NUNCA use formatação markdown (\`\`\`html). Retorne o texto puro.
      - Vá direto ao ponto.
    `;

    const respostaIA = GeminiService.generate(prompt, systemInstruction, false);

    if (!respostaIA) throw new Error("O Gemini falhou ao responder.");
    return respostaIA;

  } catch (error) {
    SysLogger.log(_serviceName, "ERRO_IA", "Falha Skew", error.message);
    return `<span style="color:#ff0055">Erro: ${error.message}</span>`;
  }
}


/**
 * Recebe o Top 3 da Matriz de Risco vs Retorno e solicita auditoria de oportunidade.
 */
function apiGerarInsightRiscoRetorno(payload) {
  const _serviceName = "ConsultoriaIA_RiscoRetorno";
  try {
    SysLogger.log(_serviceName, "INFO", `Analisando Sweet Spot para ${payload.ativo}`);

    const systemInstruction = "Você é um Analista Quantitativo de Risco no mercado de derivativos da B3.";
    
    // Se não encontrou opções boas na Zona Alvo
    if (!payload.candidatas || payload.candidatas.length === 0) {
      return `<p>Não há opções <b>OTM de ${payload.tipo}</b> para <b>${payload.ativo}</b> que ofereçam um bom prêmio (acima de 1%) com risco controlado (Delta menor que 35) neste momento. O mercado está precificando baixo o risco ou não há liquidez.</p>`;
    }

    const candidatasLista = payload.candidatas.map((c, i) => 
      `${i+1}º) Opção ${c.opcao} (Strike R$ ${c.strike}): Paga ${c.retornoPct}% com risco de ${c.deltaPct}% (Delta) e Spread de ${c.spreadPct}%.`
    ).join('\n');

    const prompt = `
      Atue como um Trader Quantitativo Sênior da B3.
      O investidor filtrou a "Zona Alvo" na Matriz de Risco x Retorno para ${payload.tipo}s de ${payload.ativo}.
      
      Top 3 opções mais eficientes na Zona Alvo (Alto Retorno Real x Baixo Delta):
      ${candidatasLista}

      O QUE VOCÊ DEVE RETORNAR (Estrutura Tática):
      
      <div style="margin-bottom: 12px;">
        <span style="color: var(--brand-emerald); font-weight: bold; font-size: 14px;">🎯 Sweet Spot (Melhor Assimetria)</span><br>
        [Apenas 1 frase apontando qual das 3 opções oferece o prêmio mais atrativo sem te empurrar muito para perto da zona de risco de exercício.]
      </div>
      
      <div style="margin-bottom: 12px;">
        <span style="color: var(--text-primary); font-weight: bold; font-size: 14px;">⚠️ Pedágio da Corretora (Spread)</span><br>
        [1 frase alertando sobre o Spread da opção escolhida. Se for alto (acima de 3%), diga para enviar ordem a mercado com cuidado. Se for baixo, diga que a entrada está fluida.]
      </div>
      
      REGRAS RÍGIDAS:
      - NUNCA use as palavras: "Olá", "Ao observar", "Na prática".
      - NUNCA use formatação markdown (\`\`\`html). Retorne o texto puro.
      - Vá direto ao ponto.
    `;

    const respostaIA = GeminiService.generate(prompt, systemInstruction, false);

    if (!respostaIA) throw new Error("Falha ao comunicar com o Gemini.");
    return respostaIA;

  } catch (error) {
    SysLogger.log(_serviceName, "ERRO_IA", "Falha RiscoRetorno", error.message);
    return `<span style="color:#ff0055">Erro: ${error.message}</span>`;
  }
}


/**
 * Solicita à IA uma análise sobre o trade-off de vender Theta pagando pedágio do Gamma.
 */
function apiGerarInsightGammaTheta(payload) {
  const _serviceName = "ConsultoriaIA_GammaTheta";
  try {
    SysLogger.log(_serviceName, "INFO", `Analisando Gamma/Theta para ${payload.ativo}`);

    const systemInstruction = "Você é um Analista de Estruturação Quantitativa no mercado de opções brasileiro.";
    
    const prompt = `
      Atue como um Trader Quantitativo Sênior da B3.
      Analise a curva estrutural Gamma x Theta de forma ULTRA RÁPIDA, DIRETA E EM TÓPICOS. Nenhuma introdução.
      
      DADOS DO ATIVO:
      - Ticker: ${payload.ativo} (Spot: R$ ${payload.spot})
      - Tipo da Opção: ${payload.tipo}
      - Maior Risco (Pico Gamma): ${payload.picoGammaVal} no Strike R$ ${payload.picoStrike}
      - Maior Retorno de Tempo (Pico Theta): R$ ${payload.picoThetaVal} no mesmo Strike.

      O QUE VOCÊ DEVE RETORNAR (Exatamente esta estrutura HTML):
      
      <div style="margin-bottom: 12px;">
        <span style="color: var(--brand-rose); font-weight: bold; font-size: 14px;">⚠️ Zona de Perigo (Pico Gamma)</span><br>
        [1 frase dizendo que vender opções exatamente no strike R$ ${payload.picoStrike} é perigoso, pois é onde o mercado tem a maior explosão direcional.]
      </div>
      
      <div style="margin-bottom: 12px;">
        <span style="color: var(--brand-amber); font-weight: bold; font-size: 14px;">⏳ Ação Prática (Setup Theta)</span><br>
        [1 frase recomendando que o investidor fuja desse pico e busque strikes mais afastados (os ombros do gráfico), onde o Gamma cai drasticamente, mas o Theta ainda gera um bom salário diário.]
      </div>
      
      REGRAS RÍGIDAS:
      - NUNCA use as palavras: "Olá", "Ao observar", "Lembre-se".
      - Seja telegráfico. Vá direto ao ponto.
      - Retorne APENAS o HTML acima.
    `;

    const respostaIA = GeminiService.generate(prompt, systemInstruction, false);

    if (!respostaIA) throw new Error("A IA não retornou o insight.");
    return respostaIA;

  } catch (error) {
    SysLogger.log(_serviceName, "ERRO_IA", "Falha GammaTheta", error.message);
    return `<span style="color:#ff0055">Erro: ${error.message}</span>`;
  }
}


/**
 * Recebe o Top 3 filtrado matematicamente pelo cruzamento dos 4 Dashboards
 * e define qual é o "Strike de Ouro".
 */
function apiGerarVereditoMaster(payload) {
  const _serviceName = "ConsultoriaIA_Radar4D";
  try {
    SysLogger.log(_serviceName, "INFO", `Calculando Convergência 4D para ${payload.ativo}`);

    const systemInstruction = "Você é um Estrategista Chefe (Sniper) de Opções. Fale direto, curto e com precisão cirúrgica.";
    
    if (!payload.topStrikes || payload.topStrikes.length === 0) {
      return `<div style="color: var(--brand-rose); font-weight: bold;">Nenhuma opção sobreviveu ao filtro de segurança 4D hoje. Fique de fora.</div>`;
    }

    // Mapeia os dados recebidos do Front-End, incluindo o novo campo de Prêmio em R$ (Close)
    const candidatasLista = payload.topStrikes.map((c, i) => 
      `Opção: ${c.opcao} (Strike R$ ${c.strike}) | Prêmio: R$ ${c.premioRs} | Taxa: ${c.retorno}% | Risco(Delta): ${c.delta}% | Spread: ${c.spread}%`
    ).join('\n');

    const prompt = `
      O algoritmo cruzou Liquidez, Skew, Risco/Retorno e Gamma/Theta para ${payload.tipo}s de ${payload.ativo} (Spot R$ ${payload.spot}).
      Estas ${payload.topStrikes.length} opções sobreviveram ao funil matemático:
      
      ${candidatasLista}

      Sua Tarefa (Apenas 2 Tópicos):
      
      <div style="margin-bottom: 12px;">
        <span style="color: var(--brand-emerald); font-weight: bold; font-size: 14px;">🎯 O Strike de Ouro</span><br>
        A melhor escolha é a <b>[NOME DA OPÇÃO]</b> (Strike <b>R$ [VALOR DO STRIKE]</b>).<br>
        <div style="margin-top: 8px; margin-bottom: 8px; padding: 8px 12px; background: var(--surface-bg); border: 1px solid var(--border-subtle); border-radius: 6px; display: inline-block;">
          💰 Prêmio: <b style="color: var(--brand-emerald);">R$ [VALOR EM REAIS]</b> &nbsp;&nbsp;|&nbsp;&nbsp; 📈 Taxa: <b>[VALOR DO RETORNO]%</b> &nbsp;&nbsp;|&nbsp;&nbsp; ⚖️ Delta: <b>[VALOR DO DELTA]%</b>
        </div>
      </div>
      
      <div>
        <span style="color: var(--brand-indigo); font-weight: bold; font-size: 14px;">🛡️ Racional 4D</span><br>
        [Em UMA frase curta, justifique dizendo que este strike tem liquidez segura, foge do pico do Gamma e paga um bom prêmio.]
      </div>

      REGRAS RÍGIDAS: 
      - Retorne EXATAMENTE e APENAS a estrutura HTML acima.
      - Substitua os dados entre colchetes pelos valores exatos da opção vencedora. NUNCA invente números.
      - NÃO utilize blocos de código markdown (como \`\`\`html) na sua resposta. Retorne o texto puro.
      - Seja frio e calculista.
    `;

    // O parâmetro isJsonResponse é false, garantindo que o motor devolva o HTML como String
    const respostaIA = GeminiService.generate(prompt, systemInstruction, false);

    if (!respostaIA) throw new Error("A IA falhou no cálculo de convergência.");
    return respostaIA;

  } catch (error) {
    SysLogger.log(_serviceName, "ERRO_IA", "Falha Radar4D", error.message);
    return `<span style="color: var(--brand-rose);">Erro no Radar: ${error.message}</span>`;
  }
}