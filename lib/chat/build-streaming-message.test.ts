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

import { buildStreamingAssistantMessage } from "./build-streaming-message"

describe("buildStreamingAssistantMessage", () => {
  it("includes image_paths so components/messages/message.tsx's .map() never sees undefined", () => {
    // Regression test: the previous inline object literal (built with `as
    // any`) forgot `image_paths`, which crashed message.tsx with
    // "Cannot read properties of undefined (reading 'map')" the first time a
    // streaming assistant reply rendered.
    const message = buildStreamingAssistantMessage({
      chatId: "chat-1",
      content: "hello",
      sequenceNumber: 1
    })

    expect(message.image_paths).toEqual([])
  })

  it("sets the temp-assistant id and echoes the given content/sequence/chat id", () => {
    const message = buildStreamingAssistantMessage({
      chatId: "chat-42",
      content: "streaming...",
      sequenceNumber: 3
    })

    expect(message.id).toBe("temp-assistant")
    expect(message.chat_id).toBe("chat-42")
    expect(message.content).toBe("streaming...")
    expect(message.sequence_number).toBe(3)
    expect(message.role).toBe("assistant")
  })
})
