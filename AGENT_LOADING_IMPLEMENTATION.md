# Implementação de Carregamento de .agent - Tentativas e Falhas

## Objetivo
Implementar suporte para carregar arquivos `.agent` (bundles ZIP do @dot-agent/cli) na interface Murici, permitindo:
1. Carregamento via file picker (browser)
2. Carregamento via "Open with" (Electron - macOS Finder / drag-drop)
3. Resolução de merge directives
4. Renderização do behavior no painel de flow

## Arquitetura Proposta
```
File picker (browser)         Electron open-with
       │                              │
       ▼                              ▼
POST /api/agent/unpack         electron/main.ts
  @dot-agent/cli unpack()        @dot-agent/cli unpack()
  → resolve merges               → resolve merges
  → { aboutme, behaviorText }    → send via IPC
       │                              │
       └──────────────┬───────────────┘
                      ▼
           agent-right-panel.tsx
             loadBehavior(engine, behaviorText)
             setActiveTab("flow")
```

## Arquivos Implementados

### ✅ Criados
- **types/electron.d.ts** - Type definitions para window.electronAPI
- **app/api/agent/unpack/route.ts** - API route para unpack no servidor (usa @dot-agent/cli)
- **electron-dist/package.json** - Declaração `"type": "module"` para ESM

### ✅ Modificados
- **package.json** - Adicionado @dot-agent/cli
- **next.config.js** - Adicionado serverComponentsExternalPackages e webpack config
- **tsconfig.electron.json** - Compilação para ESM (`"module": "esnext"`)
- **electron/main.ts** - ESM, importa @dot-agent/cli, resolve merges, ESM imports (`.js` extensions)
- **electron/updater.ts** - ESM, dynamic import de electron-updater
- **electron/preload.ts** - onOpenAgentFile bridge via IPC
- **components/agents/agent-right-panel.tsx** - File picker, metadata UI, IPC listener, kernel init

## Problemas Enfrentados e Soluções

### 1. Webpack Static Analysis do Kernel-DSL
**Problema:** Agent-right-panel importa @dot-agent/kernel-dsl dinamicamente, mas webpack faz análise estática e encontra `node:fs/promises` e `node:url` no index.js do kernel. Webpack tenta fazer bundle desses imports Node.js para o cliente.

```
Error: UnhandledSchemeError: Reading from "node:fs/promises" is not handled by plugins
```

**Tentativas:**
1. ❌ String.fromCharCode para construir nome do módulo dinamicamente
   - Webpack ainda faz análise estática da string literal
2. ❌ Function constructor para delay de imports
   - Webpack ainda detecta a string
3. ❌ `webpackIgnore: true` comment no import
   - Webpack pula o bundle, mas em runtime módulo não está disponível
4. ❌ Apenas resolve.alias para `node:` modules
   - Webpack ainda falha durante build

**Solução em Progresso:**
- Adicionar `resolve.fallback` no webpack config para stubbar módulos `node:` com `false`
- Confiar em `serverComponentsExternalPackages` para externalizar CLI e kernel no servidor
- Usar resolve.fallback para cliente: `"node:fs/promises": false, "node:url": false, etc.`

**Status:** Em teste - webpack pode estar ainda reclamando porque @dot-agent/cli também tem imports Node.js que estão sendo re-exportados.

### 2. Electron ESM Conversion
**Problema:** Adicionar @dot-agent/cli que é ESM causou conflito com CommonJS no Electron.

**Solução:**
- Converter tsconfig.electron.json para `"module": "esnext"` (ESM)
- Criar electron-dist/package.json com `"type": "module"`
- Adicionar `.js` extensions em imports relativos (ESM requirement)
- Converter imports CommonJS: `import updaterModule from "electron-updater"` ao invés de named import

### 3. __dirname não definido em ESM
**Problema:** ESM não define __dirname por padrão.

**Solução:**
```typescript
import { fileURLToPath } from "url"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
```

### 4. Dynamic Kernel Loading no Cliente
**Problema:** Kernel-dsl precisa ser importado dinamicamente no agent-right-panel (é um Client Component), mas contém imports Node.js que webpack não consegue resolver.

**Tentativas:**
1. ❌ Remover kernel init de agent-right-panel - mas engine precisa estar disponível
2. ❌ Usar lib/kernel-init.ts wrapper - webpack ainda analisa o kernel
3. ⏳ Usar resolve.fallback - em teste

**Status:** Webpack ainda reclamando mesmo com resolve.fallback

## Próximos Passos

1. **Debug webpack config**: Verificar se resolve.fallback está sendo aplicado corretamente
2. **Alternativa**: Se resolve.fallback não funcionar, considerar:
   - Remover @dot-agent/cli do cliente completamente
   - API route (/api/agent/unpack) já faz unpack no servidor
   - Electron main.ts já faz unpack localmente
   - Nunca importar CLI no cliente
3. **Verificar imports**: Confirmar que @dot-agent/cli não está sendo importado indiretamente no cliente
4. **Test e-2-e**: Uma vez compilando, testar:
   - File picker no browser
   - Open with no Electron
   - Merge directive resolution
   - Behavior rendering no painel

## Files Status

| File | Status | Notes |
|------|--------|-------|
| types/electron.d.ts | ✅ | Criado |
| lib/kernel-init.ts | ⚠️ | Criado mas problemático, pode ser removido |
| app/api/agent/unpack/route.ts | ✅ | Usa @dot-agent/cli, server-only |
| electron/main.ts | ✅ | ESM, unpack local, resolve merges |
| electron/preload.ts | ✅ | IPC bridge |
| electron/updater.ts | ✅ | ESM conversion |
| electron-dist/package.json | ✅ | Type module |
| next.config.js | ⏳ | Em ajuste - webpack fallback |
| tsconfig.electron.json | ✅ | ESM |
| agent-right-panel.tsx | ✅ | File picker, IPC, kernel init |
| package.json | ✅ | @dot-agent/cli added |

## Webpack Config Timeline

### Tentativa 1
```js
// Não adicionou nada - webpack falhou
```

### Tentativa 2
```js
next.config.js: serverComponentsExternalPackages: ["@dot-agent/cli", "@dot-agent/kernel-dsl"]
```
❌ Webpack ainda falhou

### Tentativa 3
```js
webpack: {
  resolve: { alias: { "node:fs/promises": false, "node:url": false } }
}
```
❌ Webpack ainda falhou

### Tentativa 4 (Atual)
```js
webpack: {
  resolve: { 
    fallback: {
      "fs": false,
      "fs/promises": false,
      "node:fs": false,
      "node:fs/promises": false,
      "url": false,
      "node:url": false,
      "path": false,
      "node:path": false
    }
  }
}
```
⏳ Em teste

## Observações Importantes

1. **Kernel já funcionava no cliente** antes de adicionar @dot-agent/cli
2. **CLI re-exporta o kernel**, então ambos os imports `node:` aparecem
3. **API route já usa CLI** - não precisa importar no cliente
4. **Electron main.ts já usa CLI** localmente - não precisa importar no cliente
5. **Única razão de importar kernel no cliente** é para `module.init()` e `new module.AgentDSLKernel()`
6. **Kernel é inicializado dinamicamente** no useEffect, então não é needed no bundle estático

## Possível Solução Alternativa

Se fallback não funcionar, remover kernel import do cliente e:
1. Inicializar kernel em um lugar seguro (app/root.tsx ou app-root server component)
2. Passar engine via contexto
3. Agent-right-panel apenas usa o engine, nunca inicializa

Isso evitaria webpack ter que resolver @dot-agent/* no cliente.
