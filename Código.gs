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
        .addItem('🔍 3. Atualizar Detalhes (Opções)', 'AtualizarDetalhes_Menu')
        .addSeparator()
        .addItem('🧮 4a. Calcular Gregas (API OPLab)', 'AtualizarGregasAPI_Menu')
        .addItem('🔬 4b. Calcular Gregas (Nativo BS)', 'CalcularGregasNativo_Menu')
        .addSeparator()
        .addItem('📡 5. Escaner Opções Oportunidades (API OPLab)', 'AtualizarScanner_Menu')
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
    console.log(`🔍 Configuração (001): Aba COCKPIT definida como '${SYS_CONFIG.SHEETS.COCKPIT}'`);
    
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