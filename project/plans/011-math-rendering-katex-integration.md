# Plan 011: Complete math rendering with KaTeX

## Objective

Finish the math-rendering integration in chat messages: `remark-math` is
already parsing `$inline$` and `$$block$$` syntax into mdast math nodes,
but nothing renders those nodes today, so math text either shows raw or
silently disappears. Add `rehype-katex` (+ `katex`) so those nodes actually
render, and wire it into the existing markdown pipeline.

## Motivation

Found during the murici dependency audit (2026-07-06):
`components/messages/message-markdown.tsx:8,20` imports `remarkMath` and
passes it in `remarkPlugins`, but there is no `rehypePlugins` prop at all,
and neither `rehype-katex` nor `katex` are installed
(confirmed: no match for `katex` in `package.json`). `remark-math` only
transforms the AST (wrapping math in `math`/`inlineMath` mdast node types)
— it does not know how to turn them into HTML/DOM. Without a renderer,
`react-markdown` has no component mapping for those node types, so the
content is effectively lost. This is a half-finished feature, not a
deliberate design choice, so completing it (rather than ripping
`remark-math` back out) is the right direction.

## Proposed Approach

1. **Add dependencies**: `rehype-katex` and `katex` to
   `package.json` `dependencies` (KaTeX's CSS/fonts are needed at runtime,
   not just build time, so `katex` itself — not only the rehype plugin —
   must be a real dependency).

2. **Wire the plugin** in
   [components/messages/message-markdown.tsx](../../components/messages/message-markdown.tsx):
   ```
   import rehypeKatex from "rehype-katex"
   ...
   <MessageMarkdownMemoized
     remarkPlugins={[remarkGfm, remarkMath]}
     rehypePlugins={[rehypeKatex]}
     ...
   ```
   `MessageMarkdownMemoized` ([message-markdown-memoized.tsx](../../components/messages/message-markdown-memoized.tsx))
   already forwards arbitrary `react-markdown` `Options` props, including
   `rehypePlugins` — no change needed there.

3. **Load KaTeX's CSS**. Two options, pick one:
   - Import `katex/dist/katex.min.css` directly at the top of
     `message-markdown.tsx` (Next.js App Router supports importing
     third-party CSS straight from a component/node_modules). Keeps the
     cost scoped to wherever chat messages render.
   - Add the same import to `app/[locale]/globals.css` instead, if KaTeX's
     CSS ever needs to apply outside the chat view too.
   Recommendation: colocate in `message-markdown.tsx` — nothing else in the
   app needs KaTeX styling right now.

4. **Bundle size check**: KaTeX ships its own web fonts and is not tiny
   (~250KB CSS+fonts, ~60KB JS for the plugin chain). Since `murici` ships
   both as a Next.js web app and an Electron bundle, run
   `ANALYZE=true npm run build` (existing `analyze` script in
   `package.json`) before/after to confirm the added weight is acceptable,
   and confirm it doesn't regress first paint of the chat view.

5. **Manual verification** (no existing test covers markdown rendering):
   start `npm run dev`, send a chat message containing:
   - an inline case: `The identity is $a^2 + b^2 = c^2$.`
   - a block case: `` $$\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$$ ``
   and confirm both render as typeset math, not raw text or `$` literals,
   in both light and dark theme (the app's `prose dark:prose-invert`
   classing on the markdown container should not clash with KaTeX's own
   styling — check contrast/background in dark mode specifically).

## Files Changed (Anticipated)

| File | Change |
|---|---|
| `package.json` | add `rehype-katex`, `katex` to `dependencies` |
| `components/messages/message-markdown.tsx` | import `rehypeKatex`, add `rehypePlugins`, import KaTeX CSS |

## Out of scope (adiado)

- No changes to `remark-gfm` behavior or other markdown features.
- Not addressing math input/authoring UX (e.g. a math toolbar) — this is
  purely about rendering what a model or user already typed.

## Open Questions

- Colocated CSS import vs. `globals.css` — confirmed recommendation above,
  but worth a second look if math ever needs to render somewhere besides
  chat messages (e.g. a future knowledge-panel doc preview).
- Is KaTeX's bundle weight acceptable for the Electron build's cold-start
  time, or should the import be dynamic (`next/dynamic`) so it's only
  loaded the first time a message actually contains math?
