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

import { test as base, expect } from "@playwright/test"

/*
 * A crash like the message.tsx "image_paths is undefined" TypeError doesn't
 * always surface as a visible toast/alert — it can just fail silently in
 * the console while the rest of the page keeps looking fine. Specs that
 * only assert "no error toast visible" (as the tool-call spec used to)
 * won't catch that. Import `test`/`expect` from here instead of
 * `@playwright/test` directly to auto-fail on any uncaught page exception
 * or console.error during the test.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = []

    page.on("pageerror", error => {
      errors.push(`pageerror: ${error.message}`)
    })
    page.on("console", msg => {
      if (msg.type() === "error") {
        errors.push(`console.error: ${msg.text()}`)
      }
    })

    await use(page)

    if (errors.length > 0) {
      throw new Error(`Uncaught frontend errors during test:\n${errors.join("\n")}`)
    }
  }
})

export { expect }
