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

import mermaid from "mermaid"
import { useEffect, useRef } from "react"

export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: "base" })

    if (ref.current && chart) {
      try {
        // Clear previous to avoid id conflicts
        ref.current.innerHTML = ""
        mermaid
          .render(`mermaid-svg-${Date.now()}`, chart)
          .then(({ svg }) => {
            if (ref.current) {
              ref.current.innerHTML = svg
            }
          })
          .catch(e => {
            console.error("Mermaid error:", e)
          })
      } catch (e) {
        console.error("Mermaid sync error:", e)
      }
    }
  }, [chart])

  return <div ref={ref} className="flex w-full justify-center" />
}
