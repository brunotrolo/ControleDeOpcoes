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

// ==========================================
// 6. ORQUESTRAÇÃO DE ESTADO E SIMULAÇÃO
// ==========================================

/**
 * Atualiza o horizonte na Config_Global e tenta rodar o pipeline.
 * Preparado para degradação graciosa (se o pipeline for deletado, ele não quebra).
 *
 * 🔧 FIX: String literal "Config_Global" substituída por SYS_CONFIG.SHEETS.CONFIG
 */
function apiSimularHorizontePreditivo(diasParam) {
  try {
    const dias = parseInt(diasParam, 10);
    if (isNaN(dias) || dias < 1 || dias > 45) {
      throw new Error("Horizonte inválido. O parâmetro deve ser um número entre 1 e 45.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const abaConfig = getPlanilhaDinamica(ss, SYS_CONFIG.SHEETS.CONFIG);
    if (!abaConfig) throw new Error(`Aba [${SYS_CONFIG.SHEETS.CONFIG}] não encontrada no banco de dados.`);

    const dados = abaConfig.getDataRange().getValues();
    let configuracaoAtualizada = false;

    for (let i = 0; i < dados.length; i++) {
      if (String(dados[i][0]).trim() === "Regra_Dias_Horizonte_Preditivo") {
        abaConfig.getRange(i + 1, 2).setValue(dias);
        configuracaoAtualizada = true;
        break;
      }
    }

    if (!configuracaoAtualizada) {
      abaConfig.appendRow([
        "Regra_Dias_Horizonte_Preditivo",
        dias,
        "[SISTEMA] Horizonte de simulação configurado via Web App"
      ]);
    }

    SpreadsheetApp.flush();

    // Tenta acionar o recálculo, mas não quebra se os arquivos legados não existirem
    let statusPipeline = "Salvo em Config_Global (Modo Standby).";
    if (typeof executarFluxoSequencial === "function") {
      executarFluxoSequencial();
      statusPipeline = "Pipeline sequencial acionado com sucesso.";
    } else if (typeof gerarAnalisePreditivaHeatmap === "function") {
      gerarAnalisePreditivaHeatmap(dias);
      statusPipeline = "Heatmap preditivo atualizado isoladamente.";
    }

    return {
      success: true,
      mensagem: `Simulação para ${dias} dias processada. ${statusPipeline}`,
      horizonte: dias
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}


// ==========================================
// 🧪 MÓDULO DE TESTE DA PARTE 3 (Homologação)
// ==========================================

function testarAPI_Integracoes() {
  Logger.log("Iniciando Teste da Parte 3...");

  // Teste de Estado
  const resSimulador = apiSimularHorizontePreditivo(15);
  Logger.log("Atualização de Configuração: " + resSimulador.success + " | " + resSimulador.mensagem);

  if (resSimulador.error) {
    Logger.log("❌ ERRO ENCONTRADO NA PARTE 3.");
  } else {
    Logger.log("✅ PARTE 3 HOMOLOGADA COM SUCESSO. Arquivo API.gs finalizado!");
  }
}


// ============================================================================
// MÓDULO: PATRIMÔNIO SNAPSHOT — cole ao final do API.gs existente
//
// v4 — Todos os 11 bugs corrigidos com base nos dados reais da Necton:
//
// PAT_SNAPSHOT:
//   [B1] patrimonioTotal=0 → lookahead correto na ordem de leitura
//   [B2] lancamentosFuturos pegando valor de trânsito → lookahead limitado
//
// PAT_RENDA_VARIAVEL:
//   [B3] totalAcoes="2", totalETFs="1" → "N produtos" não confundido com total
//
// PAT_ACOES:
//   [B4] TIPO_ATIVO deslocado (coluna J sem cabeçalho) → array corrigido
//   [B5] QUANTIDADE=0 para "3.000" → _patQtd aplicado no bloco2
//   [B6] PRIO3/LFTB11 como ETF → seção preservada após cabeçalhos multi-linha
//   [B7] Ticker cortado "INVEST" / "PRIO" → regex /^([A-Z]{3,5}\d{1,2})(.+)?$/
//
// PAT_DERIVATIVOS:
//   [B8]  VALOR_MERCADO=0 → regex R$ limitado a 2 casas decimais
//   [B9]  RESULTADO_PCT=0 → capturado da substring após o último R$
//   [B10] BRKMR80 ausente → regex aceita 2-3 dígitos no strike
//   [B11] SANBJ349 capturado como SANBJ3494 → regex código+qtd combinado
// ============================================================================

const PAT_ABAS = {
  SNAPSHOT:    'PAT_SNAPSHOT',
  RV:          'PAT_RENDA_VARIAVEL',
  ACOES:       'PAT_ACOES',
  EXTRATO:     'PAT_EXTRATO',
  TRANSITO:    'PAT_TRANSITO',
  DERIVATIVOS: 'PAT_DERIVATIVOS',
  GARANTIAS:   'PAT_GARANTIAS'
};

const PAT_HDRS = {
  SNAPSHOT:    ['SNAPSHOT_ID','SNAPSHOT_DATE','NOTA','PATRIMONIO_TOTAL','VARIACAO_12M_VALOR','VARIACAO_12M_PCT','SALDO_CONTA','TOTAL_INVESTIDO','LANCAMENTOS_FUTUROS'],
  RV:          ['SNAPSHOT_ID','SNAPSHOT_DATE','TOTAL_RV','VARIACAO_RV_VALOR','VARIACAO_RV_PCT','TOTAL_ACOES','TOTAL_ETFS'],
  ACOES:       ['SNAPSHOT_ID','SNAPSHOT_DATE','TIPO_ATIVO','TICKER','NOME','QUANTIDADE','PRECO_MEDIO','PRECO_MERCADO','RESULTADO_PCT','SALDO_BRUTO'],
  EXTRATO:     ['SNAPSHOT_ID','SNAPSHOT_DATE','DATA_LANCAMENTO','TIPO','DESCRICAO','MOVIMENTACAO','SALDO_APOS'],
  TRANSITO:    ['SNAPSHOT_ID','SNAPSHOT_DATE','DATA_PREVISTA','PRAZO','OPERACAO','ATIVO','MERCADO','VALOR'],
  DERIVATIVOS: ['SNAPSHOT_ID','SNAPSHOT_DATE','CODIGO','QUANTIDADE','TIPO','POSICAO','DATA_EXERCICIO','STRIKE','PREMIO_EXERCICIO','PRECO_MEDIO','VALOR_MERCADO','RESULTADO_PCT'],
  GARANTIAS:   ['SNAPSHOT_ID','SNAPSHOT_DATE','TICKER','NOME','QUANTIDADE','PRECO_MERCADO','SALDO_BRUTO']
};

// ── apiAdicionarLinhas corrigida (getLastRow+1) ───────────────────────────
function apiAdicionarLinhas(nomeAba, dadosMatriz) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
    if (!sheet) throw new Error('Aba [' + nomeAba + '] não existe.');
    if (!dadosMatriz || dadosMatriz.length === 0) return { success: true, message: 'Nenhum dado.' };
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, dadosMatriz.length, dadosMatriz[0].length).setValues(dadosMatriz);
    SpreadsheetApp.flush();
    return { success: true, message: dadosMatriz.length + ' linhas adicionadas a partir da linha ' + startRow + '.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================================================
// FUNÇÃO PRINCIPAL
// ============================================================================
function apiSalvarPatrimonioSnapshot(payload) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    _patGarantirAbas(ss);

    const tz           = ss.getSpreadsheetTimeZone();
    const agora        = new Date();
    const snapshotId   = 'PAT_' + Utilities.formatDate(agora, tz, 'yyyyMMdd_HHmmss');
    const snapshotDate = Utilities.formatDate(agora, tz, 'dd/MM/yyyy HH:mm:ss');
    const nota         = String(payload.nota || '').trim();

    const b1 = _patParseBloco1(payload.bloco1 || '');
    const b2 = _patParseBloco2(payload.bloco2 || '');
    const b3 = _patParseBloco3(payload.bloco3 || '');
    const b4 = _patParseBloco4(payload.bloco4 || '');
    const b5 = _patParseBloco5(payload.bloco5 || '');

    apiAdicionarLinhas(PAT_ABAS.SNAPSHOT, [[
      snapshotId, snapshotDate, nota,
      b1.patrimonioTotal, b1.variacao12mValor, b1.variacao12mPct,
      b1.saldoConta, b1.totalInvestido, b1.lancamentosFuturos
    ]]);

    apiAdicionarLinhas(PAT_ABAS.RV, [[
      snapshotId, snapshotDate,
      b2.totalRV, b2.variacaoRVValor, b2.variacaoRVPct,
      b2.totalAcoes, b2.totalETFs
    ]]);

    // [B4-FIX] array com 10 elementos na ordem correta do PAT_HDRS.ACOES
    const linhasAtivos = [
      ...b2.acoes.map(a => [snapshotId, snapshotDate, 'ACAO',
        a.ticker, a.nome, a.quantidade, a.precoMedio, a.precoMercado, a.resultadoPct, a.saldoBruto]),
      ...b2.etfs.map(e => [snapshotId, snapshotDate, 'ETF',
        e.ticker, e.nome, e.quantidade, e.precoMedio, e.precoMercado, e.resultadoPct, e.saldoBruto])
    ];
    if (linhasAtivos.length > 0) apiAdicionarLinhas(PAT_ABAS.ACOES, linhasAtivos);

    const linhasExtrato = b3.linhas.map(l => [
      snapshotId, snapshotDate, l.data, l.tipo, l.descricao, l.movimentacao, l.saldoApos
    ]);
    if (linhasExtrato.length > 0) apiAdicionarLinhas(PAT_ABAS.EXTRATO, linhasExtrato);

    const linhasTransito = b4.linhas.map(l => [
      snapshotId, snapshotDate, l.dataPrevista, l.prazo, l.operacao, l.ativo, l.mercado, l.valor
    ]);
    if (linhasTransito.length > 0) apiAdicionarLinhas(PAT_ABAS.TRANSITO, linhasTransito);

    const linhasDerivs = b5.opcoes.map(o => [
      snapshotId, snapshotDate, o.codigo, o.quantidade,
      o.tipo, o.posicao, o.dataExercicio, o.strike,
      o.premioExercicio, o.precoMedio, o.valorMercado, o.resultadoPct
    ]);
    if (linhasDerivs.length > 0) apiAdicionarLinhas(PAT_ABAS.DERIVATIVOS, linhasDerivs);

    const linhasGarantias = b2.garantias.map(g => [
      snapshotId, snapshotDate, g.ticker, g.nome, g.quantidade, g.precoMercado, g.saldoBruto
    ]);
    if (linhasGarantias.length > 0) apiAdicionarLinhas(PAT_ABAS.GARANTIAS, linhasGarantias);

    SpreadsheetApp.flush();

    return {
      success: true, snapshotId: snapshotId,
      resumo: {
        patrimonioTotal:  b1.patrimonioTotal,
        saldoConta:       b1.saldoConta,
        totalAtivos:      linhasAtivos.length,
        totalExtrato:     linhasExtrato.length,
        totalTransito:    linhasTransito.length,
        totalDerivativos: linhasDerivs.length,
        totalGarantias:   linhasGarantias.length
      }
    };
  } catch (e) {
    console.error('[PatrimonioSnapshot] Erro:', e.message);
    return { success: false, error: e.message };
  }
}

// ============================================================================
// LEITURA
// ============================================================================
function apiGetPatrimonioSnapshots() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getPlanilhaDinamica(ss, PAT_ABAS.SNAPSHOT);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };
    const hdrs = PAT_HDRS.SNAPSHOT;
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, hdrs.length)
      .getDisplayValues()
      .map(r => { const o = {}; hdrs.forEach((h, i) => { o[h] = r[i]; }); return o; })
      .reverse();
    return { success: true, data };
  } catch (e) { return { success: false, error: e.message }; }
}

function apiGetPatrimonioSnapshotDetalhe(snapshotId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const filtrar = (nomeAba, hdrs) => {
      const sheet = getPlanilhaDinamica(ss, nomeAba);
      if (!sheet || sheet.getLastRow() < 2) return [];
      return sheet.getRange(2, 1, sheet.getLastRow() - 1, hdrs.length)
        .getDisplayValues()
        .filter(r => r[0] === snapshotId)
        .map(r => { const o = {}; hdrs.forEach((h, i) => { o[h] = r[i]; }); return o; });
    };
    return {
      success: true,
      rvResumo:    filtrar(PAT_ABAS.RV,          PAT_HDRS.RV),
      ativos:      filtrar(PAT_ABAS.ACOES,       PAT_HDRS.ACOES),
      extrato:     filtrar(PAT_ABAS.EXTRATO,     PAT_HDRS.EXTRATO),
      transito:    filtrar(PAT_ABAS.TRANSITO,    PAT_HDRS.TRANSITO),
      derivativos: filtrar(PAT_ABAS.DERIVATIVOS, PAT_HDRS.DERIVATIVOS),
      garantias:   filtrar(PAT_ABAS.GARANTIAS,   PAT_HDRS.GARANTIAS)
    };
  } catch (e) { return { success: false, error: e.message }; }
}

// ============================================================================
// PARSERS
// ============================================================================

/**
 * BLOCO 1 — Patrimônio geral
 * [B1-FIX] patrimonioTotal lido na ordem correta: ignora variação e labels
 * [B2-FIX] lancamentosFuturos: busca apenas a próxima linha com R$ após o label,
 *          não confunde com valores de trânsito que vêm depois
 */
function _patParseBloco1(texto) {
  const r = { patrimonioTotal:0, variacao12mValor:0, variacao12mPct:0, saldoConta:0, totalInvestido:0, lancamentosFuturos:0 };
  if (!texto) return r;
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < linhas.length; i++) {
    const l    = linhas[i];
    const prox = linhas[i + 1] || '';

    // [B1-FIX] Patrimônio total: primeira linha R$ pura, sem label de contexto
    // Ignora linhas que contenham labels ou sinais de variação
    if (/^R\$\s*[\d]/.test(l) && r.patrimonioTotal === 0 &&
        !/conta|investido|futuros|variável|últimos|meses|[-+]/i.test(l)) {
      r.patrimonioTotal = _patMoeda(l);
      continue;
    }

    // Linha de variação colada: "+ R$ 1.374,76 (-0.17%)nos últimos 12 meses"
    if (/nos\s+últimos\s+12\s+meses|last\s+12/i.test(l)) {
      const mV = (l.match(/([-+]?\s*R\$\s*[\d.,]+)/g) || []);
      if (mV.length >= 1) r.variacao12mValor = _patMoeda(mV[0]);
      const mP = l.match(/([-+]?\s*[\d.,]+)\s*%/);
      if (mP) r.variacao12mPct = parseFloat(mP[1].replace(',','.')) || 0;
      continue;
    }

    // Sinal de variação sozinho: "+ R$ 5.720,52 (-26.93%)"
    if (/^[+\-]\s*R\$\s*[\d]/.test(l) && r.variacao12mValor === 0) {
      r.variacao12mValor = _patMoeda(l);
      const mP = l.match(/([-+]?\s*[\d.,]+)\s*%/);
      if (mP) r.variacao12mPct = parseFloat(mP[1].replace(',','.')) || 0;
      continue;
    }

    // Conta investimento
    if (/conta\s+investimento/i.test(l)) {
      r.saldoConta = /R\$\s*[\d]/.test(l) ? _patMoeda(l) : _patMoeda(prox);
      continue;
    }

    // Total investido
    if (/total\s+investido/i.test(l)) {
      r.totalInvestido = /R\$\s*[\d]/.test(l) ? _patMoeda(l) : _patMoeda(prox);
      continue;
    }

    // [B2-FIX] Lançamentos futuros: pega APENAS a próxima linha com R$
    // Limita a busca às próximas 2 linhas para não pegar valores de trânsito
    if (/lança(mentos)?\s+futuros/i.test(l)) {
      const valNaLinha = /R\$\s*[\d]/.test(l) ? _patMoeda(l) : 0;
      if (valNaLinha !== 0) { r.lancamentosFuturos = valNaLinha; continue; }
      // Busca nas próximas 2 linhas apenas
      for (let j = i + 1; j <= Math.min(i + 2, linhas.length - 1); j++) {
        if (/^R\$\s*[\d]/.test(linhas[j]) || /^-?\s*R\$\s*[\d]/.test(linhas[j])) {
          r.lancamentosFuturos = _patMoeda(linhas[j]);
          break;
        }
      }
      continue;
    }
  }
  return r;
}

/**
 * BLOCO 2 — Renda Variável
 * [B3-FIX] "N produtos" ignorado antes de capturar totais de seção
 * [B5-FIX] _patQtd para quantidade com ponto de milhar
 * [B6-FIX] seção preservada após cabeçalhos multi-linha
 * [B7-FIX] regex ticker /^([A-Z]{3,5}\d{1,2})(.+)?$/ separa ticker do nome
 */
function _patParseBloco2(texto) {
  const r = { totalRV:0, variacaoRVValor:0, variacaoRVPct:0, totalAcoes:0, totalETFs:0, acoes:[], etfs:[], garantias:[] };
  if (!texto) return r;
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  // Cabeçalhos de tabela — ignorados, não resetam seção
  const ehCabecalho = l =>
    /^(Produto|Qtd\.|Preço\s+médio|Proventos|Preço\s+de\s+mercado|Resultado|Saldo\s+bruto)$/i.test(l) ||
    /^Resultado\s+c\/\s+proventos/i.test(l) ||
    /^Proventos\s+da\s+posição/i.test(l);

  // Parse linha de dados de ativo colados: "3.000R$ 8,77-R$ 6,42-26,8%R$ 19.260,00"
  const parseDadosAtivo = (l) => {
    const mQtd = l.match(/^([\d.]+)/);
    const qtd  = mQtd ? _patQtd(mQtd[1]) : 0;
    const vals = l.match(/([-+]?\s*R\$\s*[\d.]+(?:,\d{1,2})?)/g) || [];
    const precoMedio   = vals[0] ? Math.abs(_patMoeda(vals[0])) : 0;
    const v1           = vals[1] ? _patMoeda(vals[1]) : 0;
    // Se v1 negativo = proventos; precoMercado = vals[2]; senão precoMercado = v1
    const precoMercado = (v1 < 0 && vals.length >= 4) ? Math.abs(_patMoeda(vals[2])) : Math.abs(v1);
    const saldoBruto   = vals.length >= 3 ? Math.abs(_patMoeda(vals[vals.length - 1])) : 0;
    // FIX: remove R$ values before searching for % to avoid digit contamination
    // "R$ 120,822,09%" → after removing R$ → "X2,09%" → correctly parses 2.09
    const linhaSemR = l.replace(/([-+]?\s*R\$\s*[\d.]+(?:,\d{1,2})?)/g, 'X');
    const mPct = linhaSemR.match(/([-+]?\s*\d{1,3}[.,]\d{1,2})\s*%/);
    const resultadoPct = mPct ? parseFloat(mPct[1].replace(/\s/g,'').replace(',','.')) : 0;
    return { qtd, precoMedio, precoMercado, resultadoPct, saldoBruto };
  };

  // Parse linha de dados de garantia: "3.000R$ 6,42R$ 19.260,00"
  const parseDadosGarantia = (l) => {
    const mQtd = l.match(/^([\d.]+)/);
    const qtd  = mQtd ? _patQtd(mQtd[1]) : 0;
    const vals = l.match(/([-+]?\s*R\$\s*[\d.]+(?:,\d{1,2})?)/g) || [];
    return { qtd, precoMercado: vals[0] ? Math.abs(_patMoeda(vals[0])) : 0, saldoBruto: vals[1] ? Math.abs(_patMoeda(vals[1])) : 0 };
  };

  let secao  = '';
  let buffer = null;

  const salvar = (s) => {
    if (!buffer || !buffer.ticker) return;
    const sec = s || secao;
    if      (sec === 'ACAO') r.acoes.push({...buffer});
    else if (sec === 'ETF')  r.etfs.push({...buffer});
    else if (sec === 'GAR')  r.garantias.push({...buffer});
    buffer = null;
  };

  for (let i = 0; i < linhas.length; i++) {
    const l    = linhas[i];
    const prox = linhas[i + 1] || '';

    if (ehCabecalho(l)) continue;
    if (/^\d+\s+produtos?$/i.test(l)) continue; // [B3-FIX] "N produtos" ignorado

    // Renda Variável header
    if (/renda\s+variável/i.test(l)) {
      const mV = l.match(/R\$\s*[\d.,]+/);
      r.totalRV = mV ? _patMoeda(mV[0]) : _patMoeda(prox);
      continue;
    }
    if (/nos\s+últimos\s+12\s+meses/i.test(l)) {
      const mV = (l.match(/([-+]?\s*R\$\s*[\d.,]+)/g) || []);
      if (mV.length >= 1) r.variacaoRVValor = _patMoeda(mV[0]);
      const mP = l.match(/([-+]?\s*[\d.,]+)\s*%/);
      if (mP) r.variacaoRVPct = parseFloat(mP[1].replace(',','.'));
      continue;
    }

    // Seções
    if (/^ações$/i.test(l)) { salvar(); secao = 'ACAO'; continue; }
    if (/^etfs?$/i.test(l)) { salvar(); secao = 'ETF';  continue; }
    if (/^bloqueios?\s+e\s+garantias$/i.test(l)) { salvar(); secao = 'GAR'; continue; }

    // "Bloqueios e Garantias" COM dados colados
    if (/^bloqueios?\s+e\s+garantias/i.test(l) && /R\$/.test(l)) {
      secao = 'GAR';
      const resto = l.replace(/^bloqueios?\s+e\s+garantias/i, '').trim();
      if (resto && buffer) {
        const d = parseDadosGarantia(resto);
        buffer.quantidade = d.qtd; buffer.precoMercado = d.precoMercado; buffer.saldoBruto = d.saldoBruto;
        salvar('GAR');
      }
      continue;
    }

    // Total de seção solto
    if (/^R\$\s*[\d]/.test(l) && !buffer) {
      if (secao === 'ACAO' && r.totalAcoes === 0) { r.totalAcoes = _patMoeda(l); continue; }
      if (secao === 'ETF'  && r.totalETFs  === 0) { r.totalETFs  = _patMoeda(l); continue; }
      continue;
    }

    // [B7-FIX] Ticker+nome colados: "CSNA3SID NACIONALON" / "LFTB11INVESTO LFTBF11"
    // Regex: 3-5 letras + 1-2 dígitos (ticker B3 padrão), seguido do nome
    const mTN = l.match(/^([A-Z]{3,5}\d{1,2})(.+)?$/);
    if (mTN && /^[A-Z]{3,5}\d{1,2}$/.test(mTN[1]) && secao !== '') {
      salvar();
      buffer = { ticker: mTN[1], nome: (mTN[2] || '').trim(), quantidade:0, precoMedio:0, precoMercado:0, resultadoPct:0, saldoBruto:0 };
      continue;
    }

    if (!buffer) continue;

    // Linha de dados colados: "3.000R$ 8,77..." ou "3.000R$ 6,42R$ 19.260,00"
    if (/^\d[\d.]*R\$/.test(l)) {
      if (secao !== 'GAR') {
        const d = parseDadosAtivo(l);
        buffer.quantidade = d.qtd; buffer.precoMedio = d.precoMedio;
        buffer.precoMercado = d.precoMercado; buffer.resultadoPct = d.resultadoPct; buffer.saldoBruto = d.saldoBruto;
      } else {
        const d = parseDadosGarantia(l);
        buffer.quantidade = d.qtd; buffer.precoMercado = d.precoMercado; buffer.saldoBruto = d.saldoBruto;
        salvar();
      }
    }
  }
  salvar();
  return r;
}

/**
 * BLOCO 3 — Extrato (sem bugs identificados, mantido)
 */
function _patParseBloco3(texto) {
  const r = { linhas: [] };
  if (!texto) return r;
  const linhas  = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const ignorar = /^(Extrato|Filtros|Limpar|Resumo|Saldo\s+(inicial|final)|Rendimento|Lançamento|Descrição|Movimentação|^Saldo$|Lançamentos?\s+futuros|operações?\s+programadas)/i;
  let dataAtual = '', tipoAtual = '', descAtual = '';

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (ignorar.test(l)) continue;
    if (/^\d{1,2}\/[A-Za-zçã]+(\s+\d{4})?$/.test(l) || /^\d{2}\/\d{2}\/\d{4}$/.test(l)) {
      dataAtual = l; tipoAtual = ''; descAtual = ''; continue;
    }
    if (/^crédito/i.test(l)) { tipoAtual = 'CREDITO'; continue; }
    if (/^débito/i.test(l))  { tipoAtual = 'DEBITO';  continue; }
    if (/R\$\s*[\d.,]+/.test(l)) {
      const vals = l.match(/([-+]?\s*R\$\s*[\d.,]+)/g) || [];
      const mov  = vals[0] ? _patMoeda(vals[0]) : 0;
      const sal  = vals[1] ? _patMoeda(vals[1]) : 0;
      if (tipoAtual || descAtual) {
        r.linhas.push({ data: dataAtual, tipo: tipoAtual, descricao: descAtual || l, movimentacao: mov, saldoApos: sal });
        tipoAtual = ''; descAtual = '';
      }
      continue;
    }
    if (l.length > 5 && !/^\d+\s+de\s+\d+/.test(l)) descAtual = l;
  }
  return r;
}

/**
 * BLOCO 4 — Valores em Trânsito (sem bugs identificados, mantido)
 */
function _patParseBloco4(texto) {
  const r = { linhas: [] };
  if (!texto) return r;
  const linhas   = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const ignorar  = /^(valores?|são|mercado|agrupar|valor\s+total|em\s+trânsito|operação|ativo|transaç|data|prazo|\*)/i;
  let dataAtual  = '', prazoAtual = '';

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (ignorar.test(l)) continue;
    if (/^\d{2}\/\d{2}\/\d{4}/.test(l)) { dataAtual  = l; continue; }
    if (/^em\s+\d+\s+dia/i.test(l))      { prazoAtual = l; continue; }
    const mOp = l.match(/^(compra|venda)\s*[-–]\s*(\S+)\s+(.+?)\s+([-+]?\s*R\$\s*[\d.,]+)/i);
    if (mOp) {
      r.linhas.push({ dataPrevista: dataAtual, prazo: prazoAtual, operacao: mOp[1].toUpperCase(), ativo: mOp[2], mercado: mOp[3].trim(), valor: _patMoeda(mOp[4]) });
      continue;
    }
    if (/R\$\s*[\d]/.test(l)) {
      r.linhas.push({ dataPrevista: dataAtual, prazo: prazoAtual, operacao: '', ativo: l, mercado: '', valor: _patMoeda(l) });
    }
  }
  return r;
}

/**
 * BLOCO 5 — Derivativos / Opções
 * [B8-FIX]  VALOR_MERCADO: regex R$ limita a 2 casas decimais
 * [B9-FIX]  RESULTADO_PCT: capturado da substring após o último R$
 * [B10-FIX] BRKMR80: regex aceita 2-3 dígitos no strike
 * [B11-FIX] SANBJ349400: regex código+qtd combinado com lookahead
 */
function _patParseBloco5(texto) {
  const r = { opcoes: [] };
  if (!texto) return r;
  const linhas  = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const ignorar = /^(derivativos|opções|código|tipo\s+e|data\s+de|preço\s+de|valor\s+de|resultado|\d+\s+produtos?)/i;

  // [B11-FIX] Regex que captura código + quantidade em uma passagem
  // Padrão: 4-5 letras + 1 letra série + 2-3 dígitos strike (não 4)
  // Lookahead: após o código, ou há [-+] (qty negativa) ou [A-Za-z] (tipo)
  // Para qty positiva colada (ex: SANBJ349400): o lookahead não é suficiente
  // Usamos: código 2-3 dígitos + qty restante antes de [A-Za-z]
  const reCodigoQtd = /^([A-Z]{4,5}[A-Z]\d{2,3})([-+]?\d[\d.]*)?(?=[A-Za-z])/;

  // [B8-FIX] Regex R$ com no máximo 2 casas decimais para evitar capturar o resultado
  const reRdol = /([-+]?\s*R\$\s*[\d.]+(?:,\d{1,2})?)/g;

  let buf = null;
  const salvar = () => { if (buf && buf.codigo) r.opcoes.push({...buf}); buf = null; };

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (ignorar.test(l)) continue;

    const mCQ = l.match(reCodigoQtd);
    if (!mCQ) {
      // Modo multi-linha: processa campo adicional se há buffer ativo
      if (buf) _patBloco5Campo(l, buf, reRdol);
      continue;
    }

    salvar();
    buf = {
      codigo: mCQ[1], quantidade: mCQ[2] ? _patQtd(mCQ[2]) : 0,
      tipo: '', posicao: '', dataExercicio: '', strike: 0,
      premioExercicio: 0, precoMedio: 0, valorMercado: 0, resultadoPct: 0
    };

    // Extrai o restante após código+qtd
    const resto = l.slice(mCQ[0].length).trim();
    if (!resto) continue; // linha só com código → modo multi-linha

    // Modo linha única: tudo concatenado
    const mTipo = resto.match(/(put|call)/i);
    if (mTipo) buf.tipo = mTipo[1].toUpperCase();
    const mPos = resto.match(/(vendida|comprada)/i);
    if (mPos) buf.posicao = mPos[1].toUpperCase();
    const mData = resto.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (mData) buf.dataExercicio = mData[1];

    // [B8-FIX] Captura R$ com limite de 2 casas decimais
    const mVals = [...resto.matchAll(reRdol)].map(m => m[0]);
    if (mVals[0]) buf.strike          = _patMoeda(mVals[0]);
    if (mVals[1]) buf.premioExercicio = _patMoeda(mVals[1]);
    if (mVals[2]) buf.precoMedio      = _patMoeda(mVals[2]);
    if (mVals[3]) buf.valorMercado    = _patMoeda(mVals[3]);

    // [B9-FIX] Resultado% da substring APÓS o último R$
    if (mVals.length > 0) {
      const lastMatch = [...resto.matchAll(reRdol)].pop();
      const apos = resto.slice(lastMatch.index + lastMatch[0].length);
      const mPct = apos.match(/^\s*([-+]?\s*[\d.,]+)\s*%/);
      if (mPct) buf.resultadoPct = parseFloat(mPct[1].replace(/\s/g,'').replace(',','.')) || 0;
    }
  }
  salvar();
  return r;
}

/** Auxiliar Bloco5: modo multi-linha — preenche campos do buffer linha a linha */
function _patBloco5Campo(l, buf, reRdol) {
  if (/^[-+]?\s*\d[\d.]*\s*$/.test(l) && buf.quantidade === 0) { buf.quantidade = _patQtd(l); return; }
  const mTipo = l.match(/^(put|call)\s*(vendida|comprada)?/i);
  if (mTipo) { buf.tipo = mTipo[1].toUpperCase(); if (mTipo[2]) buf.posicao = mTipo[2].toUpperCase(); return; }
  const mPos = l.match(/^(vendida|comprada)$/i);
  if (mPos) { buf.posicao = mPos[1].toUpperCase(); return; }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(l)) { buf.dataExercicio = l; return; }
  if (/R\$\s*[\d]|^\d+[.,]\d+/.test(l)) {
    const mVals = [...l.matchAll(reRdol)].map(m => m[0]);
    if (mVals.length >= 2 && buf.strike === 0) { buf.strike = _patMoeda(mVals[0]); buf.premioExercicio = _patMoeda(mVals[1]); }
    else if (mVals.length === 1) {
      if      (buf.strike          === 0) buf.strike          = _patMoeda(mVals[0]);
      else if (buf.premioExercicio === 0) buf.premioExercicio = _patMoeda(mVals[0]);
      else if (buf.precoMedio      === 0) buf.precoMedio      = _patMoeda(mVals[0]);
      else if (buf.valorMercado    === 0) buf.valorMercado    = _patMoeda(mVals[0]);
    }
    if (mVals.length > 0) {
      const lastMatch = [...l.matchAll(reRdol)].pop();
      const apos = l.slice(lastMatch.index + lastMatch[0].length);
      const mPct = apos.match(/^\s*([-+]?\s*[\d.,]+)\s*%/);
      if (mPct) buf.resultadoPct = parseFloat(mPct[1].replace(/\s/g,'').replace(',','.')) || 0;
    }
  }
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/** Converte quantidade com ponto de milhar BR → inteiro. "-1.000" → -1000 */
function _patQtd(s) {
  if (!s) return 0;
  const str = String(s).trim(), neg = str.startsWith('-');
  const limpo = str.replace(/[+\-\s]/g,'').replace(/\.(?=\d{3}(?!\d))/g,'');
  const n = parseInt(limpo, 10) || 0;
  return neg ? -Math.abs(n) : n;
}

/** Converte string de moeda BR → número. "R$122.316,42" → 122316.42 */
function _patMoeda(s) {
  if (!s && s !== 0) return 0;
  if (typeof s === 'number') return s;
  let str = String(s).trim();
  const neg = /^[-–]/.test(str) || /[-–]\s*R\$/.test(str) || /R\$\s*[-–]/.test(str);
  str = str.replace(/[R$\s+\-–]/g, '').trim();
  if (!str) return 0;
  if (str.includes(',') && str.includes('.')) { str = str.replace(/\./g,'').replace(',','.'); }
  else if (str.includes(',')) { const pts=str.split(','),ult=pts[pts.length-1]; str=(ult.length<=2)?str.replace(/\./g,'').replace(',','.'):str.replace(/,/g,''); }
  else if (str.includes('.')) { const pts=str.split('.'); if(pts.length>1&&pts.slice(1).every(p=>p.length===3)) str=str.replace(/\./g,''); }
  const n = parseFloat(str) || 0;
  return neg ? -Math.abs(n) : n;
}

/** Garante que as 7 abas existem com cabeçalho e coluna A como texto puro */
function _patGarantirAbas(ss) {
  Object.entries(PAT_ABAS).forEach(([chave, nome]) => {
    let sheet = getPlanilhaDinamica(ss, nome);
    if (!sheet) {
      sheet = ss.insertSheet(nome);
      const hdrs = PAT_HDRS[chave];
      sheet.getRange(1, 1, 1, hdrs.length).setValues([hdrs]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.getRange('A:A').setNumberFormat('@STRING@');
    }
  });
}

// ============================================================================
// TESTE MANUAL — dados reais da Necton
// ============================================================================
function testarPatrimonioSnapshot() {
  const res = apiSalvarPatrimonioSnapshot({
    nota: 'Teste v4',
    bloco1: [
      'Investimentos','Patrimônio','R$122.316,42',
      '+ R$ 1.374,76 (-0.17%)nos últimos 12 meses',
      'Conta investimento','R$ 15.201,39',
      'Total investido','R$ 108.334,85',
      'Lançamentos futuros','R$ 0,00'
    ].join('\n'),
    bloco2: [
      '88,95%Renda Variável','R$ 122.316,42',
      '- R$ 5.720,52 (-26.93%) nos últimos 12 meses',
      'Ações','2 produtos','R$ 56.376,00',
      'Produto','Qtd.','Preço médio','Proventos da posição','Preço de mercado','Resultado c/ proventos','Saldo bruto',
      'CSNA3SID NACIONALON','3.000R$ 8,77-R$ 6,42-26,8%R$ 19.260,00',
      'PRIO3PRIO ON NM','600R$ 62,69-R$ 61,86-1,32%R$ 37.116,00',
      'ETFs','1 produto','R$ 65.940,42',
      'Produto','Qtd.','Preço médio','Proventos da posição','Preço de mercado','Resultado c/ proventos','Saldo bruto',
      'LFTB11INVESTO LFTBF11','546R$ 118,35-R$ 120,772,04%R$ 65.940,42',
      'Bloqueios e Garantias','3 produtos',
      'Produto','Qtd.','Preço de mercado','Saldo bruto',
      'CSNA3SID NACIONALON','Bloqueios e Garantias3.000R$ 6,42R$ 19.260,00',
      'LFTB11INVESTO LFTBF11','Bloqueios e Garantias466R$ 120,77R$ 56.278,82',
      'PRIO3PRIO ON NM','Bloqueios e Garantias600R$ 61,86R$ 37.116,00'
    ].join('\n'),
    bloco3: [
      '24/Abril','Débito','LIQ BOLSA (Operacoes)- Pregão:23/04/2026','- R$ 963,46\tR$ 15.201,32',
      '23/Abril','Crédito','LIQ BOLSA (CREDITO MARGEM EM DINHEIRO RETIRADA)','R$ 9.079,56\tR$ 16.164,78'
    ].join('\n'),
    bloco4: [
      'Valor total','- R$ 9.663,20','27/04/2026','Em 3 dias',
      'COMPRA - LFTB11\tRenda Variável\t- R$ 9.663,20'
    ].join('\n'),
    bloco5: [
      'BBASQ229-100Putvendida15/05/2026R$ 22,75R$ 0,66R$ 0,93- R$ 57,9628,76 %',
      'BBASQ250-500Putvendida15/05/2026R$ 25,00R$ 2,17R$ 1,09- R$ 998,44-90,17 %',
      'BBASR251-500Putvendida19/06/2026R$ 24,85R$ 1,99R$ 1,12- R$ 936,04-66,54 %',
      'BBDCR201-1.000Putvendida19/06/2026R$ 19,53R$ 0,54R$ 0,28- R$ 534,45-92,64 %',
      'BRKMQ105-1.000Putvendida15/05/2026R$ 10,50R$ 2,45R$ 1,14- R$ 2.448,21-115,46 %',
      'BRKMR80-1.500Putvendida19/06/2026R$ 8,00R$ 0,85R$ 0,65- R$ 1.278,80-31,63 %',
      'BRKMR840-2.000Putvendida19/06/2026R$ 8,40R$ 1,06R$ 0,75- R$ 2.128,02-42,27 %',
      'BRKMR880-1.700Putvendida19/06/2026R$ 8,80R$ 1,31R$ 0,86- R$ 2.219,06-52,22 %',
      'BRKMR900-900Putvendida19/06/2026R$ 9,00R$ 1,44R$ 0,96- R$ 1.292,80-50,21 %',
      'CSNAE750-3.000Callvendida15/05/2026R$ 7,50R$ 0,05R$ 0,14- R$ 117,7271,79 %',
      'PRIOE640-600Callvendida15/05/2026R$ 64,00R$ 2,41R$ 3,09- R$ 1.705,548,07 %',
      'PRIOQ655-100Putvendida15/05/2026R$ 65,50R$ 4,90R$ 2,67- R$ 452,33-69,13 %',
      'SANBJ349400CallComprada16/10/2026R$ 33,47R$ 1,31R$ 2,55R$ 523,22-48,63 %',
      'SANBV329-500Putvendida16/10/2026R$ 31,47R$ 2,03R$ 2,28- R$ 1.015,7810,98 %'
    ].join('\n')
  });

  Logger.log('=== RESULTADO v4 ===');
  if (res.success) {
    Logger.log('✅ ' + res.snapshotId);
    Logger.log('   Patrimônio:  ' + res.resumo.patrimonioTotal);
    Logger.log('   Saldo conta: ' + res.resumo.saldoConta);
    Logger.log('   Ativos:      ' + res.resumo.totalAtivos);
    Logger.log('   Extrato:     ' + res.resumo.totalExtrato);
    Logger.log('   Trânsito:    ' + res.resumo.totalTransito);
    Logger.log('   Derivativos: ' + res.resumo.totalDerivativos);
    Logger.log('   Garantias:   ' + res.resumo.totalGarantias);
  } else {
    Logger.log('❌ ' + res.error);
  }
}