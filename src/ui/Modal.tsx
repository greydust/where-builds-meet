import { useEffect, useRef, type ReactNode, type SyntheticEvent } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  onCancel?: (event: SyntheticEvent<HTMLDialogElement, Event>) => void;
  className?: string;
  label?: string;
  children: ReactNode;
};

export function Modal({ open, onClose, onCancel, className, label, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className={className} aria-label={label} onCancel={onCancel} onClose={onClose}>
      {children}
    </dialog>
  );
}
