/** A permanent setup bonus to natural regeneration below a fraction of the resource cap. */
export type ResourceRegenerationBonus = { resource: string; belowRatio: number; bonus: number }

/** Integrate one constant-rate span, splitting exactly where its bonus changes. */
export function regenerateResource(
  value: number,
  elapsed: number,
  regeneration: number,
  consumption: number,
  maximum: number | undefined,
  bonus: ResourceRegenerationBonus | undefined,
) {
  const normalRate = regeneration - consumption
  if (!bonus || maximum === undefined || maximum <= 0 || regeneration <= 0) return value + normalRate * elapsed

  const threshold = maximum * bonus.belowRatio
  const lowRate = regeneration * (1 + bonus.bonus) - consumption
  // When drain lies between the two regeneration rates, the meter stays at the
  // threshold once it reaches it; neither side can carry it through the boundary.
  const boundaryRate = normalRate >= 0 ? normalRate : Math.min(0, lowRate)
  if (value === threshold) return value + boundaryRate * elapsed

  const rate = value < threshold ? lowRate : normalRate
  const crossingTime = rate === 0 ? Infinity : (threshold - value) / rate
  if (crossingTime <= 0 || crossingTime >= elapsed) return value + rate * elapsed
  return threshold + boundaryRate * (elapsed - crossingTime)
}
