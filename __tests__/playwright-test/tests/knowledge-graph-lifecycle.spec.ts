// SPDX-License-Identifier: Apache-2.0

import type { Page } from "@playwright/test"
import { expect, test } from "../fixtures"

// The cerrado graph's lifecycle on a real WebGPU device: each unmount releases
// its device, and a device lost under the engine hands the graph to the
// vis-network fallback. Chromium only, with the flags cerrado's own GPU tests
// launch it with; skipped where the machine has no adapter.
test.use({
  launchOptions: {
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan,WebGPU",
      "--use-angle=metal"
    ]
  }
})

// Counts GPU devices as the page creates and destroys them, and keeps every one
// so a test can destroy the live one from outside the engine.
const INSTRUMENT = `(() => {
  const w = window
  w.__gpu = { live: 0, created: 0, devices: [] }
  if (!("GPUAdapter" in w)) return
  const request = GPUAdapter.prototype.requestDevice
  GPUAdapter.prototype.requestDevice = async function (...args) {
    const device = await request.apply(this, args)
    w.__gpu.live++
    w.__gpu.created++
    const entry = { device, gone: false }
    w.__gpu.devices.push(entry)
    const destroy = device.destroy.bind(device)
    device.destroy = () => {
      if (!entry.gone) { entry.gone = true; w.__gpu.live-- }
      destroy()
    }
    return device
  }
})()`

async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("entelekheia")
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const now = new Date().toISOString()
    const put = (store: string, values: object[]) =>
      new Promise<void>((res, rej) => {
        const tx = db.transaction(store, "readwrite")
        for (const v of values) tx.objectStore(store).put(v)
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
    await put("knowledge", [
      {
        id: "k1",
        nodeType: "document",
        originConversationId: "c1",
        messageId: "m",
        sourcePromptMessageId: null,
        title: "Itinerary",
        summary: null,
        outputType: "GeneralContent",
        payload: { language: "md", content: "x" },
        derivedFrom: [],
        agentRuns: [],
        createdAt: now
      }
    ])
  })
}

async function cerradoReady(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } })
      .gpu
    return gpu ? (await gpu.requestAdapter()) !== null : false
  })
}

const liveDevices = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __gpu: { live: number } }).__gpu.live
  )

test.describe("knowledge graph on cerrado", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "WebGPU flags are Chromium's"
  )

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INSTRUMENT)
    await page.goto("/local/graph")
    await seed(page)
    test.skip(!(await cerradoReady(page)), "no WebGPU adapter on this machine")
    await page.reload()
    await expect(
      page.getByRole("button", { name: "Agent", exact: true })
    ).toBeEnabled({ timeout: 30_000 })
  })

  test("leaves one live GPU device after mounting the graph ten times", async ({
    page
  }) => {
    for (let i = 0; i < 10; i++) {
      await page.getByRole("button", { name: "List", exact: true }).click()
      await page.getByRole("button", { name: "Graph", exact: true }).click()
      await expect(
        page.getByRole("button", { name: "Agent", exact: true })
      ).toBeEnabled({ timeout: 30_000 })
    }
    // A mount cancelled mid-init releases its device when its own init settles, so wait for it.
    await expect.poll(() => liveDevices(page)).toBe(1)
  })

  test("falls back to vis-network when the GPU device is lost", async ({
    page
  }) => {
    await expect(page.locator(".vis-network")).toHaveCount(0)
    // The device the drawn engine holds is the one not yet destroyed (a StrictMode
    // double mount may have created and released another before it).
    await page.evaluate(() => {
      const { devices } = (
        window as unknown as {
          __gpu: { devices: { device: { destroy(): void }; gone: boolean }[] }
        }
      ).__gpu
      for (const e of devices) if (!e.gone) e.device.destroy()
    })
    await expect(page.locator(".vis-network")).toHaveCount(1, {
      timeout: 15_000
    })
    await expect.poll(() => liveDevices(page)).toBe(0)
  })
})
