// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"

import { rotationListStorageKey } from "@/application/persistence/keys"
import { initialRotationEditorState } from "@/application/persistence/rotations"
import {
  defaultRotationEntries,
  rotationEntriesForPreview,
  rotationRecordForEntry,
} from "@/application/rotationCatalog"
import { useRotationStore } from "@/stores/rotationStore"

const retiredInPreview = [
  "mixed-dummy-1-min-double-stab",
  "mixed-dummy-infinite-vitality-1-min",
  "mixed-dummy-smolder-poet-1-min",
]
const previewId = "cn-2.8.5" // A persisted selection from before promotion.

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useRotationStore.getState().initialise("stonesplitStrength")
})

it.each(retiredInPreview)("resolves retired preset %s to Mixed after promotion", id => {
  expect(initialRotationEditorState(false, id, ["snowparting", "phalanxbane"]).activeId).toBe("mixed-dummy-1-min")
})

it("keeps custom rotations and their persisted contents independent of preset overlays", () => {
  const store = useRotationStore.getState()
  store.initialise("stonesplitStrength", previewId)
  const source = defaultRotationEntries.find(entry => entry.id === "mixed-dummy-1-min")!
  const custom = {
    ...source,
    id: "custom-strength",
    isDefault: false,
    rotation: { ...source.rotation, name: "My Strength" },
  }
  store.updateEntries(entries => [...entries, custom])
  const saved = localStorage.getItem(rotationListStorageKey)
  expect(JSON.parse(saved!).map((entry: { id: string }) => entry.id)).toEqual([custom.id])
  store.setPreview(null)
  store.setPreview(previewId)
  expect(useRotationStore.getState().entries.find(entry => entry.id === custom.id)).toEqual(custom)
  expect(rotationRecordForEntry(custom, previewId)).toBe(custom.rotation)
  store.persistEntries()
  expect(localStorage.getItem(rotationListStorageKey)).toBe(saved)
  expect(rotationEntriesForPreview(defaultRotationEntries, null)).toBe(defaultRotationEntries)
})
