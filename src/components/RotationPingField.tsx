import { IconRotate } from "@tabler/icons-react"
import { useState } from "react"

import { t } from "../i18n"
import { NumberInput } from "../ui/NumberInput"

type RotationPingFieldProps = {
  value: number | undefined
  inheritedValue: number
  disabled: boolean
  onCommit: (value: number | undefined) => void
}

export function RotationPingField({ value, inheritedValue, disabled, onCommit }: RotationPingFieldProps) {
  const [editing, setEditing] = useState(false)
  const [resetRevision, setResetRevision] = useState(0)
  const modified = editing || value !== undefined

  if (disabled) {
    return (
      <label className="field compact-field rotation-target-hp rotation-ping-field ping-field">
        <span className="field-label">{t("ui.app.ping")}</span>
        <NumberInput
          disabled
          min={0}
          max={999}
          step={1}
          inputMode="numeric"
          value={value ?? inheritedValue}
          onCommit={onCommit}
        />
      </label>
    )
  }

  return (
    <label
      className={`field compact-field rotation-target-hp rotation-ping-field ping-field ${modified ? "modified-field" : ""}`}
    >
      <span className="field-label">
        <span>{t("ui.app.ping")}</span>
        {modified && (
          <button
            className="stat-reset-button"
            type="button"
            aria-label={t("ui.app.resetNamedValue", { name: t("ui.app.ping") })}
            title={t("ui.app.pingInherit")}
            onClick={event => {
              event.preventDefault()
              setEditing(false)
              setResetRevision(revision => revision + 1)
              onCommit(undefined)
            }}
          >
            <IconRotate size="1em" aria-hidden />
          </button>
        )}
      </span>
      <NumberInput
        key={resetRevision}
        allowEmpty
        min={0}
        max={999}
        step={1}
        inputMode="numeric"
        placeholder={String(inheritedValue)}
        title={t("ui.app.pingInherit")}
        value={value}
        onEditingChange={setEditing}
        onCommit={onCommit}
      />
    </label>
  )
}
