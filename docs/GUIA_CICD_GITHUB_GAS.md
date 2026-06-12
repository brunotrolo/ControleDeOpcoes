# Guia Completo: CI/CD GitHub → Google Apps Script

> **Objetivo:** ao mergear uma Pull Request no GitHub, o código é enviado
> automaticamente para o Google Apps Script (GAS) em ~30 segundos, sem nenhuma
> ação manual.
>
> **Reutilizável em qualquer projeto GAS.** Siga os passos na ordem.

---

## Como funciona (visão geral)

```
┌─────────────┐    merge PR     ┌────────────────┐    clasp push    ┌─────────────┐
│   GitHub    │ ──────────────► │ GitHub Actions │ ───────────────► │  GAS (DEV)  │
│  (branch    │                 │  (job deploy)  │                  │  projeto    │
│   main)     │                 │   ~30s         │                  │  atualizado │
└─────────────┘                 └────────────────┘                  └─────────────┘
```

O **clasp** é a CLI oficial do Google para Apps Script. O workflow do GitHub
Actions instala o clasp num runner Linux, autentica com credenciais salvas como
*secret* e roda `clasp push --force`.

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
  pull_request:
    types: [closed]         # dispara quando a PR é FECHADA...
    branches: [main]        # ...com base = main

jobs:
  deploy:
    # ...mas só roda se foi MERGEADA (fechar sem merge não deploya)
    if: github.event_name == 'workflow_dispatch' || github.event.pull_request.merged == true
```

| Decisão | Por quê |
|---|---|
| `pull_request: closed` + `if merged` | Não existe evento "PR merged" puro; o padrão é filtrar `closed` pelo campo `merged == true` |
| `workflow_dispatch` | Permite testar o deploy sem precisar de PR |
| `clasp push --force` | Sem `--force`, o clasp pede confirmação interativa (trava o CI) |
| Cache do npm global | Corta ~15s por execução (262 pacotes do clasp) |
| `permissions: pull-requests: write` | Necessário para o job comentar na PR confirmando o deploy |
| `actions/github-script@v7` | Posta "✅ Deploy concluído" na PR com link para o log |

---

## Fluxo de uso no dia a dia

```
1. Editar código (local, Claude Code, ou GitHub web)
2. Commit + push no branch de trabalho
3. Abrir PR → main
4. Mergear a PR
5. (automático) GitHub Actions roda clasp push
6. (automático) Comentário "✅ Deploy concluído" aparece na PR
7. Recarregar o web app GAS → mudanças no ar
```

Para deploy manual sem PR: **Actions → Deploy to GAS DEV → Run workflow**.

---

## Solução de problemas

| Sintoma | Causa | Correção |
|---|---|---|
| Job aparece como **"skipped"** | Disparo manual com `if` exigindo `merged == true` | O `if` precisa de `github.event_name == 'workflow_dispatch' \|\|` antes da condição de merge |
| `ReferenceError: self is not defined` no GAS | Arquivo `.js` não-GAS (ex.: service worker) foi enviado | Adicionar o caminho ao `.claspignore` |
| `clasp push` pede confirmação e trava | Falta `--force` | Usar `clasp push --force` |
| Erro de autenticação `invalid_grant` | `refresh_token` revogado (trocou senha / removeu acesso do app) | Refazer Passo 4 e atualizar o secret |
| Secret com formato errado | JSON do clasp v3 (`"tokens"`) usado direto | Converter para o formato clássico (`"token"` + `"oauth2ClientSettings"`) — ver Passo 4 |
| Deploy ok mas mudança não aparece | Cache do browser / deployment de versão fixa | `clasp push` atualiza o código HEAD; o web app `/dev` reflete na hora, o `/exec` depende do deployment apontar para HEAD |

---

## Adaptando para outro projeto (checklist)

- [ ] Copiar `.github/workflows/deploy-gas-dev.yml` para o novo repo
- [ ] Criar `.clasp.json` com o scriptId do novo projeto GAS
- [ ] Criar `.claspignore` listando o que não é código GAS
- [ ] Garantir que `appsscript.json` existe na raiz
- [ ] Criar o secret `CLASPRC_JSON` no novo repo (pode reutilizar as mesmas
      credenciais se for a mesma conta Google)
- [ ] Ajustar o branch alvo no `on.pull_request.branches` se não for `main`
- [ ] Testar com Run workflow manual antes de confiar no automático

## Evoluindo para DEV + PROD (quando precisar)

1. Criar segundo projeto GAS (PROD) e copiar o scriptId
2. No repo: `.clasp.dev.json` e `.clasp.prod.json` (cada um com seu scriptId)
3. Duplicar o workflow: um dispara no merge em `develop` (copia
   `.clasp.dev.json` → `.clasp.json` antes do push), outro no merge em `main`
   (copia `.clasp.prod.json`)
4. Mesmo secret serve para os dois se a conta Google for a mesma
