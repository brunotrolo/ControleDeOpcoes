# Bootstrap: Criar Novo Projeto GAS do Zero

---

## 🚀 Antes de abrir o Claude Code (2 minutos)

O Claude Code precisa de um repositório para trabalhar. Crie um vazio:

1. Acesse **https://github.com/new**
2. **Repository name:** o nome do seu projeto (ex: `controle-de-estoque`)
3. Marque **Private**
4. Marque **"Add a README file"** (para o repositório não ficar vazio)
5. Clique em **Create repository**

Agora abra o **claude.ai/code**, inicie uma sessão **neste repositório novo**,
faça upload deste arquivo e diga:

> _"Siga o BOOTSTRAP_NOVO_PROJETO_GAS.md para criar meu projeto do zero."_

---

## 📋 PROTOCOLO PARA CLAUDE (leia antes de começar)

> Este documento é um roteiro que você (Claude) deve seguir para criar um
> projeto Google Apps Script completo com CI/CD para um usuário leigo.
>
> **Regras obrigatórias:**
> - Apresente **uma etapa por vez**. Nunca avance sem confirmação.
> - Use linguagem simples. Sem jargões técnicos.
> - Em cada etapa que exige ação do usuário, diga exatamente **o que clicar**,
>   **o que copiar** e peça para **colar o resultado aqui no chat**.
> - Só avance para a próxima etapa após receber a confirmação ou o resultado.
> - Se o usuário errar ou travar, ofereça ajuda antes de continuar.
> - **TODAS as decisões técnicas já estão tomadas neste documento.** NUNCA
>   pergunte ao usuário como gravar arquivos, em qual branch commitar, como
>   fazer push, ou qualquer outra escolha de implementação. Ao seguir este
>   roteiro, o usuário já autorizou commits e pushes diretos em `main`.
>   As únicas interações permitidas são as escritas literalmente nas etapas
>   (confirmações "ativei"/"feito"/"renomeei", colar o JSON, informar o nome
>   final).
> - **Não pergunte o nome do projeto no início** — use o nome do repositório
>   como título temporário. O nome final será definido na Etapa 7, após validar
>   que o pipeline funciona.

---

## O que será criado ao final

- Um **repositório privado no GitHub** com o código do projeto
- Uma **planilha Google** + **projeto Apps Script** criados automaticamente
- Um **pipeline de deploy**: toda mudança feita aqui no Claude Code chega ao
  Apps Script em ~30 segundos, sem abrir o GitHub
- Validação visual: uma página do **Bob Esponja** confirma que o link do
  web app está funcionando antes de qualquer personalização

---

## ETAPA 0 — Identificar o contexto

> **Claude:** a sessão já está rodando dentro do repositório do usuário.
> Detecte `GITHUB_USER` e `NOME_REPO` automaticamente com:
> ```bash
> git remote get-url origin
> ```
> (formato: `.../GITHUB_USER/NOME_REPO`)
>
> Guarde ambos. `NOME_REPO` será usado como título inicial da planilha e do
> projeto GAS — **não pergunte nada ao usuário ainda**.
>
> Apresente ao usuário:

_"Ótimo! Vou criar seu projeto passo a passo. Vamos começar ativando uma
permissão no Google."_

> ⚡ **O que acontece automaticamente ao final:**
> - Planilha Google criada com o nome do repositório
> - Apps Script criado e vinculado
> - Página do Bob Esponja implantada para validar o pipeline
> - Link do web app capturado da API do Google e entregue
> - Renomeação guiada para o nome final do projeto

---

## ETAPA 1 — Ativar a Apps Script API (feita uma única vez na vida)

> **Claude:** apresente exatamente este texto ao usuário:

---

**Etapa 1 de 7 — Ativar a Apps Script API**

Primeiro precisamos ativar uma permissão no Google. Isso é feito **uma única vez** e vale para todos os projetos futuros.

1. Clique neste link: **https://script.google.com/home/usersettings**
2. Certifique-se de estar logado com a conta Google que vai usar o projeto
3. Encontre a opção **"Google Apps Script API"**
4. Clique no botão para **ativar** (deve ficar azul/verde)

Quando ativar, me diga **"ativei"** para continuarmos.

---

> **Claude:** aguarde a confirmação. Só siga quando o usuário disser que ativou.

---

## ETAPA 2 — Gerar as credenciais de acesso (feita uma única vez por conta)

> **Claude:** apresente exatamente este texto:

---

**Etapa 2 de 7 — Gerar credenciais de acesso**

Agora vamos gerar uma "chave" que permite ao sistema fazer deploys automaticamente. Não precisa instalar nada — vamos usar um terminal gratuito no próprio browser.

**Passo 1:** Abra uma nova aba e acesse: **https://shell.cloud.google.com/**

**Passo 2:** Quando o terminal aparecer, cole este comando e pressione Enter:
```
npm install -g @google/clasp && clasp login --no-localhost
```

**Passo 3:** O terminal vai mostrar uma URL longa. Copie essa URL, abra numa nova aba e faça login com a sua conta Google (a mesma do Google Sheets).

**Passo 4:** O Google vai pedir permissão — clique em **Permitir/Allow**.

**Passo 5:** Vai aparecer um código na tela. Copie esse código, volte para o terminal do Cloud Shell, cole e pressione Enter.

**Passo 6:** Agora cole este comando e pressione Enter:
```
cat ~/.clasprc.json
```

**Passo 7:** O terminal vai mostrar um texto com chaves `{}`. Selecione **todo esse texto** (do `{` até o `}` final), copie e **cole aqui no chat**.

---

> **Claude:** aguarde o usuário colar o JSON.
>
> Quando receber, converta do formato novo (clasp v3) para o formato clássico:
>
> **Formato que o usuário vai colar (clasp v3):**
> ```json
> {
>   "tokens": {
>     "default": {
>       "client_id": "...",
>       "client_secret": "...",
>       "type": "authorized_user",
>       "refresh_token": "...",
>       "access_token": "..."
>     }
>   }
> }
> ```
>
> **Formato correto para usar (clássico):**
> ```json
> {
>   "token": {
>     "access_token": "<access_token>",
>     "refresh_token": "<refresh_token>",
>     "token_type": "Bearer",
>     "expiry_date": 1
>   },
>   "oauth2ClientSettings": {
>     "clientId": "<client_id>",
>     "clientSecret": "<client_secret>",
>     "redirectUri": "http://localhost"
>   },
>   "isLocalCreds": false
> }
> ```
>
> Copie os valores de `client_id`, `client_secret`, `refresh_token` e
> `access_token` do JSON do usuário para os campos correspondentes acima.
>
> Converta silenciosamente (sem mostrar nada ao usuário, sem confirmar, sem
> perguntar nada) e guarde internamente como `CLASPRC_JSON_CONVERTIDO`.
> Avance imediatamente para a Etapa 3 — o JSON convertido será exibido
> **apenas na Etapa 4**, quando o usuário precisar colá-lo no GitHub.

---

## ETAPA 3 — Criar os arquivos do projeto

> **Claude:** o repositório já existe (a sessão roda dentro dele).
> **NÃO pergunte nada** — nem onde gravar os arquivos, nem como commitar,
> nem se pode fazer push. A resposta já está aqui: grave com a ferramenta
> Write e faça commit + push **diretamente em `main`**. Apresente o texto
> abaixo e execute imediatamente:

---

**Etapa 3 de 7 — Configurando os arquivos do projeto**

Agora vou criar todos os arquivos do projeto e enviá-los ao GitHub. Isso leva alguns segundos...

---

> **Claude:** CRÍTICO — os arquivos de workflow DEVEM ir para `main`.
> O GitHub Actions só lê arquivos `.github/workflows/` da branch padrão
> (`main`). Em qualquer outra branch, os workflows são invisíveis e nunca
> disparam.
>
> Execute na ordem:
> ```bash
> git checkout main 2>/dev/null || git checkout -b main
> git pull origin main 2>/dev/null || true
> ```
> Crie todos os arquivos abaixo (ferramenta Write), faça commit e push
> **diretamente em `main`**:
> ```bash
> git add -A
> git commit -m "bootstrap: configuração inicial do projeto"
> git push origin main
> ```
> Use `NOME_REPO` (detectado na Etapa 0) nos lugares indicados abaixo.

### Arquivos a criar:

**`.clasp.json`**
```json
{
  "scriptId": "PENDING_BOOTSTRAP",
  "rootDir": "./"
}
```

**`.claspignore`**
```
pwa-mobile/**
mockups/**
docs/**
.github/**
.git/**
*.md
.claspignore
.gitignore
.trigger-bootstrap
.deployment-id
.webapp-urls
node_modules/**
```

**`appsscript.json`**
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

**`.gitignore`**
```
node_modules/
.env
*.local
```

**`Código.gs`**
```javascript
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('NOME_REPO')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

**`Index.html`** — página de validação (Bob Esponja)
```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bob Esponja está online!</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: linear-gradient(180deg, #5BB8F5 0%, #5BB8F5 55%, #F5D76E 55%, #F5D76E 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: 'Comic Sans MS', 'Chalkboard SE', cursive;
      padding: 20px;
      text-align: center;
    }
    .sponge {
      font-size: 100px;
      animation: bounce 0.8s ease-in-out infinite alternate;
      display: block;
      margin-bottom: 16px;
    }
    @keyframes bounce {
      from { transform: translateY(0) rotate(-5deg); }
      to   { transform: translateY(-24px) rotate(5deg); }
    }
    h1 {
      font-size: 2.2em;
      color: #2C3E50;
      text-shadow: 2px 2px 0 #F39C12;
      margin-bottom: 12px;
    }
    .subtitle {
      font-size: 1.1em;
      color: #2471A3;
      background: rgba(255,255,255,0.75);
      border-radius: 14px;
      padding: 10px 22px;
      margin-bottom: 20px;
    }
    .badge {
      background: #1E8449;
      color: #fff;
      border-radius: 20px;
      padding: 10px 28px;
      font-size: 1em;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <span class="sponge">🧽</span>
  <h1>Olá, Mundo Submarino!</h1>
  <p class="subtitle">
    Seu pipeline GitHub → Google Apps Script<br>está funcionando perfeitamente!
  </p>
  <div class="badge">✅ Infraestrutura validada</div>
</body>
</html>
```

**`.github/workflows/bootstrap-gas-project.yml`**
```yaml
name: Bootstrap GAS Project

# Workflow executado UMA ÚNICA VEZ para criar a planilha Google e o
# projeto Apps Script automaticamente.
#
# Gatilho: push do arquivo .trigger-bootstrap (criado pelo Claude Code).
# Isso evita depender de workflow_dispatch, que exige permissão extra.

on:
  push:
    paths:
      - '.trigger-bootstrap'
    branches:
      - '**'

permissions:
  contents: write

jobs:
  bootstrap:
    runs-on: ubuntu-latest
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Ler nome do projeto
        run: |
          PROJECT_NAME=$(cat .trigger-bootstrap)
          echo "PROJECT_NAME=$PROJECT_NAME" >> $GITHUB_ENV

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

      - name: Create Google Sheet + Apps Script
        run: |
          rm -f .clasp.json
          clasp create --type sheets --title "${{ env.PROJECT_NAME }}"
          SCRIPT_ID=$(node -e "console.log(require('./.clasp.json').scriptId)")
          SHEET_ID=$(node -e "const c=require('./.clasp.json'); console.log(c.parentId ? (Array.isArray(c.parentId) ? c.parentId[0] : c.parentId) : 'N/A')")
          echo "SCRIPT_ID=$SCRIPT_ID" >> $GITHUB_ENV
          echo "SHEET_ID=$SHEET_ID" >> $GITHUB_ENV

      # Publica o web app e captura as URLs REAIS direto da API do Apps Script.
      # Nunca monte a URL na mão: a API retorna entryPoints[].webApp.url e essa
      # é a URL exata que funciona no browser.
      - name: Push código inicial + publicar web app
        run: |
          clasp push --force
          clasp deploy --description "Implantação inicial" 2>&1 || true

          # Renova o access token a partir do refresh token (mesmas credenciais do clasp)
          CLIENT_ID=$(node -e "console.log(require(process.env.HOME+'/.clasprc.json').oauth2ClientSettings.clientId)")
          CLIENT_SECRET=$(node -e "console.log(require(process.env.HOME+'/.clasprc.json').oauth2ClientSettings.clientSecret)")
          REFRESH_TOKEN=$(node -e "console.log(require(process.env.HOME+'/.clasprc.json').token.refresh_token)")
          ACCESS_TOKEN=$(curl -s https://oauth2.googleapis.com/token \
            -d client_id="$CLIENT_ID" -d client_secret="$CLIENT_SECRET" \
            -d refresh_token="$REFRESH_TOKEN" -d grant_type=refresh_token \
            | node -e "let r='';process.stdin.on('data',d=>r+=d);process.stdin.on('end',()=>console.log(JSON.parse(r).access_token||''))")

          # Consulta a API oficial: lista deployments com seus entry points
          curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
            "https://script.googleapis.com/v1/projects/${{ env.SCRIPT_ID }}/deployments?pageSize=50" \
            > /tmp/deployments.json

          node > /tmp/urls.env <<'PARSE'
          const data = require('/tmp/deployments.json');
          const deps = data.deployments || [];
          let headUrl = '', execUrl = '', headId = '', bestVersion = -1;
          for (const d of deps) {
            const isHead = !(d.deploymentConfig && d.deploymentConfig.versionNumber);
            if (isHead && !headId) headId = d.deploymentId;
            for (const ep of (d.entryPoints || [])) {
              if (ep.entryPointType === 'WEB_APP' && ep.webApp && ep.webApp.url) {
                if (isHead) { headUrl = ep.webApp.url; headId = d.deploymentId; }
                else {
                  const v = Number(d.deploymentConfig.versionNumber) || 0;
                  if (v > bestVersion) { bestVersion = v; execUrl = ep.webApp.url; }
                }
              }
            }
          }
          console.log('HEAD_URL=' + headUrl);
          console.log('EXEC_URL=' + execUrl);
          console.log('HEAD_ID=' + headId);
          PARSE
          cat /tmp/urls.env
          cat /tmp/urls.env >> $GITHUB_ENV
          cp /tmp/urls.env .webapp-urls
          grep '^HEAD_ID=' /tmp/urls.env | cut -d= -f2 > .deployment-id

      - name: Smoke test do web app
        run: |
          if [ -n "$HEAD_URL" ]; then
            HTTP_STATUS=$(curl -s -o /tmp/webapp.html -w "%{http_code}" "$HEAD_URL")
            if grep -q "Mundo Submarino" /tmp/webapp.html 2>/dev/null; then
              echo "SMOKE_TEST=✅ validado automaticamente" >> $GITHUB_ENV
            else
              echo "SMOKE_TEST=⚠️ página não retornou conteúdo esperado (HTTP $HTTP_STATUS)" >> $GITHUB_ENV
            fi
          else
            echo "SMOKE_TEST=⚠️ HEAD_URL vazio — web app não implantado" >> $GITHUB_ENV
          fi

      - name: Commit .clasp.json + URLs do web app
        run: |
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git config user.name "github-actions[bot]"
          git add .clasp.json .deployment-id .webapp-urls
          git commit -m "bootstrap: scriptId e URLs do web app criados automaticamente"
          git push

      - name: Summary
        run: |
          echo "## ✅ Projeto GAS criado com sucesso!" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Campo | Link |" >> $GITHUB_STEP_SUMMARY
          echo "|---|---|" >> $GITHUB_STEP_SUMMARY
          echo "| 📊 Planilha Google | https://docs.google.com/spreadsheets/d/${{ env.SHEET_ID }}/edit |" >> $GITHUB_STEP_SUMMARY
          echo "| ⚙️ Editor GAS | https://script.google.com/home/projects/${{ env.SCRIPT_ID }}/edit |" >> $GITHUB_STEP_SUMMARY
          echo "| 🌐 Web App | ${{ env.HEAD_URL }} |" >> $GITHUB_STEP_SUMMARY
          echo "| 🔬 Smoke test | ${{ env.SMOKE_TEST }} |" >> $GITHUB_STEP_SUMMARY
```

**`.github/workflows/deploy-gas-dev.yml`**
```yaml
name: Deploy to GAS DEV

# Dispara automaticamente em todo push para main.
# Aguarda o bootstrap ser concluído antes do primeiro deploy real.

on:
  workflow_dispatch:
  push:
    branches:
      - main

permissions:
  contents: write   # para commitar .webapp-urls atualizados

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Verificar se bootstrap foi concluído
        id: check
        run: |
          SCRIPT_ID=$(node -e "console.log(require('./.clasp.json').scriptId)")
          if [ "$SCRIPT_ID" = "PENDING_BOOTSTRAP" ]; then
            echo "Bootstrap ainda não concluído. Pulando deploy."
            echo "skip=true" >> $GITHUB_OUTPUT
          else
            echo "skip=false" >> $GITHUB_OUTPUT
          fi

      - name: Setup Node.js
        if: steps.check.outputs.skip == 'false'
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Cache clasp
        if: steps.check.outputs.skip == 'false'
        uses: actions/cache@v4
        with:
          path: ~/.npm-global
          key: clasp-${{ runner.os }}-node24

      - name: Install clasp
        if: steps.check.outputs.skip == 'false'
        run: |
          mkdir -p ~/.npm-global
          npm config set prefix ~/.npm-global
          if [ ! -f ~/.npm-global/bin/clasp ]; then
            npm install -g @google/clasp
          fi
          echo "$HOME/.npm-global/bin" >> $GITHUB_PATH

      - name: Write clasp credentials
        if: steps.check.outputs.skip == 'false'
        run: echo '${{ secrets.CLASPRC_JSON }}' > ~/.clasprc.json

      - name: Push to GAS DEV
        if: steps.check.outputs.skip == 'false'
        id: push
        run: |
          OUTPUT=$(clasp push --force 2>&1)
          echo "$OUTPUT"
          FILES=$(echo "$OUTPUT" | grep -c '└─' || true)
          echo "files=$FILES" >> $GITHUB_OUTPUT

      # Atualiza o web app e captura as URLs reais via API.
      # GAS limita a 20 deployments versionados — por isso REUSA o existente
      # (clasp deploy -i) em vez de criar um novo a cada push.
      - name: Atualizar web app e capturar URLs reais
        if: steps.check.outputs.skip == 'false'
        run: |
          CLIENT_ID=$(node -e "console.log(require(process.env.HOME+'/.clasprc.json').oauth2ClientSettings.clientId)")
          CLIENT_SECRET=$(node -e "console.log(require(process.env.HOME+'/.clasprc.json').oauth2ClientSettings.clientSecret)")
          REFRESH_TOKEN=$(node -e "console.log(require(process.env.HOME+'/.clasprc.json').token.refresh_token)")
          ACCESS_TOKEN=$(curl -s https://oauth2.googleapis.com/token \
            -d client_id="$CLIENT_ID" -d client_secret="$CLIENT_SECRET" \
            -d refresh_token="$REFRESH_TOKEN" -d grant_type=refresh_token \
            | node -e "let r='';process.stdin.on('data',d=>r+=d);process.stdin.on('end',()=>console.log(JSON.parse(r).access_token||''))")
          SCRIPT_ID=$(node -e "console.log(require('./.clasp.json').scriptId)")

          fetch_deployments() {
            curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
              "https://script.googleapis.com/v1/projects/$SCRIPT_ID/deployments?pageSize=50" \
              > /tmp/deployments.json
          }

          fetch_deployments
          EXISTING_ID=$(node -e "
            const deps = require('/tmp/deployments.json').deployments || [];
            let best = '', bestV = -1;
            for (const d of deps) {
              const v = Number(d.deploymentConfig && d.deploymentConfig.versionNumber) || 0;
              if (v > bestV) { bestV = v; best = d.deploymentId; }
            }
            console.log(best);
          ")
          if [ -n "$EXISTING_ID" ]; then
            clasp deploy -i "$EXISTING_ID" --description "Deploy automático $(date +%Y-%m-%d)" 2>&1 || true
          else
            clasp deploy --description "Deploy automático $(date +%Y-%m-%d)" 2>&1 || true
          fi

          fetch_deployments
          node > /tmp/urls.env <<'PARSE'
          const data = require('/tmp/deployments.json');
          const deps = data.deployments || [];
          let headUrl = '', execUrl = '', headId = '', bestVersion = -1;
          for (const d of deps) {
            const isHead = !(d.deploymentConfig && d.deploymentConfig.versionNumber);
            if (isHead && !headId) headId = d.deploymentId;
            for (const ep of (d.entryPoints || [])) {
              if (ep.entryPointType === 'WEB_APP' && ep.webApp && ep.webApp.url) {
                if (isHead) { headUrl = ep.webApp.url; headId = d.deploymentId; }
                else {
                  const v = Number(d.deploymentConfig.versionNumber) || 0;
                  if (v > bestVersion) { bestVersion = v; execUrl = ep.webApp.url; }
                }
              }
            }
          }
          console.log('HEAD_URL=' + headUrl);
          console.log('EXEC_URL=' + execUrl);
          console.log('HEAD_ID=' + headId);
          PARSE
          cat /tmp/urls.env
          cat /tmp/urls.env >> $GITHUB_ENV
          cp /tmp/urls.env .webapp-urls
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git config user.name "github-actions[bot]"
          git add .webapp-urls
          git diff --staged --quiet || git commit -m "ci: atualiza URLs do web app"
          git push 2>/dev/null || true

      - name: Deploy summary
        if: steps.check.outputs.skip == 'false'
        run: |
          echo "### ✅ Deploy GAS DEV concluído" >> $GITHUB_STEP_SUMMARY
          echo "- **Arquivos:** ${{ steps.push.outputs.files }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Branch:** \`${{ github.ref_name }}\`" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          if [ -n "${{ env.HEAD_URL }}" ]; then
            echo "### 🌐 Web App: ${{ env.HEAD_URL }}" >> $GITHUB_STEP_SUMMARY
          else
            echo "### ⚠️ Web app NÃO implantado — verifique a seção webapp do appsscript.json" >> $GITHUB_STEP_SUMMARY
          fi
```

**`.github/workflows/rename-gas-project.yml`**
```yaml
name: Rename GAS Project

# Renomeia a planilha Google via Sheets API quando Claude cria .trigger-rename.
# Gatilho: push do arquivo .trigger-rename contendo o nome final desejado.
# Limitação: o nome no editor GAS não pode ser alterado via API (rename manual).

on:
  push:
    paths:
      - '.trigger-rename'
    branches:
      - '**'

permissions:
  contents: write

jobs:
  rename:
    runs-on: ubuntu-latest
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Write clasp credentials
        run: echo '${{ secrets.CLASPRC_JSON }}' > ~/.clasprc.json

      - name: Renomear planilha via Sheets API
        run: |
          CLIENT_ID=$(node -e "console.log(require(process.env.HOME+'/.clasprc.json').oauth2ClientSettings.clientId)")
          CLIENT_SECRET=$(node -e "console.log(require(process.env.HOME+'/.clasprc.json').oauth2ClientSettings.clientSecret)")
          REFRESH_TOKEN=$(node -e "console.log(require(process.env.HOME+'/.clasprc.json').token.refresh_token)")
          ACCESS_TOKEN=$(curl -s https://oauth2.googleapis.com/token \
            -d client_id="$CLIENT_ID" -d client_secret="$CLIENT_SECRET" \
            -d refresh_token="$REFRESH_TOKEN" -d grant_type=refresh_token \
            | node -e "let r='';process.stdin.on('data',d=>r+=d);process.stdin.on('end',()=>console.log(JSON.parse(r).access_token||''))")
          PARENT_ID=$(node -e "const c=require('./.clasp.json'); console.log(Array.isArray(c.parentId)?c.parentId[0]:c.parentId||'')")

          # Usa node para gerar o payload (seguro com nomes que têm acentos ou espaços)
          node -e "
            const name = require('fs').readFileSync('.trigger-rename','utf8').trim();
            const payload = JSON.stringify({requests:[{updateSpreadsheetProperties:{properties:{title:name},fields:'title'}}]});
            require('fs').writeFileSync('/tmp/rename_payload.json', payload);
          "

          RESULT=$(curl -s -X POST \
            -H "Authorization: Bearer $ACCESS_TOKEN" \
            -H "Content-Type: application/json" \
            -d @/tmp/rename_payload.json \
            "https://sheets.googleapis.com/v4/spreadsheets/$PARENT_ID:batchUpdate")

          if echo "$RESULT" | node -e "let r='';process.stdin.on('data',d=>r+=d);process.stdin.on('end',()=>{try{const o=JSON.parse(r);process.exit(o.error?1:0)}catch(e){process.exit(1)}})" ; then
            NOME=$(cat .trigger-rename)
            echo "✅ Planilha renomeada para: $NOME" >> $GITHUB_STEP_SUMMARY
          else
            echo "⚠️ Falha ao renomear planilha: $RESULT" >> $GITHUB_STEP_SUMMARY
          fi

      - name: Remover arquivo de trigger
        run: |
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git config user.name "github-actions[bot]"
          git rm .trigger-rename
          git commit -m "ci: remove trigger de rename após execução"
          git push
```

---

## ETAPA 4 — Criar o secret no GitHub (único passo manual do usuário)

> **Claude:** apresente exatamente este texto, com a URL específica do repo:

---

**Etapa 4 de 7 — Salvar as credenciais no GitHub**

Preciso que você faça um passo rápido no GitHub (leva menos de 1 minuto):

1. Acesse este link: **https://github.com/GITHUB_USER/NOME_REPO/settings/secrets/actions**

2. Clique em **"New repository secret"**

3. No campo **Name**, digite exatamente:
   ```
   CLASPRC_JSON
   ```

4. No campo **Secret**, cole o seguinte texto (as credenciais que geramos na Etapa 2):

   _(Claude: exiba aqui o `CLASPRC_JSON_CONVERTIDO` completo — este é o único momento em que o JSON deve ser mostrado ao usuário)_

5. Clique em **"Add secret"**

Quando terminar, me diga **"feito"** para continuarmos.

---

> **Claude:** aguarde a confirmação. Só siga quando o usuário disser que concluiu.

---

## ETAPA 5 — Criar a planilha Google + Apps Script automaticamente

> **Claude:** apresente este texto e em seguida dispare o workflow via MCP.

---

**Etapa 5 de 7 — Criando sua planilha e o Apps Script**

Agora vem a parte mais legal: vou criar automaticamente a planilha Google e o projeto Apps Script para você. Aguarde cerca de 1 minuto...

---

> **Claude:** garanta que está em `main` antes de continuar:
> ```bash
> git checkout main && git pull origin main
> ```
> Crie o arquivo `.trigger-bootstrap` com o `NOME_REPO` como conteúdo,
> faça commit e push direto em `main`:
> ```bash
> git add .trigger-bootstrap
> git commit -m "bootstrap: dispara criação do projeto GAS"
> git push origin main
> ```
>
> O push desse arquivo aciona automaticamente o workflow
> `bootstrap-gas-project.yml` (gatilho `push: paths: ['.trigger-bootstrap']`).
>
> Aguarde ~90 segundos e use `mcp__github__actions_list` para verificar o
> status do workflow `bootstrap-gas-project.yml`.
> Quando `completed` + `success`:
> - Rode `git pull` (o bootstrap commitou `.clasp.json`, `.deployment-id` e
>   `.webapp-urls`)
> - Leia `.clasp.json` → extraia `scriptId` e `parentId`
> - Leia `.webapp-urls` → a linha `HEAD_URL=...` contém a **URL real do web
>   app retornada pela API do Google**. ⚠️ **NUNCA monte a URL na mão**
>   (`/macros/s/<id>/dev`) — a URL construída manualmente pode não funcionar.
>   Use SEMPRE o valor de `HEAD_URL` exatamente como está no arquivo.
> - Monte as demais URLs:
>   - **Planilha:** `https://docs.google.com/spreadsheets/d/<parentId>/edit`
>   - **Editor GAS:** `https://script.google.com/home/projects/<scriptId>/edit`
> - Avance para a Etapa 6
>
> Se `HEAD_URL` estiver vazio no `.webapp-urls`, o web app NÃO foi implantado —
> verifique o step summary do workflow no GitHub Actions antes de continuar.

---

## ETAPA 6 — Validar o web app (Bob Esponja)

> **Claude:** verifique o campo `SMOKE_TEST` no step summary do workflow
> `bootstrap-gas-project.yml` (ou `SMOKE_TEST` no `.webapp-urls` se disponível).
>
> **Se o smoke test passou (`✅ validado automaticamente`):**
> Apresente a mensagem abaixo e avance **imediatamente** para a Etapa 7 sem
> esperar confirmação do usuário.
>
> **Se o smoke test falhou ou `HEAD_URL` está vazio:**
> Apresente a mensagem e aguarde o usuário confirmar manualmente que a página
> abriu. Se não abrir, investigue: verifique se `.webapp-urls` tem `HEAD_URL`
> preenchido, se o step summary do bootstrap mostra a mesma URL, e se o usuário
> está logado com a conta Google correta.

---

**Etapa 6 de 7 — Web app validado!**

🌐 **Seu Web App:**
_(Claude: cole aqui o valor de `HEAD_URL` lido do arquivo `.webapp-urls`)_

_(Claude: se smoke test passou, diga: "O pipeline confirmou automaticamente que a página do Bob Esponja está no ar. Vamos para o último passo!" — e avance para a Etapa 7 sem pedir resposta.)_

_(Claude: se smoke test falhou, diga: "Abra o link acima — você deve ver o Bob Esponja 🧽 pulsando. Quando confirmar, me avise para continuar.")_

---

## ETAPA 7 — Personalizar o projeto com o nome definitivo

> **Claude:** apresente este texto:

---

**Etapa 7 de 7 — Vamos dar o nome definitivo ao seu projeto!**

A infraestrutura está 100% funcionando. Agora personalizamos.

**Qual o nome que você quer dar ao projeto?** (ex: _"Controle de Estoque"_)

---

> **Claude:** aguarde o usuário informar o nome. Chame de `NOME_FINAL`.
>
> Com `NOME_FINAL` em mãos, faça **tudo isso automaticamente**:
>
> 1. **Atualize `Código.gs`** — substitua `NOME_REPO` por `NOME_FINAL` no
>    `setTitle()`
>
> 2. **Crie `.trigger-rename`** com o conteúdo `NOME_FINAL` (só o texto, sem
>    aspas). O workflow `rename-gas-project.yml` vai renomear a planilha Google
>    via Sheets API automaticamente ao detectar esse arquivo no push. Após a
>    execução do workflow ele mesmo apaga o arquivo.
>
> 3. **Substitua `Index.html`** por uma página de boas-vindas com o nome real:
>
> ```html
> <!DOCTYPE html>
> <html lang="pt-BR">
> <head>
>   <meta name="viewport" content="width=device-width, initial-scale=1.0">
>   <title>NOME_FINAL</title>
>   <style>
>     * { box-sizing: border-box; margin: 0; padding: 0; }
>     body {
>       min-height: 100vh;
>       background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
>       display: flex;
>       flex-direction: column;
>       align-items: center;
>       justify-content: center;
>       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
>       padding: 20px;
>       text-align: center;
>       color: white;
>     }
>     h1 { font-size: 2.4em; font-weight: 800; margin-bottom: 12px; }
>     p  { font-size: 1.1em; opacity: 0.85; max-width: 420px; line-height: 1.6; }
>   </style>
> </head>
> <body>
>   <h1>🚀 NOME_FINAL</h1>
>   <p>Projeto conectado ao GitHub. Toda mudança feita no Claude Code aparece
>      aqui automaticamente em ~30 segundos.</p>
> </body>
> </html>
> ```
>
> 4. **Faça commit e push** em `main` — o CI/CD atualiza o web app e o
>    workflow `rename-gas-project.yml` renomeia a planilha automaticamente:
>    ```bash
>    git add Código.gs Index.html .trigger-rename
>    git commit -m "feat: personaliza projeto com nome definitivo"
>    git push origin main
>    ```
>    O workflow de rename apaga `.trigger-rename` sozinho após executar.
>
> 5. **Guie o usuário a renomear APENAS o editor GAS** com este texto:

---

Quase lá! A planilha Google já foi renomeada automaticamente. Falta só um clique: renomear o projeto no editor Apps Script.

**Editor Apps Script:**
1. Abra: `https://script.google.com/home/projects/SCRIPT_ID/edit`
2. Clique no nome do projeto no topo (ao lado do logo do Google)
3. Digite **"NOME_FINAL"** e pressione Enter

Quando renomear, me diga **"renomeei"**!

---

> **Claude:** após a confirmação, aguarde ~30 segundos para o CI/CD terminar
> o deploy de `Index.html`. Verifique também que o workflow `rename-gas-project.yml`
> completou com sucesso (planilha renomeada). Então leia os valores reais de:
> - `SCRIPT_ID` e `PARENT_ID` do arquivo `.clasp.json`
> - `HEAD_URL` e `EXEC_URL` do arquivo `.webapp-urls`
> - `GITHUB_USER` e `NOME_REPO` detectados na Etapa 0
>
> **OBRIGATÓRIO:** apresente TODOS os 6 links abaixo com os valores reais
> substituídos. Nunca omita nenhum deles, mesmo que alguma URL esteja vazia
> (nesse caso, investigue antes de continuar).

---

**Tudo pronto! 🎉**

Seu projeto **NOME_FINAL** está completamente configurado. Salve estes links:

| | Link |
|---|---|
| 📊 **Planilha Google** | `https://docs.google.com/spreadsheets/d/PARENT_ID/edit` |
| ⚙️ **Editor Apps Script** | `https://script.google.com/home/projects/SCRIPT_ID/edit` |
| 🟢 **Web App DEV** (código mais recente) | _(Claude: valor de `HEAD_URL` em `.webapp-urls`)_ |
| 🔵 **Web App PROD** (versão publicada) | _(Claude: valor de `EXEC_URL` em `.webapp-urls`)_ |
| 📦 **Repositório GitHub** | `https://github.com/GITHUB_USER/NOME_REPO` |

> **DEV** sempre serve o código mais recente após cada push.
> **PROD** serve a última versão implantada explicitamente.

**Como funciona daqui em diante:**

Você trabalha aqui comigo no Claude Code. Toda vez que eu fizer uma mudança e você disser OK, o código vai para o Apps Script **automaticamente em ~30 segundos**.

Você nunca mais precisa abrir o GitHub ou o terminal. Só diga o que quer mudar.

---

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| Etapa 2: URL do login não abre | Copie a URL completa e cole numa nova aba do browser |
| Etapa 4: não encontro o link das secrets | Certifique-se de ser o dono do repositório; o link é exatamente Settings → Secrets and variables → Actions |
| Etapa 6: link do web app não abre | Confirme que está logado com a conta Google dona do projeto |
| Etapa 6: página em branco ou erro 404 | O bootstrap pode ter falhado ao capturar o HEAD ID — verifique o step summary do workflow no GitHub Actions |
| Bootstrap falhou com `invalid_grant` | As credenciais expiraram — repita a Etapa 2 e atualize o secret |
| Bootstrap falhou com `Apps Script API disabled` | Repita a Etapa 1 — o toggle precisa estar ativo |
| Deploy pulado após bootstrap | Normal na primeira vez — o segundo commit (do scriptId) dispara o deploy real |

---

## Para projetos futuros (a partir do segundo projeto)

As Etapas 1 e 2 **não precisam ser repetidas** — as credenciais geradas valem para todos os projetos da mesma conta Google. Basta começar pela Etapa 0 (detectar repo) e ir direto para a Etapa 3.
