import { useState, type InputHTMLAttributes } from "react"

import { commitDraft, isValidDraft } from "./commit"

import styles from "./style.module.css"

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "min" | "max" | "step"
> & {
  value: string | number | undefined
  /** Separate lower bound: rendered as the min attribute and used to clamp on commit. */
  min?: number
  /** Separate upper bound: rendered as the max attribute and used to clamp on commit. */
  max?: number
  step?: number | string
  /**
   * "commit" keeps a local draft while editing and reports the parsed,
   * clamped number on blur or Enter. "immediate" reports the raw string on
   * every keystroke and stays fully controlled (the parent owns capping).
   */
  commitMode?: "immediate" | "commit"
  allowEmpty?: boolean
  onChange?: (raw: string) => void
  onCommit?: (value: number | undefined) => void
  onEditingChange?: (editing: boolean) => void
  onValidityChange?: (valid: boolean) => void
}

type FieldProps = NumberInputProps & {
  draft: string | undefined
  onDraft: (raw: string) => void
  onCommitRequested: () => void
}

function NumberInputField({ draft, onDraft, onCommitRequested, ...props }: FieldProps) {
  const { value, min, max, step, inputMode, className, onBlur, onKeyDown, ...rest } = props
  const commitMode = props.commitMode ?? "commit"
  const evaluated = draft ?? (commitMode === "immediate" ? (value ?? "") : undefined)
  const invalid = evaluated !== undefined && !isValidDraft(String(evaluated), props.allowEmpty ?? false, min, max)
  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      step={step}
      inputMode={inputMode}
      aria-invalid={invalid || undefined}
      className={className ? `${styles.input} ${className}` : styles.input}
      value={draft ?? value ?? ""}
      onChange={event => onDraft(event.target.value)}
      onBlur={event => {
        if (commitMode === "commit") onCommitRequested()
        onBlur?.(event)
      }}
      onKeyDown={event => {
        if (commitMode === "commit" && event.key === "Enter") {
          event.preventDefault()
          onCommitRequested()
        }
        onKeyDown?.(event)
      }}
    />
  )
}

// Numeric input with separately controlled bounds, step size, and range
// evaluation. Visual styling lives one level up (field, editor-field,
// detail-field wrappers). Never reference project design tokens here.
export function NumberInput(props: NumberInputProps) {
  const [draft, setDraft] = useState<string>()
  const commitMode = props.commitMode ?? "commit"

  function handleDraft(raw: string) {
    if (commitMode === "commit") setDraft(raw)
    props.onChange?.(raw)
    props.onEditingChange?.(true)
    props.onValidityChange?.(isValidDraft(raw, props.allowEmpty ?? false, props.min, props.max))
  }

  function handleCommit() {
    if (draft === undefined) return
    props.onCommit?.(commitDraft(draft, props))
    setDraft(undefined)
    props.onEditingChange?.(false)
  }

  return (
    <NumberInputField
      {...props}
      commitMode={commitMode}
      draft={draft}
      onDraft={handleDraft}
      onCommitRequested={handleCommit}
    />
  )
}
