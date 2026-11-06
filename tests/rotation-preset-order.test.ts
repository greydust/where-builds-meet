// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"

import { rotationListStorageKey } from "@/application/persistence/keys"
import { loadRotationEntries } from "@/application/persistence/rotations"
import { defaultRotationEntries } from "@/application/rotationCatalog"

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

it("loads saved presets without copying them when their catalog order changes", () => {
  const saved = defaultRotationEntries.map(entry => {
    const rotation = { ...entry.rotation } as typeof entry.rotation & { order?: number }
    delete rotation.order
    return { ...entry, rotation }
  })
  localStorage.setItem(rotationListStorageKey, JSON.stringify(saved))
  const loaded = loadRotationEntries()
  expect(loaded.filter(entry => !entry.isDefault)).toEqual([])
  expect(loaded.map(entry => entry.id)).toEqual(defaultRotationEntries.map(entry => entry.id))
})
