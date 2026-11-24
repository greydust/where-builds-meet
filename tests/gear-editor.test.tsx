// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  capAndFilterGearDraft,
  capGearDraft,
  GearEditor,
  newDraft,
  normalizeDraftValue,
  savedValueToDraft,
} from "@/features/build/GearEditor"
import { affixOptionsForGearDefinition, attunementsForGearDefinition, gearData } from "@/gear"

describe("GearEditor", () => {
  type GearEditorProps = Parameters<typeof GearEditor>[0]
  let container: HTMLDivElement
  let root: Root

  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it.each([
    ["body", 123.45678912345679, "123.45679", 123.45679],
    ["allMysticDmgBoost", 0.12345678912345678, "12.34568", 0.1234568],
    ["allMysticDmgBoost", 0.30000000000000004, "30", 0.3],
  ])("rounds a %s roll of %s to five decimals in editor units", (key, value, input, stored) => {
    const draft = savedValueToDraft({ key, value }, gearData.affixes)
    expect(draft.value).toBe(input)
    expect(normalizeDraftValue(draft, gearData.affixes)?.value).toBe(stored)
  })

  it.each(["12.345678912345678", "1.2345678912345678e1"])(
    "rounds an edited percentage of %s before converting it to a stored ratio",
    value => {
      const key = "allMysticDmgBoost"
      expect(normalizeDraftValue({ key, value }, gearData.affixes)?.value).toBe(0.1234568)
    },
  )

  it("cleans up floating-point tails when relaying a roll", () => {
    const draft = newDraft()
    draft.baseAffix = { key: "maxPhys", value: "100" }
    const relayed = capGearDraft(draft, true)
    expect(relayed.baseAffix.value).toBe("85.164")
    expect(normalizeDraftValue(relayed.baseAffix, gearData.affixes)?.value).toBe(85.164)
  })

  it.each(["areaMysticDmgBoost", "singleTargetMysticDmgBoost"])("converts %s when changing to tier 100", key => {
    const draft = newDraft(96)
    draft.additionalAffixes[0] = { key, value: "9.8" }
    const converted = capAndFilterGearDraft({ ...draft, level: 100 }, gearData.gear.helmet)
    expect(converted.additionalAffixes[0]).toEqual({ key: "allMysticDmgBoost", value: "9.8" })
    expect(newDraft().level).toBe(100)
  })

  it.each(["", "body", "defense", "maxHp", "physicalDefense"])(
    "keeps defensive %s rolls without offering defensive choices",
    async key => {
      const [definitionId, definition] = Object.entries(gearData.gear)[0]
      const draft = newDraft()
      if (key) draft.additionalAffixes[0] = { key, value: "35" }

      await act(async () => {
        root.render(
          <GearEditor
            definition={definition}
            definitionId={definitionId}
            definitionName={definition.name}
            editingExisting={false}
            draft={draft}
            error=""
            baseAffixOptions={affixOptionsForGearDefinition(definition, "baseAffixes", draft.level)}
            additionalAffixOptions={affixOptionsForGearDefinition(definition, "additionalAffixes", draft.level)}
            attunementOptions={attunementsForGearDefinition(definition)}
            selectedAdditionalKeys={new Set()}
            onDraftChange={vi.fn<GearEditorProps["onDraftChange"]>()}
            onImportSlot={vi.fn<GearEditorProps["onImportSlot"]>()}
            onLevelChange={vi.fn<GearEditorProps["onLevelChange"]>()}
            onRelayedChange={vi.fn<GearEditorProps["onRelayedChange"]>()}
            onCancel={vi.fn<GearEditorProps["onCancel"]>()}
            onSave={vi.fn<GearEditorProps["onSave"]>()}
          />,
        )
      })

      const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]'))
      expect(inputs).toHaveLength(6)
      expect(inputs[0]?.getAttribute("aria-invalid")).toBe("true")
      expect(inputs.slice(1).every(input => !input.hasAttribute("aria-invalid"))).toBe(true)
      for (const defensiveKey of ["body", "defense", "maxHp", "physicalDefense"]) {
        const options = Array.from(container.querySelectorAll<HTMLOptionElement>(`option[value="${defensiveKey}"]`))
        expect(options).toHaveLength(defensiveKey === key ? 1 : 0)
        expect(options.every(option => option.disabled && option.selected)).toBe(true)
      }
      expect(capAndFilterGearDraft(draft, definition).additionalAffixes[0]).toEqual(draft.additionalAffixes[0])
      expect(inputs[1]?.value).toBe(draft.additionalAffixes[0].value)
    },
  )
})
