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

import { NextRequest, NextResponse } from "next/server"
import { getKernel, buildKernelState } from "../_kernel"

export const runtime = "nodejs"

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const kernel = await getKernel()
    const effects = kernel.send_offtopic()

    const state = buildKernelState(kernel, effects)
    return NextResponse.json(state)
  } catch (error: any) {
    console.error("Kernel offtopic error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to send offtopic" },
      { status: 500 }
    )
  }
}
