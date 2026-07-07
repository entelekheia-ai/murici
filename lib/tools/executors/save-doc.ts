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

import { z } from "zod"
import { logger } from "@/lib/logger"

export const saveDocSchema = z.object({
  title: z.string().describe("A short, descriptive title for the document."),
  theme: z.string().describe("The general theme or topic."),
  summary: z.string().describe("A one-sentence summary of the content."),
  content: z.string().describe("The full content of the document, formatted in markdown.")
})

export type SaveDocArgs = z.infer<typeof saveDocSchema>

export async function runSaveDoc(
  args: SaveDocArgs,
  chatId: string,
  messageId: string,
  promptMessageId: string
) {
  try {
    const { getAgentBundle } = await import("@/lib/local-db/agent-bundles")
    const bundle = await getAgentBundle(chatId)

    const record = {
      id: crypto.randomUUID(),
      nodeType: "knowledge" as const,
      originConversationId: chatId,
      messageId: messageId,
      sourcePromptMessageId: promptMessageId,
      title: args.title,
      summary: args.summary,
      outputType: args.theme || "GeneralContent",
      payload: {
        language: "md",
        content: args.content
      },
      derivedFrom: [],
      agentRuns: bundle?.aboutme.id
        ? [{ agentId: bundle.aboutme.id, runAt: new Date().toISOString(), role: "produced" as const }]
        : [],
      createdAt: new Date().toISOString()
    }

    const { createKnowledgeRecord } = await import("@/lib/local-db/knowledge")
    await createKnowledgeRecord(record)

    return {
      status: "Document saved successfully.",
      record
    }
  } catch (e: any) {
    logger.error("Failed to save doc", { error: e.message })
    return { status: "Error saving document", error: e.message }
  }
}
