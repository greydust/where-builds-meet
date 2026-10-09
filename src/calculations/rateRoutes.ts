import type { DerivedStats } from "./effectiveStats"

/**
 * Routes that cannot roll every damage outcome. Any other action uses the normal
 * route's abrasion, normal, critical, and affinity rates from `calculateRates`.
 */
export type RestrictedRateRoute = "healing" | "divinecraft"

export type OutcomeRates = { abrasionRate: number; normalRate: number; critRate: number; affinityRate: number }

type CriticalRateStats = Pick<DerivedStats, "effectiveCrit" | "directCrit">

export function restrictedRateRouteFor(value: unknown): RestrictedRateRoute | undefined {
  switch (value) {
    case "healing":
      return "healing"
    case "divinecraft":
      return "divinecraft"
    default:
      return undefined
  }
}

/** Healing ignores Precision and rolls only Normal or Critical; Divinecraft rolls only Normal. */
export function restrictedOutcomeRates(route: RestrictedRateRoute, derivedStats: CriticalRateStats): OutcomeRates {
  switch (route) {
    case "healing": {
      const critRate = Math.min(1, Math.max(0, derivedStats.effectiveCrit + derivedStats.directCrit))
      return { abrasionRate: 0, normalRate: 1 - critRate, critRate, affinityRate: 0 }
    }
    case "divinecraft":
      return { abrasionRate: 0, normalRate: 1, critRate: 0, affinityRate: 0 }
  }
}
