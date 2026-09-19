import type { ButtonHTMLAttributes } from "react"

import styles from "./style.module.css"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

// Self-contained primitive: behavior plus structure. Visual variants
// (button-primary, button-secondary, button-danger, button-small, ...) live
// one level up in application CSS and assign the scoped `--btn-*` variables
// below. Never reference project design tokens here.
export function Button({ type = "button", className, ...rest }: ButtonProps) {
  return <button type={type} className={className ? `${styles.button} ${className}` : styles.button} {...rest} />
}
