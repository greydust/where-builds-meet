import type { RotationSkillBreakdown, RotationHealingSkillBreakdown } from "./rotationMetrics"
import type { SkillRecord } from "./rotationTimeline"

type SkillRow = RotationSkillBreakdown | RotationHealingSkillBreakdown
export type SkillBreakdownGroup<T extends SkillRow> = T & { children?: T[] }

/** Aggregate published rows once in the worker; preserve flat rows for numerical audits. */
export function groupSkillBreakdown<T extends SkillRow>(
  rows: T[],
  skills: Record<string, SkillRecord>,
): SkillBreakdownGroup<T>[] {
  const categories = new Map<string, T[]>()
  const result: SkillBreakdownGroup<T>[] = []
  for (const row of rows) {
    const category = (row.skillBreakdownCategory ?? skills[row.id]?.skillBreakdownCategory)?.trim()
    if (!category) {
      result.push(row)
      continue
    }
    const members = categories.get(category) ?? []
    members.push(row)
    categories.set(category, members)
  }
  for (const [name, children] of categories) {
    const group = { ...children[0], id: `category:${name}`, name, children }
    group.casts = 0
    group.triggers = 0
    group.percentage = 0
    group.normalRate = 0
    group.criticalRate = 0
    if ("damage" in group) {
      group.damage = 0
      group.hits = 0
      group.abrasionRate = 0
      group.affinityRate = 0
    } else {
      group.healing = 0
      group.heals = 0
    }
    for (const row of children) {
      group.casts += row.casts
      group.triggers += row.triggers
      group.percentage += row.percentage
      const count = "hits" in row ? row.hits : row.heals
      group.normalRate += row.normalRate * count
      group.criticalRate += row.criticalRate * count
      if ("damage" in group && "damage" in row) {
        group.damage += row.damage
        group.hits += row.hits
        group.abrasionRate += row.abrasionRate * count
        group.affinityRate += row.affinityRate * count
      }
      if ("healing" in group && "healing" in row) {
        group.healing += row.healing
        group.heals += row.heals
      }
    }
    const count = "hits" in group ? group.hits : group.heals
    group.normalRate = count > 0 ? group.normalRate / count : 0
    group.criticalRate = count > 0 ? group.criticalRate / count : 0
    if ("damage" in group) {
      group.abrasionRate = count > 0 ? group.abrasionRate / count : 0
      group.affinityRate = count > 0 ? group.affinityRate / count : 0
    }
    result.push(group)
  }
  return result.sort((left, right) => {
    const leftTotal = "damage" in left ? left.damage : left.healing
    const rightTotal = "damage" in right ? right.damage : right.healing
    return rightTotal - leftTotal || left.name.localeCompare(right.name)
  })
}
