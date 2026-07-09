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

import { Message } from "@/types/database"

/*
 * Returns Message (not `any`) on purpose: the previous inline object literal
 * used `as any`, which let a missing `image_paths` field (required by
 * Message) silently reach components/messages/message.tsx and crash on
 * `.map()`. Typing this as a real return value makes the compiler catch a
 * forgotten field instead of it surfacing as a runtime TypeError.
 */
export function buildStreamingAssistantMessage(params: {
  chatId: string
  content: string
  sequenceNumber: number
  toolCalls?: any[]
}): Message {
  return {
    id: "temp-assistant",
    chat_id: params.chatId,
    user_id: "local",
    assistant_id: null,
    role: "assistant",
    content: params.content,
    model: "custom",
    sequence_number: params.sequenceNumber,
    tool_calls: params.toolCalls || [],
    image_paths: [],
    created_at: new Date().toISOString(),
    updated_at: null
  }
}
