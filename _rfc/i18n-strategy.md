<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
-->

# i18n Strategy — Murici

## Current state

The project uses `i18next` / `react-i18next` with per-locale JSON files at `public/locales/<locale>/translation.json`.

Locales configured in `i18nConfig.js`: en, de, es, fr, it, ja, ko, pt, pt-BR, ru, si, sv, zh, zh-TW (plus others inherited from chatbot-ui).

### What was done (June 2026)

- Expanded `en/translation.json` from 1 → 29 keys (sidebar: New X, No X, Search X, Quick Settings, date labels)
- Created `pt/translation.json` and `pt-BR/translation.json` with the same 29 keys translated
- Added `pt-BR` to `i18nConfig.js`
- `sidebar-search.tsx` instrumented with `useTranslation`

### Known issues / pending

#### 1. Divergent key in `chat-input.tsx`

The placeholder passed to `t()` is:
```
Ask anything. Type @  /  #  !
```
But the key in the JSON is:
```
Ask anything. Type "/" for prompts, "@" for files, and "#" for tools.
```
They don't match — the component renders the raw key string. Fix by aligning the JSON key with the exact string used in the component, or extract to a shared constant.

#### 2. Dynamic key in `sidebar-create-buttons.tsx`

The component builds the key at runtime:
```ts
t("New " + contentType.charAt(0).toUpperCase() + contentType.slice(1, contentType.length - 1))
// → "New Chat", "New File", "New Prompt", etc.
```
The JSON keys use correct capitalization (`"New Chat"`), and `contentType` is plural (`"chats"`) so the slice produces `"Chat"` — seems correct, but should be validated for all types.

Verified: `"New " + "collections".charAt(0).toUpperCase() + "collections".slice(1, -1)` → `"New Collection"` ✓

#### 3. `pt/` and `pt-BR/` are identical

Currently both are copies. Differentiate when regional vocabulary diverges (BR vs PT).

#### 4. Partial coverage

The 29 keys cover only the sidebar. The rest of the UI still uses hardcoded strings. Instrument progressively with `useTranslation` — priority:
- `chat-input.tsx` (fix the key mismatch above)
- `components/ui/dashboard.tsx`
- `components/messages/message.tsx`

## Key convention

- Key = exact English string as it appears in the UI
- No namespaces for now — everything in `translation` (default namespace)
- Dynamic keys must be constructed predictably and documented here
- Do not translate domain technical terms: `.agent`, `.behavior`, `intent`, `state`, `prompt`, `preset`
