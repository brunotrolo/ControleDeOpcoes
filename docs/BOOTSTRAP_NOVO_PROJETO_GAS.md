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
> - No início do projeto, pergunte apenas o **nome do projeto** e o
>   **username do GitHub** — nada mais ainda.

---

## O que será criado ao final

- Um **repositório privado no GitHub** com o código do projeto
- Uma **planilha Google** + **projeto Apps Script** criados automaticamente
- Um **pipeline de deploy**: toda mudança feita aqui no Claude Code chega ao
  Apps Script em ~30 segundos, sem abrir o GitHub

---

## ETAPA 0 — Identificar o contexto

> **Claude:** a sessão já está rodando dentro do repositório do usuário.
> Detecte `GITHUB_USER` e `NOME_PROJETO` automaticamente com:
> ```bash
> git remote get-url origin
> ```
> (formato: `.../GITHUB_USER/NOME_PROJETO`)
>
> Pergunte ao usuário apenas:

> _"Vamos criar seu projeto! Qual **título** você quer dar à planilha Google?
> (ex: Controle de Estoque) Se preferir, uso o nome do repositório mesmo."_

Guardar como `TITULO_PLANILHA`.

> ⚡ **O que acontece automaticamente ao final:**
> - Planilha Google criada
> - Apps Script criado e vinculado
> - Código inicial enviado ao GAS
> - Web app implantado e link `/dev` gerado
> - Tudo isso sem mais nenhuma ação do usuário após a Etapa 4

---

## ETAPA 1 — Ativar a Apps Script API (feita uma única vez na vida)

> **Claude:** apresente exatamente este texto ao usuário:

---

**Etapa 1 de 6 — Ativar a Apps Script API**

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

**Etapa 2 de 6 — Gerar credenciais de acesso**

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
> Guarde o JSON convertido como `CLASPRC_JSON_CONVERTIDO` — você vai usá-lo
> nas etapas seguintes.
>
> Mostre ao usuário o JSON convertido e diga:
> _"Convertido! Guarde também no seu computador para usar em projetos futuros.
> Pode seguir para a próxima etapa."_

---

## ETAPA 3 — Criar os arquivos do projeto

> **Claude:** o repositório já existe (a sessão roda dentro dele). Mostre ao
> usuário:

---

**Etapa 3 de 6 — Configurando os arquivos do projeto**

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
> Substitua `NOME_PROJETO` pelo título real.

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
    .setTitle('NOME_PROJETO')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

**`Index.html`**
```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NOME_PROJETO</title>
    <style>
      body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 20px; }
      h1 { color: #4f46e5; }
    </style>
  </head>
  <body>
    <h1>NOME_PROJETO</h1>
    <p>✅ Projeto criado com sucesso! O pipeline CI/CD está ativo.</p>
    <p>Qualquer mudança feita no Claude Code aparece aqui em ~30 segundos.</p>
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

      - name: Push código inicial + publicar web app
        run: |
          clasp push --force
          # Cria deployment versionado (GAS cria o HEAD automaticamente)
          clasp deploy --description "Implantação inicial" 2>&1 || true
          # Lista todos e extrai o HEAD deployment ID
          DEPLOYMENTS=$(clasp deployments --json 2>/dev/null || clasp deployments 2>&1)
          echo "$DEPLOYMENTS"
          HEAD_ID=$(echo "$DEPLOYMENTS" | node -e "
            let raw = '';
            process.stdin.on('data', d => raw += d);
            process.stdin.on('end', () => {
              try {
                const arr = JSON.parse(raw);
                const head = arr.find(d => JSON.stringify(d).includes('HEAD'));
                console.log(head ? head.deploymentId : '');
              } catch(e) {
                const m = raw.match(/- (AKfycb[A-Za-z0-9_-]+) @HEAD/);
                console.log(m ? m[1] : '');
              }
            });
          " 2>/dev/null || echo "")
          if [ -z "$HEAD_ID" ]; then
            HEAD_ID=$(echo "$DEPLOYMENTS" | grep -oE 'AKfycb[A-Za-z0-9_-]+' | head -1)
          fi
          echo "$HEAD_ID" > .deployment-id
          DEV_URL="https://script.google.com/macros/s/${HEAD_ID}/dev"
          echo "DEPLOYMENT_ID=$HEAD_ID" >> $GITHUB_ENV
          echo "DEV_URL=$DEV_URL" >> $GITHUB_ENV

      - name: Commit .clasp.json + .deployment-id
        run: |
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git config user.name "github-actions[bot]"
          git add .clasp.json .deployment-id
          git commit -m "bootstrap: scriptId e deployment ID criados automaticamente"
          git push

      - name: Summary
        run: |
          echo "## ✅ Projeto GAS criado com sucesso!" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Campo | Link |" >> $GITHUB_STEP_SUMMARY
          echo "|---|---|" >> $GITHUB_STEP_SUMMARY
          echo "| 📊 Planilha Google | https://docs.google.com/spreadsheets/d/${{ env.SHEET_ID }}/edit |" >> $GITHUB_STEP_SUMMARY
          echo "| ⚙️ Editor GAS | https://script.google.com/home/projects/${{ env.SCRIPT_ID }}/edit |" >> $GITHUB_STEP_SUMMARY
          echo "| 🌐 Web App (DEV) | ${{ env.DEV_URL }} |" >> $GITHUB_STEP_SUMMARY
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
  contents: read

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

      - name: Deploy summary
        if: steps.check.outputs.skip == 'false'
        run: |
          echo "### ✅ Deploy GAS DEV concluído" >> $GITHUB_STEP_SUMMARY
          echo "- **Arquivos:** ${{ steps.push.outputs.files }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Branch:** \`${{ github.ref_name }}\`" >> $GITHUB_STEP_SUMMARY
```

---

## ETAPA 4 — Criar o secret no GitHub (único passo manual do usuário)

> **Claude:** apresente exatamente este texto, com a URL específica do repo:

---

**Etapa 4 de 6 — Salvar as credenciais no GitHub**

Preciso que você faça um passo rápido no GitHub (leva menos de 1 minuto):

1. Acesse este link: **https://github.com/GITHUB_USER/NOME_PROJETO/settings/secrets/actions**

2. Clique em **"New repository secret"**

3. No campo **Name**, digite exatamente:
   ```
   CLASPRC_JSON
   ```

4. No campo **Secret**, cole o seguinte texto (as credenciais que convertemos na Etapa 2):

   _(Claude: cole aqui o `CLASPRC_JSON_CONVERTIDO` gerado na Etapa 2)_

5. Clique em **"Add secret"**

Quando terminar, me diga **"feito"** para continuarmos.

---

> **Claude:** aguarde a confirmação. Só siga quando o usuário disser que concluiu.

---

## ETAPA 5 — Criar a planilha Google + Apps Script automaticamente

> **Claude:** apresente este texto e em seguida dispare o workflow via MCP.

---

**Etapa 5 de 6 — Criando sua planilha e o Apps Script**

Agora vem a parte mais legal: vou criar automaticamente a planilha Google e o projeto Apps Script para você. Aguarde cerca de 1 minuto...

---

> **Claude:** garanta que está em `main` antes de continuar:
> ```bash
> git checkout main && git pull origin main
> ```
> Crie o arquivo `.trigger-bootstrap` com o `TITULO_PLANILHA` como conteúdo,
> faça commit e push direto em `main`:
> ```bash
> echo "TITULO_PLANILHA" > .trigger-bootstrap
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
> - Rode `git pull` (o bootstrap commitou `.clasp.json` e `.deployment-id`)
> - Leia `.clasp.json` → extraia `scriptId` e `parentId`
> - Leia `.deployment-id` → extraia o deployment ID
> - Monte as URLs:
>   - **Planilha:** `https://docs.google.com/spreadsheets/d/<parentId>/edit`
>   - **Editor GAS:** `https://script.google.com/home/projects/<scriptId>/edit`
>   - **Web App DEV:** `https://script.google.com/macros/s/<deploymentId>/dev`
> - Avance para a Etapa 6

---

## ETAPA 6 — Confirmar e entregar o resultado

> **Claude:** apresente este texto com as URLs reais preenchidas:

---

**Etapa 6 de 6 — Tudo pronto! 🎉**

Seu projeto foi criado com sucesso. Aqui está tudo que foi configurado:

📊 **Sua Planilha Google:**
`https://docs.google.com/spreadsheets/d/PARENT_ID/edit`

⚙️ **Editor Apps Script:**
`https://script.google.com/home/projects/SCRIPT_ID/edit`

🌐 **Seu Web App (link permanente de DEV):**
`https://script.google.com/macros/s/DEPLOYMENT_ID/dev`

📦 **Repositório GitHub:**
`https://github.com/GITHUB_USER/NOME_PROJETO`

> **Claude:** substitua os placeholders pelos valores reais lidos dos arquivos
> `.clasp.json` (scriptId + parentId) e `.deployment-id` (deploymentId).
> Apresente sempre os 4 links clicáveis. O link `/dev` é permanente — toda
> mudança futura aparece automaticamente nele após cada push.

---

**Como funciona daqui em diante:**

Você trabalha aqui comigo no Claude Code. Toda vez que eu fizer uma mudança e você disser OK, o código vai para o Apps Script **automaticamente em ~30 segundos**.

Você nunca mais precisa abrir o GitHub ou o terminal. Só diga o que quer mudar.

---

**Quer publicar o projeto como um web app?**

No editor Apps Script:
1. Clique em **"Implantar"** → **"Nova implantação"**
2. Tipo: **"Aplicativo da Web"**
3. Executar como: sua conta Google
4. Quem tem acesso: escolha conforme necessário
5. Clique em **"Implantar"**
6. Copie a URL gerada — esse é o link do seu app!

---

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| Etapa 2: URL do login não abre | Copie a URL completa e cole numa nova aba do browser |
| Etapa 4: não encontro o link das secrets | Certifique-se de ser o dono do repositório; o link é exatamente Settings → Secrets and variables → Actions |
| Bootstrap falhou com `invalid_grant` | As credenciais expiraram — repita a Etapa 2 e atualize o secret |
| Bootstrap falhou com `Apps Script API disabled` | Repita a Etapa 1 — o toggle precisa estar ativo |
| Deploy pulado após bootstrap | Normal na primeira vez — o segundo commit (do scriptId) dispara o deploy real |

---

## Para projetos futuros (a partir do segundo projeto)

As Etapas 1 e 2 **não precisam ser repetidas** — as credenciais geradas valem para todos os projetos da mesma conta Google. Basta começar pela Etapa 0 (nome + username) e ir direto para a Etapa 3.
