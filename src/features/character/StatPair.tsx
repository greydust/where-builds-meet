import { Children, type ReactNode } from "react"

export function StatPair({ children }: { children: ReactNode }) {
  return (
    <div className="stat-row">
      {children}
      {Children.count(children) < 2 ? <span aria-hidden="true" /> : null}
    </div>
  )
}
