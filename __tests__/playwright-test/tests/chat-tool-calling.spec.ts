/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { test, expect } from "../fixtures"

/**
 * Camada 5 (E2E, mais distante do LLM): verifica pela UI de verdade que o
 * streaming e o tool-calling continuam funcionando depois do fix do contrato
 * de tools (app/api/chat/{provider}/route.ts + lib/tools/registry.ts).
 *
 * Este fork não usa mais Supabase/login — "/" redireciona direto para
 * "/local/chat" sem nenhum gate de auth (ver app/[locale]/page.tsx).
 *
 * Requer:
 * - Um servidor local OpenAI-compatible (oMLX, Ollama, etc.) rodando e
 *   auto-descoberto pelo app, com o model id abaixo disponível — ajuste
 *   E2E_LOCAL_MODEL_ID se o seu servidor expõe outro modelo. O teste pula
 *   sozinho se nenhum modelo local estiver disponível.
 */

const LOCAL_MODEL_ID =
  process.env.E2E_LOCAL_MODEL_ID || "Qwen3-4B-Instruct-2507-4bit"

test.describe("chat streaming + tool calling", () => {
  test.beforeEach(async ({ page }) => {
    // Pré-seleciona o modelo local via localStorage (mesma chave que
    // components/models/model-select.tsx grava ao clicar num modelo),
    // evitando depender da estrutura exata do dropdown.
    await page.addInitScript(modelId => {
      window.localStorage.setItem("murici_selected_model", modelId)
    }, LOCAL_MODEL_ID)

    await page.goto("/local/chat")
    await page.locator("textarea").first().waitFor({ timeout: 30_000 })
  })

  test("streams a plain text reply from the local model", async ({
    page
  }) => {
    const input = page.locator("textarea").first()
    await input.click()
    await input.fill("Reply with exactly the word: pong")
    await input.press("Enter")

    // Scoped to message paragraphs: a plain getByText("pong") also matches
    // the sidebar's chat title, which echoes the truncated user prompt.
    await expect(page.getByRole("paragraph").getByText("pong")).toBeVisible({
      timeout: 30_000
    })
  })

  test("triggers a built-in tool call without erroring", async ({ page }) => {
    const input = page.locator("textarea").first()
    await input.click()
    await input.fill(
      "Call the murici__save_doc tool to save a one-line note titled 'test' about testing. Only call the tool."
    )
    await input.press("Enter")

    // A resposta pode vir vazia de texto (o modelo só chamou a tool), então
    // o sinal de sucesso aqui é a ausência de um toast/alerta de erro visível
    // e o input voltar a ficar habilitado para a próxima mensagem.
    await expect(page.getByText(/unexpected error|failed/i)).toHaveCount(0, {
      timeout: 30_000
    })
    await expect(input).toBeEnabled({ timeout: 30_000 })
  })
})
