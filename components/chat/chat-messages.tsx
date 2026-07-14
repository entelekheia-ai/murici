/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { useChatHandler } from "@/lib/hooks/use-chat-handler"
import { ChatbotUIContext } from "@/context/context"
import {
  selectViewedFlowEvents,
  useChannelStore
} from "@/lib/store/channel-store"
import { Tables } from "@/types/database"
import { FlowEvent } from "@/types"
import { FC, Fragment, useContext, useState } from "react"
import { FlowEventCard } from "../messages/flow-event-card"
import { ErrorMessageBubble } from "../messages/error-message-bubble"
import { Message } from "../messages/message"

interface ChatMessagesProps {}

export const ChatMessages: FC<ChatMessagesProps> = ({}) => {
  const { chatMessages, chatFileItems, showDebugPanels } =
    useContext(ChatbotUIContext)

  const { handleSendEdit } = useChatHandler()

  const [editingMessage, setEditingMessage] = useState<Tables<"messages">>()

  // The debug/error timeline of the thread on screen (ADR-0007). Events are stored
  // per thread, so a chat still generating in the BACKGROUND cannot spill its rows
  // into the chat being viewed — no filtering needed here.
  const chatEvents = useChannelStore(selectViewedFlowEvents)

  // Debug is a real-time mirror of the exchange: each flowEvent renders as its
  // own inline card, ungrouped, interleaved with the messages in the order it
  // actually happened (by timestamp) — not consolidated into a per-turn block.
  const orderedMessages = [...chatMessages].sort(
    (a, b) => a.message.sequence_number - b.message.sequence_number
  )
  const orderedEvents = showDebugPanels
    ? [...chatEvents].sort((a, b) => a.timestamp - b.timestamp)
    : []

  // "error" events get a friendly bubble unconditionally (not gated by
  // showDebugPanels) — a failed response should never be invisible just
  // because the debug panel is off. When debug IS on, both this bubble and
  // the compact JSON row above coexist; they're not the same list.
  const errorEvents = chatEvents
    .filter(e => e.type === "error")
    .sort((a, b) => a.timestamp - b.timestamp)

  const lastMessageId =
    orderedMessages[orderedMessages.length - 1]?.message.id ?? null
  const msgTs = (cm: (typeof orderedMessages)[number]) =>
    Date.parse(cm.message.created_at || "") || 0

  const eventsInRange = (list: FlowEvent[], fromTs: number, toTs: number) =>
    list.filter(e => e.timestamp >= fromTs && e.timestamp < toTs)

  // Events that predate the first message (rare) render at the very top.
  const firstTs = orderedMessages.length ? msgTs(orderedMessages[0]) : Infinity
  const leadingEvents = orderedEvents.filter(e => e.timestamp < firstTs)
  const leadingErrorEvents = errorEvents.filter(e => e.timestamp < firstTs)

  return (
    <>
      {leadingEvents.map(ev => (
        <FlowEventCard key={ev.id} event={ev} />
      ))}
      {leadingErrorEvents.map(ev => (
        <ErrorMessageBubble key={ev.id} event={ev} />
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
        const eventsAfter = eventsInRange(orderedEvents, thisTs, nextTs)
        const errorEventsAfter = eventsInRange(errorEvents, thisTs, nextTs)

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
            {errorEventsAfter.map(ev => (
              <ErrorMessageBubble key={ev.id} event={ev} />
            ))}
          </Fragment>
        )
      })}
    </>
  )
}
