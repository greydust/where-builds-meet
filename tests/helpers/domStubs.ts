import assert from "node:assert/strict"

/**
 * Stand-ins for the browser globals a spec drives directly.
 *
 * A full `Window` or `Document` is not buildable by hand in a spec and the app
 * reads only a few members off each, so these name the members a spec needs and
 * leave the rest to the cast at the boundary.
 */
export function windowWithStorage(storage: {
  localStorage: Storage
  sessionStorage: Storage
}): Window & typeof globalThis {
  return { localStorage: storage.localStorage, sessionStorage: storage.sessionStorage } as unknown as Window &
    typeof globalThis
}

/**
 * A window whose storage is whatever `globalThis` currently holds.
 *
 * A spec that walks a spec through several migrations re-points the globals
 * between phases, so the window has to track them rather than capture one value.
 */
export function windowOverGlobalStorage(): Window & typeof globalThis {
  return {
    get localStorage() {
      return globalThis.localStorage
    },
    get sessionStorage() {
      return globalThis.sessionStorage
    },
  } as unknown as Window & typeof globalThis
}

/**
 * Storage that only reads. The persistence specs seed a value and let the app
 * read it back, so the write half is never exercised and is left inert.
 */
export function readOnlyStorage(read: (key: string) => string | null): Storage {
  const inert: Storage = {
    get length() {
      return 0
    },
    key: () => null,
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  }
  return { ...inert, getItem: read } as Storage
}

/**
 * Storage backed by a map, for a spec that seeds, rewrites and removes keys.
 *
 * A spec that walks a value through several migrations has to write it, remove it
 * again to prove a later read misses, and write a different value in its place, so
 * this keeps the whole `Storage` surface rather than only the reads.
 */
export function writableStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
  }
}

/** The URL a `fetch` or `Request` input names, however it was spelled. */
export function urlOf(input: RequestInfo | URL): string {
  if (input instanceof URL) return input.href
  if (typeof input === "string") return input
  return input.url
}

/**
 * A window carrying the timers, location and events a browser-lifecycle spec
 * drives. The interval callback is recorded rather than scheduled, so the spec
 * decides when the app's periodic check runs.
 */
export function windowWithLifecycle(options: { href: string; onNavigate: (url: string) => void; intervalMs: number }): {
  window: Window & typeof globalThis
  events: EventTarget
  /** Run the app's recorded periodic check, awaiting it when it is async. */
  runPeriodicCheck: () => unknown
  /** Whether the app still holds a live interval callback. */
  hasPeriodicCheck: () => boolean
  /** Restore the real globals the spec replaced. */
  restore: () => void
} {
  const events = new EventTarget()
  // The app's poll is async, so the recorded callback's result is what a spec awaits.
  let periodicCheck: (() => unknown) | undefined
  const navigations: string[] = []
  const { href } = new URL(options.href)
  const win = Object.assign(events, {
    location: {
      origin: new URL(href).origin,
      href,
      replace: (url: string) => {
        navigations.push(url)
        options.onNavigate(url)
      },
    },
    setInterval: (callback: () => unknown, delay: number) => {
      assert.equal(delay, options.intervalMs, "The deployment poll must run on its configured interval.")
      periodicCheck = callback
      return 1
    },
    clearInterval: () => {
      periodicCheck = undefined
    },
  }) as unknown as Window & typeof globalThis
  const originalWindow = globalThis.window
  globalThis.window = win
  return {
    window: win,
    events,
    runPeriodicCheck: () => {
      assert(periodicCheck, "Expected the app to have registered its periodic check.")
      return periodicCheck()
    },
    hasPeriodicCheck: () => periodicCheck !== undefined,
    restore: () => {
      if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window")
      else globalThis.window = originalWindow
    },
  }
}

/**
 * A document whose visibility a spec toggles.
 *
 * `Document.visibilityState` is readonly on the real type, so the spec assigns
 * through this holder rather than fighting the declaration.
 */
export function documentWithVisibility(initial: DocumentVisibilityState = "visible"): {
  document: Document
  events: EventTarget
  setVisibility: (state: DocumentVisibilityState) => void
  restore: () => void
} {
  const events = new EventTarget()
  const holder = { visibilityState: initial }
  // Defined rather than assigned: `Object.assign` reads a getter and copies the
  // value it returns, which would freeze visibility at its initial state and make
  // `setVisibility` inert.
  const doc = Object.defineProperty(events, "visibilityState", {
    get: () => holder.visibilityState,
    configurable: true,
  }) as unknown as Document
  const originalDocument = globalThis.document
  globalThis.document = doc
  return {
    document: doc,
    events,
    setVisibility: state => {
      holder.visibilityState = state
    },
    restore: () => {
      if (originalDocument === undefined) Reflect.deleteProperty(globalThis, "document")
      else globalThis.document = originalDocument
    },
  }
}
