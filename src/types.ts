export type CharacterStats = {
  minPhys: number
  maxPhys: number
  precision: number
  crit: number
  /** Hit-scoped bonus added after Judgement Resistance but before the 80% Effective Critical cap. */
  effectiveCritBonus: number
  affinity: number
  directCrit: number
  directAffinity: number
  power: number
  agility: number
  momentum: number
  body: number
  defense: number
  maxHp: number
  physicalDefense: number
  /** Offensive flat penetration applied to the physical damage and healing channels. */
  physicalPenetration: number
  /** Offensive flat penetration added to the equipped path's primary attribute. */
  formlessPenetration: number
  /** Defensive flat resistance; intentionally omitted from the character-stat UI. */
  physicalResistance: number
  /** Character-sheet reduction; Take Damage events already specify resolved damage. */
  physicalDmgReduction: number
  maxEndurance: number
  maxVitality: number
  /** Heaven's Will generated per second. */
  heavensWillRegen: number
  minSilkbind: number
  maxSilkbind: number
  minBellstrike: number
  maxBellstrike: number
  minStonesplit: number
  maxStonesplit: number
  minBamboocut: number
  maxBamboocut: number
  minVoidAttack: number
  maxVoidAttack: number
  bellstrikePenetration: number
  silkbindPenetration: number
  stonesplitPenetration: number
  bamboocutPenetration: number
  physDmgBonus: number
  bellstrikeDmgBonus: number
  stonesplitDmgBonus: number
  silkbindDmgBonus: number
  /** Multiplier applied to the Silkbind component of healing actions. */
  silkbindHealingBonus: number
  /** Multiplier applied to the physical component of healing actions. */
  physicalHealingBonus: number
  /** Base bonus used by Critical healing outcomes before action-specific effects. */
  criticalHealingBonus: number
  bamboocutDmgBonus: number
  critDmgBonus: number
  affinityDmgBonus: number
  allMartialArts: number
  vsBossDmg: number
  moBladeDmgBoost: number
  hengBladeDmgBoost: number
  umbrellaDmgBoost: number
  ropeDartDmgBoost: number
  gauntletDmgBoost: number
  spearDmgBoost: number
  swordDmgBoost: number
  ribbonAndDrumDmgBoost: number
  fanDmgBoost: number
  dualBladesDmgBoost: number
  allMysticDmgBoost: number
  singleTargetMysticDmgBoost: number
  areaMysticDmgBoost: number
}

export type EnemyProfile = {
  specificSkillDamageDivisor?: number
  correctablePenetrationDivisor?: number
  name: string
  level: number
  defense: number
  physicalResistance: number
  bellstrikeResistance: number
  stonesplitResistance: number
  silkbindResistance: number
  bamboocutResistance: number
  judgementResistance: number
}

export const weaponIds = [
  "boshanQuyueSpear",
  "jueyuXuanfengSpear",
  "snowparting",
  "phalanxbane",
  "thundercry",
  "stormbreaker",
  "everspring",
  "unfettered",
  "heavenwill",
  "skygrasp",
  "namelessSword",
  "namelessSpear",
  "strategicSword",
  "heavenquakerSpear",
  "vernalUmbrella",
  "inkwellFan",
  "panaceaFan",
  "soulshadeUmbrella",
  "infernalTwinblades",
  "mortalRopeDart",
  "skystrikeGauntlets",
  "rivenTwinblades",
  "museflowWaistDrum",
  "willowbendFan",
] as const
export type WeaponId = (typeof weaponIds)[number]
const legacyUniversalWeaponIdSets: readonly (readonly WeaponId[])[] = [
  weaponIds.filter(id => id !== "jueyuXuanfengSpear" && id !== "boshanQuyueSpear"),
  weaponIds.filter(
    id =>
      id !== "museflowWaistDrum" && id !== "willowbendFan" && id !== "jueyuXuanfengSpear" && id !== "boshanQuyueSpear",
  ),
  ["snowparting", "phalanxbane", "thundercry", "stormbreaker", "everspring", "unfettered", "heavenwill", "skygrasp"],
  [
    "snowparting",
    "phalanxbane",
    "thundercry",
    "stormbreaker",
    "everspring",
    "unfettered",
    "heavenwill",
    "skygrasp",
    "namelessSword",
    "namelessSpear",
    "strategicSword",
    "heavenquakerSpear",
    "vernalUmbrella",
    "inkwellFan",
    "panaceaFan",
    "soulshadeUmbrella",
    "infernalTwinblades",
    "mortalRopeDart",
  ],
]

export function normalizeStoredWeaponIds(value: unknown): WeaponId[] {
  const parsed = Array.isArray(value)
    ? [
        ...new Set(
          value.filter((item): item is WeaponId => typeof item === "string" && weaponIds.includes(item as WeaponId)),
        ),
      ]
    : []
  const isLegacyUniversal = legacyUniversalWeaponIdSets.some(
    legacyIds => parsed.length === legacyIds.length && legacyIds.every(weapon => parsed.includes(weapon)),
  )
  return isLegacyUniversal ? [...weaponIds] : parsed
}
export type WeaponFamily =
  | "HengBlade"
  | "MoBlade"
  | "Spear"
  | "Umbrella"
  | "RopeDart"
  | "Gauntlet"
  | "Sword"
  | "RibbonAndDrum"
  | "Fan"
  | "DualBlades"

export type StatKey = keyof CharacterStats

export type StatDefinition = {
  key: StatKey
  label: string
  unit?: string
  showUnitInLabel?: boolean
  showUnitInInput?: boolean
  step?: number
  maximum?: number
}
