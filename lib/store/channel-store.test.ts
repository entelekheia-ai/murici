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

import { useChannelStore, selectViewedActiveCss } from "./channel-store"
import { Effect } from "@/types/kernel-effect"

function applyCss(value: string): Effect {
  return { type: "apply_css", value }
}

function removeCss(value: string): Effect {
  return { type: "remove_css", value }
}

beforeEach(() => {
  useChannelStore.setState({
    viewedThreadId: null,
    channels: {},
    flowEvents: {},
    activeCss: {}
  })
})

describe("ingestCssEffects", () => {
  it("creates the thread's activeCss entry from apply_css effects", () => {
    useChannelStore.getState().ingestCssEffects("thread-a", [applyCss("theme.css")])
    expect(useChannelStore.getState().activeCss["thread-a"]).toEqual(["theme.css"])
  })

  it("does not touch other threads' entries", () => {
    useChannelStore.getState().ingestCssEffects("thread-a", [applyCss("theme.css")])
    useChannelStore.getState().ingestCssEffects("thread-b", [applyCss("other.css")])
    expect(useChannelStore.getState().activeCss["thread-a"]).toEqual(["theme.css"])
    expect(useChannelStore.getState().activeCss["thread-b"]).toEqual(["other.css"])
  })

  it("removes a value via remove_css", () => {
    useChannelStore.getState().ingestCssEffects("thread-a", [applyCss("theme.css")])
    useChannelStore.getState().ingestCssEffects("thread-a", [removeCss("theme.css")])
    expect(useChannelStore.getState().activeCss["thread-a"]).toEqual([])
  })

  it("is a no-op on the top-level state object when the fold produces no change", () => {
    useChannelStore.getState().ingestCssEffects("thread-a", [applyCss("theme.css")])
    const stateBefore = useChannelStore.getState()

    // Re-applying the same value is a no-op fold (foldCssEffects returns the
    // same array reference), so ingestCssEffects must skip the state update
    // entirely — this is what keeps a background thread's repeated effects
    // from spuriously re-rendering subscribers of unrelated store slices.
    useChannelStore.getState().ingestCssEffects("thread-a", [applyCss("theme.css")])
    expect(useChannelStore.getState()).toBe(stateBefore)
  })

  it("ingests effects for a thread that is in the background (not the viewed thread)", () => {
    useChannelStore.setState({ viewedThreadId: "thread-viewed" })
    useChannelStore.getState().ingestCssEffects("thread-background", [applyCss("theme.css")])
    expect(useChannelStore.getState().activeCss["thread-background"]).toEqual(["theme.css"])
    expect(useChannelStore.getState().activeCss["thread-viewed"]).toBeUndefined()
  })
})

describe("dropChannel", () => {
  it("clears the channel runtime state", () => {
    useChannelStore.getState().patchChannel("thread-a", { status: "streaming" })
    useChannelStore.getState().dropChannel("thread-a")
    expect(useChannelStore.getState().channels["thread-a"]).toBeUndefined()
  })

  it("does NOT clear the thread's activeCss entry — a background chat's ChatChannel unmounts (and disposes/drops) the moment its reply finishes and it isn't viewed, which is exactly the off-screen scenario the pipeline exists for; wiping activeCss here would erase an agent's theme before the user ever switched back to see it", () => {
    useChannelStore.getState().patchChannel("thread-a", { status: "streaming" })
    useChannelStore.getState().ingestCssEffects("thread-a", [applyCss("theme.css")])

    useChannelStore.getState().dropChannel("thread-a")

    expect(useChannelStore.getState().activeCss["thread-a"]).toEqual(["theme.css"])
  })

  it("is a no-op when the thread has no channel entry", () => {
    const stateBefore = useChannelStore.getState()
    useChannelStore.getState().dropChannel("thread-never-existed")
    expect(useChannelStore.getState()).toBe(stateBefore)
  })
})

describe("selectViewedActiveCss", () => {
  it("returns an empty array when there is no viewed thread", () => {
    expect(selectViewedActiveCss(useChannelStore.getState())).toEqual([])
  })

  it("returns an empty array when the viewed thread has no CSS entry", () => {
    useChannelStore.setState({ viewedThreadId: "thread-a" })
    expect(selectViewedActiveCss(useChannelStore.getState())).toEqual([])
  })

  it("returns the viewed thread's desired CSS set", () => {
    useChannelStore.getState().ingestCssEffects("thread-a", [applyCss("theme.css")])
    useChannelStore.setState({ viewedThreadId: "thread-a" })
    expect(selectViewedActiveCss(useChannelStore.getState())).toEqual(["theme.css"])
  })

  it("does not leak a background thread's CSS into the viewed selector", () => {
    useChannelStore.getState().ingestCssEffects("thread-background", [applyCss("theme.css")])
    useChannelStore.setState({ viewedThreadId: "thread-viewed" })
    expect(selectViewedActiveCss(useChannelStore.getState())).toEqual([])
  })
})
