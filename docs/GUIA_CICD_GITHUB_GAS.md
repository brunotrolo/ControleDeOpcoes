# Guia Completo: CI/CD GitHub → Google Apps Script

> **Objetivo:** a cada push na branch `main` do GitHub, o código é enviado
> automaticamente para o Google Apps Script (GAS) em ~30 segundos, sem nenhuma
> ação manual.
>
> **Reutilizável em qualquer projeto GAS.** Siga os passos na ordem.
> Para criar um projeto GAS **do zero** (planilha + script + pipeline),
> use o runbook `BOOTSTRAP_NOVO_PROJETO_GAS.md`.

---

## Como funciona (visão geral)

```
┌─────────────┐    git push     ┌────────────────┐  clasp push+deploy  ┌─────────────┐
│   GitHub    │ ──────────────► │ GitHub Actions │ ──────────────────► │  GAS (DEV)  │
│  (branch    │                 │  (job deploy)  │                     │  projeto    │
│   main)     │                 │   ~45s         │                     │  atualizado │
└─────────────┘                 └────────────────┘                     └─────────────┘
```

O **clasp** é a CLI oficial do Google para Apps Script. O workflow do GitHub
Actions instala o clasp num runner Linux, autentica com credenciais salvas como
*secret*, roda `clasp push --force` e depois atualiza o web app. As **URLs
reais** do web app são lidas da API oficial do Apps Script
(`entryPoints[].webApp.url`) — nunca montadas na mão — e exibidas no step
summary e persistidas no arquivo `.webapp-urls` do repo.

---

## Peças necessárias (4 arquivos + 1 secret)

| Peça | Onde fica | O que é | É segredo? |
|---|---|---|---|
| `.github/workflows/deploy-gas-dev.yml` | repo | O workflow (job) | Não |
| `.clasp.json` | repo (raiz) | Aponta para o scriptId do GAS | Não — scriptId não dá acesso |
| `.claspignore` | repo (raiz) | Arquivos que NÃO vão para o GAS | Não |
| `appsscript.json` | repo (raiz) | Manifest do projeto GAS (já existe em todo projeto GAS) | Não |
| Secret `CLASPRC_JSON` | GitHub → Settings → Secrets | Credenciais OAuth do clasp | **SIM — nunca commitar** |

---

## Passo a passo de configuração

### Passo 1 — Obter o Script ID do projeto GAS

Abra o projeto no editor GAS. O ID está na URL:

```
https://script.google.com/home/projects/<ESTE_É_O_SCRIPT_ID>/edit
```

### Passo 2 — Criar `.clasp.json` na raiz do repo

```json
{
  "scriptId": "SEU_SCRIPT_ID_AQUI",
  "rootDir": "./"
}
```

- `rootDir: "./"` = todos os `.gs` e `.html` estão na raiz do repo.
- O scriptId **pode** ser commitado: sozinho ele não dá acesso a nada.

### Passo 3 — Criar `.claspignore` na raiz do repo

**Crítico:** o clasp envia TODO arquivo `.js`/`.gs`/`.html` que encontrar.
Arquivos que não são código GAS (service workers, mockups, docs) **quebram o
runtime** do GAS. Exemplo real: um `sw.js` de PWA causou
`ReferenceError: self is not defined` porque o GAS tentou executá-lo como
script V8.

```
pwa-mobile/**
mockups/**
docs/**
.github/**
.git/**
*.md
.claspignore
.gitignore
```

Regra geral: **liste tudo que não deve existir dentro do editor GAS.**

### Passo 4 — Gerar as credenciais do clasp (sem instalar nada localmente)

Use o **Google Cloud Shell** (terminal no browser, grátis):

1. Abra https://shell.cloud.google.com/
2. Rode:
   ```bash
   npm install -g @google/clasp && clasp login --no-localhost
   ```
3. Abra a URL exibida numa nova aba → faça login com a conta Google **dona do
   projeto GAS** → autorize
4. Cole o código de volta no terminal
5. Exiba as credenciais:
   ```bash
   cat ~/.clasprc.json
   ```

⚠️ **Atenção ao formato.** O Cloud Shell (clasp v3) gera o formato novo
(`"tokens": { "default": {...} }`), mas o workflow usa o formato clássico.
Converta para:

```json
{
  "token": {
    "access_token": "<access_token>",
    "refresh_token": "<refresh_token>",
    "token_type": "Bearer",
    "expiry_date": 1
  },
  "oauth2ClientSettings": {
    "clientId": "<client_id>",
    "clientSecret": "<client_secret>",
    "redirectUri": "http://localhost"
  },
  "isLocalCreds": false
}
```

- Copie `access_token`, `refresh_token`, `client_id` e `client_secret` do JSON
  gerado para os campos correspondentes acima.
- `expiry_date: 1` força o clasp a renovar o token via `refresh_token` a cada
  execução — exatamente o que CI precisa. O `refresh_token` não expira.

### Passo 5 — Criar o Secret no GitHub

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `CLASPRC_JSON`
3. Secret: o JSON convertido do passo 4 (completo, com `{` e `}`)

🔒 **Nunca** commite esse JSON, nem cole em issues/PRs. Ele dá acesso total ao
Google Apps Script da conta.

### Passo 6 — Criar o workflow

Arquivo `.github/workflows/deploy-gas-dev.yml` — ver o arquivo real neste repo.
Pontos-chave do design:

```yaml
on:
  workflow_dispatch:        # permite disparo manual (Actions → Run workflow)
  push:
    branches:
      - main                # dispara em todo push direto para main

permissions:
  contents: write           # necessário para commitar .deployment-id

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - clasp push --force
      - clasp deploy -i <id-existente>     # REUSA o deployment (limite de 20!)
      - GET script.googleapis.com/v1/projects/{id}/deployments
      - lê entryPoints[].webApp.url        # URLs REAIS, nunca montadas na mão
      - salva .webapp-urls no repo
      - exibe as URLs no step summary
```

| Decisão | Por quê |
|---|---|
| `push: branches: [main]` | Dispara em qualquer push direto para main — sem precisar de PR |
| `workflow_dispatch` | Permite testar o deploy manualmente (Actions → Run workflow) |
| `clasp push --force` | Sem `--force`, o clasp pede confirmação interativa (trava o CI) |
| `clasp deploy -i <id>` (reuso) | GAS limita a **20 deployments versionados** por script; criar um novo a cada push estoura o limite e o deploy passa a falhar silenciosamente |
| API `projects.deployments` | Única fonte confiável das URLs do web app (`entryPoints[].webApp.url`); URLs montadas na mão (`/macros/s/<id>/dev`) podem não funcionar |
| Retry com backoff (5/10/20/30s) na leitura das URLs | A API demora alguns segundos para popular `entryPoints` após um deploy — sem retry a URL vem vazia na 1ª leitura |
| `git pull --rebase` antes do push do CI | Quando dois workflows commitam de volta ao repo no mesmo push, um deles falha com "remote contains work you do not have" sem o rebase |
| Cache do npm global | Corta ~15s por execução (262 pacotes do clasp) |
| `contents: write` permission | Necessário para commitar `.deployment-id` de volta ao repo |

### As duas URLs do web app (DEV vs PROD)

A API retorna **duas** URLs, ambas terminando em `/exec`:

| | Deployment | ID na URL | Quem abre | Atualiza quando |
|---|---|---|---|---|
| 🟢 **DEV** (`HEAD_URL`) | HEAD (sem `versionNumber`) | **curto** (~46 chars) | Só o dono, logado | A cada `clasp push` |
| 🔵 **PROD** (`EXEC_URL`) | Versionado | **longo** (~76 chars) | Público (`ANYONE_ANONYMOUS`) | A cada `clasp deploy` |

O sufixo `/dev` **não existe** nas URLs retornadas pela API — só na interface
"Testar implantações" do editor GAS. Um `curl` na URL DEV sem sessão recebe a
tela de login do Google: isso é normal, não é falha.

---

## Fluxo de uso no dia a dia

```
1. Editar código (local, Claude Code, ou GitHub web)
2. Commit + push para main
3. (automático) GitHub Actions roda clasp push + atualiza o web app
4. (automático) Step summary exibe as URLs reais do web app
5. Abrir a URL (HEAD_URL em .webapp-urls) → mudanças no ar
```

Para deploy manual: **Actions → Deploy to GAS DEV → Run workflow**.

---

## Solução de problemas

| Sintoma | Causa | Correção |
|---|---|---|
| `ReferenceError: self is not defined` no GAS | Arquivo `.js` não-GAS (ex.: service worker) foi enviado | Adicionar o caminho ao `.claspignore` |
| `clasp push` pede confirmação e trava | Falta `--force` | Usar `clasp push --force` |
| Erro de autenticação `invalid_grant` | `refresh_token` revogado (trocou senha / removeu acesso do app) | Refazer Passo 4 e atualizar o secret |
| Secret com formato errado | JSON do clasp v3 (`"tokens"`) usado direto | Converter para o formato clássico (`"token"` + `"oauth2ClientSettings"`) — ver Passo 4 |
| Link do web app não funciona | URL montada na mão a partir de um deployment ID | Nunca construa a URL; leia `entryPoints[].webApp.url` da API (o workflow grava em `.webapp-urls`) |
| `Scripts may only have up to 20 versioned deployments` | Cada execução do CI criava um deployment novo | Reusar o deployment existente: `clasp deploy -i <deploymentId>` |
| Nada em "Testar implantações" no GAS | Web app não foi configurado no `appsscript.json` | Garantir que `appsscript.json` tem a seção `"webapp"` e foi incluído no push |
| Deploy ok mas mudança não aparece | Cache do browser / deployment de versão fixa | A URL do deployment HEAD (em `.webapp-urls`, chave `HEAD_URL`) sempre serve o código mais recente após `clasp push` |
| URLs vazias logo após o deploy | A API demora segundos para popular `entryPoints` | Retry com backoff (5/10/20/30s) — já embutido nos workflows deste repo |
| `appsscript.json` sem a seção `webapp` no servidor (após `clasp create`) | `clasp create` **sobrescreve** o `appsscript.json` local com o manifest padrão do Google | Backup antes do create, restore antes do push (`cp` para `/tmp` e de volta) |
| URL DEV pede login / `curl` mostra tela do Google | Comportamento padrão: a URL HEAD só abre para o dono logado | Normal. A URL pública é a `EXEC_URL` (deployment versionado) |
| Push do CI falha com "remote contains work you do not have" | Dois workflows commitaram de volta ao repo no mesmo push | `git pull --rebase origin "$GITHUB_REF_NAME"` antes do `git push` |

---

## Adaptando para outro projeto (checklist)

- [ ] Copiar `.github/workflows/deploy-gas-dev.yml` para o novo repo
- [ ] Criar `.clasp.json` com o scriptId do novo projeto GAS
- [ ] Criar `.claspignore` listando o que não é código GAS
- [ ] Garantir que `appsscript.json` existe na raiz **com a seção `"webapp"`** (necessário para o link `/dev` funcionar)
- [ ] Criar o secret `CLASPRC_JSON` no novo repo (pode reutilizar as mesmas
      credenciais se for a mesma conta Google)
- [ ] Ajustar os branches alvo em `on.push.branches` conforme necessário
- [ ] Testar com Run workflow manual antes de confiar no automático
- [ ] Verificar o step summary do job (ou o arquivo `.webapp-urls`) para obter as URLs reais do web app

## Evoluindo para DEV + PROD (quando precisar)

1. Criar segundo projeto GAS (PROD) e copiar o scriptId
2. No repo: `.clasp.dev.json` e `.clasp.prod.json` (cada um com seu scriptId)
3. Duplicar o workflow: um dispara no merge em `develop` (copia
   `.clasp.dev.json` → `.clasp.json` antes do push), outro no merge em `main`
   (copia `.clasp.prod.json`)
4. Mesmo secret serve para os dois se a conta Google for a mesma
