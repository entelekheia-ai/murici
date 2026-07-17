// SPDX-License-Identifier: Apache-2.0

/**
 * Union type for all effects emitted by dot-agent-kernel FSM.
 * Effects are state-change notifications and directives for the LLM runtime and UI layer.
 * Mirrors the Effect enum in the kernel source (src/effect.rs).
 * https://github.com/dot-agent-spec/kernel-dsl
 */
export type Effect =
  | {
      type: "goal"
      text: string
    }
  | {
      type: "guide"
      text: string
    }
  | {
      type: "teach"
      text: string
    }
  | {
      type: "request_interact"
    }
  | {
      type: "transition"
      from: string
      to: string
    }
  | {
      type: "run_script"
      target: string
      parameters: string | null
      silent: boolean
    }
  | {
      type: "run_subagent"
      target: string
      parameters: string | null
      background: boolean
    }
  | {
      type: "run_tool"
      target: string
      parameters: string | null
    }
  | {
      type: "set_memory"
      domain: string
      key: string
      value: string | number | boolean | null
    }
  | {
      type: "apply_css"
      value: string
    }
  | {
      type: "remove_css"
      value: string
    }
  | {
      type: "parse_error"
      message: string
    }
