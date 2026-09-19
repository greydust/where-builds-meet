import type { InputHTMLAttributes } from "react"

import styles from "./style.module.css"

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">

// Native checkbox shell with the primitive structure class. Accent color and
// layout live one level up (checkbox-field and domain wrappers). Never
// reference project design tokens here.
export function Checkbox({ className, ...rest }: CheckboxProps) {
  return <input type="checkbox" className={className ? `${styles.checkbox} ${className}` : styles.checkbox} {...rest} />
}
