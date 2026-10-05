// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useInViewport } from "@/features/build/useInViewport"

/**
 * The gear inventory bounds its measuring by what a reader can see, and this is the mechanism that
 * decides what that is. It is load-bearing twice over: if it reports a card as on screen when it is
 * not, a slot costs the whole inventory to open, and if it never reports one, the deltas never
 * appear at all. Both failures are invisible in the numbers, so they are pinned here.
 */

/** Reports whatever the test says, standing in for the browser's own observer. */
class ControllableObserver implements IntersectionObserver {
  readonly targets = new Set<Element>()
  disconnected = false
  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    ControllableObserver.instances.push(this)
  }

  static instances: ControllableObserver[] = []

  /** The observer watching the card, which is the only one a single card ever opens. */
  static get latest() {
    return ControllableObserver.instances[ControllableObserver.instances.length - 1]
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.disconnected = true
    this.targets.clear()
  }

  takeRecords() {
    return []
  }

  readonly root = null
  readonly rootMargin = ""
  readonly scrollMargin = ""
  readonly thresholds = []

  /** The browser telling the card it has entered or left the screen. */
  show(isIntersecting: boolean) {
    this.callback(
      [...this.targets].map(target => ({ target, isIntersecting }) as IntersectionObserverEntry),
      this,
    )
  }
}

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  ControllableObserver.instances = []
  vi.stubGlobal("IntersectionObserver", ControllableObserver)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

/** A stand-in for one gear card, reporting what the hook says it can see. */
function Card(props: { observing: boolean; publish: (visible: boolean) => void }) {
  const { ref, visible } = useInViewport<HTMLDivElement>(props.observing)
  // Published through a prop rather than assigned to a module variable, which the react-hooks rules
  // reject as writing to something the hook does not own.
  props.publish(visible)
  return createElement("div", { ref, "data-testid": "card" })
}

/** What the card reported on its last render. */
let sawVisible: boolean | undefined

const card = (observing: boolean) =>
  createElement(Card, { observing, publish: (visible: boolean) => (sawVisible = visible) })

async function mount(observing: boolean) {
  await act(async () => root.render(card(observing)))
  // The observer exists by the time the effect has run and the element has been given to it.
  await act(async () => {})
  return ControllableObserver.latest
}

describe("a card reporting whether it is on screen", () => {
  it("says it cannot be seen until the browser says otherwise", async () => {
    await mount(true)
    // Assuming visibility would make every candidate in a slot measure on open, which is exactly
    // the bound the viewport is there to provide.
    expect(sawVisible).toBe(false)
  })

  it("reports a card that has entered the screen", async () => {
    const observer = await mount(true)
    await act(async () => observer!.show(true))
    expect(sawVisible).toBe(true)
  })

  it("reports a card that has left the screen, so it stops being asked about", async () => {
    const observer = await mount(true)
    await act(async () => observer!.show(true))
    expect(sawVisible).toBe(true)

    await act(async () => observer!.show(false))
    // Scrolling past a card is what keeps a large inventory affordable.
    expect(sawVisible).toBe(false)
  })

  it("stops observing a card that is taken away, rather than watching a detached node", async () => {
    const observer = await mount(true)
    await act(async () => observer!.show(true))

    await act(async () => root.render(createElement("div")))
    // A leaked observer keeps reporting for a card that is gone, which would resurrect a candidate
    // nobody is looking at.
    expect(observer!.disconnected).toBe(true)
  })
})

describe("a card that is not observing", () => {
  it("never claims to be on screen, since nothing is watching it", async () => {
    await mount(false)
    // The equipped card is the reference everything else is weighed against; it has nothing to ask
    // for, so it must not hold an observer open or report itself as a candidate.
    expect(sawVisible).toBe(false)
    expect(ControllableObserver.latest).toBeUndefined()
  })

  it("does not claim visibility it had before it stopped observing", async () => {
    const observer = await mount(true)
    await act(async () => observer!.show(true))
    expect(sawVisible).toBe(true)

    await act(async () => root.render(card(false)))
    // Derived rather than remembered: a card that stopped observing is not known to be on screen,
    // and reporting otherwise would ask for a measurement the viewport can no longer vouch for.
    expect(sawVisible).toBe(false)
  })
})

describe("a browser with no intersection observer", () => {
  it("measures rather than never measuring", async () => {
    vi.stubGlobal("IntersectionObserver", undefined)
    await act(async () => root.render(card(true)))

    // With nothing to wait for, silence is not evidence of absence. Refusing to measure would leave
    // every delta permanently blank, which is a worse failure than a larger bill.
    expect(sawVisible).toBe(true)
  })
})
