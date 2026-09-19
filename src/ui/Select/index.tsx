import type { SelectHTMLAttributes } from "react"

import styles from "./style.module.css"

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

// Native select shell with the primitive structure class. Option styling and
// layout live one level up (editor-field and domain wrappers). Never
// reference project design tokens here.
export function Select({ className, ...rest }: SelectProps) {
  return <select className={className ? `${styles.select} ${className}` : styles.select} {...rest} />
}
