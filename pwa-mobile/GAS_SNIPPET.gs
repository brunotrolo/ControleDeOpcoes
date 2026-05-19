/**
 * GAS_SNIPPET.gs — Adicionar ao projeto GAS existente
 *
 * INSTRUÇÃO: Abra o arquivo Código.gs no GAS Editor.
 * Dentro da função doGet(e), adicione o bloco abaixo
 * ANTES do "return HtmlService.createTemplateFromFile..." existente.
 *
 * ─────────────────────────────────────────────────────────────────
 *  ONDE INSERIR em Código.gs (exemplo):
 *
 *    function doGet(e) {
 *      // ↓ ADICIONAR AQUI ↓
 *      if (e && e.parameter && e.parameter.action === 'screener_json') {
 *        return _pwa_servirScreener();
 *      }
 *      // ↑ FIM DA ADIÇÃO ↑
 *
 *      var tmpl = HtmlService.createTemplateFromFile('Index');
 *      ... (resto do doGet existente)
 *    }
 * ─────────────────────────────────────────────────────────────────
 */

// Cole esta função em qualquer arquivo .gs do projeto (ex: API.gs ou Código.gs)
function _pwa_servirScreener() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var sheet  = ss.getSheetByName('SCREENER_QUANTITATIVO');
  var payload = { rows: [], ts: new Date().toISOString() };

  if (sheet && sheet.getLastRow() > 1) {
    var lastCol  = sheet.getLastColumn();
    var lastRow  = sheet.getLastRow();
    var headers  = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    var data     = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var tz       = Session.getScriptTimeZone();

    payload.rows = data
      .map(function(row) {
        var obj = {};
        headers.forEach(function(h, i) {
          var v = row[i];
          // Converte Date para string legível
          if (v instanceof Date && !isNaN(v)) {
            obj[h] = Utilities.formatDate(v, tz, 'dd/MM/yyyy HH:mm');
          } else {
            obj[h] = v;
          }
        });
        return obj;
      })
      .filter(function(r) { return r['TICKER']; }); // Remove linhas vazias
  }

  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
