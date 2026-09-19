import { useEffect, useRef, type ReactNode, type SyntheticEvent } from "react"

import styles from "./style.module.css"

type DialogProps = {
  open: boolean
  onClose: () => void
  onCancel?: (event: SyntheticEvent<HTMLDialogElement, Event>) => void
  className?: string
  label?: string
  children: ReactNode
}

// Self-contained primitive: behavior plus structure. Presentation is a scoped
// variable API (`--modal-*`); visual variants live one level up and assign
// those variables or add classes. Never reference project design tokens here.
export function Dialog({ open, onClose, onCancel, className, label, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  const handleClose = (event: SyntheticEvent<HTMLDialogElement, Event>) => {
    event.stopPropagation()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className={className ? `${styles.dialog} ${className}` : styles.dialog}
      aria-label={label}
      onCancel={onCancel}
      onClose={handleClose}
    >
      {children}
    </dialog>
  )
}
