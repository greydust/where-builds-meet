// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NumberInput } from "../../src/ui/NumberInput"

function setNativeValue(input: HTMLInputElement, raw: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  if (!setter) throw new Error("Missing native value setter.")
  setter.call(input, raw)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("NumberInput", () => {
  let container: HTMLDivElement
  let root: Root

  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
  })

  async function renderInput(props: Parameters<typeof NumberInput>[0]) {
    await act(async () => {
      root.render(<NumberInput {...props} />)
    })
    const input = container.querySelector("input")
    if (!input) throw new Error("NumberInput did not render an input element.")
    return input
  }

  async function type(input: HTMLInputElement, raw: string) {
    await act(async () => {
      setNativeValue(input, raw)
    })
  }

  async function blur(input: HTMLInputElement) {
    await act(async () => {
      // React implements onBlur through the bubbling focusout event.
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    })
  }

  async function pressEnter(input: HTMLInputElement) {
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    })
  }

  it("renders bounds and step as attributes", async () => {
    const input = await renderInput({ value: 40, min: 0, max: 999, step: 1 })
    expect(input.getAttribute("min")).toBe("0")
    expect(input.getAttribute("max")).toBe("999")
    expect(input.getAttribute("step")).toBe("1")
    expect(input.getAttribute("type")).toBe("number")
  })

  it("clamps above the upper bound and below the lower bound on commit", async () => {
    const onCommit = vi.fn<(value: number | undefined) => void>()
    const input = await renderInput({ value: 40, min: 0, max: 999, onCommit })
    await type(input, "1500")
    await blur(input)
    expect(onCommit).toHaveBeenCalledWith(999)
    await type(input, "-20")
    await blur(input)
    expect(onCommit).toHaveBeenCalledWith(0)
  })

  it("commits with Enter and keeps the draft visible while editing", async () => {
    const onCommit = vi.fn<(value: number | undefined) => void>()
    const input = await renderInput({ value: 40, min: 0, max: 999, onCommit })
    await type(input, "41")
    expect(input.value).toBe("41")
    await pressEnter(input)
    expect(onCommit).toHaveBeenCalledWith(41)
  })

  it("maps empty drafts to undefined when allowed and to the lower bound otherwise", async () => {
    const onCommit = vi.fn<(value: number | undefined) => void>()
    const input = await renderInput({ value: 40, min: 0, max: 999, allowEmpty: true, onCommit })
    await type(input, "")
    await blur(input)
    expect(onCommit).toHaveBeenCalledWith(undefined)
    // Number inputs sanitize non-numeric text to "" before React ever sees
    // it, so an unallowed empty draft commits the lower bound instead.
    const strictCommit = vi.fn<(value: number | undefined) => void>()
    const strict = await renderInput({ value: 40, min: 0, max: 999, onCommit: strictCommit })
    await type(strict, "")
    await blur(strict)
    expect(strictCommit).toHaveBeenCalledWith(0)
  })

  it("flags out-of-range drafts as invalid without a visual hook", async () => {
    const onValidityChange = vi.fn<(valid: boolean) => void>()
    const input = await renderInput({ value: 40, min: 0, max: 999, onValidityChange })
    await type(input, "1500")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(onValidityChange).toHaveBeenLastCalledWith(false)
    await type(input, "42")
    expect(input.getAttribute("aria-invalid")).toBeNull()
    expect(onValidityChange).toHaveBeenLastCalledWith(true)
  })

  it("reports every keystroke raw in immediate mode without drafting", async () => {
    const onChange = vi.fn<(raw: string) => void>()
    const onCommit = vi.fn<(value: number | undefined) => void>()
    const input = await renderInput({ value: "4", commitMode: "immediate", onChange, onCommit })
    await type(input, "42")
    expect(onChange).toHaveBeenCalledWith("42")
    await blur(input)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("tracks editing state for reset controls", async () => {
    const onEditingChange = vi.fn<(editing: boolean) => void>()
    const onCommit = vi.fn<(value: number | undefined) => void>()
    const input = await renderInput({ value: 40, onEditingChange, onCommit })
    await type(input, "41")
    expect(onEditingChange).toHaveBeenCalledWith(true)
    await blur(input)
    expect(onEditingChange).toHaveBeenCalledWith(false)
  })
})
