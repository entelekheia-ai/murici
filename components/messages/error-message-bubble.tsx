"use client"
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

import { FlowEvent } from "@/types"
import { FC } from "react"
import { useTranslation } from "react-i18next"

const ICON_SIZE = 32

interface ErrorMessageBubbleProps {
  event: FlowEvent
}

// Always-visible sibling of FlowEventCard's "error" branch (which stays
// debug-gated and shows the full JSON) — this one renders unconditionally, as
// a message-shaped bubble, so a failed response is never invisible to a user
// who doesn't have the debug panel on.
export const ErrorMessageBubble: FC<ErrorMessageBubbleProps> = ({ event }) => {
  const { t } = useTranslation()
  const { message, translatedMessage } = event.data

  return (
    <div className="flex w-full justify-center px-[40px]">
      <div className="flex w-full gap-[16px] py-[24px]">
        <div
          className="flex shrink-0 items-center justify-center rounded-full bg-red-600 text-lg"
          style={{ width: ICON_SIZE, height: ICON_SIZE }}
        >
          ⛔
        </div>
        <div className="flex min-w-px flex-[1_0_0] flex-col gap-[4px]">
          <div className="text-[15px] font-semibold text-[#1c1611] dark:text-white">
            {t("Error")}
          </div>
          <div className="whitespace-pre-wrap text-sm">{message}</div>
          {translatedMessage && (
            <div className="whitespace-pre-wrap text-sm opacity-70">
              {translatedMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
