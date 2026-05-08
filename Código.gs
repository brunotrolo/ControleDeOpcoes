/**
 * ═══════════════════════════════════════════════════════════════
 * CÓDIGO.GS - PONTO DE ENTRADA E MENU PRINCIPAL
 * ═══════════════════════════════════════════════════════════════
 * RESPONSABILIDADES:
 * - Criar menu (onOpen) para interação do usuário com a interface (004).
 * - Servir a aplicação Web (doGet / include).
 * - Manter utilitários isolados de autorização.
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Cria o menu "⚙️ Automação" quando a planilha é aberta.
 * Conecta diretamente com as Pontes (Bridges) do arquivo 004_CoreServiceUI.
 */
function onOpen(e) {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('⚙️ Automação')
        .addItem('🚀 Rodar Fluxo Mestre (Planilha)', 'executarFluxoSequencial')
        .addItem('🔌 Rodar Fluxo OPLab Market Data', 'executarFluxoOPLab')
        .addSeparator()
        .addItem('📥 1. Atualizar Necton (Portfólio)', 'AtualizarNecton_Menu')
        .addItem('📈 2. Atualizar Dados Ativos (Ações)', 'AtualizarDadosAtivos_Menu')
        .addItem('🕰️ 3. Atualizar Histórico Ativos (250d)', 'AtualizarHistorico_Menu')
        .addItem('🔍 4. Atualizar Detalhes (Opções)', 'AtualizarDetalhes_Menu')
        .addItem('📂 5. Atualizar Histórico Opções (250d)', 'SyncHistoricoOpcoes250D_Menu')
        .addSeparator()
        .addItem('🧮 6a. Calcular Gregas (API OPLab)', 'AtualizarGregasAPI_Menu')
        .addItem('🔬 6b. Calcular Gregas (Nativo BS)', 'CalcularGregasNativo_Menu')
        .addSeparator()
        .addItem('📡 7. Escaner Opções Oportunidades (API OPLab)', 'AtualizarScanner_Menu')
        .addSeparator()
        .addItem('📊 8. Séries de Opções (API OPLab)', 'SyncSeriesInstrumento_Menu')
        .addItem('💰 9. Melhores Taxas de Lucro (API OPLab)', 'SyncBestCoveredOptionsRates_Menu')
        .addItem('📈 10. Maiores Volumes em Opções (API OPLab)', 'SyncHighestOptionsVolume_Menu')
        .addItem('⚡ 11. Maiores Variações em Opções (API OPLab)', 'SyncHighestOptionsVariation_Menu')
        .addItem('📉 12. Ranking Tendência M9M21 (API OPLab)', 'SyncM9M21Ranking_Menu')
        .addItem('🏆 13. Ranking OPLab Score (API OPLab)', 'SyncOplabScore_Menu')
        .addItem('🕰️ 14. Histórico de Opções (API OPLab)', 'SyncHistoricalOptions_Menu')
        .addItem('🏦 15. Correlação IBOV (API OPLab)', 'SyncCorrelIbovRanking_Menu')
        .addItem('📊 16. Ranking Fundamentalista (API OPLab)', 'SyncCompaniesRanking_Menu')
        .addSeparator()
        .addItem('🤖 17. Consultor IA (Claude)', 'ConsultorIA_AbrirTela')
        .addToUi();
  } catch (err) {
    console.warn("[onOpen] Interface indisponível.");
  }
}

// ============================================================================
// SERVIDOR WEB (HTML SERVICE)
// ============================================================================

/**
 * Ponto de entrada para o Web App (Dashboard HTML).
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Stock Options | Intelligence')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Função vital para o sistema de slots e componentes HTML.
 */
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    return ``;
  }
}

// ============================================================================
// UTILITÁRIOS E TESTES DE INTEGRIDADE
// ============================================================================

/**
 * Verifica se a fundação (000 a 005) está conectada e se comunicando.
 */
function testeFinalIntegridade() {
  console.log("--- INICIANDO TESTE FINAL DE ARQUITETURA ---");
  
  try {
    // 1. Testa Base de Configuração (001)
    console.log(`🔍 Configuração (001): Aba SERIES_INSTR definida como '${SYS_CONFIG.SHEETS.SERIES_INSTR}'`);
    
    // 2. Testa Logger (003)
    SysLogger.log("SISTEMA", "INFO", "Teste de integridade do Menu", "Sucesso");
    console.log("✅ Logger (003) operacional.");

    // 3. Testa Orquestrador (005)
    const servicos = Object.keys(CoreOrchestrator.REGISTRY);
    console.log(`✅ Orquestrador (005) operacional. Serviços mapeados: ${servicos.length} (${servicos.join(", ")})`);

    console.log("--- SISTEMA SAUDÁVEL E TOTALMENTE CONECTADO ---");
  } catch (e) {
    console.error("❌ ERRO DE INTEGRIDADE: " + e.message);
  }
}