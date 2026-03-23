/**
 * @fileoverview 023_ConsultorIA.gs - v1.0 (Claude claude-sonnet-4-5)
 * =====================================================================
 * Consultor estrategico de portfolio -- analise profunda posicao a posicao.
 *
 * DIFERENCA DO 022_ConsultoriaIA.gs (Gemini):
 *   022 = insights rapidos nos Dashboards, sem contexto OPLab, sem persistencia
 *   023 = analise estrategica pre-mercado, contexto OPLab completo, grava no Sheets
 *
 * FUNCIONALIDADES:
 *   - Carrega posicoes ativas com pre-calculo de urgencia (sem custo de IA)
 *   - Analise individual por posicao via Claude claude-sonnet-4-5
 *   - Cruza: M9M21 + OPLab Score + Correl IBOV + Cadeia de opcoes + Fundamentalista
 *   - Sugere opcao concreta (ticker, strike, vencimento) quando recomenda rolagem
 *   - Simula P&L da operacao sugerida
 *   - Persiste TODAS as analises em CONSULTOR_IA_HISTORICO (acesso multi-dispositivo)
 *
 * CONFIG_GLOBAL (chaves lidas via ConfigManager):
 *   IA_Meta_Lucro_Recompra    = 75      (% para recomprar e rolar)
 *   IA_DTE_Min_Entrada        = 30      (DTE minimo na entrada)
 *   IA_DTE_Max_Entrada        = 45      (DTE maximo na entrada)
 *   IA_DTE_Alerta_Urgente     = 14      (DTE que aciona urgencia alta)
 *   IA_Filtro_Score_Min       = 2       (Score OPLab minimo para candidatos)
 *   IA_Filtro_M9M21_Tendencia = 1       (1=alta, -1=baixa, 0=todos)
 *   IA_Avaliar_Outros_Ativos  = true    (sugerir troca de ativo)
 *   IA_Volume_Min_Candidatos  = 1000000 (volume minimo R$ para candidatos)
 *
 * TOKEN: PropertiesService.getScriptProperties()
 *   ANTHROPIC_API_KEY -- chave da API Anthropic (Claude)
 *
 * ABA DE HISTORICO: CONSULTOR_IA_HISTORICO
 *   Todas as analises gravadas com timestamp, ticker, resultado e status.
 * =====================================================================
 */

// ============================================================================
// CONSTANTES
// ============================================================================

var CONSULTOR_023_SHEET   = 'CONSULTOR_IA_HISTORICO';
var CONSULTOR_023_MODEL   = 'claude-sonnet-4-5';
var CONSULTOR_023_TOKENS  = 1200;

var CONSULTOR_023_HEADERS = [
  'ANALISADO_EM', 'DISPOSITIVO_SESSION',
  'TICKER', 'OPCAO', 'TIPO', 'STRIKE', 'SPOT',
  'PREMIO_ENTRADA', 'PREMIO_ATUAL', 'LUCRO_PCT', 'DTE',
  'VENCIMENTO', 'MONEYNESS',
  'STATUS_RECOMENDADO', 'URGENCIA',
  'DIAGNOSTICO', 'RECOMENDACAO', 'JUSTIFICATIVA',
  'ALERTAS',
  'OPCAO_SUGERIDA_TICKER', 'OPCAO_SUGERIDA_ATIVO',
  'OPCAO_SUGERIDA_STRIKE', 'OPCAO_SUGERIDA_VENC', 'OPCAO_SUGERIDA_DTE',
  'OPCAO_SUGERIDA_PREMIO', 'OPCAO_SUGERIDA_TAXA',
  'SIM_CUSTO_RECOMPRA', 'SIM_RECEITA_NOVA', 'SIM_RESULTADO_LIQUIDO',
  'TENDENCIA_M9M21', 'SCORE_OPLAB',
  'PROMPT_TOKENS_EST'
];

// ============================================================================
// FUNCOES PUBLICAS (chamadas pelo frontend via google.script.run)
// ============================================================================

/**
 * Lista posicoes ativas com urgencia pre-calculada -- SEM custo de IA.
 * Chamada pelo frontend para montar a lista navegavel.
 */
function consultorListarPosicoes() {
  try {
    var cfg     = _c023LerConfigs();
    var cockpit = lerAbaComoJSON(SYS_CONFIG.SHEETS.COCKPIT);
    var m9m21   = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_M9M21);
    var score   = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_SCORE);

    var ativas = cockpit.filter(function(op) {
      var status = String(op.STATUS || '').toUpperCase().trim();
      var isAtiva = op.IS_ATIVA === true || String(op.IS_ATIVA).toUpperCase() === 'TRUE';
      return isAtiva || status === 'ATIVO';
    });

    var posicoes = ativas.map(function(op) {
      var ticker = String(op.TICKER || '').trim().toUpperCase();
      var pm     = parseFloat(op.ENTRY_PRICE  || op.LAST_PREMIUM || 0);
      var pa     = parseFloat(op.LAST_PREMIUM || 0);
      var dte    = parseInt(op.DTE_CALENDAR || op.DTE || 0);
      var lucro  = pm > 0 ? ((pm - pa) / pm) * 100 : 0;
      var money  = String(op.MONEYNESS || '').toUpperCase();

      var m9row  = m9m21.find(function(r) { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
      var scrow  = score.find(function(r) { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
      var tend   = parseInt(m9row.M9M21_TREND || 0);
      var sc     = parseInt(scrow.SCORE_TOTAL || 0);

      var urg = _c023Urgencia(dte, lucro, money, tend, cfg);

      return {
        raw:         op,
        ticker:      ticker,
        opcao:       String(op.OPTION_TICKER || ''),
        tipo:        String(op.OPTION_TYPE   || 'PUT'),
        strike:      parseFloat(op.STRIKE    || 0),
        spot:        parseFloat(op.SPOT      || 0),
        premioMedio: pm,
        premioAtual: pa,
        lucroPct:    Math.round(lucro * 10) / 10,
        dte:         dte,
        vencimento:  String(op.EXPIRY || ''),
        moneyness:   money,
        tendenciaM9: tend,
        scoreFund:   sc,
        urgencia:    urg.nivel,
        urgenciaMot: urg.motivo,
        analisado:   false
      };
    });

    posicoes.sort(function(a, b) {
      var ordem = { alta: 0, media: 1, baixa: 2 };
      return (ordem[a.urgencia] || 1) - (ordem[b.urgencia] || 1);
    });

    return { success: true, posicoes: posicoes, configs: cfg };
  } catch (e) {
    SysLogger.log('ConsultorIA_023', 'ERRO', 'Falha em consultorListarPosicoes', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Analisa UMA posicao com Claude e grava o resultado no Sheets.
 * @param {Object} posicao - objeto raw da posicao (chaves UPPER_SNAKE do Sheets)
 * @returns {Object} { success, analise } ou { success: false, error }
 */
function consultorAnalisarPosicao(posicao) {
  var tInicio = Date.now();
  var ticker  = String(posicao.TICKER || posicao.ticker || '').trim().toUpperCase();
  var opcao   = String(posicao.OPTION_TICKER || posicao.opcao || '');

  SysLogger.log('ConsultorIA_023', 'INFO',
    'Iniciando analise: ' + ticker + ' / ' + opcao, '');

  try {
    var cfg    = _c023LerConfigs();
    var ctx    = _c023ColetarContexto(posicao, cfg);
    var prompt = _c023MontarPrompt(posicao, ctx, cfg);
    var analise = _c023ChamarClaude(prompt);

    // Gravar no Sheets
    _c023GravarHistorico(posicao, analise, ctx);

    var duracao = ((Date.now() - tInicio) / 1000).toFixed(1);
    SysLogger.log('ConsultorIA_023', 'SUCESSO',
      'Analise concluida: ' + ticker + ' / ' + opcao + ' | ' + duracao + 's',
      'Status: ' + (analise.status || 'N/D'));
    SysLogger.flush();

    return { success: true, analise: analise };
  } catch (e) {
    SysLogger.log('ConsultorIA_023', 'ERRO',
      'Falha na analise: ' + ticker + ' / ' + opcao, e.message);
    SysLogger.flush();
    return { success: false, error: e.message };
  }
}

/**
 * Retorna o historico de analises para exibir no frontend.
 * @param {number} limite - quantas analises recentes retornar (default 50)
 */
function consultorLerHistorico(limite) {
  try {
    limite = parseInt(limite) || 50;
    var dados = lerAbaComoJSON(CONSULTOR_023_SHEET);
    // Mais recentes primeiro
    dados.reverse();
    return { success: true, historico: dados.slice(0, limite) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Configura a chave da API Anthropic no PropertiesService.
 * Chame uma vez pelo menu ou pelo SettingsView.
 */
function consultorConfigurarChaveAnthropic(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, error: 'Chave nao pode ser vazia.' };
  }
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', apiKey.trim());
  SysLogger.log('ConsultorIA_023', 'INFO', 'ANTHROPIC_API_KEY configurada com sucesso.', '');
  SysLogger.flush();
  return { success: true, message: 'ANTHROPIC_API_KEY salva com sucesso.' };
}

// ============================================================================
// COLETA DE CONTEXTO OPLab
// ============================================================================

function _c023ColetarContexto(posicao, cfg) {
  var ticker = String(posicao.TICKER || posicao.ticker || '').trim().toUpperCase();

  var m9m21Raw  = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_M9M21);
  var scoreRaw  = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_SCORE);
  var taxasRaw  = lerAbaComoJSON(SYS_CONFIG.SHEETS.BEST_RATES);
  var seriesRaw = lerAbaComoJSON(SYS_CONFIG.SHEETS.SERIES_INSTR);

  // Correl e Fund podem nao existir ainda (motores 021/022 nao rodaram)
  var correlRaw = [];
  var fundRaw   = [];
  try { correlRaw = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_CORREL); } catch(e) {}
  try { fundRaw   = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_FUND);   } catch(e) {}

  var m9Ativo   = m9m21Raw.find(function(r) { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
  var scAtivo   = scoreRaw.find(function(r) { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
  var coAtivo   = correlRaw.find(function(r){ return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
  var fuAtivo   = fundRaw.find(function(r)  { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
  var serieAt   = seriesRaw.find(function(r){ return String(r.TICKER||'').toUpperCase() === ticker; }) || {};

  // Top 5 opcoes para rolagem no mesmo ativo (DTE adequado)
  var tipoPos = String(posicao.OPTION_TYPE || posicao.tipo || 'PUT').toUpperCase();
  var opcoesMesmoAtivo = taxasRaw.filter(function(r) {
    return String(r.TICKER||'').toUpperCase() === ticker &&
           parseInt(r.DTE_CALENDAR||0) >= cfg.dteMinEntrada &&
           String(r.CATEGORY||'').toUpperCase() === tipoPos;
  }).slice(0, 5);

  // Top 5 candidatos alternativos (outros ativos) com qualidade
  var candidatosAlternativos = [];
  if (cfg.avaliarOutrosAtivos) {
    candidatosAlternativos = taxasRaw.filter(function(r) {
      var t   = String(r.TICKER||'').toUpperCase();
      var dte = parseInt(r.DTE_CALENDAR||0);
      var sc2 = scoreRaw.find(function(s){ return String(s.TICKER||'').toUpperCase() === t; });
      var m9b = m9m21Raw.find(function(m){ return String(m.TICKER||'').toUpperCase() === t; });
      var scv = sc2 ? parseInt(sc2.SCORE_TOTAL||0) : 0;
      var mtd = m9b ? parseInt(m9b.M9M21_TREND||0) : 0;
      return t !== ticker &&
             dte >= cfg.dteMinEntrada && dte <= cfg.dteMaxEntrada &&
             scv >= cfg.filtroScoreMin &&
             (cfg.filtroM9M21 === 0 || mtd === cfg.filtroM9M21);
    }).slice(0, 5);
  }

  return {
    m9:    m9Ativo,
    sc:    scAtivo,
    co:    coAtivo,
    fu:    fuAtivo,
    serie: serieAt,
    opcoesMesmoAtivo:       opcoesMesmoAtivo,
    candidatosAlternativos: candidatosAlternativos
  };
}

// ============================================================================
// MONTAGEM DO PROMPT
// ============================================================================

function _c023MontarPrompt(posicao, ctx, cfg) {
  var ticker = String(posicao.TICKER     || '').trim().toUpperCase();
  var opcao  = String(posicao.OPTION_TICKER || '');
  var tipo   = String(posicao.OPTION_TYPE   || 'PUT').toUpperCase();
  var strike = parseFloat(posicao.STRIKE    || 0);
  var spot   = parseFloat(posicao.SPOT      || 0);
  var pm     = parseFloat(posicao.ENTRY_PRICE   || 0);
  var pa     = parseFloat(posicao.LAST_PREMIUM  || 0);
  var dte    = parseInt(posicao.DTE_CALENDAR    || posicao.DTE || 0);
  var qtd    = parseInt(posicao.QUANTITY        || 0);
  var money  = String(posicao.MONEYNESS         || '');
  var venc   = String(posicao.EXPIRY            || '');
  var noc    = parseFloat(posicao.NOTIONAL      || 0);
  var lucro  = pm > 0 ? ((pm - pa) / pm * 100).toFixed(1) : '0';
  var pl     = ((pm - pa) * qtd).toFixed(2);

  var m9  = ctx.m9;
  var sc  = ctx.sc;
  var co  = ctx.co;
  var ser = ctx.serie;

  var tendLabel = (String(m9.M9M21_TREND) === '1') ? 'ALTA' :
                  (String(m9.M9M21_TREND) === '-1') ? 'BAIXA' : 'NEUTRO';

  var secao1 =
    'POSICAO:\n' +
    '  ' + ticker + ' | ' + opcao + ' | ' + tipo + ' VENDIDA\n' +
    '  Strike: R$' + strike.toFixed(2) + ' | Spot: R$' + spot.toFixed(2) +
    ' | Moneyness: ' + money + '\n' +
    '  Premio entrada: R$' + pm.toFixed(2) + ' | Premio atual: R$' + pa.toFixed(2) +
    ' | Lucro: ' + lucro + '%\n' +
    '  P/L acumulado: R$' + pl + ' | DTE: ' + dte + 'd | Venc: ' + venc +
    ' | Qtd: ' + qtd + ' | Nocional: R$' + noc.toFixed(2);

  var secao2 =
    '\nCONTEXTO ' + ticker + ' (OPLab):\n' +
    '  Tendencia M9M21: ' + tendLabel + ' (valor: ' + (m9.M9M21_VALUE || 'N/D') + ')\n' +
    '  OPLab Score: ' + (sc.SCORE_TOTAL || 'N/D') + '/5' +
    ' [EBIT:' + (sc.SCORE_EBIT_VAR||0) +
    ' Rec:' + (sc.SCORE_REVENUE_VAR||0) +
    ' Cx:' + (sc.SCORE_CASH_VAR||0) +
    ' Pas:' + (sc.SCORE_CURRENT_LIAB||0) +
    ' MM:' + (sc.SCORE_MM_SIGNAL||0) + ']\n' +
    '  IV: ' + (ser.IV_CURRENT || 'N/D') +
    ' | EWMA: ' + (ser.EWMA_CURRENT || 'N/D') +
    ' | STDV 1Y: ' + (ser.STDV_1Y || 'N/D') + '\n' +
    '  Beta IBOV: ' + (ser.BETA_IBOV || 'N/D') +
    ' | Correl IBOV: ' + (co.CORREL_VALUE || 'N/D');

  var secao3 = '\nOPCOES PARA ROLAGEM (' + ticker + ' ' + tipo + '):';
  if (ctx.opcoesMesmoAtivo.length > 0) {
    ctx.opcoesMesmoAtivo.forEach(function(op) {
      secao3 += '\n  ' + (op.OPTION_TICKER||'') +
        ' | K' + (op.STRIKE||'') +
        ' | Venc:' + (op.EXPIRY||'') +
        ' | DTE:' + (op.DTE_CALENDAR||'') + 'd' +
        ' | Taxa:' + (op.PROFIT_RATE_IF_EXERCISED||'') + '%' +
        ' | VE/K:' + (op.VE_OVER_STRIKE||'') + '%';
    });
  } else {
    secao3 += '\n  (sem opcoes disponiveis com os filtros)';
  }

  var secao4 = '\nCANDIDATOS ALTERNATIVOS (outros ativos):';
  if (ctx.candidatosAlternativos.length > 0) {
    ctx.candidatosAlternativos.forEach(function(op) {
      var t = String(op.TICKER||'').toUpperCase();
      var sc2 = ''; // score ja filtrado
      secao4 += '\n  ' + t + ' | ' + (op.OPTION_TICKER||'') +
        ' | K' + (op.STRIKE||'') +
        ' | Venc:' + (op.EXPIRY||'') +
        ' | DTE:' + (op.DTE_CALENDAR||'') + 'd' +
        ' | Taxa:' + (op.PROFIT_RATE_IF_EXERCISED||'') + '%' +
        ' | ' + (op.COMPANY_NAME||'');
    });
  } else {
    secao4 += '\n  (sem candidatos com qualidade suficiente)';
  }

  var secao5 =
    '\nREGRAS DO INVESTIDOR:\n' +
    '  Meta recompra: ' + cfg.metaLucroRecompra + '% lucro\n' +
    '  DTE entrada preferido: ' + cfg.dteMinEntrada + ' a ' + cfg.dteMaxEntrada + 'd\n' +
    '  DTE urgente: < ' + cfg.dteAlertaUrgente + 'd\n' +
    '  Score minimo candidatos: ' + cfg.filtroScoreMin + '/5\n' +
    '  Tendencia M9M21 requerida: ' + (cfg.filtroM9M21 === 1 ? 'ALTA' : cfg.filtroM9M21 === -1 ? 'BAIXA' : 'QUALQUER') + '\n' +
    '  Estrategia: Vendedor de ' + tipo + ' coberta OTM, theta decay\n' +
    '  Aceita troca de ativo: ' + (cfg.avaliarOutrosAtivos ? 'SIM' : 'NAO');

  var instrucoes =
    '\nRetorne APENAS o JSON abaixo, sem texto adicional:\n' +
    '{"status":"MANTER|ROLAR_MESMO_ATIVO|ROLAR_OUTRO_ATIVO|FECHAR",' +
    '"urgencia":"alta|media|baixa",' +
    '"diagnostico":"2-3 frases sobre a situacao atual",' +
    '"recomendacao":"1 frase direta sobre a acao",' +
    '"justificativa":"3-5 frases com racional tecnico",' +
    '"alertas":["lista pode ser vazia"],' +
    '"opcao_sugerida":null|{"ticker_ativo":"","ticker_opcao":"","tipo":"PUT|CALL","vencimento":"yyyy-mm-dd","strike":0,"premio_estimado":0,"dte":0,"taxa_lucro_pct":0,"motivo_escolha":""},' +
    '"simulacao":null|{"custo_recompra":0,"receita_nova_venda":0,"resultado_liquido_operacao":0,"resultado_por_contrato":0,"observacao":""}}';

  return secao1 + secao2 + secao3 + secao4 + secao5 + instrucoes;
}

// ============================================================================
// CHAMADA API ANTHROPIC
// ============================================================================

function _c023ChamarClaude(prompt) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY ausente. Configure em: menu > Consultor IA > Configurar Chave.');
  }

  var payload = JSON.stringify({
    model:      CONSULTOR_023_MODEL,
    max_tokens: CONSULTOR_023_TOKENS,
    system:     'Voce e um consultor especializado em venda coberta de opcoes (PUT/CALL) no mercado brasileiro (B3). Responda APENAS com JSON valido, sem markdown, sem texto adicional.',
    messages:   [{ role: 'user', content: prompt }]
  });

  var options = {
    method:            'post',
    contentType:       'application/json',
    headers: {
      'x-api-key':         apiKey.trim(),
      'anthropic-version': '2023-06-01'
    },
    payload:            payload,
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  var code     = response.getResponseCode();
  var body     = response.getContentText();

  if (code !== 200) {
    throw new Error('Claude API HTTP ' + code + ': ' + body.substring(0, 200));
  }

  var parsed = JSON.parse(body);
  var texto  = parsed.content && parsed.content[0] ? parsed.content[0].text : '';

  try {
    return JSON.parse(texto.trim());
  } catch (e) {
    var match = texto.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) {}
    }
    throw new Error('Resposta nao parseavel: ' + texto.substring(0, 200));
  }
}

// ============================================================================
// GRAVACAO NO SHEETS (CONSULTOR_IA_HISTORICO)
// ============================================================================

function _c023GravarHistorico(posicao, analise, ctx) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = _c023GarantirAba(ss);

  var op  = analise.opcao_sugerida || {};
  var sim = analise.simulacao      || {};

  var linha = [
    new Date(),                                           // ANALISADO_EM
    Session.getEffectiveUser().getEmail(),                // DISPOSITIVO_SESSION
    String(posicao.TICKER          || ''),                // TICKER
    String(posicao.OPTION_TICKER   || ''),                // OPCAO
    String(posicao.OPTION_TYPE     || ''),                // TIPO
    parseFloat(posicao.STRIKE      || 0),                 // STRIKE
    parseFloat(posicao.SPOT        || 0),                 // SPOT
    parseFloat(posicao.ENTRY_PRICE || 0),                 // PREMIO_ENTRADA
    parseFloat(posicao.LAST_PREMIUM|| 0),                 // PREMIO_ATUAL
    (function() {
      var pm = parseFloat(posicao.ENTRY_PRICE||0);
      var pa = parseFloat(posicao.LAST_PREMIUM||0);
      return pm > 0 ? parseFloat(((pm-pa)/pm*100).toFixed(1)) : 0;
    })(),                                                 // LUCRO_PCT
    parseInt(posicao.DTE_CALENDAR  || posicao.DTE || 0),  // DTE
    String(posicao.EXPIRY          || ''),                // VENCIMENTO
    String(posicao.MONEYNESS       || ''),                // MONEYNESS
    String(analise.status          || ''),                // STATUS_RECOMENDADO
    String(analise.urgencia        || ''),                // URGENCIA
    String(analise.diagnostico     || ''),                // DIAGNOSTICO
    String(analise.recomendacao    || ''),                // RECOMENDACAO
    String(analise.justificativa   || ''),                // JUSTIFICATIVA
    Array.isArray(analise.alertas) ? analise.alertas.join(' | ') : '', // ALERTAS
    String(op.ticker_opcao         || ''),                // OPCAO_SUGERIDA_TICKER
    String(op.ticker_ativo         || ''),                // OPCAO_SUGERIDA_ATIVO
    parseFloat(op.strike           || 0),                 // OPCAO_SUGERIDA_STRIKE
    String(op.vencimento           || ''),                // OPCAO_SUGERIDA_VENC
    parseInt(op.dte                || 0),                 // OPCAO_SUGERIDA_DTE
    parseFloat(op.premio_estimado  || 0),                 // OPCAO_SUGERIDA_PREMIO
    parseFloat(op.taxa_lucro_pct   || 0),                 // OPCAO_SUGERIDA_TAXA
    parseFloat(sim.custo_recompra  || 0),                 // SIM_CUSTO_RECOMPRA
    parseFloat(sim.receita_nova_venda || 0),              // SIM_RECEITA_NOVA
    parseFloat(sim.resultado_liquido_operacao || 0),      // SIM_RESULTADO_LIQUIDO
    (function() {
      var t = String(ctx.m9.M9M21_TREND || '0');
      return t === '1' ? 'ALTA' : t === '-1' ? 'BAIXA' : 'NEUTRO';
    })(),                                                 // TENDENCIA_M9M21
    parseInt(ctx.sc.SCORE_TOTAL || 0),                   // SCORE_OPLAB
    CONSULTOR_023_TOKENS                                  // PROMPT_TOKENS_EST
  ];

  var proxLinha = sheet.getLastRow() + 1;
  sheet.getRange(proxLinha, 1, 1, CONSULTOR_023_HEADERS.length).setValues([linha]);
  SpreadsheetApp.flush();
}

function _c023GarantirAba(ss) {
  var sheet = ss.getSheetByName(CONSULTOR_023_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONSULTOR_023_SHEET);
    sheet.getRange(1, 1, 1, CONSULTOR_023_HEADERS.length).setValues([CONSULTOR_023_HEADERS]);
    // Formatar cabecalho
    var range = sheet.getRange(1, 1, 1, CONSULTOR_023_HEADERS.length);
    range.setFontWeight('bold');
    range.setBackground('#1e293b');
    range.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);  // ANALISADO_EM
    sheet.setColumnWidth(16, 300); // DIAGNOSTICO
    sheet.setColumnWidth(17, 200); // RECOMENDACAO
    sheet.setColumnWidth(18, 300); // JUSTIFICATIVA
  }
  return sheet;
}

// ============================================================================
// LEITURA DE CONFIGURACOES
// ============================================================================

function _c023LerConfigs() {
  var cfg = ConfigManager.get();
  return {
    metaLucroRecompra:   parseFloat(cfg['IA_Meta_Lucro_Recompra']    || 75),
    dteMinEntrada:       parseInt(cfg['IA_DTE_Min_Entrada']           || 30),
    dteMaxEntrada:       parseInt(cfg['IA_DTE_Max_Entrada']           || 45),
    dteAlertaUrgente:    parseInt(cfg['IA_DTE_Alerta_Urgente']        || 14),
    filtroScoreMin:      parseInt(cfg['IA_Filtro_Score_Min']          || 2),
    filtroM9M21:         parseInt(cfg['IA_Filtro_M9M21_Tendencia']    || 1),
    avaliarOutrosAtivos: String(cfg['IA_Avaliar_Outros_Ativos']       || 'true').toLowerCase() === 'true',
    volumeMinCandidatos: parseFloat(cfg['IA_Volume_Min_Candidatos']   || 1000000)
  };
}

// ============================================================================
// CALCULO DE URGENCIA (local, sem IA)
// ============================================================================

function _c023Urgencia(dte, lucroPct, moneyness, tendM9, cfg) {
  var motivos = [];
  if (dte <= cfg.dteAlertaUrgente)          motivos.push('DTE critico (' + dte + 'd)');
  if (moneyness.indexOf('ITM') >= 0)        motivos.push('Posicao ITM');
  if (tendM9 === -1)                         motivos.push('Tendencia baixa');
  if (motivos.length > 0) return { nivel: 'alta', motivo: motivos.join(' | ') };

  if (lucroPct >= cfg.metaLucroRecompra)    motivos.push('Meta atingida (' + lucroPct.toFixed(0) + '%)');
  if (dte <= 21 && dte > cfg.dteAlertaUrgente) motivos.push('DTE proximo (' + dte + 'd)');
  if (motivos.length > 0) return { nivel: 'media', motivo: motivos.join(' | ') };

  return { nivel: 'baixa', motivo: 'Posicao saudavel' };
}

// ============================================================================
// HOMOLOGACAO
// ============================================================================

function testConsultorIA023() {
  console.log('=== HOMOLOGACAO 023_ConsultorIA ===');

  // 1. Testar leitura de configs
  var cfg = _c023LerConfigs();
  console.log('Configs lidas: metaLucro=' + cfg.metaLucroRecompra +
    ' | dteMin=' + cfg.dteMinEntrada + ' | dteMax=' + cfg.dteMaxEntrada);

  // 2. Testar listagem de posicoes
  var lista = consultorListarPosicoes();
  console.log('Posicoes ativas: ' + (lista.posicoes ? lista.posicoes.length : 'erro - ' + lista.error));
  if (lista.posicoes && lista.posicoes.length > 0) {
    lista.posicoes.slice(0, 3).forEach(function(p) {
      console.log('  ' + p.opcao + ' | urgencia=' + p.urgencia + ' | ' + p.urgenciaMot);
    });
  }

  // 3. Testar chave Anthropic
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  console.log('ANTHROPIC_API_KEY: ' + (apiKey ? 'configurada (' + apiKey.length + ' chars)' : 'AUSENTE'));

  // 4. Testar aba de historico
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = _c023GarantirAba(ss);
  console.log('Aba historico: ' + sheet.getName() + ' | linhas: ' + sheet.getLastRow());

  console.log('=== FIM ===');
}