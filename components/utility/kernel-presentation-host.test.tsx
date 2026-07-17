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

import { act, cleanup, render } from "@testing-library/react"
import { KernelPresentationHost } from "./kernel-presentation-host"
import { useChannelStore } from "@/lib/store/channel-store"

function cssLinkIds(): string[] {
  return Array.from(
    document.querySelectorAll('link[id^="dot-agent-css:"]')
  ).map(link => link.id)
}

beforeEach(() => {
  document.head.innerHTML = ""
  useChannelStore.setState({
    viewedThreadId: null,
    channels: {},
    flowEvents: {},
    activeCss: {}
  })
})

afterEach(() => {
  cleanup()
})

describe("KernelPresentationHost", () => {
  it("renders nothing", () => {
    const { container } = render(<KernelPresentationHost />)
    expect(container).toBeEmptyDOMElement()
  })

  it("reconciles document.head to the viewed thread's desired CSS on mount", () => {
    act(() => {
      useChannelStore
        .getState()
        .ingestCssEffects("thread-a", [{ type: "apply_css", value: "theme.css" }])
      useChannelStore.setState({ viewedThreadId: "thread-a" })
    })

    render(<KernelPresentationHost />)

    expect(cssLinkIds()).toEqual(["dot-agent-css:theme.css"])
  })

  it("removes the theme when switching away from the thread that applied it — the leak this pipeline fixes", () => {
    act(() => {
      useChannelStore
        .getState()
        .ingestCssEffects("thread-onboarding", [
          { type: "apply_css", value: "theme.css" }
        ])
      useChannelStore.setState({ viewedThreadId: "thread-onboarding" })
    })
    render(<KernelPresentationHost />)
    expect(cssLinkIds()).toEqual(["dot-agent-css:theme.css"])

    act(() => {
      useChannelStore.setState({ viewedThreadId: "thread-other" })
    })

    expect(cssLinkIds()).toEqual([])
  })

  it("re-applies the theme when switching back to the thread that has it", () => {
    act(() => {
      useChannelStore
        .getState()
        .ingestCssEffects("thread-onboarding", [
          { type: "apply_css", value: "theme.css" }
        ])
      useChannelStore.setState({ viewedThreadId: "thread-other" })
    })
    render(<KernelPresentationHost />)
    expect(cssLinkIds()).toEqual([])

    act(() => {
      useChannelStore.setState({ viewedThreadId: "thread-onboarding" })
    })

    expect(cssLinkIds()).toEqual(["dot-agent-css:theme.css"])
  })

  it("does not leak a background thread's CSS while a different thread is viewed", () => {
    act(() => {
      useChannelStore.setState({ viewedThreadId: "thread-viewed" })
    })
    render(<KernelPresentationHost />)

    act(() => {
      useChannelStore
        .getState()
        .ingestCssEffects("thread-background", [
          { type: "apply_css", value: "theme.css" }
        ])
    })

    expect(cssLinkIds()).toEqual([])
  })
})
