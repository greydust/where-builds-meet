import type { AttunementStats } from "@/calculations/damage"
import type { DerivedStats } from "@/calculations/effectiveStats"
import type { StatEffectContainer } from "@/calculations/statEffects"
import type { BuildSetup } from "@/gear"
import type { CharacterStats, EnemyProfile, WeaponId } from "@/types"

export type CalculatorSettings = { weapons: [WeaponId, WeaponId]; breakthrough: string; ping: number }
export type LayoutMode = "pc" | "mobile"
export type PathId =
  | "mixed"
  | "bellstrikeSplendor"
  | "bellstrikeUmbra"
  | "stonesplitStrength"
  | "stonesplitMight"
  | "silkbindJade"
  | "silkbindDeluge"
  | "bamboocutWind"
  | "bamboocutKite"
  | "bamboocutDust"
  | "bamboocutDraught"

export type SetupSelections = { food: string; enduranceFood?: string; script: string; divinecraft: string }

export type CharacterState = {
  stats: CharacterStats
  rawStats: CharacterStats
  baseStats: CharacterStats
  attunementStats: AttunementStats
  displayedAttunementStats: AttunementStats
  settings: CalculatorSettings
  enemy: EnemyProfile
  derivedStats: DerivedStats
  innerWayRevision: number
  setupSelections: SetupSelections
  gearStatEffect: StatEffectContainer
  buildSetup: BuildSetup
}
