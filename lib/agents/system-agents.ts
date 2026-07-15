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

import type { UnpackPayload } from "@/types/electron"
import { unpackAgentFileFromUrl } from "./unpack-agent-file"

// background.agent (background enrichment + error-translation agent, see
// lib/knowledge/enrich.ts and lib/errors/auto-translate.ts) is internal-only
// and intentionally has no equivalent here — it must never surface in
// user-facing agent lists.

let onboardingPayloadPromise: Promise<UnpackPayload> | null = null

export function getOnboardingAgentPayload(): Promise<UnpackPayload> {
  if (!onboardingPayloadPromise) {
    onboardingPayloadPromise = unpackAgentFileFromUrl(
      "/agents/onboarding.agent",
      "onboarding.agent"
    ).catch(err => {
      onboardingPayloadPromise = null
      throw err
    })
  }
  return onboardingPayloadPromise
}
