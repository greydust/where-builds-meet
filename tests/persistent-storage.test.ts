import { beforeEach, describe, expect, it } from "vitest"

import {
  getPersistentItem,
  migrateSessionStorage,
  removePersistentItem,
  setPersistentItem,
} from "../src/persistentStorage"
import { windowWithStorage } from "./helpers/domStubs"

// Ported from script/probe/check-persistent-storage.mjs: the probe's
// MemoryStorage stand-ins become plain Maps behind the Storage interface.
class MemoryStorage implements Storage {
  #values = new Map<string, string>()

  get length() {
    return this.#values.size
  }

  clear() {
    this.#values.clear()
  }

  getItem(key: string) {
    return this.#values.get(String(key)) ?? null
  }

  key(index: number) {
    return [...this.#values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.#values.delete(String(key))
  }

  setItem(key: string, value: string) {
    this.#values.set(String(key), String(value))
  }
}

describe("persistent storage migration", () => {
  let localStorage: MemoryStorage
  let firstTabStorage: MemoryStorage

  beforeEach(() => {
    localStorage = new MemoryStorage()
    firstTabStorage = new MemoryStorage()
    globalThis.window = windowWithStorage({ localStorage, sessionStorage: firstTabStorage })
  })

  it("migrates a legacy session value to local storage on read", () => {
    firstTabStorage.setItem("legacy", "rotation-data")

    expect(getPersistentItem("legacy")).toBe("rotation-data")
    expect(localStorage.getItem("legacy")).toBe("rotation-data")
    expect(firstTabStorage.getItem("legacy")).toBeNull()
  })

  it("eagerly migrates only application-owned session values at startup", () => {
    firstTabStorage.setItem("wwm-locale", "zh-Hant")
    firstTabStorage.setItem("eager-a", "a")

    migrateSessionStorage()

    expect(localStorage.getItem("wwm-locale")).toBe("zh-Hant")
    expect(localStorage.getItem("eager-a")).toBeNull()
    expect(firstTabStorage.getItem("eager-a")).toBe("a")
  })

  it("prefers durable data over a stale session copy", () => {
    firstTabStorage.setItem("precedence", "stale-session-data")
    localStorage.setItem("precedence", "durable-data")

    expect(getPersistentItem("precedence")).toBe("durable-data")
    expect(firstTabStorage.getItem("precedence")).toBeNull()
  })

  it("shares migrated data across tabs and writes new values durably", () => {
    firstTabStorage.setItem("legacy", "rotation-data")
    expect(getPersistentItem("legacy")).toBe("rotation-data")

    const secondTabStorage = new MemoryStorage()
    globalThis.window.sessionStorage = secondTabStorage
    expect(getPersistentItem("legacy")).toBe("rotation-data")

    setPersistentItem("saved", "value")
    expect(localStorage.getItem("saved")).toBe("value")
    expect(secondTabStorage.getItem("saved")).toBeNull()

    secondTabStorage.setItem("saved", "old-value")
    removePersistentItem("saved")
    expect(localStorage.getItem("saved")).toBeNull()
    expect(secondTabStorage.getItem("saved")).toBeNull()
  })
})
