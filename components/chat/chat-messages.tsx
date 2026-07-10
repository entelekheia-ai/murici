/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { useChatHandler } from "@/lib/hooks/use-chat-handler"
import { ChatbotUIContext } from "@/context/context"
import { Tables } from "@/types/database"
import { FC, Fragment, useContext, useState } from "react"
import { FlowEventCard } from "../messages/flow-event-card"
import { Message } from "../messages/message"

interface ChatMessagesProps {}

export const ChatMessages: FC<ChatMessagesProps> = ({}) => {
  const { chatMessages, chatFileItems, flowEvents, showDebugPanels } =
    useContext(ChatbotUIContext)

  const { handleSendEdit } = useChatHandler()

  const [editingMessage, setEditingMessage] = useState<Tables<"messages">>()

  // Debug is a real-time mirror of the exchange: each flowEvent renders as its
  // own inline card, ungrouped, interleaved with the messages in the order it
  // actually happened (by timestamp) — not consolidated into a per-turn block.
  const orderedMessages = [...chatMessages].sort(
    (a, b) => a.message.sequence_number - b.message.sequence_number
  )
  const orderedEvents = showDebugPanels
    ? [...flowEvents].sort((a, b) => a.timestamp - b.timestamp)
    : []

  const lastMessageId =
    orderedMessages[orderedMessages.length - 1]?.message.id ?? null
  const msgTs = (cm: (typeof orderedMessages)[number]) =>
    Date.parse(cm.message.created_at || "") || 0

  // Events that predate the first message (rare) render at the very top.
  const firstTs = orderedMessages.length ? msgTs(orderedMessages[0]) : Infinity
  const leadingEvents = orderedEvents.filter(e => e.timestamp < firstTs)

  return (
    <>
      {leadingEvents.map(ev => (
        <FlowEventCard key={ev.id} event={ev} />
      ))}

      {orderedMessages.map((chatMessage, index) => {
        const messageFileItems = chatFileItems.filter(
          (chatFileItem, _, self) =>
            chatMessage.fileItems.includes(chatFileItem.id) &&
            self.findIndex(item => item.id === chatFileItem.id) === _
        )

        // Every event whose timestamp falls between this message and the next
        // one renders right after this message — i.e. in the order it happened.
        const thisTs = msgTs(chatMessage)
        const nextTs =
          index < orderedMessages.length - 1
            ? msgTs(orderedMessages[index + 1])
            : Infinity
        const eventsAfter = orderedEvents.filter(
          e => e.timestamp >= thisTs && e.timestamp < nextTs
        )

        return (
          // Keyed on message id, not sequence_number: the optimistic user
          // message and the "temp-assistant" streaming placeholder can
          // legitimately compute the same next sequence_number for a brief
          // window, and a duplicate React key makes React silently merge/drop
          // one of the two nodes instead of rendering both.
          <Fragment key={chatMessage.message.id}>
            <Message
              message={chatMessage.message}
              fileItems={messageFileItems}
              isEditing={editingMessage?.id === chatMessage.message.id}
              isLast={chatMessage.message.id === lastMessageId}
              onStartEdit={setEditingMessage}
              onCancelEdit={() => setEditingMessage(undefined)}
              onSubmitEdit={handleSendEdit}
            />
            {eventsAfter.map(ev => (
              <FlowEventCard key={ev.id} event={ev} />
            ))}
          </Fragment>
        )
      })}
    </>
  )
}
