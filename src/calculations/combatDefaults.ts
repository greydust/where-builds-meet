import bossData from "@gamedata/boss.json"

export const DEFAULT_TARGET_HP_RATIO = 0.99

export const DEFAULT_ROTATION_EVENT_LIMIT = 6000

export const DEFAULT_PING_MS = 40

export function normalizePing(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined
}

export function resolvePing(override: unknown, setting: unknown = DEFAULT_PING_MS): number {
  return normalizePing(override) ?? normalizePing(setting) ?? DEFAULT_PING_MS
}

export function normalizeEnemyCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1
}

export const TARGET_TYPES = ["Dummy", "DummyAttack", "Boss"] as const
export type TargetType = (typeof TARGET_TYPES)[number]
export const DEFAULT_TARGET_TYPE: TargetType = "Dummy"

/**
 * One entry of a practice target's attack pattern: the first generated hit lands
 * `firstDelay` seconds after battle start, then `interval` seconds apart, with
 * `count` simultaneous hits dealing `damage` each. An empty pattern never attacks.
 */
export type TargetAttackPattern = { firstDelay: number; interval: number; count: number; damage: number }
export type BossDefinition = {
  id: TargetType
  name: string
  type: "Dummy" | "Boss"
  attackPattern: TargetAttackPattern[]
}
export const bossDefinitions: BossDefinition[] = bossData as BossDefinition[]
export const bossDefinitionById = new Map(bossDefinitions.map(definition => [definition.id, definition]))

/** Resolves a rotation's practice target. The legacy `dummyAttack` flag is its former two-value form. */
export function resolveTargetType(source: { targetType?: unknown; dummyAttack?: unknown }): TargetType {
  const stored = source.targetType
  if (typeof stored === "string" && bossDefinitionById.has(stored as TargetType)) return stored as TargetType
  return source.dummyAttack === true ? "DummyAttack" : DEFAULT_TARGET_TYPE
}

/** The selected practice target's record, or the inert default when the stored ID is unknown. */
export function bossDefinitionFor(type: TargetType): BossDefinition {
  return bossDefinitionById.get(type) ?? bossDefinitionById.get(DEFAULT_TARGET_TYPE)!
}
