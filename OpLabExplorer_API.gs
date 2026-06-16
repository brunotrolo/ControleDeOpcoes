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

  function probe(label, path, critical) {
    var start = new Date().getTime();
    try {
      var resp = UrlFetchApp.fetch(OPLAB_BASE_URL + path, { method: "get", headers: headers, muteHttpExceptions: true });
      var elapsed = new Date().getTime() - start;
      var status = resp.getResponseCode();
      var body = resp.getContentText();
      var ok = (status === 200 || status === 204);
      var preview = null, errorMsg = null;
      if (ok && body) {
        try {
          var d = JSON.parse(body);
          if (Array.isArray(d)) preview = "Array: " + d.length + " item(s)";
          else if (d && typeof d === "object") {
            var keys = Object.keys(d).slice(0, 4);
            preview = "{" + keys.join(", ") + (Object.keys(d).length > 4 ? ", ..." : "") + "}";
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
      return { label: label, path: path, critical: critical, ok: ok, status: status, elapsed: elapsed, preview: preview, error: errorMsg };
    } catch(e) {
      return { label: label, path: path, critical: critical, ok: false, status: "ERR", elapsed: new Date().getTime() - start, preview: null, error: e.message };
    }
  }

  // Busca um símbolo de opção real de PETR4 para endpoints que exigem ticker de opção
  var liveOptionSymbol = null;
  try {
    var optResp = UrlFetchApp.fetch(OPLAB_BASE_URL + "/market/options/PETR4", { method: "get", headers: headers, muteHttpExceptions: true });
    if (optResp.getResponseCode() === 200) {
      var opts = JSON.parse(optResp.getContentText());
      if (Array.isArray(opts) && opts.length > 0 && opts[0].symbol) liveOptionSymbol = opts[0].symbol;
    }
  } catch(_) {}

  var results = [
    probe("Status do Mercado",         "/market/status",                                                          true),
    probe("Dados de Ação (PETR4)",     "/market/stocks/PETR4",                                                    true),
    probe("Opções por Ativo (PETR4)",  "/market/options/PETR4",                                                   true),
    probe("Histórico Ação (PETR4)",    "/market/historical/PETR4/1d?amount=5&smooth=true&df=iso",                 true),
    probe("Histórico de Opções",       "/market/historical/options/PETR4/2024-01-02/2024-01-31",                  false),
    probe("Detalhes de Opção",         "/market/options/details/" + (liveOptionSymbol || "PETRA260"),             false),
    probe("Black-Scholes (BS)",        "/market/options/bs?symbol=" + (liveOptionSymbol || "PETRA260"),           false)
  ];

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
