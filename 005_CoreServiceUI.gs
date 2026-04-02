/**
 * @fileoverview 005_CoreServiceUI.gs - v4.1
 * RESPONSABILIDADE: Gerenciar a ponte de execucao mantendo o silencio total na interface.
 * PADRAO: Zero Toasts e Zero Modais. Tudo flui em background (Console e SysLogger).
 *
 * v4.1 - Correcoes:
 *   - Removidos template literals (backticks) -- incompativeis com GAS document.write()
 *   - Adicionadas bridges ausentes: SyncCorrelIbovRanking_Menu, SyncCompaniesRanking_Menu
 *   - ConsultorIA_AbrirTela REMOVIDA deste arquivo -- pertence ao 024_ConsultorIAClaudeSonnet45.gs
 */

const UIHandler = {

  /**
   * Forcamos o sistema a sempre agir como backend,
   * ignorando qualquer tentativa de renderizar pop-ups na tela.
   */
  isBackend() {
    return true;
  },

  /**
   * Notificacao Silenciosa.
   */
  notify(mensagem, titulo) {
    titulo = titulo || "Sistema";
    console.info("[NOTIFY_SILENCIADO] " + titulo + ": " + mensagem);
  },

  /**
   * Alerta Silencioso. Redirecionado para o Console de Erros.
   */
  alert(titulo, mensagem) {
    console.warn("[ALERT_SILENCIADO] " + titulo + ": " + mensagem);
  }
};

// ================================================================
// BRIDGE MESTRE
// ================================================================

/**
 * Bridge mestre que encapsula a execucao garantindo logs e silencio.
 */
function _menuBridge(servicoNome, callback) {
  var inicio = Date.now();

  try {
    callback();

    var duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    console.info("[BRIDGE] " + servicoNome + " concluido com sucesso em " + duracao + "s.");

    if (typeof SysLogger !== 'undefined') SysLogger.flush();

  } catch (e) {
    console.error("[BRIDGE_ERRO] Falha em " + servicoNome + ": " + e.message);

    if (typeof SysLogger !== 'undefined') {
      SysLogger.log("UI_BRIDGE", "ERRO", "Falha fatal em " + servicoNome, String(e.message));
      SysLogger.flush();
    }
  }
}

// ================================================================
// MAPA DE FUNCOES DO MENU
// ================================================================

function AtualizarNecton_Menu()             { _menuBridge("Necton", atualizarNecton); }
function AtualizarDadosAtivos_Menu()        { _menuBridge("Ativos", atualizarDadosAtivos); }
function AtualizarHistorico_Menu()          { _menuBridge("Historico", atualizarDadosHistoricos); }
function AtualizarDetalhes_Menu()           { _menuBridge("Detalhes", atualizarDetalhesOpcoes); }
function AtualizarGregasAPI_Menu()          { _menuBridge("Gregas (API)", atualizarGregas); }
function CalcularGregasNativo_Menu()        { _menuBridge("Gregas (Nativo)", calcularGregasNativo); }
function AtualizarScanner_Menu()            { _menuBridge("Scanner Oportunidades", atualizarScannerOpcoes); }
function SyncSeriesInstrumento_Menu()       { _menuBridge("Series de Opcoes (OPLab)", orquestrarSyncSeriesInstrumento); }
function SyncBestCoveredOptionsRates_Menu() { _menuBridge("Melhores Taxas de Lucro (OPLab)", orquestrarSyncBestRates); }
function SyncHighestOptionsVolume_Menu()    { _menuBridge("Maiores Volumes em Opcoes (OPLab)", orquestrarSyncHighestVolume); }
function SyncHighestOptionsVariation_Menu() { _menuBridge("Maiores Variacoes em Opcoes (OPLab)", orquestrarSyncHighestVariation); }
function SyncM9M21Ranking_Menu()            { _menuBridge("Ranking Tendencia M9M21 (OPLab)", orquestrarSyncM9M21); }
function SyncOplabScore_Menu()              { _menuBridge("Ranking OPLab Score (OPLab)", orquestrarSyncOplabScore); }
function SyncHistoricalOptions_Menu()       { _menuBridge("Historico de Opcoes (OPLab)", orquestrarSyncHistoricalOptions); }
function SyncHistoricoOpcoes250D_Menu()     { _menuBridge("Historico Incremental Opcoes 250D", sincronizarHistoricoOpcoes); }
function SyncCorrelIbovRanking_Menu()       { _menuBridge("Ranking Correlacao IBOV (OPLab)", orquestrarSyncCorrelIbov); }
function SyncCompaniesRanking_Menu()        { _menuBridge("Ranking Fundamentalista (OPLab)", orquestrarSyncCompaniesRanking); }


// ================================================================
// TESTE DE HOMOLOGACAO
// ================================================================

function testSuiteUIHandler() {
  console.log("=== HOMOLOGANDO INTERFACE v4.1 ===");

  UIHandler.notify("Isso nao deve aparecer na tela.", "Teste");
  UIHandler.alert("Isso tambem nao deve aparecer na tela.", "Teste de Erro");

  console.log("Testando resiliencia da Bridge silenciosa...");
  _menuBridge("Teste_Silencioso", function() {
    throw new Error("Simulacao de falha para validar apenas o Log interno.");
  });

  console.log("=== FIM DA HOMOLOGACAO ===");
}