/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

export interface GeneralContent {
  language: string // raw fence tag: "typescript", "md", "json", "sql", ""
  content: string // full text inside the fence block
}

export interface AgentRunRef {
  agentId: string // full agent ID per agent-id spec: "ns/name:v~digest" or "unknown/name"
  runAt: string // ISO 8601
  role: "produced" | "consumed" | "transformed"
}

export interface KnowledgeRecord {
  id: string
  nodeType: "knowledge" | "document" | "task" | "automation" | "entity"
  originConversationId: string // immutable: where this node was created
  messageId: string // assistant message that contained the fenced block
  sourcePromptMessageId: string | null // user message that preceded it
  title: string // display label, human-editable
  summary: string | null // one-sentence digest for LLM traversal; null until enrichment
  outputType: string // "GeneralContent" in v0; DSL type name when RFC-0014 exists
  payload: GeneralContent // typed by outputType
  derivedFrom: string[] // KnowledgeRecord ids this was built from; [] in v0
  agentRuns: AgentRunRef[] // agents that touched this node; [] in v0 plain chat
  createdAt: string // ISO 8601
}
