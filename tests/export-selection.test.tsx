// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import { ExportSelection, TransferSelectionDialog } from "@/features/transfer/ExportSelection"

vi.mock("@/i18n", () => ({ t: (key: string) => key }))
vi.mock("@/ui/Dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <dialog open>{children}</dialog>,
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const items = [
  { id: "build-a", name: "First build", detail: "First path" },
  { id: "build-b", name: "Second build", detail: "Second path" },
]

const groupedItems = [
  { id: "umbra-a", name: "Build c", detail: "", group: "Umbra", groupOrder: 1 },
  { id: "splendor-a", name: "Build a", detail: "", group: "Splendor", groupOrder: 0 },
  { id: "splendor-b", name: "Build b", detail: "", group: "Splendor", groupOrder: 0 },
]

it("exports checked entries across paths, prevents empty export, and resets on reopen", async () => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const onExport = vi.fn<(ids: Set<string>) => void>()

  const button = (key: string) => [...container.querySelectorAll("button")].find(button => button.textContent === key)!
  const click = async (element: HTMLElement) => act(async () => element.click())
  try {
    await act(async () => root.render(<ExportSelection title="Export builds" items={items} onExport={onExport} />))
    expect(container.querySelector("dialog")).toBeNull()
    await click(button("ui.app.export"))
    const checkboxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(checkboxes.map(checkbox => checkbox.checked)).toEqual([true, true])
    expect(container.textContent).toContain("Second path")
    await click(button("ui.exportSelection.clearAll"))
    const confirm = () => [...container.querySelectorAll<HTMLButtonElement>("dialog button")].at(-1)!
    expect(confirm().disabled).toBe(true)
    await click(checkboxes[1])
    await click(confirm())
    expect(onExport).toHaveBeenCalledExactlyOnceWith(new Set(["build-b"]))
    expect(container.querySelector("dialog")).toBeNull()
    await click(button("ui.app.export"))
    expect(
      [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(input => input.checked),
    ).toBe(true)
    await click(button("ui.exportSelection.clearAll"))
    await click(button("ui.exportSelection.selectAll"))
    await click(confirm())
    expect(onExport).toHaveBeenLastCalledWith(new Set(["build-a", "build-b"]))
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

it("lets an import preview cancel without committing or confirm only checked entries", async () => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const onConfirm = vi.fn<(ids: Set<string>) => void>()
  const onClose = vi.fn<() => void>()
  try {
    await act(async () =>
      root.render(
        <TransferSelectionDialog
          title="Import rotations"
          items={items}
          confirmLabel="Import"
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      ),
    )
    const buttons = () => [...container.querySelectorAll("button")]
    await act(async () =>
      buttons()
        .find(button => button.textContent === "ui.buildTab.cancel")!
        .click(),
    )
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
    await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
    await act(async () =>
      buttons()
        .find(button => button.textContent === "Import")!
        .click(),
    )
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(new Set(["build-b"]))
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

it("shows ordered path headings with every matching entry beneath its heading", async () => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const onConfirm = vi.fn<(ids: Set<string>) => void>()
  const onClose = vi.fn<() => void>()
  try {
    await act(async () =>
      root.render(
        <TransferSelectionDialog
          title="Import builds"
          items={groupedItems}
          confirmLabel="Import"
          onConfirm={onConfirm}
          onClose={onClose}
        />,
      ),
    )
    const groups = [...container.querySelectorAll("fieldset")]
    expect(groups.map(group => group.querySelector("legend")!.textContent)).toEqual(["Splendor", "Umbra"])
    expect([...groups[0].querySelectorAll("strong")].map(label => label.textContent)).toEqual(["Build a", "Build b"])
    expect(groups[1].textContent).toContain("Build c")
    expect(container.querySelectorAll("label strong")).toHaveLength(3)
    const pathCheckbox = groups[0].querySelector<HTMLInputElement>("legend input")!
    const otherPathCheckbox = groups[1].querySelector<HTMLInputElement>("legend input")!
    const entryCheckboxes = [...groups[0].querySelectorAll<HTMLInputElement>("input")].slice(1)
    expect(pathCheckbox.checked).toBe(true)
    await act(async () => pathCheckbox.click())
    expect(entryCheckboxes.every(checkbox => !checkbox.checked)).toBe(true)
    expect(otherPathCheckbox.checked).toBe(true)
    await act(async () => entryCheckboxes[0].click())
    expect(pathCheckbox.checked).toBe(false)
    expect(pathCheckbox.indeterminate).toBe(true)
    await act(async () => pathCheckbox.click())
    expect(entryCheckboxes.every(checkbox => checkbox.checked)).toBe(true)
    expect(pathCheckbox.checked).toBe(true)
    expect(pathCheckbox.indeterminate).toBe(false)
    await act(async () => pathCheckbox.click())
    await act(async () =>
      [...container.querySelectorAll("button")].find(button => button.textContent === "Import")!.click(),
    )
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(new Set(["umbra-a"]))
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
