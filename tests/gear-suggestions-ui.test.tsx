// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { GearEditor, itemToDraft } from "@/features/build/GearEditor"
import { GearSuggestions } from "@/features/build/GearSuggestions"
import { useBuildThroughputs } from "@/features/build/useBuildThroughputs"
import { affixOptionsForGearDefinition, gearData, type GearItem } from "@/gear"
import { retuneCandidates } from "@/gearRetuning"
import { t } from "@/i18n"

import { realGearSearchInput } from "./helpers/gearOptimizationScenarios"

vi.mock("@/features/build/useBuildThroughputs", () => ({ useBuildThroughputs: vi.fn<typeof useBuildThroughputs>() }))

const item: GearItem = {
  id: "edited",
  definitionId: "helmet",
  slot: "helmet",
  level: 100,
  rarity: "Gold",
  baseAffix: { key: "crit", value: 0.06 },
  additionalAffixes: [
    { key: "minPhys", value: 40 },
    { key: "maxPhys", value: 65 },
  ],
  turnedAffixIndex: 1,
}
const emptyOptions: string[] = []
let container: HTMLDivElement
let root: Root
let dpsByKey: Record<string, number>
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  dpsByKey = { "gear-suggestion-current": 100, "gear-suggestion-relay": 90, "gear-retune-1-maxStonesplit-max": 150 }
  vi.mocked(useBuildThroughputs).mockImplementation(({ targets }) =>
    Object.fromEntries(
      targets.map(target => {
        const dps = dpsByKey[target.key] ?? 110
        return [target.key, { dps, hps: 0, totalDamage: dps * 60 }]
      }),
    ),
  )
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

it("shows the recommended source and destination with all legal outcomes, and blocks relayed suggestions", async () => {
  const input = realGearSearchInput(0)
  const show = async (gear: GearItem) => {
    await act(async () =>
      root.render(
        <GearSuggestions
          draft={itemToDraft(gear)}
          definitionId="helmet"
          slot="helmet"
          build={input.build}
          gearItems={input.items}
          context={input.context}
          rotation={input.rotation}
        />,
      ),
    )
  }
  await show(item)
  expect(container.querySelectorAll("section")[1].querySelector("h4")?.textContent).toBe(
    t("ui.gearSuggestions.retuneAffix", { affix: "Max Physical Attack" }),
  )
  expect(container.querySelectorAll(".gear-retune-outcomes li")).toHaveLength(
    retuneCandidates(item, "stonesplitStrength").length,
  )
  expect(container.querySelector("section")?.textContent).toContain("-10.00")
  expect(container.querySelector("section")?.textContent).not.toContain("→")
  expect(container.querySelector("h3")).toBeNull()
  expect(container.querySelector(".gear-retune-outcomes")?.textContent).not.toContain("51.4")
  expect(container.querySelector(".gear-retune-outcomes")?.textContent).not.toContain("–")
  expect(container.querySelector(".gear-retune-outcomes")?.textContent).not.toContain("Max Physical Attack")
  await show({ ...item, relayed: true })
  expect(container.querySelectorAll(".gear-retune-outcomes li")).toHaveLength(0)
  expect(container.querySelectorAll("section")).toHaveLength(0)
  expect(container.textContent).toBe(t("ui.gearSuggestions.relayedLocked"))
  expect(vi.mocked(useBuildThroughputs).mock.lastCall?.[0].targets).toEqual([])
})

it.each([140, 110])(
  "does not recommend retuning when every outcome is below or equal to baseline %s",
  async baseline => {
    dpsByKey = { "gear-suggestion-current": 100, "gear-suggestion-relay": baseline }
    const input = realGearSearchInput(0)
    await act(async () =>
      root.render(
        <GearSuggestions
          draft={itemToDraft(item)}
          definitionId="helmet"
          slot="helmet"
          build={input.build}
          gearItems={input.items}
          context={input.context}
          rotation={input.rotation}
        />,
      ),
    )
    expect(container.querySelectorAll("section")[1].textContent).toContain(t("ui.gearSuggestions.noImprovement"))
    expect(container.querySelector("strong")).toBeNull()
    expect(container.querySelectorAll(".gear-retune-outcomes li")).toHaveLength(0)
  },
)

it.each([
  { current: 100, relay: 140, retune: 150, afterRelay: 160, delta: "+20.00", value: "48.316", relayed: true },
  { current: 140, relay: 100, retune: 150, afterRelay: 160, delta: "+20.00", value: "48.316", relayed: true },
  { current: 100, relay: 140, retune: 170, afterRelay: 160, delta: "+30.00", value: "51.4", relayed: false },
])("uses the better baseline and outcome: $current/$relay → $retune/$afterRelay", async scenario => {
  dpsByKey = {
    "gear-suggestion-current": scenario.current,
    "gear-suggestion-relay": scenario.relay,
    "gear-retune-1-maxStonesplit-max": scenario.retune,
    "gear-retune-1-maxStonesplit-relayed": scenario.afterRelay,
  }
  const input = realGearSearchInput(0)
  await act(async () =>
    root.render(
      <GearSuggestions
        draft={itemToDraft(item)}
        definitionId="helmet"
        slot="helmet"
        build={input.build}
        gearItems={input.items}
        context={input.context}
        rotation={input.rotation}
      />,
    ),
  )
  const heading = container.querySelectorAll("section")[1].querySelector("h4")!
  const message = scenario.relayed ? "ui.gearSuggestions.retuneThenRelay" : "ui.gearSuggestions.retuneAffix"
  expect(heading.textContent).toBe(t(message, { affix: "Max Physical Attack" }))
  const outcome = Array.from(container.querySelectorAll(".gear-retune-outcomes li")).find(row =>
    row.textContent?.includes("Max Stonesplit Attack"),
  )!
  expect(outcome.querySelector("span")?.textContent).toBe("Max Stonesplit Attack")
  expect(outcome.textContent).not.toContain(scenario.value)
  expect(outcome.textContent).not.toContain(t("ui.buildTab.relayedOptionLabel"))
  expect(outcome.textContent).toContain(scenario.delta)
  expect(outcome.querySelectorAll(".setup-delta-label")).toHaveLength(1)
})

it("allows only one Turn marker and clears it when its affix is removed", async () => {
  let draft = itemToDraft({ ...item, turnedAffixIndex: undefined })
  const definition = gearData.gear.helmet
  const render = () =>
    root.render(
      <GearEditor
        definition={definition}
        definitionId="helmet"
        definitionName={definition.name}
        editingExisting
        draft={draft}
        error=""
        baseAffixOptions={affixOptionsForGearDefinition(definition, "baseAffixes", draft.level)}
        additionalAffixOptions={affixOptionsForGearDefinition(definition, "additionalAffixes", draft.level)}
        attunementOptions={emptyOptions}
        selectedAdditionalKeys={new Set()}
        onDraftChange={next => {
          draft = typeof next === "function" ? next(draft) : next
          render()
        }}
        onImportSlot={vi.fn<() => void>()}
        onLevelChange={vi.fn<() => void>()}
        onRelayedChange={vi.fn<() => void>()}
        onCancel={vi.fn<() => void>()}
        onSave={vi.fn<() => void>()}
      />,
    )
  await act(async () => render())
  const checkboxes = () => container.querySelectorAll<HTMLInputElement>(".gear-turn-toggle input")
  await act(async () => checkboxes()[1].click())
  expect(draft.turnedAffixIndex).toBe(1)
  expect(checkboxes()[1].checked).toBe(true)
  expect(checkboxes()[0].disabled).toBe(true)
  await act(async () => {
    const select = container.querySelectorAll<HTMLSelectElement>(".gear-additional-row select")[1]
    select.value = ""
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(draft.turnedAffixIndex).toBeUndefined()
  expect(checkboxes()[0].disabled).toBe(false)
})

it("lists relay stat changes individually with the shared positive and negative colors", async () => {
  const input = realGearSearchInput(0)
  const highRolls: GearItem = {
    ...item,
    baseAffix: { key: "crit", value: 0.104 },
    additionalAffixes: [
      { key: "minPhys", value: 90.6 },
      { key: "maxPhys", value: 65 },
    ],
  }
  await act(async () =>
    root.render(
      <GearSuggestions
        draft={itemToDraft(highRolls)}
        definitionId="helmet"
        slot="helmet"
        build={input.build}
        gearItems={input.items}
        context={input.context}
        rotation={input.rotation}
      />,
    ),
  )
  const rows = container.querySelectorAll(".gear-relay-affixes li")
  expect(rows).toHaveLength(3)
  expect(rows[0].textContent).toBe("Critical-0.62%")
  expect(rows[1].textContent).toBe("Min Physical Attack-5.44")
  expect(rows[2].textContent).toBe("Max Physical Attack+20.16")
  expect(rows[0].querySelector(".damage-negative")).not.toBeNull()
  expect(rows[1].querySelector(".damage-negative")).not.toBeNull()
  expect(rows[2].querySelector(".damage-positive")).not.toBeNull()
})
