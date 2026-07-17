# 019 — Prerelease track (alpha → beta → stable)

Status: active · Since: 2026-07-17

## Objetivo

`main` só carrega versões **OK** (promovidas e validadas). Builds de teste de
integração e "check final" vivem numa track de prerelease isolada, com auto-update
que **nunca** empurra build de teste pros usuários estáveis.

## Modelo em uma imagem

```
feature/* ──PR──▶ alpha ──promote──▶ beta ──promote──▶ main
                  (front line)        (RC / check final) (stable)
     tag:         vX.Y.Z-alpha.N      vX.Y.Z-beta.N      vX.Y.Z
     canal:       alpha.yml           beta.yml           latest.yml
     GH Release:  prerelease          prerelease         release
```

Branch = canal = convenção. Cada camada é um superconjunto da de baixo em quem
recebe update:

| Build instalado | allowPrerelease | Recebe updates de |
|-----------------|-----------------|-------------------|
| estável (`latest`) | false | só estável |
| `-beta.N` | true, canal `beta` | beta + estável |
| `-alpha.N` | true, canal `alpha` | alpha + beta + estável |

Ou seja: um tester nunca "fica preso" — ele desce naturalmente até o estável.
Um usuário estável nunca vê um build de teste.

## Como funciona (mecânica já configurada)

- **Canal** é derivado da versão automaticamente pelo electron-builder
  (`detectUpdateChannel`): sufixo `-alpha.*` → `alpha.yml`, `-beta.*` → `beta.yml`,
  sem sufixo → `latest.yml`. Não há nada pra configurar por canal.
- **GitHub Release prerelease flag**: o workflow `electron-release.yml` computa
  da tag — qualquer tag com `-` vira `releaseType=prerelease`, senão `release`.
- **Opt-in do canal no cliente**: `electron/updater.ts` lê `app.getVersion()`.
  Build estável mantém `allowPrerelease=false` (comportamento antigo, intacto);
  build alpha/beta se auto-inscreve em `autoUpdater.channel` = alpha/beta.

## Instalação lado a lado

Cada canal recebe `appId` + `productName` distintos (override no CI), então os
três instalam sem se sobrescrever — como VS Code Stable/Insiders:

| Canal | productName | appId |
|-------|-------------|-------|
| stable | `Murici` | `com.entelekheia.murici` |
| beta | `Murici Beta` | `com.entelekheia.murici.beta` |
| alpha | `Murici Alpha` | `com.entelekheia.murici.alpha` |

Consequência: `userData`/IndexedDB são separados por productName → chats e
settings **isolados** entre canais (desejável pra teste de integração). O stable
mantém a identidade original, então instalações existentes não são afetadas.

Rough edges a polir depois (não bloqueiam): `electron/app-config.ts` usa
`~/.config/murici` fixo (compartilhado entre canais; só config de janela/app), e
`electron/main.ts` tem o ícone da janela em runtime hardcoded (cosmético; no mac
o ícone do bundle prevalece).

## Branches

- `main` — estável. Só recebe merges de `beta` já validados. Protegida.
- `beta` — ramo de estabilização (branch off `main`). Portão principal do
  "check final". Cortar `-beta.N` aqui.
- `alpha` — front line opcional (branch off `main`). Onde features integram cedo.
  Cortar `-alpha.N` aqui. Se não precisar de builds ultra-early, dá pra pular e
  cortar o primeiro `-alpha.N` direto da `beta`.

Criar as branches (uma vez):

```bash
git checkout main && git pull
git checkout -b beta  && git push -u origin beta
git checkout -b alpha && git push -u origin alpha   # opcional
```

## Fluxo de release

### 1. Cortar um prerelease (ex.: primeiro RC da 0.11.0)

```bash
git checkout beta && git pull
# integrar as features (merge de alpha ou dos PRs)
npm version 0.11.0-beta.1 --no-git-tag-version   # bump em package.json
git commit -am "chore: 0.11.0-beta.1"
git tag v0.11.0-beta.1
git push origin beta --tags
```

CI builda mac/win/linux → publica **GitHub prerelease** + `beta.yml`. Só quem
instalou um build beta recebe. Repetir `-beta.2`, `-beta.3`… conforme os fixes.

Para builds ainda mais crus, mesmo fluxo na branch `alpha` com `-alpha.N`.

### 2. Promover pra estável

Quando o `-beta.N` passou no teste de integração e check final:

```bash
git checkout main && git pull
git merge --ff-only beta            # ou PR beta -> main
npm version 0.11.0 --no-git-tag-version
git commit -am "chore: 0.11.0"
git tag v0.11.0
git push origin main --tags
```

CI publica **GitHub release** (final) + `latest.yml`. Todos os usuários recebem.

Depois, ressincronizar as branches de teste com o novo estável:

```bash
git checkout beta  && git merge --ff-only main && git push
git checkout alpha && git merge main && git push   # se existir
```

## Convenção de tags

- `vX.Y.Z-alpha.N` — front line
- `vX.Y.Z-beta.N` — release candidate / check final
- `vX.Y.Z` — estável

Sempre incrementar `N` a cada build publicado no mesmo ciclo (electron-updater
compara semver: `-alpha.1 < -alpha.2 < -beta.1 < 0.11.0`).

## Verificação (na primeira vez)

Cortar um `v0.11.0-beta.1` de mentira e confirmar:
1. GitHub Release aparece marcado **Pre-release**.
2. Assets vêm com `beta.yml` (não `latest.yml`).
3. Um build estável instalado **não** oferece atualizar pro beta.
4. Um build beta instalado oferece atualizar quando sai `-beta.2` e, depois,
   quando sai o `0.11.0` estável.

## Arquivos tocados

- `electron/updater.ts` — canal version-aware (`allowPrerelease` + `channel`).
- `.github/workflows/electron-release.yml` — deriva da tag: `releaseType`,
  `channel`, `appId`, `productName` e os 4 ícones (mac/dmg/win/linux).
- `electron-builder.yml` — ícones default apontam pro canal `latest`
  (`icon/latest.*`); win/linux ganharam `icon` explícito. `releaseType`,
  `appId` e `productName` default valem pro build local; o CI sobrescreve por tag.
- `electron/assets/icon/` — masters por canal (`<canal>.icon|icns|ico|png|svg`),
  sem variantes de export.
- `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md` — documentação do processo.
