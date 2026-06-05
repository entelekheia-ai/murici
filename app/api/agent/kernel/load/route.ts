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
import { getKernel, resetKernel, buildKernelState } from "../_kernel"

export const runtime = "nodejs"

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { behaviorText } = await request.json()

    if (!behaviorText || typeof behaviorText !== "string") {
      return NextResponse.json(
        { error: "behaviorText must be a non-empty string" },
        { status: 400 }
      )
    }

    resetKernel()
    const kernel = await getKernel()

    let effects: any[] = []
    try {
      effects = kernel.load_behavior(behaviorText)
      if (!Array.isArray(effects)) {
        effects = [effects]
      }
    } catch (e: any) {
      console.error("Kernel load_behavior failed:", e)
      return NextResponse.json(
        { error: "Kernel failed to load behavior", details: e?.message },
        { status: 500 }
      )
    }

    const parseError = effects.find((e: any) => e?.type === "parse_error")

    if (parseError) {
      return NextResponse.json(
        {
          error: "Parse error",
          message: parseError.message,
          effects
        },
        { status: 400 }
      )
    }

    const state = buildKernelState(kernel, effects)
    return NextResponse.json(state)
  } catch (error: any) {
    console.error("Kernel load endpoint error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to load behavior" },
      { status: 500 }
    )
  }
}
