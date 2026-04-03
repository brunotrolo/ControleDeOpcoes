/**
 * @fileoverview 024_ConsultorIAClaudeSonnet45.gs - v1.1
 * =====================================================================
 * Consultor estrategico de portfolio -- analise profunda posicao a posicao.
 *
 * v1.1 - Correcoes:
 *   - consultorListarPosicoes: substituido lerAbaComoJSON(COCKPIT) por
 *     _c023LerCockpit() que respeita o headerRowIndex=9 da aba COCKPIT
 *     (as 9 primeiras linhas sao sumario de portfolio, cabecalho real na linha 10)
 *   - Adicionados SysLogger.log() e SysLogger.flush() no fluxo de sucesso
 *     de consultorListarPosicoes e consultorLerHistorico (antes so existiam no catch)
 *   - ConsultorIA_AbrirTela movida para este arquivo (padrao micro-servico do projeto)
 * =====================================================================
 */

// ============================================================================
// CONSTANTES
// ============================================================================

var CONSULTOR_023_SHEET   = 'CONSULTOR_IA_HISTORICO';
var CONSULTOR_023_MODEL   = 'claude-sonnet-4-5';
var CONSULTOR_023_TOKENS  = 2000; // aumentado para comportar analise de cenarios comparativos

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
  'SIM_PL_REAL',
  'TENDENCIA_M9M21', 'SCORE_OPLAB',
  'PROMPT_TOKENS_EST'
];

// ============================================================================
// BRIDGE DE MENU (padrao micro-servico -- pertence a este motor)
// ============================================================================

/**
 * Abre o Web App em nova aba do navegador via modal de redirect.
 * Chamado pelo item 16 do menu do Sheets (Codigo.gs).
 */
function ConsultorIA_AbrirTela() {
  var url = ScriptApp.getService().getUrl();

  // Usa sidebar com google.script.host.openUrl() -- unico metodo que abre
  // uma URL real em nova aba a partir de um gatilho de menu do Sheets.
  // showModalDialog + window.open() e bloqueado pelo browser como popup.
  var html = HtmlService
    .createHtmlOutput(
      '<script>' +
      '  google.script.host.openUrl("' + url + '");' +
      '  google.script.host.close();' +
      '<\/script>'
    )
    .setWidth(1)
    .setHeight(1)
    .setTitle('Consultor IA');

  SpreadsheetApp.getUi().showSidebar(html);
}

// ============================================================================
// FUNCOES PUBLICAS (chamadas pelo frontend via google.script.run)
// ============================================================================

/**
 * Lista posicoes ativas com urgencia pre-calculada -- SEM custo de IA.
 * Chamada pelo frontend para montar a lista navegavel.
 */
function consultorListarPosicoes() {
  var tInicio = Date.now();
  SysLogger.log('ConsultorIA_024', 'START',
    '>>> LISTANDO POSICOES ATIVAS <<<',
    JSON.stringify({ timestamp: new Date().toISOString(), origem: 'consultorListarPosicoes' })
  );

  try {
    // 1. Configs
    var cfg = _c023LerConfigs();
    SysLogger.log('ConsultorIA_024', 'INFO',
      'Configs carregadas.',
      JSON.stringify({
        metaLucroRecompra: cfg.metaLucroRecompra,
        dteMinEntrada: cfg.dteMinEntrada,
        dteMaxEntrada: cfg.dteMaxEntrada,
        dteAlertaUrgente: cfg.dteAlertaUrgente,
        filtroScoreMin: cfg.filtroScoreMin,
        filtroM9M21: cfg.filtroM9M21,
        avaliarOutrosAtivos: cfg.avaliarOutrosAtivos
      })
    );

    // 2. Carga das abas
    var tCarga = Date.now();
    var cockpit = _c023LerCockpit();
    var m9m21   = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_M9M21);
    var score   = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_SCORE);
    SysLogger.log('ConsultorIA_024', 'INFO',
      'Abas carregadas em ' + ((Date.now() - tCarga) / 1000).toFixed(2) + 's.',
      JSON.stringify({
        COCKPIT:    cockpit.length + ' linhas (headerRowIndex=9)',
        RANK_M9M21: m9m21.length  + ' linhas',
        RANK_SCORE: score.length  + ' linhas'
      })
    );

    // 3. Filtrar posicoes ativas
    var todas   = cockpit.length;
    var ativas  = cockpit.filter(function(op) {
      return String(op.STATUS || '').toUpperCase().trim() === 'ATIVO';
    });
    var encerradas = cockpit.filter(function(op) {
      return String(op.STATUS || '').toUpperCase().trim() === 'ENCERRADO';
    });
    var exercidas = cockpit.filter(function(op) {
      return String(op.STATUS || '').toUpperCase().trim() === 'EXERCIDA';
    });
    SysLogger.log('ConsultorIA_024', 'INFO',
      'Distribuicao STATUS: ' + ativas.length + ' ATIVO | ' +
      encerradas.length + ' ENCERRADO | ' + exercidas.length + ' EXERCIDA | ' +
      (todas - ativas.length - encerradas.length - exercidas.length) + ' outros.',
      JSON.stringify({ total: todas, ativo: ativas.length, encerrado: encerradas.length, exercida: exercidas.length })
    );

    if (ativas.length === 0) {
      SysLogger.log('ConsultorIA_024', 'AVISO',
        'Nenhuma posicao com STATUS=ATIVO encontrada. Verifique a aba COCKPIT.',
        JSON.stringify({ cockpit_linhas: todas, cabecalho_linha: 10, status_encontrados: cockpit.slice(0, 5).map(function(r){ return r.STATUS; }) })
      );
      SysLogger.flush();
      return { success: true, posicoes: [], configs: cfg };
    }

    // 4. Montar objetos de posicao com urgencia
    var contUrgencia = { alta: 0, media: 0, baixa: 0 };
    var posicoes = ativas.map(function(op) {
      var ticker = String(op.TICKER || '').trim().toUpperCase();
      var pm     = parseFloat(op.ENTRY_PRICE  || op.LAST_PREMIUM || 0);
      var pa     = parseFloat(op.LAST_PREMIUM || 0);
      var dte    = parseInt(op.DTE_CALENDAR || op.DTE || 0);
      var lucro  = pm > 0 ? ((pm - pa) / pm) * 100 : 0;
      var money  = String(op.MONEYNESS || '').toUpperCase();

      var m9row  = m9m21.find(function(r) { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
      var scrow  = score.find(function(r)  { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
      var tend   = parseInt(m9row.M9M21_TREND || 0);
      var sc     = parseInt(scrow.SCORE_TOTAL || 0);
      var urg    = _c023Urgencia(dte, lucro, money, tend, cfg);

      contUrgencia[urg.nivel] = (contUrgencia[urg.nivel] || 0) + 1;

      SysLogger.log('ConsultorIA_024', 'INFO',
        op.OPTION_TICKER + ' (' + ticker + '): urgencia=' + urg.nivel.toUpperCase() + ' | ' + urg.motivo,
        JSON.stringify({
          option_ticker: op.OPTION_TICKER,
          tipo: op.OPTION_TYPE,
          strike: op.STRIKE,
          spot: op.SPOT,
          moneyness: money,
          dte: dte,
          lucro_pct: Math.round(lucro * 10) / 10,
          pm: pm,
          pa: pa,
          tend_m9: tend === 1 ? 'ALTA' : tend === -1 ? 'BAIXA' : 'NEUTRO',
          score_oplab: sc,
          m9_encontrado: Object.keys(m9row).length > 0,
          score_encontrado: Object.keys(scrow).length > 0
        })
      );

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

    var duracao = ((Date.now() - tInicio) / 1000).toFixed(2);
    SysLogger.log('ConsultorIA_024', 'FINISH',
      '>>> LISTAGEM CONCLUIDA: ' + posicoes.length + ' posicoes | ' + duracao + 's <<<',
      JSON.stringify({
        total_posicoes: posicoes.length,
        urgencia: contUrgencia,
        duracao_s: duracao,
        posicoes: posicoes.map(function(p) {
          return p.opcao + '|' + p.ticker + '|DTE:' + p.dte + 'd|Lucro:' + p.lucroPct + '%|' + p.urgencia.toUpperCase();
        })
      })
    );
    SysLogger.flush();

    return { success: true, posicoes: posicoes, configs: cfg };

  } catch (e) {
    SysLogger.log('ConsultorIA_024', 'ERRO',
      'FALHA em consultorListarPosicoes: ' + e.message,
      JSON.stringify({ stack: e.stack || 'N/D' })
    );
    SysLogger.flush();
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
  var tipo    = String(posicao.OPTION_TYPE || 'PUT').toUpperCase();
  var dte     = parseInt(posicao.DTE_CALENDAR || posicao.DTE || 0);
  var pm      = parseFloat(posicao.ENTRY_PRICE || 0);
  var pa      = parseFloat(posicao.LAST_PREMIUM || 0);
  var lucro   = pm > 0 ? ((pm - pa) / pm * 100).toFixed(1) : '0';

  SysLogger.log('ConsultorIA_024', 'START',
    '>>> ANALISANDO ' + opcao + ' (' + ticker + ') <<<',
    JSON.stringify({
      ticker: ticker,
      opcao: opcao,
      tipo: tipo,
      strike: posicao.STRIKE,
      spot: posicao.SPOT,
      moneyness: posicao.MONEYNESS,
      dte: dte,
      pm: pm,
      pa: pa,
      lucro_pct: lucro,
      vencimento: posicao.EXPIRY,
      quantidade: posicao.QUANTITY,
      timestamp: new Date().toISOString()
    })
  );
  SysLogger.flush();

  try {
    var cfg = _c023LerConfigs();

    // Coleta de contexto OPLab
    var tCtx = Date.now();
    var ctx  = _c023ColetarContexto(posicao, cfg);
    SysLogger.log('ConsultorIA_024', 'INFO',
      'Contexto OPLab coletado em ' + ((Date.now() - tCtx) / 1000).toFixed(2) + 's.',
      JSON.stringify({
        m9m21_trend:  ctx.m9.M9M21_TREND || 'N/D',
        m9m21_value:  ctx.m9.M9M21_VALUE || 'N/D',
        score_total:  ctx.sc.SCORE_TOTAL || 'N/D',
        correl_ibov:  ctx.co.CORREL_VALUE || 'N/D',
        iv_atual:     ctx.serie.IV_CURRENT || 'N/D',
        ewma:         ctx.serie.EWMA_CURRENT || 'N/D',
        opcoes_mesmo_ativo:     ctx.opcoesMesmoAtivo.length,
        candidatos_alternativos: ctx.candidatosAlternativos.length,
        top_candidatos: ctx.opcoesMesmoAtivo.slice(0,3).map(function(o){
          return o.OPTION_TICKER + '|K' + o.STRIKE + '|DTE:' + o.DTE_CALENDAR + 'd|Taxa:' + o.PROFIT_RATE_IF_EXERCISED + '%';
        })
      })
    );

    // Chamada Claude
    var tPrompt  = Date.now();
    var prompt   = _c023MontarPrompt(posicao, ctx, cfg);
    var tClaude  = Date.now();
    SysLogger.log('ConsultorIA_024', 'INFO',
      'Prompt montado em ' + ((tClaude - tPrompt) / 1000).toFixed(2) + 's (' + prompt.length + ' chars). Enviando para Claude (' + CONSULTOR_023_MODEL + ')...',
      ''
    );

    var analise = _c023ChamarClaude(prompt);
    var tPosClaude = Date.now();
    SysLogger.log('ConsultorIA_024', 'INFO',
      'Claude respondeu em ' + ((tPosClaude - tClaude) / 1000).toFixed(2) + 's.',
      JSON.stringify({
        status_ia:    analise.status,
        urgencia_ia:  analise.urgencia,
        tem_sugestao: analise.opcao_sugerida ? 'SIM (' + (analise.opcao_sugerida.ticker_opcao || '') + ')' : 'NAO',
        tem_simulacao: analise.simulacao ? 'SIM' : 'NAO',
        diagnostico:  (analise.diagnostico || '').substring(0, 120) + '...',
        recomendacao: analise.recomendacao || ''
      })
    );

    // Gravacao no Sheets
    var tGravacao = Date.now();
    _c023GravarHistorico(posicao, analise, ctx);
    SysLogger.log('ConsultorIA_024', 'INFO',
      'Gravado em ' + CONSULTOR_023_SHEET + ' em ' + ((Date.now() - tGravacao) / 1000).toFixed(2) + 's.',
      ''
    );

    var duracao = ((Date.now() - tInicio) / 1000).toFixed(2);
    SysLogger.log('ConsultorIA_024', 'FINISH',
      '>>> ANALISE CONCLUIDA: ' + opcao + ' | ' + (analise.status || 'N/D') + ' | ' + duracao + 's <<<',
      JSON.stringify({
        ticker: ticker,
        opcao: opcao,
        status_ia: analise.status,
        urgencia_ia: analise.urgencia,
        duracao_total_s: duracao,
        duracao_contexto_s: ((tClaude - tCtx) / 1000).toFixed(2),
        duracao_claude_s: ((tPosClaude - tClaude) / 1000).toFixed(2),
        opcao_sugerida: analise.opcao_sugerida ? analise.opcao_sugerida.ticker_opcao : null,
        resultado_liquido: analise.simulacao ? analise.simulacao.resultado_liquido_operacao : null
      })
    );
    SysLogger.flush();

    return { success: true, analise: analise };

  } catch (e) {
    SysLogger.log('ConsultorIA_024', 'ERRO',
      'FALHA ao analisar ' + opcao + ' (' + ticker + '): ' + e.message,
      JSON.stringify({ stack: e.stack || 'N/D', dte: dte, lucro_pct: lucro })
    );
    SysLogger.flush();
    return { success: false, error: e.message };
  }
}

/**
 * Retorna o historico de analises para exibir no frontend.
 * @param {number} limite - quantas analises recentes retornar (default 50)
 */
function consultorLerHistorico(limite) {
  limite = parseInt(limite) || 50;
  SysLogger.log('ConsultorIA_024', 'INFO',
    'consultorLerHistorico: buscando ultimas ' + limite + ' analises em ' + CONSULTOR_023_SHEET + '.',
    ''
  );

  try {
    var dados = lerAbaComoJSON(CONSULTOR_023_SHEET);
    dados.reverse();
    var resultado = dados.slice(0, limite);

    SysLogger.log('ConsultorIA_024', 'SUCESSO',
      'consultorLerHistorico: ' + resultado.length + ' de ' + dados.length + ' analises retornadas.',
      JSON.stringify({
        total_no_historico: dados.length,
        retornadas: resultado.length,
        mais_recente: resultado.length > 0 ? (resultado[0].ANALISADO_EM + ' | ' + resultado[0].OPCAO + ' | ' + resultado[0].STATUS_RECOMENDADO) : 'vazio'
      })
    );
    SysLogger.flush();

    return { success: true, historico: resultado };

  } catch (e) {
    SysLogger.log('ConsultorIA_024', 'ERRO',
      'FALHA em consultorLerHistorico: ' + e.message,
      JSON.stringify({ aba: CONSULTOR_023_SHEET, stack: e.stack || 'N/D' })
    );
    SysLogger.flush();
    return { success: false, error: e.message };
  }
}

/**
 * Configura a chave da API Anthropic no PropertiesService.
 */
function consultorConfigurarChaveAnthropic(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    SysLogger.log('ConsultorIA_024', 'ERRO', 'consultorConfigurarChaveAnthropic: chave vazia ou nula.', '');
    SysLogger.flush();
    return { success: false, error: 'Chave nao pode ser vazia.' };
  }
  var chave = apiKey.trim();
  var prefixo = chave.substring(0, 14); // sk-ant-api03-...
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', chave);
  SysLogger.log('ConsultorIA_024', 'SUCESSO',
    'ANTHROPIC_API_KEY configurada com sucesso.',
    JSON.stringify({ prefixo: prefixo + '...', tamanho: chave.length })
  );
  SysLogger.flush();
  return { success: true, message: 'ANTHROPIC_API_KEY salva (' + chave.length + ' chars).' };
}

// ============================================================================
// LEITURA DO COCKPIT COM HEADER CORRETO
// ============================================================================

/**
 * Le a aba COCKPIT respeitando o headerRowIndex=9.
 * A aba tem 9 linhas de sumario de portfolio antes do cabecalho real (linha 10).
 * lerAbaComoJSON() usaria valores[0] como cabecalho, o que retornaria campos errados.
 */
function _c023LerCockpit() {
  var HEADER_ROW_INDEX = 9; // linha 10 da planilha = index 9 do array

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SYS_CONFIG.SHEETS.COCKPIT);
  if (!sheet) {
    SysLogger.log('ConsultorIA_024', 'ERRO', '_c023LerCockpit: aba COCKPIT nao encontrada.', '');
    return [];
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROW_INDEX) return [];

  var range = sheet.getDataRange();

  // Cabecalho: getDisplayValues() para strings legiveis (nomes das colunas)
  var displayVals = range.getDisplayValues();
  var cabecalho   = displayVals[HEADER_ROW_INDEX].map(function(h) { return String(h).trim(); });

  // Dados: getValues() para valores brutos (numeros como Number, datas como Date, textos como String)
  // CRITICO: getDisplayValues() retorna "R$ 0,38" para celulas monetarias,
  // o que quebra parseFloat(). getValues() retorna 0.38 (Number) diretamente.
  var rawVals = range.getValues();

  var resultado = [];
  for (var i = HEADER_ROW_INDEX + 1; i < rawVals.length; i++) {
    var linha = rawVals[i];
    // Ignora linhas completamente vazias
    if (linha.every(function(v) { return v === '' || v === null || v === undefined; })) continue;
    var obj = {};
    cabecalho.forEach(function(col, j) {
      if (!col) return;
      var val = linha[j];
      // Converte Date do GAS para string YYYY-MM-DD (sem timezone offset)
      // toISOString() retornaria "2026-04-17T03:00:00.000Z" (UTC shift),
      // por isso usamos os getters locais do GAS (America/Sao_Paulo).
      if (val instanceof Date) {
        var ano = val.getFullYear();
        var mes = String(val.getMonth() + 1).padStart(2, '0');
        var dia = String(val.getDate()).padStart(2, '0');
        obj[col] = ano + '-' + mes + '-' + dia;
      } else {
        obj[col] = val !== undefined && val !== null ? val : '';
      }
    });
    resultado.push(obj);
  }

  return resultado;
}

// ============================================================================
// COLETA DE CONTEXTO OPLab
// ============================================================================

function _c023ColetarContexto(posicao, cfg) {
  var ticker      = String(posicao.TICKER || posicao.ticker || '').trim().toUpperCase();
  var tipoPos     = String(posicao.OPTION_TYPE || posicao.tipo || 'PUT').toUpperCase();
  var strikeAtual = parseFloat(posicao.STRIKE || 0);
  var spotAtual   = parseFloat(posicao.SPOT   || 0);
  var dteAtual    = parseInt(posicao.DTE_CALENDAR || posicao.DTE || 0);

  var m9m21Raw  = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_M9M21);
  var scoreRaw  = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_SCORE);
  var taxasRaw  = lerAbaComoJSON(SYS_CONFIG.SHEETS.BEST_RATES);
  var seriesRaw = lerAbaComoJSON(SYS_CONFIG.SHEETS.SERIES_INSTR);

  var correlRaw = [];
  var fundRaw   = [];
  try { correlRaw = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_CORREL); } catch(e) {}
  try { fundRaw   = lerAbaComoJSON(SYS_CONFIG.SHEETS.RANK_FUND);   } catch(e) {}

  var m9Ativo = m9m21Raw.find(function(r) { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
  var scAtivo = scoreRaw.find(function(r) { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
  var coAtivo = correlRaw.find(function(r){ return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
  var fuAtivo = fundRaw.find(function(r)  { return String(r.TICKER||'').toUpperCase() === ticker; }) || {};
  var serieAt = seriesRaw.find(function(r){ return String(r.TICKER||'').toUpperCase() === ticker; }) || {};

  // Helper: enriquece uma linha de taxas com score e tendencia para cruzamento
  function _enriquecer(r) {
    var t   = String(r.TICKER||'').toUpperCase();
    var sc2 = scoreRaw.find(function(s){ return String(s.TICKER||'').toUpperCase() === t; }) || {};
    var m9b = m9m21Raw.find(function(m){ return String(m.TICKER||'').toUpperCase() === t; }) || {};
    // Busca dados tecnicos do ativo base em SERIES_INSTR (beta, tendencias curto/medio prazo)
    // SERIES_INSTR tem multiplas linhas por ticker; a primeira linha contem os dados do ativo
    var ser2 = seriesRaw.find(function(s){ return String(s.TICKER||'').toUpperCase() === t; }) || {};
    // SECTOR: BEST_RATES ja tem o setor correto; SERIES_INSTR nao tem SECTOR
    // Usar SECTOR do BEST_RATES como fonte primaria
    var setor = String(r.SECTOR||ser2.SECTOR||'N/D');
    return {
      OPTION_TICKER:            String(r.OPTION_TICKER||''),
      TICKER:                   t,
      COMPANY_NAME:             String(r.COMPANY_NAME||ser2.COMPANY_NAME||''),
      SECTOR:                   setor,
      CATEGORY:                 String(r.CATEGORY||''),
      STRIKE:                   parseFloat(r.STRIKE||0),
      EXPIRY:                   String(r.EXPIRY||''),
      DTE_CALENDAR:             parseInt(r.DTE_CALENDAR||0),
      SPOT_STRIKE_RATIO:        parseFloat(r.SPOT_STRIKE_RATIO||0),
      PROFIT_RATE_IF_EXERCISED: parseFloat(r.PROFIT_RATE_IF_EXERCISED||0),
      VE_OVER_STRIKE:           parseFloat(r.VE_OVER_STRIKE||0),
      VOLUME_FIN:               parseFloat(r.VOLUME_FIN||0),
      SCORE_TOTAL:              parseInt(sc2.SCORE_TOTAL||0),
      M9M21_TREND:              parseInt(m9b.M9M21_TREND||0),
      M9M21_VALUE:              parseFloat(m9b.M9M21_VALUE||0),
      BETA_IBOV:                parseFloat(ser2.BETA_IBOV||0),
      IV_CURRENT:               parseFloat(ser2.IV_CURRENT||0),
      SHORT_TERM_TREND:         parseInt(ser2.SHORT_TERM_TREND||0)
    };
  }

  // Todas as opcoes futuras do mesmo ativo e tipo (sem filtro de DTE minimo)
  var opcoesAtivo = taxasRaw
    .filter(function(r) {
      return String(r.TICKER||'').toUpperCase() === ticker &&
             parseInt(r.DTE_CALENDAR||0) > dteAtual &&
             String(r.CATEGORY||'').toUpperCase() === tipoPos;
    })
    .map(_enriquecer)
    .sort(function(a, b) { return a.DTE_CALENDAR - b.DTE_CALENDAR; });

  // Grupo A: rolagem padrao -- janela ideal de DTE (30-45d por default)
  var opcoesMesmoAtivo = opcoesAtivo
    .filter(function(r) {
      return r.DTE_CALENDAR >= cfg.dteMinEntrada && r.DTE_CALENDAR <= cfg.dteMaxEntrada;
    }).slice(0, 5);

  // Grupo B: rolagem defensiva -- qualquer DTE futuro, strike <= spot + 5%
  // Para posicoes ITM: permite encontrar strikes abaixo do spot que reduzem
  // risco de exercicio mesmo fora da janela ideal de DTE
  var opcoesDefensivas = opcoesAtivo
    .filter(function(r) {
      return r.STRIKE <= (spotAtual * 1.05) && r.STRIKE < strikeAtual;
    }).slice(0, 5);

  // Grupo C: rolagem longa -- DTE > dteMax (para posicoes muito problematicas
  // onde esticar o tempo e necessario para recuperar parte do prejuizo)
  var opcoesLongas = opcoesAtivo
    .filter(function(r) { return r.DTE_CALENDAR > cfg.dteMaxEntrada; })
    .slice(0, 3);

  // Candidatos alternativos: outros ativos com score e tendencia validados
  var candidatosAlternativos = [];
  if (cfg.avaliarOutrosAtivos) {
    candidatosAlternativos = taxasRaw
      .filter(function(r) {
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
      })
      .map(_enriquecer)
      .slice(0, 5);
  }

  return {
    m9:                     m9Ativo,
    sc:                     scAtivo,
    co:                     coAtivo,
    fu:                     fuAtivo,
    serie:                  serieAt,
    opcoesMesmoAtivo:       opcoesMesmoAtivo,
    opcoesDefensivas:       opcoesDefensivas,
    opcoesLongas:           opcoesLongas,
    candidatosAlternativos: candidatosAlternativos
  };
}

// ============================================================================
// MONTAGEM DO PROMPT
// ============================================================================

function _c023MontarPrompt(posicao, ctx, cfg) {
  var ticker = String(posicao.TICKER        || '').trim().toUpperCase();
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
  var plTotal      = ((pm - pa) * qtd).toFixed(2);
  var custRecompra = (pa * qtd).toFixed(2);
  var distItm      = spot > 0 ? (((strike - spot) / spot) * 100).toFixed(1) : '0';

  var m9  = ctx.m9;
  var sc  = ctx.sc;
  var co  = ctx.co;
  var ser = ctx.serie;

  var tendLabel = (String(m9.M9M21_TREND) === '1')  ? 'ALTA'  :
                  (String(m9.M9M21_TREND) === '-1') ? 'BAIXA' : 'NEUTRO';
  var tendCurto = String(ser.SHORT_TERM_TREND) === '-1' ? 'BAIXA' : String(ser.SHORT_TERM_TREND) === '1' ? 'ALTA' : 'NEUTRO';
  var tendMedio = String(ser.MID_TERM_TREND)   === '-1' ? 'BAIXA' : String(ser.MID_TERM_TREND)   === '1' ? 'ALTA' : 'NEUTRO';

  var NL = '\n';

  // SECAO 1: Estado atual
  var secao1 = '=== POSICAO ATUAL ===' + NL
    + ticker + ' | ' + opcao + ' | ' + tipo + ' VENDIDA' + NL
    + 'Strike: R$' + strike.toFixed(2)
    + ' | Spot: R$' + spot.toFixed(2)
    + ' | Distancia ITM: ' + distItm + '%'
    + ' | Moneyness: ' + money + NL
    + 'Premio entrada: R$' + pm.toFixed(2)
    + ' | Premio atual: R$' + pa.toFixed(2)
    + ' | Lucro/Prejuizo: ' + lucro + '%' + NL
    + 'P&L total: R$' + plTotal
    + ' | Custo recompra: R$' + custRecompra
    + ' | DTE: ' + dte + 'd | Venc: ' + venc + NL
    + 'Quantidade: ' + qtd + ' contratos | Nocional: R$' + noc.toFixed(2);

  // SECAO 2: Contexto tecnico do ativo
  var secao2 = NL + '=== CONTEXTO ' + ticker + ' ===' + NL
    + 'Tendencia M9M21: ' + tendLabel + ' (val:' + (m9.M9M21_VALUE || 'N/D') + ')'
    + ' | Curto: ' + tendCurto + ' | Medio: ' + tendMedio + NL
    + 'OPLab Score: ' + (sc.SCORE_TOTAL || 'N/D') + '/5'
    + ' [EBIT:' + (sc.SCORE_EBIT_VAR||0)
    + ' Rec:' + (sc.SCORE_REVENUE_VAR||0)
    + ' Cx:' + (sc.SCORE_CASH_VAR||0)
    + ' Pas:' + (sc.SCORE_CURRENT_LIAB||0)
    + ' MM:' + (sc.SCORE_MM_SIGNAL||0) + ']' + NL
    + 'IV: ' + (ser.IV_CURRENT || 'N/D')
    + ' | EWMA: ' + (ser.EWMA_CURRENT || 'N/D')
    + ' | STDV1Y: ' + (ser.STDV_1Y || 'N/D')
    + ' | Beta: ' + (ser.BETA_IBOV || 'N/D')
    + ' | Corr.IBOV: ' + (co.CORREL_VALUE || 'N/D');

  // Helper: formata uma linha de opcao de rolagem
  function _fmtOp(op, idx) {
    var receita = (op.PROFIT_RATE_IF_EXERCISED / 100 * op.STRIKE * qtd).toFixed(2);
    return '  [' + (idx + 1) + '] ' + op.OPTION_TICKER
      + ' | K' + op.STRIKE.toFixed(2)
      + ' | Venc:' + op.EXPIRY
      + ' | DTE:' + op.DTE_CALENDAR + 'd'
      + ' | Taxa:' + op.PROFIT_RATE_IF_EXERCISED.toFixed(2) + '%'
      + ' | VE/K:' + op.VE_OVER_STRIKE.toFixed(2) + '%'
      + ' | Vol:R$' + (op.VOLUME_FIN / 1000).toFixed(0) + 'k'
      + ' | Receita(est):R$' + receita;
  }

  // SECAO 3A: Rolagem padrao (janela ideal DTE)
  var secao3a = NL + '=== ROLAGEM PADRAO (' + ticker + ' ' + tipo
    + ', DTE ' + cfg.dteMinEntrada + '-' + cfg.dteMaxEntrada + 'd) ===';
  if (ctx.opcoesMesmoAtivo.length > 0) {
    ctx.opcoesMesmoAtivo.forEach(function(op, i) { secao3a += NL + _fmtOp(op, i); });
  } else {
    secao3a += NL + '  (nenhuma opcao na janela ' + cfg.dteMinEntrada + '-' + cfg.dteMaxEntrada + 'd)';
  }

  // SECAO 3B: Rolagem defensiva (strike <= spot, qualquer DTE)
  var secao3b = NL + '=== ROLAGEM DEFENSIVA (' + ticker + ' ' + tipo
    + ', strike <= spot+5%, qualquer DTE) ===';
  if (ctx.opcoesDefensivas.length > 0) {
    ctx.opcoesDefensivas.forEach(function(op, i) { secao3b += NL + _fmtOp(op, i); });
  } else {
    secao3b += NL + '  (nenhuma opcao com strike abaixo de R$' + (spot * 1.05).toFixed(2) + ')';
  }

  // SECAO 3C: Rolagem longa (DTE > max)
  var secao3c = NL + '=== ROLAGEM LONGA (' + ticker + ' ' + tipo
    + ', DTE > ' + cfg.dteMaxEntrada + 'd) ===';
  if (ctx.opcoesLongas.length > 0) {
    ctx.opcoesLongas.forEach(function(op, i) { secao3c += NL + _fmtOp(op, i); });
  } else {
    secao3c += NL + '  (sem opcoes longas disponiveis)';
  }

  // SECAO 4: Candidatos alternativos
  var secao4 = NL + '=== CANDIDATOS ALTERNATIVOS (score>='
    + cfg.filtroScoreMin + ', tend.ALTA, DTE '
    + cfg.dteMinEntrada + '-' + cfg.dteMaxEntrada + 'd) ===';
  if (ctx.candidatosAlternativos.length > 0) {
    ctx.candidatosAlternativos.forEach(function(op, i) {
      var tendStr = op.M9M21_TREND === 1 ? 'ALTA' : op.M9M21_TREND === -1 ? 'BAIXA' : 'NEUTRO';
      var receita = (op.PROFIT_RATE_IF_EXERCISED / 100 * op.STRIKE * qtd).toFixed(2);
      secao4 += NL
        + '  [' + (i + 1) + '] ' + op.TICKER + ' | ' + op.OPTION_TICKER
        + ' | K' + op.STRIKE.toFixed(2)
        + ' | Venc:' + op.EXPIRY
        + ' | DTE:' + op.DTE_CALENDAR + 'd'
        + ' | Taxa:' + op.PROFIT_RATE_IF_EXERCISED.toFixed(2) + '%'
        + ' | Score:' + op.SCORE_TOTAL + '/5'
        + ' | Tend:' + tendStr
        + ' | M9V:' + op.M9M21_VALUE.toFixed(2)
        + ' | Vol:R$' + (op.VOLUME_FIN / 1000).toFixed(0) + 'k'
        + ' | Receita(est):R$' + receita
        + ' | Setor:' + op.SECTOR
        + ' | Beta:' + (op.BETA_IBOV > 0 ? op.BETA_IBOV.toFixed(2) : 'N/D')
        + ' | IV:' + (op.IV_CURRENT > 0 ? op.IV_CURRENT.toFixed(1) : 'N/D')
        + ' | ' + op.COMPANY_NAME;
    });
  } else {
    secao4 += NL + '  (nenhum candidato qualificado com os filtros atuais)';
  }

  // SECAO 5: Metricas pre-calculadas para auxiliar a analise
  var thetaDiario     = parseFloat(posicao.THETA || 0);
  var thetaRestante   = (thetaDiario * qtd * dte).toFixed(2);
  var prejuizoAtual   = ((pa - pm) * qtd).toFixed(2);
  var prejuizoAtualNum = (pa - pm) * qtd;
  var breakEvenAtual  = (strike - pm).toFixed(2);

  // Nocional atual vs nocional que cada candidato geraria com os mesmos contratos
  var nocionalAtual = noc;
  var nocionaisNovos = [];
  ctx.candidatosAlternativos.forEach(function(op) {
    nocionaisNovos.push(op.OPTION_TICKER + ':R$' + (op.STRIKE * qtd).toFixed(0));
  });
  ctx.opcoesMesmoAtivo.forEach(function(op) {
    nocionaisNovos.push(op.OPTION_TICKER + ':R$' + (op.STRIKE * qtd).toFixed(0));
  });

  var secao5 = NL + '=== METRICAS DE DECISAO ===' + NL
    + 'Prejuizo atual: R$' + prejuizoAtual
    + ' | Custo recompra: R$' + custRecompra + NL
    + 'Theta diario (total): R$' + (thetaDiario * qtd).toFixed(2)
    + ' | Theta restante (' + dte + 'd): R$' + thetaRestante + NL
    + 'Break-even atual: R$' + breakEvenAtual + ' (spot precisa subir ate aqui para lucro)' + NL
    + 'Para FECHAR agora: crystallizar prejuizo de R$' + prejuizoAtual + NL
    + 'Para ROLAR: pagar R$' + custRecompra + ' + receber novo premio = P&L real inclui o prejuizo de R$' + prejuizoAtual + NL
    + 'NOCIONAL ATUAL: R$' + nocionalAtual.toFixed(0) + ' (' + qtd + ' contratos x R$' + strike.toFixed(2) + ')' + NL
    + 'NOCIONAL NOS CANDIDATOS (mesmo qtd ' + qtd + ' contratos):' + NL
    + (nocionaisNovos.length > 0 ? '  ' + nocionaisNovos.slice(0, 5).join(' | ') : '  (sem candidatos)') + NL
    + 'IMPORTANTE: o campo resultado_liquido_operacao na simulacao deve ser calculado como' + NL
    + '  (receita_nova_venda - custo_recompra). O P&L REAL da operacao completa e:' + NL
    + '  resultado_liquido_operacao + prejuizo_atual (R$' + prejuizoAtual + ')' + NL
    + 'Inclua o P&L REAL na observacao da simulacao.';

  // SECAO 6: Regras do investidor
  var filtroM9Str = cfg.filtroM9M21 === 1 ? 'ALTA' : cfg.filtroM9M21 === -1 ? 'BAIXA' : 'QUALQUER';
  var secao6 = NL + '=== REGRAS DO INVESTIDOR ===' + NL
    + 'Estrategia: Vendedor de ' + tipo + ' coberta OTM | Theta decay | Exercicio = LOSS' + NL
    + 'Meta recompra: ' + cfg.metaLucroRecompra + '% lucro (atual: ' + lucro + '%)' + NL
    + 'Janela DTE preferida: ' + cfg.dteMinEntrada + '-' + cfg.dteMaxEntrada + 'd'
    + ' | DTE critico: <' + cfg.dteAlertaUrgente + 'd' + NL
    + 'Score minimo: ' + cfg.filtroScoreMin + '/5 | Tendencia requerida: ' + filtroM9Str + NL
    + 'Aceita troca de ativo: ' + (cfg.avaliarOutrosAtivos ? 'SIM' : 'NAO');

  // INSTRUCAO: exige analise comparativa de cenarios, diversificacao e P&L real
  var instrucoes = NL + '=== INSTRUCAO ===' + NL
    + 'Analise TODOS os cenarios antes de recomendar. Para cada cenario viavel calcule o P&L resultante:' + NL
    + '  1. FECHAR: crystallizar prejuizo R$' + prejuizoAtual + ', liberar capital' + NL
    + '  2. ROLAR DEFENSIVO: strike abaixo do spot, recuperar parcialmente via novo premio' + NL
    + '  3. ROLAR PADRAO: janela ' + cfg.dteMinEntrada + '-' + cfg.dteMaxEntrada + 'd, melhor taxa' + NL
    + '  4. ROLAR OUTRO ATIVO: candidato qualificado (score+tendencia)' + NL
    + '  5. MANTER: apenas se theta restante + reversao justificarem' + NL
    + 'Mesmo que o ativo viole regras (tendencia/score), avalie rolagem que recupere parcialmente o prejuizo com risco controlado.' + NL
    + 'Escolha o cenario que MAXIMIZA recuperacao ou MINIMIZA perda total.' + NL
    + NL
    + 'REGRA DE DIVERSIFICACAO (CRITICA):' + NL
    + 'Esta analise faz parte de um portfolio com MULTIPLAS posicoes sendo analisadas.' + NL
    + 'Se o melhor candidato ja foi sugerido para outra posicao do portfolio,' + NL
    + 'prefira o SEGUNDO melhor candidato disponivel para evitar concentracao em unico ativo.' + NL
    + 'Mencione explicitamente na justificativa se optou por diversificar.' + NL
    + NL
    + 'CALCULO DE P&L REAL (OBRIGATORIO):' + NL
    + 'resultado_liquido_operacao = receita_nova_venda - custo_recompra' + NL
    + 'pl_real_operacao_completa  = resultado_liquido_operacao + (' + prejuizoAtual + ')' + NL
    + 'Inclua o pl_real_operacao_completa na observacao da simulacao.' + NL
    + NL
    + 'NOCIONAL: informe o nocional da nova posicao na observacao (strike_novo x ' + qtd + ' contratos).' + NL
    + NL
    + 'Retorne APENAS o JSON abaixo, sem texto adicional:' + NL
    + '{"status":"MANTER|ROLAR_MESMO_ATIVO|ROLAR_OUTRO_ATIVO|FECHAR",'
    + '"urgencia":"alta|media|baixa",'
    + '"diagnostico":"3-4 frases: situacao atual, distancia ITM, risco exercicio, contexto tecnico",'
    + '"recomendacao":"1 frase com cenario escolhido, ativo/opcao especifica e motivo principal",'
    + '"justificativa":"4-6 frases: P&L calculado de CADA cenario considerado, por que este foi escolhido, diversificacao considerada",'
    + '"alertas":["alerta especifico 1 com valor em R$","alerta especifico 2","alerta de concentracao se aplicavel"],'
    + '"opcao_sugerida":null|{"ticker_ativo":"","ticker_opcao":"","tipo":"PUT|CALL","vencimento":"yyyy-mm-dd","strike":0,"premio_estimado":0,"dte":0,"taxa_lucro_pct":0,"motivo_escolha":"por que este e nao outro candidato"},'
    + '"simulacao":null|{"custo_recompra":0,"receita_nova_venda":0,"resultado_liquido_operacao":0,"resultado_por_contrato":0,"observacao":"P&L real=R$X | Nocional novo=R$Y (Z contratos x strike)"}}';

  return secao1 + secao2 + secao3a + secao3b + secao3c + secao4 + secao5 + secao6 + instrucoes;
}



function _c023ChamarClaude(prompt) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY ausente. Configure via menu Sheets > Consultor IA > Configurar Chave.');
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
    new Date(),
    Session.getEffectiveUser().getEmail(),
    String(posicao.TICKER          || ''),
    String(posicao.OPTION_TICKER   || ''),
    String(posicao.OPTION_TYPE     || ''),
    parseFloat(posicao.STRIKE      || 0),
    parseFloat(posicao.SPOT        || 0),
    parseFloat(posicao.ENTRY_PRICE || 0),
    parseFloat(posicao.LAST_PREMIUM|| 0),
    (function() {
      var pm = parseFloat(posicao.ENTRY_PRICE||0);
      var pa = parseFloat(posicao.LAST_PREMIUM||0);
      return pm > 0 ? parseFloat(((pm-pa)/pm*100).toFixed(1)) : 0;
    })(),
    parseInt(posicao.DTE_CALENDAR  || posicao.DTE || 0),
    String(posicao.EXPIRY          || ''),
    String(posicao.MONEYNESS       || ''),
    String(analise.status          || ''),
    String(analise.urgencia        || ''),
    String(analise.diagnostico     || ''),
    String(analise.recomendacao    || ''),
    String(analise.justificativa   || ''),
    Array.isArray(analise.alertas) ? analise.alertas.join(' | ') : '',
    String(op.ticker_opcao         || ''),
    String(op.ticker_ativo         || ''),
    parseFloat(op.strike           || 0),
    String(op.vencimento           || ''),
    parseInt(op.dte                || 0),
    parseFloat(op.premio_estimado  || 0),
    parseFloat(op.taxa_lucro_pct   || 0),
    parseFloat(sim.custo_recompra  || 0),                 // SIM_CUSTO_RECOMPRA
    parseFloat(sim.receita_nova_venda || 0),              // SIM_RECEITA_NOVA
    parseFloat(sim.resultado_liquido_operacao || 0),      // SIM_RESULTADO_LIQUIDO
    (function() {                                         // SIM_PL_REAL
      var liqOp  = parseFloat(sim.resultado_liquido_operacao || 0);
      var pmPos  = parseFloat(posicao.ENTRY_PRICE || 0);
      var paPos  = parseFloat(posicao.LAST_PREMIUM || 0);
      var qtdPos = parseInt(posicao.QUANTITY || 0);
      // pl_posicao e negativo quando ha prejuizo: (pm - pa) * qtd
      // SIM_PL_REAL = resultado da rolagem + pl ja embutido na posicao
      var plPosicao = (pmPos - paPos) * qtdPos;
      return liqOp === 0 ? 0 : parseFloat((liqOp + plPosicao).toFixed(2));
    })(),
    (function() {
      var t = String(ctx.m9.M9M21_TREND || '0');
      return t === '1' ? 'ALTA' : t === '-1' ? 'BAIXA' : 'NEUTRO';
    })(),
    parseInt(ctx.sc.SCORE_TOTAL || 0),
    CONSULTOR_023_TOKENS
  ];

  var proxLinha = sheet.getLastRow() + 1;
  sheet.getRange(proxLinha, 1, 1, CONSULTOR_023_HEADERS.length).setValues([linha]);
  SpreadsheetApp.flush();
}

function _c023GarantirAba(ss) {
  var sheet = ss.getSheetByName(CONSULTOR_023_SHEET);

  // Criar aba se nao existir
  if (!sheet) {
    sheet = ss.insertSheet(CONSULTOR_023_SHEET);
    SysLogger.log('ConsultorIA_024', 'INFO',
      'Aba ' + CONSULTOR_023_SHEET + ' criada.',
      JSON.stringify({ colunas: CONSULTOR_023_HEADERS.length })
    );
  }

  // Garantir cabecalho independente de a aba ter sido criada agora ou ja existir.
  // Se linha 1 estiver vazia ou com valor diferente da primeira coluna esperada,
  // insere/sobrescreve o cabecalho com formatacao padrao do projeto.
  var primeiraColuna = sheet.getLastRow() > 0
    ? String(sheet.getRange(1, 1).getValue()).trim()
    : '';

  if (primeiraColuna !== CONSULTOR_023_HEADERS[0]) {
    // Inserir linha de cabecalho no topo (desloca dados existentes para baixo)
    sheet.insertRowBefore(1);
    var headerRange = sheet.getRange(1, 1, 1, CONSULTOR_023_HEADERS.length);
    headerRange.setValues([CONSULTOR_023_HEADERS]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1e293b');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    // Larguras das colunas com conteudo longo
    sheet.setColumnWidth(1,  160);  // ANALISADO_EM
    sheet.setColumnWidth(2,  200);  // DISPOSITIVO_SESSION
    sheet.setColumnWidth(16, 320);  // DIAGNOSTICO
    sheet.setColumnWidth(17, 220);  // RECOMENDACAO
    sheet.setColumnWidth(18, 320);  // JUSTIFICATIVA
    sheet.setColumnWidth(19, 280);  // ALERTAS
    SpreadsheetApp.flush();
    SysLogger.log('ConsultorIA_024', 'INFO',
      'Cabecalho inserido/corrigido em ' + CONSULTOR_023_SHEET + '.',
      JSON.stringify({ cabecalho: CONSULTOR_023_HEADERS })
    );
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
  if (dte <= cfg.dteAlertaUrgente)             motivos.push('DTE critico (' + dte + 'd)');
  if (moneyness.indexOf('ITM') >= 0)           motivos.push('Posicao ITM');
  if (tendM9 === -1)                           motivos.push('Tendencia baixa');
  if (motivos.length > 0) return { nivel: 'alta', motivo: motivos.join(' | ') };

  if (lucroPct >= cfg.metaLucroRecompra)       motivos.push('Meta atingida (' + lucroPct.toFixed(0) + '%)');
  if (dte <= 21 && dte > cfg.dteAlertaUrgente) motivos.push('DTE proximo (' + dte + 'd)');
  if (motivos.length > 0) return { nivel: 'media', motivo: motivos.join(' | ') };

  return { nivel: 'baixa', motivo: 'Posicao saudavel' };
}

// ============================================================================
// HOMOLOGACAO
// ============================================================================

function testConsultorIA024() {
  console.log('=== HOMOLOGACAO 024_ConsultorIAClaudeSonnet45 ===');

  // 1. Configs
  var cfg = _c023LerConfigs();
  console.log('Configs: metaLucro=' + cfg.metaLucroRecompra +
    ' | dteMin=' + cfg.dteMinEntrada + ' | dteMax=' + cfg.dteMaxEntrada);

  // 2. Leitura direta do COCKPIT com header correto
  var cockpit = _c023LerCockpit();
  console.log('COCKPIT (header correto): ' + cockpit.length + ' linhas');
  if (cockpit.length > 0) {
    var primeiros = cockpit.slice(0, 2);
    primeiros.forEach(function(op, i) {
      console.log('  [' + i + '] STATUS=' + op.STATUS + ' | TICKER=' + op.TICKER +
        ' | OPTION_TICKER=' + op.OPTION_TICKER);
    });
  }

  // 3. Listagem de posicoes ativas
  var lista = consultorListarPosicoes();
  console.log('Posicoes ativas: ' + (lista.success ? lista.posicoes.length : 'ERRO: ' + lista.error));
  if (lista.success && lista.posicoes.length > 0) {
    lista.posicoes.forEach(function(p) {
      console.log('  ' + p.ticker + '/' + p.opcao +
        ' | urgencia=' + p.urgencia + ' | ' + p.urgenciaMot);
    });
  }

  // 4. Chave Anthropic
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  console.log('ANTHROPIC_API_KEY: ' + (apiKey ? 'OK (' + apiKey.length + ' chars)' : 'AUSENTE'));

  // 5. Aba de historico
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = _c023GarantirAba(ss);
  console.log('Aba historico: ' + sheet.getName() + ' | linhas: ' + sheet.getLastRow());

  console.log('=== FIM ===');
}