import type { HTMLAttributes } from "react"

import styles from "./style.module.css"

type ChipProps = HTMLAttributes<HTMLSpanElement>

// Self-contained primitive: pill chrome plus structure. Tones (effect-plate
// kinds, status badges, percentile chips) live one level up in application
// CSS and assign the scoped `--chip-*` variables below. Never reference
// project design tokens here.
export function Chip({ className, ...rest }: ChipProps) {
  return <span className={className ? `${styles.chip} ${className}` : styles.chip} {...rest} />
}
