/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  localeToLanguageName,
  buildTranslateContent,
  translateErrorMessage
} from "./auto-translate"
import { runHeadlessAgent } from "@/lib/runtime/headless-runner"
import { LLM } from "@/types"

jest.mock("@/lib/runtime/headless-runner")

const mockRunHeadlessAgent = runHeadlessAgent as jest.MockedFunction<
  typeof runHeadlessAgent
>

function makeModel(): LLM {
  return {
    modelId: "llama3",
    modelName: "llama3",
    provider: "local",
    hostedId: "llama3",
    platformLink: "",
    imageInput: false
  } as LLM
}

describe("localeToLanguageName", () => {
  it("maps every supported locale to its language name", () => {
    expect(localeToLanguageName("en")).toBe("English")
    expect(localeToLanguageName("pt")).toBe("Portuguese")
    expect(localeToLanguageName("pt-BR")).toBe("Brazilian Portuguese")
    expect(localeToLanguageName("de")).toBe("German")
    expect(localeToLanguageName("es")).toBe("Spanish")
  })

  it("falls back to the locale code itself when unknown", () => {
    expect(localeToLanguageName("ja")).toBe("ja")
  })
})

describe("buildTranslateContent", () => {
  it("concatenates the message with a target-language line", () => {
    expect(buildTranslateContent("Insufficient quota.", "Portuguese")).toBe(
      "Insufficient quota.\n\nTarget language: Portuguese"
    )
  })
})

describe("translateErrorMessage", () => {
  beforeEach(() => {
    mockRunHeadlessAgent.mockReset()
  })

  it("resolves to the translated field when the agent responds", async () => {
    mockRunHeadlessAgent.mockResolvedValue({ translated: "Cota insuficiente." })

    const result = await translateErrorMessage(
      "Insufficient quota.",
      makeModel(),
      "pt"
    )

    expect(result).toBe("Cota insuficiente.")
    expect(mockRunHeadlessAgent).toHaveBeenCalledWith(
      "Insufficient quota.\n\nTarget language: Portuguese",
      expect.anything(),
      "/agents/background.agent",
      "run_translation",
      expect.stringContaining("save_translation")
    )
  })

  it("returns null without throwing when the agent returns null", async () => {
    mockRunHeadlessAgent.mockResolvedValue(null)
    await expect(
      translateErrorMessage("x", makeModel(), "en")
    ).resolves.toBeNull()
  })

  it("returns null without throwing when the agent rejects", async () => {
    mockRunHeadlessAgent.mockRejectedValue(new Error("no local model"))
    await expect(
      translateErrorMessage("x", makeModel(), "en")
    ).resolves.toBeNull()
  })
})
