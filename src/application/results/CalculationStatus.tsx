import { useShallow } from "zustand/react/shallow"

import type { RotationCalculationCategory } from "@/calculations/rotationMetrics"
import { useRotationStore } from "@/stores/rotationStore"
import { CalculationStatus as CalculationStatusView } from "@/ui/CalculationStatus"

import { calculationStatusLabel } from "./calculationStatusLabel"

/**
 * Binds one or more categories of the rotation calculation to the shared status primitive. A category
 * the calculation reports no progress for is described without a percentage.
 *
 * Reading the status by way of the store rather than through a subscription of its own means
 * only this component re-renders when its category's progress moves, however many are on screen.
 */
export function CalculationStatus({
  category,
  className = "",
}: {
  category: RotationCalculationCategory | readonly RotationCalculationCategory[]
  className?: string
}) {
  const status = useRotationStore(
    useShallow(state => {
      if (typeof category === "string") return state.status[category]
      const statuses = category.map(key => state.status[key])
      const recalculating = statuses.some(value => value.recalculating)
      const progress = statuses.some(value => value.recalculating && value.progress === undefined)
        ? undefined
        : statuses.reduce((sum, value) => sum + (value.recalculating ? value.progress! : 1), 0) / statuses.length
      return { recalculating, progress }
    }),
  )
  const label = calculationStatusLabel(status.recalculating, status.progress)
  return (
    <CalculationStatusView busy={status.recalculating} progress={status.progress} label={label} className={className} />
  )
}
