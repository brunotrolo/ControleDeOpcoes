# Travas de Alta — PUT Spread PWA

Aplicativo mobile para visualizar os spreads gerados pelo Screener Quantitativo.

## Estrutura

```
pwa-mobile/
├── index.html       ← App completo (HTML + CSS + JS)
├── manifest.json    ← Configuração PWA (ícone, nome, tema)
├── sw.js            ← Service Worker (funciona offline)
├── icon-192.svg     ← Ícone do app (192×192)
├── icon-512.svg     ← Ícone do app (512×512)
├── GAS_SNIPPET.gs   ← Trecho para adicionar ao projeto GAS
└── README.md        ← Este arquivo
```

## Setup em 4 passos

### Passo 1 — Modificar o GAS

Abra o projeto GAS e siga as instruções dentro de `GAS_SNIPPET.gs`.
São duas mudanças em `Código.gs`: adicionar 3 linhas dentro de `doGet()` e copiar a função `_pwa_servirScreener()`.

### Passo 2 — Publicar o GAS como WebApp

No GAS Editor:
1. **Implantar → Novo implantação**
2. Tipo: **App da Web**
3. Executar como: **Eu**
4. Acesso: **Qualquer pessoa** (sem login)
5. Copie a **URL do app da Web** gerada

### Passo 3 — Publicar no GitHub Pages

1. Crie um repositório público no GitHub (ex: `travas-put`)
2. Faça upload de todos os arquivos desta pasta
3. Vá em **Settings → Pages**
4. Source: **Deploy from branch → main → / (root)**
5. Acesse a URL gerada (ex: `https://seuusuario.github.io/travas-put`)

### Passo 4 — Configurar a URL no app

Ao abrir o app pela primeira vez, um modal pedirá a URL do WebApp GAS.
Cole a URL do Passo 2 e clique em **Salvar e Carregar**.

A URL fica salva no navegador — não precisa inserir novamente.

## Instalar como app no smartphone

### Android (Chrome)
1. Acesse a URL do GitHub Pages no Chrome
2. Menu (⋮) → **Adicionar à tela inicial**
3. O app aparecerá como ícone na tela inicial

### iOS (Safari)
1. Acesse a URL no Safari
2. Botão de compartilhamento → **Adicionar à Tela de Início**
3. Confirme o nome e toque em **Adicionar**

## Funcionalidades

- **Grupos por ticker**: cada card mostra pernas VENDA + COMPRA do mesmo ativo
- **Nota Quantamental**: círculo de 0–100 com cor (verde/amarelo/vermelho)
- **Filtros**: Todos / Só Venda / Só Compra
- **Ordenação**: por Nota, por DTE, por Retorno
- **Cache offline**: último conjunto de dados disponível sem internet
- **Auto-refresh**: botão Atualizar chama o GAS em tempo real

## Métricas exibidas por perna

| Campo | Descrição |
|---|---|
| Strike | Preço de exercício |
| Prêmio | Preço de mercado da opção |
| Retorno (VENDA) | PROFIT_RATE — retorno sobre o strike |
| Dist. (COMPRA) | DIST_SPOT_PCT — distância percentual do spot |
| Delta | Sensibilidade ao preço do ativo |
| Theta | Decaimento diário do valor |
| IV Rank (VENDA) | Percentil de volatilidade implícita |
| Volume (COMPRA) | Volume financeiro em R$ |
