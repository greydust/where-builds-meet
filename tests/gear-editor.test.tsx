// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { capAndFilterGearDraft, GearEditor, newDraft } from "@/features/build/GearEditor"
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
