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

/**
 * Union type for all effects emitted by dot-agent-kernel FSM.
 * Effects are state-change notifications and directives for the LLM runtime and UI layer.
 * Mirrors the Effect enum in the kernel source (src/effect.rs).
 * https://github.com/dot-agent-spec/kernel-dsl
 */
export type Effect = {
    type: "goal";
    text: string;
} | {
    type: "guide";
    text: string;
} | {
    type: "teach";
    text: string;
} | {
    type: "request_interact";
} | {
    type: "transition";
    from: string;
    to: string;
} | {
    type: "run_script";
    target: string;
    parameters: string | null;
    silent: boolean;
} | {
    type: "run_subagent";
    target: string;
    parameters: string | null;
    background: boolean;
} | {
    type: "run_tool";
    target: string;
    parameters: string | null;
} | {
    type: "set_memory";
    domain: string;
    key: string;
    value: string | number | boolean | null;
} | {
    type: "apply_css";
    value: string;
} | {
    type: "remove_css";
    value: string;
} | {
    type: "parse_error";
    message: string;
};
