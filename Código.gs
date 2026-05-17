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
        .addSeparator()
        .addItem('📥 1. Atualizar Necton (Portfólio)', 'AtualizarNecton_Menu')
        .addItem('📈 2. Atualizar Dados Ativos (Ações)', 'AtualizarDadosAtivos_Menu')
        .addItem('🔍 3. Atualizar Detalhes (Opções)', 'AtualizarDetalhes_Menu')
        .addSeparator()
        .addItem('🧮 4a. Calcular Gregas (API OPLab)', 'AtualizarGregasAPI_Menu')
        .addItem('🔬 4b. Calcular Gregas (Nativo BS)', 'CalcularGregasNativo_Menu')
        .addSeparator()
        .addItem('📡 5. Scanner de Opções (SCANNER_OPCOES)', 'AtualizarScannerOpcoes_Menu')
        .addSeparator()
        .addItem('💰 6. Melhores Taxas Cobertas (PUT/CALL)', 'SyncBestCoveredOptionsRates_Menu')
        .addItem('📊 7. Maiores Volumes em Opções',           'SyncHighestOptionsVolume_Menu')
        .addItem('📈 8. Ranking Tendência M9M21',             'SyncM9M21Ranking_Menu')
        .addItem('🔗 9. Ranking Correlação IBOV',             'SyncCorrelIbovRanking_Menu')
        .addSeparator()
        .addItem('🎯 10. Screener Quantitativo (Trava de Alta PUT)', 'ScreenerQuantitativo_Menu')
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
