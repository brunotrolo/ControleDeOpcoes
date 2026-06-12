# Runbook: Bootstrap de Novo Projeto GAS + CI/CD

> **Como usar:** no início de um novo chat do Claude Code, faça upload deste
> arquivo e diga:
>
> _"Siga o BOOTSTRAP_NOVO_PROJETO_GAS.md para criar meu projeto do zero."_
>
> Claude vai guiar você passo a passo. Você só precisa ter em mãos:
> - O **Script ID** do seu projeto GAS
> - O **JSON de credenciais** do clasp (instrução abaixo para gerar)
> - O **nome** que quer dar ao repositório GitHub

---

## O que você precisa preparar (antes de abrir o Claude Code)

### 1 — Criar o Google Sheet e o projeto GAS

1. Acesse https://sheets.google.com → **Planilha em branco**
2. Dê um nome (ex: `MeuProjeto`)
3. Menu → **Extensões → Apps Script** (abre o editor GAS numa nova aba)
4. Copie o **Script ID** da URL:
   ```
   https://script.google.com/home/projects/<COPIE_ISTO>/edit
   ```

### 2 — Gerar as credenciais do clasp (token OAuth)

> **Sem instalar nada.** Use o Google Cloud Shell (terminal no browser).

1. Abra https://shell.cloud.google.com/
2. Cole e execute:
   ```bash
   npm install -g @google/clasp && clasp login --no-localhost
   ```
3. Abra a URL exibida → faça login com a **mesma conta Google do GAS** → autorize
4. Cole o código de volta no terminal e pressione Enter
5. Execute:
   ```bash
   cat ~/.clasprc.json
   ```
6. Copie todo o JSON exibido (começa com `{`, termina com `}`)

> ⚠️ O Cloud Shell gera o formato novo. Claude vai convertê-lo automaticamente
> para o formato correto antes de salvar.

---

## Instruções para Claude (execute nesta ordem)

> Claude: ao receber este arquivo, siga os passos abaixo **na ordem exata**,
> perguntando ao usuário apenas o que está marcado como **[PERGUNTAR]**.

---

### PASSO 1 — Coletar informações do usuário

Pergunte ao usuário (pode ser tudo de uma vez):

1. **[PERGUNTAR]** Qual o nome do repositório GitHub? (ex: `meu-projeto-gas`)
2. **[PERGUNTAR]** Qual o Script ID do projeto GAS? (da URL do editor)
3. **[PERGUNTAR]** Cole o conteúdo do `~/.clasprc.json` gerado no Cloud Shell

---

### PASSO 2 — Converter as credenciais do clasp

O Cloud Shell (clasp v3) gera o formato novo (`"tokens": { "default": ... }`).
Claude deve converter para o formato clássico que o workflow usa:

```json
{
  "token": {
    "access_token": "<access_token do JSON original>",
    "refresh_token": "<refresh_token do JSON original>",
    "token_type": "Bearer",
    "expiry_date": 1
  },
  "oauth2ClientSettings": {
    "clientId": "<client_id do JSON original>",
    "clientSecret": "<client_secret do JSON original>",
    "redirectUri": "http://localhost"
  },
  "isLocalCreds": false
}
```

Exibir o JSON convertido ao usuário e pedir confirmação antes de continuar.

---

### PASSO 3 — Criar o repositório GitHub

Use a ferramenta `mcp__github__create_repository` com:
- `name`: o nome fornecido pelo usuário
- `private`: `true` (repositório privado por padrão)
- `auto_init`: `true` (cria com commit inicial)

Confirmar com o usuário a URL do repo criado.

---

### PASSO 4 — Criar o secret CLASPRC_JSON (passo manual do usuário)

Claude **não consegue** criar secrets via GitHub MCP — este é o **único passo manual**.

Instruir o usuário a:

1. Acessar: `https://github.com/<SEU_USUARIO>/<NOME_DO_REPO>/settings/secrets/actions`
2. Clicar em **New repository secret**
3. **Name:** `CLASPRC_JSON`
4. **Secret:** colar o JSON convertido no Passo 2
5. Clicar em **Add secret**
6. Voltar e avisar Claude quando concluído

---

### PASSO 5 — Criar todos os arquivos do projeto

Use `mcp__github__push_files` para criar os arquivos abaixo num único commit.

#### `.clasp.json`
```json
{
  "scriptId": "<SCRIPT_ID_DO_USUARIO>",
  "rootDir": "./"
}
```

#### `.claspignore`
```
pwa-mobile/**
mockups/**
docs/**
.github/**
.git/**
*.md
.claspignore
.gitignore
node_modules/**
```

#### `appsscript.json`
```json
{
  "timeZone": "America/Sao_Paulo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

#### `.github/workflows/deploy-gas-dev.yml`
```yaml
name: Deploy to GAS DEV

# Dispara automaticamente em todo push para main ou branch de trabalho.
# Também pode ser disparado manualmente: Actions → Deploy to GAS DEV → Run workflow.
#
# Pré-requisitos:
#   - Secret CLASPRC_JSON criado em Settings → Secrets → Actions
#   - .clasp.json com scriptId do projeto GAS na raiz do repo
#   - .claspignore excluindo arquivos não-GAS

on:
  workflow_dispatch:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Cache clasp
        uses: actions/cache@v4
        with:
          path: ~/.npm-global
          key: clasp-${{ runner.os }}-node24

      - name: Install clasp
        run: |
          mkdir -p ~/.npm-global
          npm config set prefix ~/.npm-global
          if [ ! -f ~/.npm-global/bin/clasp ]; then
            npm install -g @google/clasp
          fi
          echo "$HOME/.npm-global/bin" >> $GITHUB_PATH

      - name: Write clasp credentials
        run: echo '${{ secrets.CLASPRC_JSON }}' > ~/.clasprc.json

      - name: Push to GAS DEV
        id: push
        run: |
          OUTPUT=$(clasp push --force 2>&1)
          echo "$OUTPUT"
          FILES=$(echo "$OUTPUT" | grep -c '└─' || true)
          echo "files=$FILES" >> $GITHUB_OUTPUT

      - name: Deploy summary
        run: |
          echo "### ✅ Deploy GAS DEV concluído" >> $GITHUB_STEP_SUMMARY
          echo "- **Arquivos:** ${{ steps.push.outputs.files }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Branch:** \`${{ github.ref_name }}\`" >> $GITHUB_STEP_SUMMARY
          echo "- **Commit:** \`${{ github.sha }}\`" >> $GITHUB_STEP_SUMMARY
```

#### `.gitignore`
```
node_modules/
.env
*.local
```

#### `Código.gs`
```javascript
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Meu Projeto GAS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

#### `Index.html`
```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meu Projeto GAS</title>
  </head>
  <body>
    <h1>Projeto GAS iniciado com sucesso!</h1>
    <p>Pipeline CI/CD ativa. Edite este arquivo e o deploy acontece automaticamente.</p>
  </body>
</html>
```

---

### PASSO 6 — Verificar o deploy inicial

Após o push dos arquivos, o GitHub Actions deve disparar automaticamente.

Informar ao usuário:
1. O deploy está rodando em: `https://github.com/<usuario>/<repo>/actions`
2. Aguardar ~30s para o primeiro deploy concluir
3. Abrir o editor GAS — os arquivos devem aparecer lá

---

### PASSO 7 — Confirmar e resumir

Ao final, exibir ao usuário:

```
✅ Projeto criado com sucesso!

Repositório: https://github.com/<usuario>/<repo>
GAS: https://script.google.com/home/projects/<scriptId>/edit

Fluxo de trabalho:
  Você pede uma mudança aqui no Claude Code
  → Claude edita + faz git push
  → GitHub Actions deploya automaticamente (~30s)
  → Mudança aparece no GAS sem nenhuma ação extra

Para publicar o web app:
  No editor GAS → Implantar → Nova implantação → Web app
```

---

## Solução de problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| Job `skipped` | Condição `if merged` com trigger de push | Remover a condição `if` — trigger `push` não precisa dela |
| `ReferenceError: self is not defined` | Arquivo `.js` não-GAS foi enviado (ex: service worker) | Adicionar o caminho ao `.claspignore` |
| `invalid_grant` | Credencial revogada (trocou senha ou removeu acesso) | Refazer Passo 2 e atualizar o secret no GitHub |
| Job não dispara | Branch não está na lista do workflow | Adicionar o nome do branch em `on.push.branches` |
| Formato inválido do secret | JSON do clasp v3 usado sem converter | Refazer a conversão do Passo 2 deste runbook |

---

## Guia de referência completo

Para detalhes aprofundados sobre o pipeline (decisões de design, segurança,
escalando para DEV+PROD): `docs/GUIA_CICD_GITHUB_GAS.md`
