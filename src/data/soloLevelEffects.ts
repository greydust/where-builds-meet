import type { EffectiveStatEffectContainer, StatEffectContainer, StatEffectValues } from "@/calculations/statEffects"
import type { CharacterStats } from "@/types"

type SoloLevelStatValues = Partial<
  Record<keyof CharacterStats, StatEffectValues[keyof CharacterStats] | { bySoloLevel: (number | null)[] }>
>
export type AuthoredSoloLevelEffect<Effect> = Omit<Effect, "rawStat" | "stat" | "effectiveStat"> & {
  rawStat?: SoloLevelStatValues
  stat?: SoloLevelStatValues
  effectiveStat?: SoloLevelStatValues
}

/** Resolve the shared authored Solo Level tables before stat aggregation. */
export function effectForSoloLevel<Effect extends object>(
  effect: Effect,
  soloLevel: number,
  context: string,
): Omit<Effect, "rawStat" | "stat" | "effectiveStat"> & StatEffectContainer & EffectiveStatEffectContainer {
  if (!Number.isInteger(soloLevel) || soloLevel < 0) throw new RangeError("Invalid Solo Level: " + soloLevel)
  const resolved = { ...effect }
  for (const field of ["rawStat", "stat", "effectiveStat"] as const) {
    const stats = (effect as Record<string, unknown>)[field] as Record<string, unknown> | undefined
    if (!stats) continue
    Object.assign(resolved, {
      [field]: Object.fromEntries(
        Object.entries(stats).map(([stat, amount]) => {
          if (!amount || typeof amount !== "object" || !("bySoloLevel" in amount)) return [stat, amount]
          const selected = (amount.bySoloLevel as (number | null)[])[soloLevel]
          if (selected === undefined)
            throw new RangeError(context + " " + stat + " has no value for Solo Level " + soloLevel)
          return [stat, selected ?? 0]
        }),
      ),
    })
  }
  return resolved as Omit<Effect, "rawStat" | "stat" | "effectiveStat"> &
    StatEffectContainer &
    EffectiveStatEffectContainer
}
