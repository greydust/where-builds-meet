// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AvailableGearCard, EquippedGearCard } from "@/features/build/GearCard"
import { buildPresetInventory, defaultBuildPresets, type GearItem } from "@/gear"
import { initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"

/**
 * A gear card offers three actions, and the two that destroy things are one click away from a
 * mistake that loses the reader's work. These pin what the card says about the state it is in, since
 * the states are told apart by wording rather than by layout: the equip action is the reference
 * point, and the delete action is the one whose second step has no label left to change.
 */

const preset = defaultBuildPresets[0]
const inventory = buildPresetInventory(preset)
const worn = inventory.items.find(item => item.id === inventory.equipped.helmet)!

const spare: GearItem = {
  ...worn,
  id: "spare-helmet",
  relayed: true,
  baseAffix: { ...worn.baseAffix, value: worn.baseAffix.value * 1.5 },
}

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(async () => {
  globalThis.fetch = (async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
    text: async () => "{}",
  })) as typeof fetch
  await initializeI18n()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

const card = (props: Partial<Parameters<typeof AvailableGearCard>[0]> = {}) =>
  act(async () =>
    root.render(
      <AvailableGearCard
        item={spare}
        name="Helmet"
        equipped={false}
        usageCount={0}
        onEquip={vi.fn<() => void>()}
        onEdit={vi.fn<() => void>()}
        onDelete={vi.fn<() => void>()}
        deleting={false}
        {...props}
        onRename={props.onRename ?? vi.fn<() => void>()}
        onDuplicate={props.onDuplicate ?? vi.fn<() => void>()}
      />,
    ),
  )

/** Every action on the card, by the label a reader or a screen reader reaches it by. */
async function actions() {
  return [...container.querySelectorAll("button")].map(button => ({
    label: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "",
    disabled: button.disabled,
  }))
}

describe("a candidate in the inventory", () => {
  it("offers equipping it, which is the thing a reader came to do", async () => {
    await card()
    const equip = (await actions()).find(action => !action.disabled)
    expect(equip?.label).toBe("Equip")
  })

  it("says the item is already equipped rather than offering to equip it again", async () => {
    // Clicking Equip on the item already in the slot is a no-op the game would perform, so the
    // action is withdrawn and the state is stated instead.
    await card({ equipped: true })
    const shown = await actions()
    expect(shown.map(action => action.label)).toContain("Equipped")

    // Withdrawn means withdrawn: the control that equips must not merely be relabelled and left
    // clickable, which is a control that looks inert and is not.
    const equip = shown.find(action => action.label === "Equipped")
    expect(equip?.disabled).toBe(true)
    // And no action anywhere on the card is the equip action in disguise.
    expect(shown.some(action => action.label === "Equip")).toBe(false)
  })

  it("keeps the destructive action out of reach of a single click", async () => {
    // The card is controlled, so arming lives in the parent that owns the build, and the card's own
    // contribution is that it asks rather than acting. The parent is modelled here because the
    // guarantee under test is the two clicks in sequence, not the card in isolation.
    const deleted = vi.fn<() => void>()
    let armed = false

    function Owner(props: { publish: (isArmed: boolean) => void }) {
      const [isArmed, setArmed] = useState(false)
      // Published through a prop rather than assigned to a module variable, which the react-hooks
      // rules reject as writing to something the component does not own.
      props.publish(isArmed)
      return (
        <AvailableGearCard
          item={spare}
          name="Helmet"
          equipped={false}
          usageCount={0}
          onEquip={vi.fn<() => void>()}
          onEdit={vi.fn<() => void>()}
          onRename={vi.fn<() => void>()}
          onDuplicate={vi.fn<() => void>()}
          onDelete={() => {
            if (!isArmed) {
              setArmed(true)
              return
            }
            deleted()
          }}
          deleting={isArmed}
        />
      )
    }

    const clickLabelled = (label: string) =>
      act(async () => {
        const button = [...container.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === label)
        expect(button, `no action labelled ${label}`).toBeDefined()
        await button!.click()
      })

    await act(async () => root.render(<Owner publish={(isArmed: boolean) => (armed = isArmed)} />))
    expect(armed).toBe(false)

    await clickLabelled("Delete gear")
    // The first click arms the confirmation and destroys nothing.
    expect(armed).toBe(true)
    expect(deleted).not.toHaveBeenCalled()

    await clickLabelled("Confirm delete gear")
    // Only the second click, and only under a label that says what it does.
    expect(deleted).toHaveBeenCalledTimes(1)
  })

  it("labels the armed delete as a confirmation rather than as the action it repeats", async () => {
    await card({ deleting: true })
    // The armed step is an icon with no label of its own to change, so the label and the title are
    // the only thing telling a reader the next click destroys the item.
    const armed = container.querySelector<HTMLButtonElement>('[aria-label="Confirm delete gear"]')
    expect(armed).not.toBeNull()
    expect(armed?.getAttribute("title")).toBe("Confirm delete gear")
    expect(container.querySelector('[aria-label="Delete gear"]')).toBeNull()
  })

  it("asks to be measured only when it is a candidate, never when it is the reference", async () => {
    // The equipped card is what every other card is read against, so measuring it as a candidate of
    // itself would spend a whole rotation to learn the difference between a reading and itself.
    // The stub never reports an intersection, so anything claiming to be on screen is claiming it
    // without having been observed.
    const neverIntersecting = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }
    vi.stubGlobal("IntersectionObserver", neverIntersecting)

    const equipped = vi.fn<(visible: boolean) => void>()
    await card({ equipped: true, onVisibilityChange: equipped })
    expect(equipped).not.toHaveBeenCalledWith(true)

    const candidate = vi.fn<(visible: boolean) => void>()
    await card({ onVisibilityChange: candidate })
    expect(candidate).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})

describe("a slot in the equipped grid", () => {
  it("is a single control that opens the slot's inventory", async () => {
    const onSelect = vi.fn<() => void>()
    await act(async () =>
      root.render(
        <EquippedGearCard
          slot="helmet"
          slotLabel="Helmet"
          item={worn}
          name="Helmet"
          selected={false}
          disabled={false}
          onSelect={onSelect}
        />,
      ),
    )

    // The whole card is the target, so it carries no actions of its own to be reached first.
    const buttons = container.querySelectorAll("button")
    expect(buttons).toHaveLength(1)
    await act(async () => buttons[0].click())
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it("cannot be opened on a build whose gear is the game's rather than the reader's", async () => {
    const onSelect = vi.fn<() => void>()
    await act(async () =>
      root.render(
        <EquippedGearCard
          slot="helmet"
          slotLabel="Helmet"
          item={worn}
          name="Helmet"
          selected={false}
          disabled
          onSelect={onSelect}
        />,
      ),
    )

    // A preset's slots hold no alternatives to shop, so the control is withdrawn rather than
    // opening an inventory that could not be used.
    expect(container.querySelector("button")?.disabled).toBe(true)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("marks the slot the reader is shopping", async () => {
    await act(async () =>
      root.render(
        <EquippedGearCard
          slot="helmet"
          slotLabel="Helmet"
          item={worn}
          name="Helmet"
          selected
          disabled={false}
          onSelect={vi.fn<() => void>()}
        />,
      ),
    )
    expect(container.querySelector(".gear-card--selected")).not.toBeNull()
  })
})
