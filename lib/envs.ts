/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { EnvKey } from "@/types/key-type"

// returns true if the key is found in the environment variables
export function isUsingEnvironmentKey(type: EnvKey) {
  return Boolean(process.env[type])
}
