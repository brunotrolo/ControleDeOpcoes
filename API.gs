/**
 * ============================================================================
 * API.gs - The "State of the Art" Universal Backend Repository (Refatorado)
 * FOCO ATUAL: 10 Abas Core (Ingestão, Base, Cálculo e Interface)
 * ============================================================================
 */

// ==========================================
// 1. READ (Leitura Universal de Todo o Banco)
// ==========================================

/**
 * 🚀 FASE 1: VOO RÁPIDO
 * Carrega apenas o essencial para a tela acender imediatamente.
 *
 * 🔧 FIX: Strings literais substituídas por SYS_CONFIG.SHEETS.*
 *
 * ⚠️ ATENÇÃO: Mantido getDisplayValues() intencionalmente.
 *    O GAS não serializa Date objects via google.script.run — getValues() retorna
 *    Dates nativos que quebram a comunicação com o frontend com response: null.
 *    A conversão de tipos fica exclusivamente no Tradutor.html.
 */
function getDadosLight() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const abasEssenciais = [
      SYS_CONFIG.SHEETS.COCKPIT,
      SYS_CONFIG.SHEETS.CONFIG
    ];

    const data = {
      success: true,
      timestamp: new Date().toLocaleString('pt-BR'),
      raw: {}
    };

    abasEssenciais.forEach(nomeAba => {
      const sheet = getPlanilhaDinamica(ss, nomeAba);
      if (sheet) {
        const lastRow = sheet.getLastRow();
        data.raw[sheet.getName()] = lastRow === 0 ? [] : sheet.getDataRange().getDisplayValues();
      }
    });

    return data;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 🚚 FASE 2: CARGA PESADA (Background)
 * Otimizado APENAS para as 10 abas do Core de Operações atuais.
 * Séries legadas (400, 500, 600) foram expurgadas para economizar memória e tempo de requisição.
 *
 * 🔧 FIX: Strings literais substituídas por SYS_CONFIG.SHEETS.*
 * ⚠️ ATENÇÃO: Mantido getDisplayValues() intencionalmente — mesma razão do getDadosLight.
 */
function getAbasPesadas() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const abasPesadas = [
      // 1. Ingestão & Logs
      SYS_CONFIG.SHEETS.IMPORT,
      SYS_CONFIG.SHEETS.LOGS,

      // 2. Base de Dados & Histórico
      SYS_CONFIG.SHEETS.ASSETS,
      SYS_CONFIG.SHEETS.HIST_250D,
      SYS_CONFIG.SHEETS.DETAILS,

      // 3. Motor Matemático & Filtros
      SYS_CONFIG.SHEETS.GREEKS_CALC,
      SYS_CONFIG.SHEETS.GREEKS_API,
      SYS_CONFIG.SHEETS.SELECTION_OPT,

      // 4. OPLab Market Data (motores 014-020)
      SYS_CONFIG.SHEETS.SERIES_INSTR,
      SYS_CONFIG.SHEETS.BEST_RATES,
      SYS_CONFIG.SHEETS.VOL_OPCOES,
      SYS_CONFIG.SHEETS.VAR_OPCOES,
      SYS_CONFIG.SHEETS.RANK_M9M21,
      SYS_CONFIG.SHEETS.RANK_SCORE,
      SYS_CONFIG.SHEETS.HIST_OPCOES,
      SYS_CONFIG.SHEETS.RANK_CORREL,
      SYS_CONFIG.SHEETS.RANK_FUND,

      // 5. Consultor IA (024_ConsultorIAClaudeSonnet45)
      SYS_CONFIG.SHEETS.CONSULTOR_HIST,

      // 6. Historico de Cotacoes de Opcoes 250D (013_CoreSyncStockOptionsDataHistory)
      SYS_CONFIG.SHEETS.HIST_OPCOES_250D
    ];

    const data = { success: true, timestamp: new Date().toLocaleString('pt-BR'), raw: {} };

    abasPesadas.forEach(nomeAba => {
      const sheet = getPlanilhaDinamica(ss, nomeAba);
      if (sheet) {
        const lastRow = sheet.getLastRow();
        data.raw[sheet.getName()] = lastRow === 0 ? [] : sheet.getDataRange().getDisplayValues();
      }
    });

    return data;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// FUNÇÕES AUXILIARES (Core de Busca)
// ==========================================

/**
 * 🛡️ BUSCA DE PLANILHA DINÂMICA
 * Encontra a aba independentemente de Case Sensitive (maiúsculas/minúsculas).
 */
function getPlanilhaDinamica(planilhaAtiva, nomeProcurado) {
  const abas = planilhaAtiva.getSheets();
  const nomeProcuradoUpper = String(nomeProcurado).toUpperCase();

  // Otimização: For loop tradicional é levemente mais rápido que .find() no V8 do Apps Script
  for (let i = 0; i < abas.length; i++) {
    if (abas[i].getName().toUpperCase() === nomeProcuradoUpper) {
      return abas[i];
    }
  }
  return null;
}

function getAbaDinamica(payloadRaw, nomeProcurado) {
  const nomeProcuradoUpper = String(nomeProcurado).toUpperCase();
  const chaves = Object.keys(payloadRaw);

  for (let i = 0; i < chaves.length; i++) {
    if (String(chaves[i]).toUpperCase() === nomeProcuradoUpper) {
      return payloadRaw[chaves[i]];
    }
  }
  return null;
}

// ==========================================
// 🧪 MÓDULO DE TESTE (Para Homologação)
// ==========================================

/**
 * Rode esta função diretamente no Google Apps Script para validar
 * se o servidor consegue ler as 10 abas perfeitamente.
 */
function testarAPI_Leitura() {
  Logger.log("Iniciando Teste: getDadosLight()...");
  const light = getDadosLight();
  Logger.log("Status Light: " + light.success);
  Logger.log("Abas carregadas no Light: " + Object.keys(light.raw).join(", "));

  Logger.log("-----------------------------------------");

  Logger.log("Iniciando Teste: getAbasPesadas()...");
  const pesadas = getAbasPesadas();
  Logger.log("Status Pesadas: " + pesadas.success);
  Logger.log("Abas carregadas no Pesadas: " + Object.keys(pesadas.raw).join(", "));

  if (pesadas.error) {
    Logger.log("ERRO ENCONTRADO: " + pesadas.error);
  } else {
    Logger.log("✅ PARTE 1 HOMOLOGADA COM SUCESSO. Nenhuma falha de leitura.");
  }
}


// ==========================================
// 1b. LEITURA DIRETA DE ABA (OpLab Hub)
// ==========================================

/**
 * Lê qualquer aba do Sheets e retorna como array de objetos JSON.
 * Usado pelo OpLabHub para carregar as abas OPLab sob demanda,
 * sem passar pelo pipeline getDadosLight/getAbasPesadas.
 *
 * Linha 1 = cabeçalho. Linhas vazias são ignoradas.
 * Retorna [] se a aba não existir ou estiver vazia.
 *
 * Uso no frontend:
 *   google.script.run
 *     .withSuccessHandler(resolve)
 *     .lerAbaComoJSON('SERIES_OPCOES_INSTRUMENTO');
 */
function lerAbaComoJSON(nomeAba) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getPlanilhaDinamica(ss, nomeAba);
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const valores = sheet.getDataRange().getDisplayValues();
    const cabecalho = valores[0].map(function(h) { return String(h).trim(); });

    var resultado = [];
    for (var i = 1; i < valores.length; i++) {
      var linha = valores[i];
      // Ignora linhas completamente vazias
      if (linha.every(function(cel) { return String(cel).trim() === ''; })) continue;

      var obj = {};
      cabecalho.forEach(function(col, j) {
        if (col) obj[col] = linha[j] !== undefined ? linha[j] : '';
      });
      resultado.push(obj);
    }

    return resultado;
  } catch (e) {
    console.error('[lerAbaComoJSON] Erro ao ler aba ' + nomeAba + ': ' + e.message);
    return [];
  }
}

// ==========================================
// 1c. EXPORTAR COCKPIT (CSV Download)
// ==========================================

/**
 * Lê a aba COCKPIT a partir da linha 10 (cabeçalho real) até a última linha
 * preenchida e devolve o array 2D de display values para o frontend gerar o CSV.
 *
 * Uso no frontend:
 *   google.script.run
 *     .withSuccessHandler(handler)
 *     .exportarCockpitCSV();
 */
function exportarCockpitCSV() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.COCKPIT);

    if (!sheet) return { success: false, error: "Aba COCKPIT não encontrada." };

    const LINHA_CABECALHO = 10;
    const lastRow  = sheet.getLastRow();
    const lastCol  = sheet.getLastColumn();

    if (lastRow < LINHA_CABECALHO || lastCol === 0) {
      return { success: true, rows: [] };
    }

    const numLinhas = lastRow - LINHA_CABECALHO + 1;
    const rows = sheet
      .getRange(LINHA_CABECALHO, 1, numLinhas, lastCol)
      .getDisplayValues();

    return { success: true, rows: rows };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// 2. CREATE (Inserção em Lote)
// ==========================================

/**
 * 🔧 FIX: Lógica de busca de linha vazia substituída por getLastRow() + 1.
 *         A abordagem anterior era frágil — qualquer célula vazia no meio dos
 *         dados causava inserção na posição errada.
 */
function apiAdicionarLinhas(nomeAba, dadosMatriz) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
    if (!sheet) throw new Error(`Aba [${nomeAba}] não existe no banco de dados.`);
    if (!dadosMatriz || dadosMatriz.length === 0) return { success: true, message: "Nenhum dado para inserir." };

    // 🔧 FIX: getLastRow() conta linhas que já tiveram conteúdo (mesmo deletadas),
    //         causando gaps quando rows são excluídas. A solução correta é varrer
    //         a coluna A e encontrar a primeira célula realmente vazia.
    const colA = sheet.getRange(1, 1, sheet.getMaxRows(), 1).getValues();
    let startRow = colA.length + 1; // fallback: fim da aba
    for (let i = 0; i < colA.length; i++) {
      if (String(colA[i][0]).trim() === '') {
        startRow = i + 1; // índice 1-based
        break;
      }
    }

    sheet.getRange(startRow, 1, dadosMatriz.length, dadosMatriz[0].length).setValues(dadosMatriz);
    SpreadsheetApp.flush();

    return { success: true, message: `${dadosMatriz.length} linhas adicionadas em [${nomeAba}] a partir da linha ${startRow}.` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// 3. UPDATE (Atualização de Chave-Valor)
// ==========================================

function apiAtualizarChaveValor(nomeAba, payload) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getPlanilhaDinamica(ss, nomeAba);
    if (!sheet) throw new Error(`Aba de configurações [${nomeAba}] não encontrada.`);

    const data = sheet.getDataRange().getValues();
    const chavesNovas = Object.keys(payload);
    let atualizacoes = 0;

    // Percorre a planilha procurando as chaves enviadas
    for (let i = 0; i < data.length; i++) {
      const chavePlanilha = String(data[i][0]).trim();
      if (chavesNovas.includes(chavePlanilha)) {
        sheet.getRange(i + 1, 2).setValue(payload[chavePlanilha]);
        atualizacoes++;
      }
    }

    SpreadsheetApp.flush();
    return { success: true, message: `${atualizacoes} chaves atualizadas com sucesso.` };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function apiSetCellValue(nomeAba, linha, coluna, valor) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 🔧 FIX: busca a aba ignorando maiúsculas/minúsculas
    // getSheetByName é case-sensitive — 'Cockpit' != 'COCKPIT'
    const sheets = ss.getSheets();
    const sheet  = sheets.find(s => s.getName().toUpperCase() === String(nomeAba).toUpperCase());
    if (!sheet) throw new Error(`Aba [${nomeAba}] não encontrada. Abas disponíveis: ${sheets.map(s => s.getName()).join(', ')}`);

    if (!linha || linha < 1) throw new Error(`Linha inválida: ${linha}`);
    if (!coluna || coluna < 1) throw new Error(`Coluna inválida: ${coluna}`);

    sheet.getRange(linha, coluna).setValue(valor);
    SpreadsheetApp.flush();
    return { success: true, timestamp: new Date().toLocaleTimeString() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// 4. DELETE & TRUNCATE (Exclusão e Limpeza)
// ==========================================

function apiExcluirLinhaSegura(nomeAba, numeroLinha, valorEsperadoColunaA) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
    if (!sheet) throw new Error(`Aba [${nomeAba}] não existe no banco de dados.`);

    const valorPlanilha = String(sheet.getRange(numeroLinha, 1).getDisplayValue() || "").trim().toUpperCase();
    const valorSeguro = String(valorEsperadoColunaA || "").trim().toUpperCase();

    // Trava anti-dessincronização (Double Check)
    if (valorPlanilha !== valorSeguro) {
      return { success: false, error: `Falha de sincronia: Esperava encontrar [${valorSeguro}], mas encontrou [${valorPlanilha}] na linha ${numeroLinha}. Exclusão abortada.` };
    }

    sheet.deleteRow(numeroLinha);
    SpreadsheetApp.flush();
    return { success: true, message: `Registro [${valorSeguro}] removido de [${nomeAba}].` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiExcluirLinhasEmLote(nomeAba, listaLinhas) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(nomeAba);
    if (!sheet) throw new Error("Aba não encontrada: " + nomeAba);

    // FILTRO DE SEGURANÇA: Remove nulos, converte para inteiro e ordena de baixo para cima
    const linhasOrdenadas = listaLinhas
      .filter(l => l !== null && l !== undefined && !isNaN(l))
      .map(l => parseInt(l, 10))
      .filter(l => l > 0) // Impede deleção de linha 0 ou negativa
      .sort((a, b) => b - a); // ⚠️ OBRIGATÓRIO: Deletar de baixo para cima para não mudar o índice das linhas de cima

    linhasOrdenadas.forEach(linha => {
      sheet.deleteRow(linha);
    });

    SpreadsheetApp.flush();
    return { success: true, count: linhasOrdenadas.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function apiLimparAba(nomeAba, manterLinhasTop = 1, mensagemAuditoria = null) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(nomeAba);
    if (!sheet) throw new Error(`Aba [${nomeAba}] não existe no banco de dados.`);

    const lastRow = sheet.getLastRow();
    if (lastRow > manterLinhasTop) {
      sheet.getRange(manterLinhasTop + 1, 1, lastRow - manterLinhasTop, sheet.getLastColumn()).clearContent();
    }

    // Rastro de auditoria
    if (mensagemAuditoria) {
      const ts = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "dd/MM/yyyy HH:mm:ss");
      sheet.getRange(manterLinhasTop + 1, 1, 1, 4).setValues([[ts, "SYSTEM", "AVISO", mensagemAuditoria]]);
    }

    SpreadsheetApp.flush();
    return { success: true, message: `Aba [${nomeAba}] foi limpa, mantendo ${manterLinhasTop} linha(s) de cabeçalho.` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// 🧪 MÓDULO DE TESTE DA PARTE 2 (Homologação)
// ==========================================

function testarAPI_Escrita() {
  Logger.log("Iniciando Teste de Escrita na aba [Logs]...");

  // 1. Testa Inserção (Adiciona um Log falso)
  const timestamp = new Date().toLocaleString();
  const resInsert = apiAdicionarLinhas(SYS_CONFIG.SHEETS.LOGS, [[timestamp, "SISTEMA_TESTE", "INFO", "Teste de Homologação da API de Escrita", ""]]);
  Logger.log("Adicionar Linha: " + resInsert.success + " | " + resInsert.message);

  // 2. Testa Limpeza Segura (Limpa os Logs mantendo o cabeçalho e adicionando auditoria)
  const resLimpar = apiLimparAba(SYS_CONFIG.SHEETS.LOGS, 1, "Auditoria de teste gerada pelo testarAPI_Escrita.");
  Logger.log("Limpar Aba Segura: " + resLimpar.success + " | " + resLimpar.message);

  if (resInsert.error || resLimpar.error) {
    Logger.log("❌ ERRO ENCONTRADO DURANTE A ESCRITA/LIMPEZA.");
  } else {
    Logger.log("✅ PARTE 2 HOMOLOGADA COM SUCESSO. Banco de dados seguro.");
  }
}


// ==========================================
// 5. EXTERNAL API BRIDGE (Integrações de Terceiros)
// ==========================================

function apiIntegracaoOpLab(ticker) {
  if (!ticker || String(ticker).trim() === '') {
    return { success: false, error: 'Ticker nao fornecido.' };
  }

  try {
    var cleanTicker = String(ticker).toUpperCase().trim();
    var data = OplabService.getOptionDetails(cleanTicker);

    if (!data) return { success: false, error: 'Opcao [' + cleanTicker + '] nao encontrada ou sem liquidez na API OpLab.' };

    // Extrai a data de vencimento no formato YYYY-MM-DD
    var expiry = '';
    if (data.due_date) {
      // due_date pode vir como "2026-05-15T03:00:00.000Z" ou "2026-05-15"
      expiry = String(data.due_date).substring(0, 10);
    } else if (data.days_to_maturity) {
      // Fallback: calcula a data aproximada somando dte a hoje
      var dataVenc = new Date();
      dataVenc.setDate(dataVenc.getDate() + parseInt(data.days_to_maturity || 0));
      var y  = dataVenc.getFullYear();
      var m  = String(dataVenc.getMonth() + 1).padStart(2, '0');
      var d  = String(dataVenc.getDate()).padStart(2, '0');
      expiry = y + '-' + m + '-' + d;
    }

    // Busca a Selic atual da Config_Global para pre-popular o campo de taxa
    var taxaJuros = 14.75; // fallback padrao
    try {
      var cfg = ConfigManager.get();
      if (cfg && cfg['Taxa_Selic_Anual']) {
        taxaJuros = parseFloat(String(cfg['Taxa_Selic_Anual']).replace(',', '.')) * 100 || 14.75;
      }
    } catch (eCfg) {
      // silencioso -- usa o fallback
    }

    // Busca IV (volatilidade implicita) do ativo mae na aba DADOS_ATIVOS
    // Coluna IV = volatilidade implicita atual (calculada pelo 008_CoreSyncStockData)
    var ivAtivo = null;
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var abaAtivos = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.ASSETS);
      if (abaAtivos && abaAtivos.getLastRow() > 1) {
        var headersAtivos = abaAtivos.getRange(1, 1, 1, abaAtivos.getLastColumn()).getValues()[0];
        var colTicker = -1, colIV = -1;
        for (var hi = 0; hi < headersAtivos.length; hi++) {
          var h = String(headersAtivos[hi]).trim().toUpperCase();
          if (h === 'TICKER') colTicker = hi;
          if (h === 'IV')     colIV     = hi;
        }
        if (colTicker >= 0 && colIV >= 0) {
          // Campo correto na API OpLab: 'parent_symbol' (confirmado via debug)
          // 'underlying' nao existe neste endpoint -- vem undefined
          var tickerBusca = String(
            data.parent_symbol ||
            data.underlying    ||
            data.stock         ||
            ''
          ).trim().toUpperCase();

          // Fallback: extrair ticker mae removendo sufixo de opcao do symbol
          // Ex: 'SANBJ349' -> tenta encontrar 'SANB11' via lookup direto
          // Nao tentamos regex aqui pois e dificil de acertar para todos os casos --
          // confiamos no campo 'underlying' da API

          if (tickerBusca) {
            var valoresAtivos = abaAtivos.getRange(2, 1, abaAtivos.getLastRow() - 1, abaAtivos.getLastColumn()).getValues();
            for (var ri = 0; ri < valoresAtivos.length; ri++) {
              if (String(valoresAtivos[ri][colTicker]).trim().toUpperCase() === tickerBusca) {
                var ivBruto = valoresAtivos[ri][colIV];

                // FIX 2: DADOS_ATIVOS usa getDisplayValues() -- IV pode vir como:
                //   numero puro  : 0.3359  (decimal, ja na forma correta)
                //   string BR    : "33,59" (percentual com virgula)
                //   string US    : "33.59" (percentual com ponto)
                // Regra: se o valor numerico for > 1, e percentual -> dividir por 100
                var ivNum = parseFloat(String(ivBruto).replace('%', '').replace(',', '.').trim());
                if (!isNaN(ivNum) && ivNum > 0) {
                  ivAtivo = ivNum > 1 ? ivNum / 100 : ivNum;
                }
                break;
              }
            }
          }
        }
      }
    } catch (eIV) {
      // silencioso -- ivAtivo permanece null, frontend exibe campo manual
      SysLogger.log('apiIntegracaoOpLab', 'AVISO', 'Falha ao buscar IV de DADOS_ATIVOS: ' + eIV.message);
    }

    return {
      success: true,
      data: {
        symbol:      data.symbol      || cleanTicker,
        category:    String(data.category || data.type || 'CALL').toUpperCase(),
        strike:      parseFloat(data.strike            || 0),
        premioAtual: parseFloat(data.close > 0 ? data.close : (data.bid || 0)),
        spotPrice:   parseFloat(data.spot_price || data.spot || 0),
        dte:         parseInt(data.days_to_maturity    || 0),
        expiry:      expiry,
        taxaJuros:   taxaJuros,
        ivAtivo:     ivAtivo       // null se nao encontrado -> frontend mostra campo manual
      }
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==========================================
// 7. IA: INSIGHT DE HISTORICO DE OPCAO (Motor 013 / DashHistoricoOpcoes)
// ==========================================

/**
 * Gera analise de trajetoria de premio para uma opcao especifica.
 * Chamado pelo DashHistoricoOpcoes.html via google.script.run.
 */
function apiGerarInsightHistoricoOpcao(payload) {
  try {
    var prompt =
      'Voce e um analista quantitativo especialista em opcoes da B3 (Brasil). ' +
      'Analise a trajetoria de premio da seguinte opcao com base nos dados historicos fornecidos. ' +
      'Seja objetivo, use linguagem de trader experiente, maximo 5 paragrafos curtos. ' +
      'Use HTML simples (p, strong, ul/li). Nao use markdown.\n\n' +
      'OPCAO: ' + (payload.opcao || '') + ' | ATIVO: ' + (payload.ticker || '') + ' | TIPO: ' + (payload.tipo || '') + '\n' +
      'Strike: R$ ' + (payload.strike || 0) + ' | Premio de Entrada: R$ ' + (payload.entryPrice || 0) + '\n' +
      'Premio Atual: R$ ' + (payload.premioAtual || 0) + ' | P/L Acumulado: ' + (payload.plPct || 0) + '%\n' +
      'IV no inicio: ' + (payload.ivInicio || 0) + '% | IV atual: ' + (payload.ivAtual || 0) + '%\n' +
      'Delta atual: ' + (payload.delta || 0) + ' | Moneyness: ' + (payload.moneyness || '') + ' | DTE: ' + (payload.dte || 0) + 'd\n' +
      'Total de candles analisados: ' + (payload.totalCandles || 0) + '\n\n' +
      'Responda:\n' +
      '1. O decaimento do premio esta sendo saudavel ou ha anomalias?\n' +
      '2. A variacao da IV afetou o preco de forma relevante?\n' +
      '3. O posicionamento atual (Moneyness + Delta) justifica manutencao ou recompra?\n' +
      '4. Existe risco de exercicio iminente?\n' +
      '5. Qual a recomendacao objetiva para esta posicao?';

    var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY') || '';
    if (!apiKey) return '<p style="color:var(--brand-rose);">Chave ANTHROPIC_API_KEY nao configurada nas propriedades do script.</p>';

    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });

    var json = JSON.parse(response.getContentText());
    if (json && json.content && json.content[0]) return json.content[0].text;
    return '<p style="color:var(--brand-rose);">Resposta inesperada da IA.</p>';
  } catch (e) {
    return '<p style="color:var(--brand-rose);">Erro ao chamar IA: ' + e.message + '</p>';
  }
}

// ==========================================
// DEBUG: Testar apiIntegracaoOpLab (rodar manualmente no editor GAS)
// ==========================================

/**
 * Cole um ticker e rode esta funcao no editor GAS para ver o que a API retorna.
 * Isso resolve o misterio do ivAtivo vindo null.
 */
function debugApiIntegracaoOpLab() {
  var ticker = 'SANBJ349'; // <-- troque pelo ticker que quiser testar

  // 1. Ver o retorno bruto da API OpLab
  var raw = OplabService.getOptionDetails(ticker);
  console.log('=== RETORNO BRUTO DA OPLAB ===');
  console.log('underlying:  ' + raw.underlying);
  console.log('symbol:      ' + raw.symbol);
  console.log('category:    ' + raw.category);
  console.log('type:        ' + raw.type);
  console.log('strike:      ' + raw.strike);
  console.log('spot_price:  ' + raw.spot_price);
  console.log('close:       ' + raw.close);
  console.log('due_date:    ' + raw.due_date);
  console.log('days_to_mat: ' + raw.days_to_maturity);
  console.log('Campos disponiveis: ' + Object.keys(raw).join(', '));

  // 2. Ver o que existe na DADOS_ATIVOS para o underlying
  var tickerBusca = String(raw.underlying || raw.symbol || '').trim().toUpperCase();
  console.log('');
  console.log('=== LOOKUP DADOS_ATIVOS ===');
  console.log('Ticker buscado: ' + tickerBusca);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaAtivos = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.ASSETS);
  var headers = abaAtivos.getRange(1, 1, 1, abaAtivos.getLastColumn()).getValues()[0];
  console.log('Cabecalhos DADOS_ATIVOS: ' + headers.join(' | '));

  var colTicker = -1, colIV = -1;
  headers.forEach(function(h, i) {
    var hu = String(h).trim().toUpperCase();
    if (hu === 'TICKER') colTicker = i;
    if (hu === 'IV')     colIV     = i;
  });
  console.log('Col TICKER: ' + colTicker + ' | Col IV: ' + colIV);

  var dados = abaAtivos.getRange(2, 1, abaAtivos.getLastRow() - 1, abaAtivos.getLastColumn()).getValues();
  var encontrou = false;
  for (var i = 0; i < dados.length; i++) {
    var tk = String(dados[i][colTicker]).trim().toUpperCase();
    if (tk === tickerBusca) {
      var ivBruto = dados[i][colIV];
      console.log('ENCONTROU: linha ' + (i + 2) + ' | IV bruto = [' + ivBruto + '] | tipo = ' + typeof ivBruto);
      console.log('IV parseado: ' + parseFloat(String(ivBruto).replace(',', '.')));
      encontrou = true;
      break;
    }
  }
  if (!encontrou) {
    console.log('NAO ENCONTROU "' + tickerBusca + '" em DADOS_ATIVOS');
    console.log('Tickers disponíveis: ' + dados.slice(0, 5).map(function(r) { return r[colTicker]; }).join(', ') + '...');
  }

  // 3. Ver o retorno final da funcao
  console.log('');
  console.log('=== RETORNO FINAL apiIntegracaoOpLab ===');
  var resultado = apiIntegracaoOpLab(ticker);
  console.log(JSON.stringify(resultado, null, 2));
}

