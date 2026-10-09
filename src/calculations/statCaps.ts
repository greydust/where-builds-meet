export const DIRECT_CRIT_RATE_CAP = 0.2

const calculationStatMaximums: Readonly<Record<string, number>> = { directCrit: DIRECT_CRIT_RATE_CAP }

export function calculationStatMaximum(stat: string) {
  return calculationStatMaximums[stat]
}
