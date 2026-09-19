import type { HTMLAttributes } from "react"

import styles from "./style.module.css"

type PanelProps = HTMLAttributes<HTMLElement>
type PanelHeadingProps = HTMLAttributes<HTMLDivElement>

// Self-contained primitives: behavior plus structure. Presentation is a
// scoped variable API (`--panel-*`); visual variants and theme values live
// one level up in application CSS. Never reference project design tokens
// here.
export function Panel({ className, ...rest }: PanelProps) {
  return <section className={className ? `${styles.panel} ${className}` : styles.panel} {...rest} />
}

export function PanelHeading({ className, ...rest }: PanelHeadingProps) {
  return <div className={className ? `${styles.heading} ${className}` : styles.heading} {...rest} />
}
