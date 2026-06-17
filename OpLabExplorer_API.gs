/**
 * ═══════════════════════════════════════════════════════════════
 * OpLabExplorer_API.gs - MÓDULO ISOLADO
 * ═══════════════════════════════════════════════════════════════
 * RESPONSABILIDADE: Realizar chamadas de Proxy para a API OpLab
 * CONSUMO: Exclusivo para o componente OpLabExplorerView.html
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Executa uma requisição GET na API da OpLab.
 * Chamado pelo frontend via google.script.run.callOpLabAPI
 * * @param {string} path - Path do endpoint (ex: /market/options/PETR4)
 * @param {Object} queryParams - Objeto com query parameters
 * @returns {Object} { status, data, elapsed, url }
 */
function callOpLabAPI(path, queryParams) {
  const startTime = new Date().getTime();
  const OPLAB_BASE_URL = "https://api.oplab.com.br/v3";
  
  try {
    // 🛡️ Segurança: Busca o token salvo nas Propriedades do Script
    // Certifique-se de cadastrar a chave 'OPLAB_ACCESS_TOKEN' nas configurações do projeto
    const OPLAB_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty("OPLAB_ACCESS_TOKEN");
    
    if (!OPLAB_ACCESS_TOKEN) {
      throw new Error("Configuração ausente: OPLAB_ACCESS_TOKEN não encontrado nas Propriedades do Script.");
    }

    // 1. Montagem da URL com Query Parameters
    let url = OPLAB_BASE_URL + path;
    
    if (queryParams && Object.keys(queryParams).length > 0) {
      const qs = Object.entries(queryParams)
        .filter(([_, v]) => v !== "" && v !== null && v !== undefined)
        .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
        .join("&");
      if (qs) url += "?" + qs;
    }
    
    // 2. Configuração da Requisição
    const options = {
      method: "get",
      headers: {
        "Access-Token": OPLAB_ACCESS_TOKEN,
        "Accept": "application/json"
      },
      muteHttpExceptions: true
    };
    
    // 3. Execução via UrlFetchApp
    const response = UrlFetchApp.fetch(url, options);
    const elapsed = new Date().getTime() - startTime;
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    // 4. Tratamento do Payload (Tenta JSON, senão devolve texto)
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = responseText;
    }
    
    return {
      status: statusCode,
      data: data,
      elapsed: elapsed,
      url: url
    };
    
  } catch (error) {
    const elapsed = new Date().getTime() - startTime;
    return {
      status: "ERR",
      data: { error: error.message },
      elapsed: elapsed,
      url: OPLAB_BASE_URL + path
    };
  }
}

/**
 * Testa todos os endpoints da OPLab consumidos por 000_CoreServiceAPIClient.gs.
 * Chamado pelo frontend via google.script.run.runOpLabDiagnostic
 * @returns {Object} resultado completo do diagnóstico
 */
function runOpLabDiagnostic() {
  var OPLAB_BASE_URL = "https://api.oplab.com.br/v3";
  var token = PropertiesService.getScriptProperties().getProperty("OPLAB_ACCESS_TOKEN");

  if (!token) {
    return {
      tokenOk: false, error: "OPLAB_ACCESS_TOKEN não configurado nas Script Properties.",
      results: [], allOk: false, criticalOk: false, failedCount: 0, totalCount: 0,
      testedAt: new Date().toISOString()
    };
  }

  var headers = { "Access-Token": token.trim(), "Accept": "application/json" };
  var BUDGET_MS = 50000; // 50s total: se um endpoint travar, os restantes são marcados como SKIP
  var diagStart = new Date().getTime();

  function probe(label, path, critical) {
    // Orçamento global: se já gastamos demais, não faz mais chamadas
    if (new Date().getTime() - diagStart > BUDGET_MS) {
      return { label: label, path: path, critical: critical, ok: false, status: "SKIP", elapsed: 0, preview: null, error: "Orçamento de tempo atingido — API possivelmente indisponível", _parsed: null };
    }
    var start = new Date().getTime();
    try {
      var resp = UrlFetchApp.fetch(OPLAB_BASE_URL + path, { method: "get", headers: headers, muteHttpExceptions: true });
      var elapsed = new Date().getTime() - start;
      var status = resp.getResponseCode();
      var body = resp.getContentText();
      var ok = (status === 200 || status === 204);
      var preview = null, errorMsg = null, parsed = null;
      if (ok && body) {
        try {
          parsed = JSON.parse(body);
          if (Array.isArray(parsed)) preview = "Array: " + parsed.length + " item(s)";
          else if (parsed && typeof parsed === "object") {
            var keys = Object.keys(parsed).slice(0, 4);
            preview = "{" + keys.join(", ") + (Object.keys(parsed).length > 4 ? ", ..." : "") + "}";
          }
        } catch(_) {}
      }
      if (!ok) {
        errorMsg = "HTTP " + status;
        try {
          var err = JSON.parse(body);
          if (err.message) errorMsg += ": " + err.message;
          else if (err.error) errorMsg += ": " + err.error;
        } catch(_) {
          if (body && body.length < 300) errorMsg += " — " + body.substring(0, 200);
        }
      }
      return { label: label, path: path, critical: critical, ok: ok, status: status, elapsed: elapsed, preview: preview, error: errorMsg, _parsed: parsed };
    } catch(e) {
      return { label: label, path: path, critical: critical, ok: false, status: "ERR", elapsed: new Date().getTime() - start, preview: null, error: e.message, _parsed: null };
    }
  }

  function clean(r) {
    return { label: r.label, path: r.path, critical: r.critical, ok: r.ok, status: r.status, elapsed: r.elapsed, preview: r.preview, error: r.error };
  }

  // Probes executadas em sequência para que a #3 forneça o símbolo de opção para as #6 e #7
  var results = [];

  var r1 = probe("Status do Mercado",        "/market/status",                                             true);
  results.push(clean(r1));

  var r2 = probe("Dados de Ação (PETR4)",    "/market/stocks/PETR4",                                       true);
  results.push(clean(r2));

  // Probe #3: também extrai o símbolo de opção para os testes seguintes
  var r3 = probe("Opções por Ativo (PETR4)", "/market/options/PETR4",                                      true);
  var liveOptionSymbol = null;
  if (r3.ok && Array.isArray(r3._parsed) && r3._parsed.length > 0 && r3._parsed[0].symbol) {
    liveOptionSymbol = r3._parsed[0].symbol;
  }
  results.push(clean(r3));

  var r4 = probe("Histórico Ação (PETR4)",   "/market/historical/PETR4/1d?amount=5&smooth=true&df=iso",   true);
  results.push(clean(r4));

  var r5 = probe("Histórico de Opções",      "/market/historical/options/PETR4/2024-01-02/2024-01-31",    false);
  results.push(clean(r5));

  var optSymbol = liveOptionSymbol || "PETRA260";

  var r6 = probe("Detalhes de Opção",        "/market/options/details/" + optSymbol,                       false);
  results.push(clean(r6));

  var r7 = probe("Black-Scholes (BS)",       "/market/options/bs?symbol=" + optSymbol,                     false);
  results.push(clean(r7));

  var failedCount = results.filter(function(r) { return !r.ok; }).length;

  return {
    tokenOk: true,
    allOk: failedCount === 0,
    criticalOk: results.filter(function(r) { return r.critical; }).every(function(r) { return r.ok; }),
    failedCount: failedCount,
    totalCount: results.length,
    liveOptionSymbol: liveOptionSymbol,
    results: results,
    testedAt: new Date().toISOString()
  };
}
