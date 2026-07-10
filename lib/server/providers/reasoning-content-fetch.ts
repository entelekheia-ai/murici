/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

/**
 * Local reasoning models (DeepSeek R1, Qwen3, gpt-oss, etc. via oMLX/Ollama/
 * LM Studio) stream their chain-of-thought in a separate `delta.reasoning_content`
 * field, NOT inside the normal `delta.content`. @ai-sdk/openai (createOpenAI)
 * doesn't map that field, so it's silently dropped and the thinking never
 * reaches the UI.
 *
 * This fetch wrapper folds `reasoning_content` back into the text stream wrapped
 * in <think>...</think>. The custom chat route already runs
 * extractReasoningMiddleware({ tagName: "think" }), which turns those tags into
 * real `reasoning` UI parts — so this one shim is all it takes to restore the
 * think block for local reasoning models, with no provider swap and no effect on
 * tool calling. (Same idea as the pre-refactor commit "support delta.reasoning_content
 * for local reasoning models", adapted to the current streamText + middleware stack.)
 */
export function withReasoningContentAsThink(
  baseFetch?: typeof fetch
): typeof fetch {
  return async (input: any, init?: any) => {
    // Resolve the underlying fetch lazily, at actual request time, rather than
    // as a default parameter. An eager `= fetch` default references the global
    // the instant this factory is *called* (before any request), which throws
    // "fetch is not defined" in environments that only expose fetch per-request
    // (and in the jest node test env). Deferring it keeps both edge runtime and
    // tests happy.
    const doFetch = baseFetch ?? fetch
    const response = await doFetch(input, init)

    const contentType = response.headers.get("content-type") || ""
    const { logger } = await import("@/lib/logger")
    logger.debug("reasoning-fetch invoked", {
      url: typeof input === "string" ? input : input?.url,
      contentType,
      hasBody: !!response.body
    })
    if (!response.body || !contentType.includes("text/event-stream")) {
      return response
    }

    let buffer = ""
    let insideThink = false
    let reasoningSeen = 0

    const rewriteLine = (line: string): string => {
      if (!line.startsWith("data:")) return line
      const payload = line.slice(line.indexOf(":") + 1).trim()
      if (payload === "" || payload === "[DONE]") return line

      let json: any
      try {
        json = JSON.parse(payload)
      } catch {
        return line
      }

      const choice = json.choices?.[0]
      const delta = choice?.delta
      if (!delta) return line

      if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
        // Reasoning tokens: open the <think> block on the first one, fold the
        // rest in, and hide the non-standard field from the provider.
        delta.content = (insideThink ? "" : "<think>") + delta.reasoning_content
        delete delta.reasoning_content
        insideThink = true
        reasoningSeen++
      } else if (insideThink && (delta.content != null || choice.finish_reason != null)) {
        // First normal content (or the finish chunk) after reasoning: close the
        // block before anything else in this delta.
        delta.content = "</think>" + (delta.content ?? "")
        insideThink = false
      }

      return "data: " + JSON.stringify(json)
    }

    const transform = new TransformStream<string, string>({
      transform(chunk, controller) {
        buffer += chunk
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          controller.enqueue(rewriteLine(line) + "\n")
        }
      },
      flush(controller) {
        logger.debug("reasoning-fetch stream done", { reasoningSeen })
        if (buffer) controller.enqueue(rewriteLine(buffer))
        // Reasoning-only response that ended without a trailing content chunk:
        // make sure the block is still closed so the parser doesn't swallow it.
        if (insideThink) {
          controller.enqueue(
            `data: ${JSON.stringify({
              choices: [{ index: 0, delta: { content: "</think>" }, finish_reason: null }]
            })}\n\n`
          )
          insideThink = false
        }
      }
    })

    const stream = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(transform)
      .pipeThrough(new TextEncoderStream())

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    })
  }
}
