import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatbotUIContext } from "@/context/context"
import { Tables } from "@/types/database"
import { FC, Fragment, useContext, useState } from "react"
import { FlowEventCard } from "../messages/flow-event-card"
import { FlowSystemDebugBubble } from "../messages/flow-system-debug-bubble"
import { Message } from "../messages/message"

interface ChatMessagesProps {}

export const ChatMessages: FC<ChatMessagesProps> = ({}) => {
  const { chatMessages, chatFileItems, flowDebugLog, flowEvents } =
    useContext(ChatbotUIContext)

  const { handleSendEdit } = useChatHandler()

  const [editingMessage, setEditingMessage] = useState<Tables<"messages">>()

  return chatMessages
    .sort((a, b) => a.message.sequence_number - b.message.sequence_number)
    .map((chatMessage, index, array) => {
      const messageFileItems = chatFileItems.filter(
        (chatFileItem, _, self) =>
          chatMessage.fileItems.includes(chatFileItem.id) &&
          self.findIndex(item => item.id === chatFileItem.id) === _
      )

      const seqNum = chatMessage.message.sequence_number
      const isAssistant = chatMessage.message.role === "assistant"
      const debug = isAssistant ? flowDebugLog?.[seqNum] : undefined

      const eventsForSeq = isAssistant
        ? flowEvents
            .filter(e => e.seqNum === seqNum)
            .sort((a, b) => a.timestamp - b.timestamp)
        : []

      return (
        <Fragment key={seqNum}>
          {eventsForSeq.map(ev => (
            <FlowEventCard key={ev.id} event={ev} />
          ))}
          <Message
            message={chatMessage.message}
            fileItems={messageFileItems}
            isEditing={editingMessage?.id === chatMessage.message.id}
            isLast={index === array.length - 1}
            onStartEdit={setEditingMessage}
            onCancelEdit={() => setEditingMessage(undefined)}
            onSubmitEdit={handleSendEdit}
          />
          {debug && (
            <details className="mx-4 mb-2">
              <summary className="text-muted-foreground/50 cursor-pointer select-none font-mono text-xs hover:opacity-70">
                ver debug completo
              </summary>
              <FlowSystemDebugBubble debug={debug} />
            </details>
          )}
        </Fragment>
      )
    })
}
