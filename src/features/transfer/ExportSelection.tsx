import { useId, useState } from "react"

import { t } from "@/i18n"
import { Button } from "@/ui/Button"
import { Checkbox } from "@/ui/Checkbox"
import { Dialog } from "@/ui/Dialog"

import styles from "./exportSelection.module.css"

type ExportItem = { id: string; name: string; detail: string; group?: string; groupOrder?: number }

type ExportSelectionProps = { title: string; items: ExportItem[]; onExport: (ids: Set<string>) => void }

export function ExportSelection({ title, items, onExport }: ExportSelectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="secondary"
        size="small"
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t("ui.app.export")}
      </Button>
      {open && (
        <TransferSelectionDialog
          title={title}
          items={items}
          description={t("ui.exportSelection.description")}
          emptyMessage={t("ui.exportSelection.empty")}
          confirmLabel={t("ui.app.export")}
          onConfirm={onExport}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

type TransferSelectionDialogProps = {
  title: string
  items: ExportItem[]
  description?: string
  emptyMessage?: string
  confirmLabel: string
  onConfirm: (ids: Set<string>) => void
  onClose: () => void
}

export function TransferSelectionDialog({
  title,
  items,
  description,
  emptyMessage,
  confirmLabel,
  onConfirm,
  onClose,
}: TransferSelectionDialogProps) {
  const checkboxId = useId()
  const groupCheckboxId = useId()
  const [selected, setSelected] = useState(() => new Set(items.map(item => item.id)))
  const selectedCount = items.filter(item => selected.has(item.id)).length
  const groups = new Map<string, { name: string; order: number; items: ExportItem[] }>()
  for (const item of items) {
    const key = item.group ?? ""
    const group = groups.get(key) ?? { name: key, order: item.groupOrder ?? 0, items: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  const orderedGroups = [...groups.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))

  return (
    <Dialog open={true} onClose={onClose} label={title}>
      <div className={styles.content}>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
        <div className={styles.actions}>
          <Button
            variant="secondary"
            size="small"
            type="button"
            disabled={!items.length}
            onClick={() => setSelected(new Set(items.map(item => item.id)))}
          >
            {t("ui.exportSelection.selectAll")}
          </Button>
          <Button
            variant="secondary"
            size="small"
            type="button"
            disabled={!selectedCount}
            onClick={() => setSelected(new Set())}
          >
            {t("ui.exportSelection.clearAll")}
          </Button>
        </div>
        <div className={styles.list}>
          {items.length === 0 && emptyMessage && <p>{emptyMessage}</p>}
          {orderedGroups.map(group => {
            const count = group.items.filter(item => selected.has(item.id)).length
            const checked = count === group.items.length
            const partial = count > 0 && !checked
            const groupId = `${groupCheckboxId}-${group.name}`
            return (
              <fieldset key={group.name} className={styles.group}>
                {group.name && (
                  <legend>
                    <label htmlFor={groupId} className={styles.groupHeading}>
                      <Checkbox
                        id={groupId}
                        checked={checked}
                        ref={element => {
                          if (element) element.indeterminate = partial
                        }}
                        onChange={event => {
                          const selectGroup = event.currentTarget.checked
                          setSelected(current => {
                            const next = new Set(current)
                            for (const item of group.items) {
                              if (selectGroup) next.add(item.id)
                              else next.delete(item.id)
                            }
                            return next
                          })
                        }}
                      />
                      {group.name}
                    </label>
                  </legend>
                )}
                {group.items.map(item => (
                  <label key={item.id} htmlFor={`${checkboxId}-${item.id}`} className={styles.item}>
                    <Checkbox
                      id={`${checkboxId}-${item.id}`}
                      checked={selected.has(item.id)}
                      onChange={event => {
                        const checked = event.currentTarget.checked
                        setSelected(current => {
                          const next = new Set(current)
                          if (checked) next.add(item.id)
                          else next.delete(item.id)
                          return next
                        })
                      }}
                    />
                    <span>
                      <strong>{item.name}</strong>
                      {!item.group && <small>{item.detail}</small>}
                    </span>
                  </label>
                ))}
              </fieldset>
            )
          })}
        </div>
        <p aria-live="polite">{t("ui.exportSelection.selectedCount", { count: selectedCount, total: items.length })}</p>
        <div className={styles.actions}>
          <Button variant="secondary" type="button" onClick={onClose}>
            {t("ui.buildTab.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!selectedCount}
            onClick={() => {
              onConfirm(new Set(items.filter(item => selected.has(item.id)).map(item => item.id)))
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
