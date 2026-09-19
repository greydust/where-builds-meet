import type { ButtonHTMLAttributes } from "react"

import styles from "./style.module.css"

type TabProps = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; modified?: boolean }

// Selectable option button with a shared active/dirty contract. The `active`
// and `modified` state classes are part of the primitive API and are styled
// one level up (main-tabs, category-tab, skill-list-item). Never reference
// project design tokens here.
export function Tab({ type = "button", active = false, modified = false, className, ...rest }: TabProps) {
  const state = `${active ? " active" : ""}${modified ? " modified" : ""}`
  const combined = `${styles.tab}${state}${className ? ` ${className}` : ""}`
  return (
    <button type={type} className={combined} {...rest}>
      {rest.children}
    </button>
  )
}
