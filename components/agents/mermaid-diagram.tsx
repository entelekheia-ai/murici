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
