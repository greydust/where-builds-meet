export type CharacterStats = {
  minPhys: number;
  maxPhys: number;
  precision: number;
  crit: number;
  /** Hit-scoped bonus added after Judgement Resistance but before the 80% Effective Critical cap. */
  effectiveCritBonus: number;
  affinity: number;
  directCrit: number;
  directAffinity: number;
  power: number;
  agility: number;
  momentum: number;
  body: number;
  defense: number;
  maxHp: number;
  physicalDefense: number;
  /** Offensive flat penetration applied to the physical damage and healing channels. */
  physicalPenetration: number;
  /** Defensive flat resistance; intentionally omitted from the character-stat UI. */
  physicalResistance: number;
  maxEndurance: number;
  maxVitality: number;
  /** Heaven's Will generated per second. */
  heavensWillRegen: number;
  minSilkbind: number;
  maxSilkbind: number;
  minBellstrike: number;
  maxBellstrike: number;
  minStonesplit: number;
  maxStonesplit: number;
  minBamboocut: number;
  maxBamboocut: number;
  minVoidAttack: number;
  maxVoidAttack: number;
  bellstrikePenetration: number;
  silkbindPenetration: number;
  stonesplitPenetration: number;
  bamboocutPenetration: number;
  physDmgBonus: number;
  bellstrikeDmgBonus: number;
  stonesplitDmgBonus: number;
  silkbindDmgBonus: number;
  /** Multiplier applied to the Silkbind component of healing actions. */
  silkbindHealingBonus: number;
  /** Base bonus used by Critical healing outcomes before action-specific effects. */
  criticalHealingBonus: number;
  bamboocutDmgBonus: number;
  critDmgBonus: number;
  affinityDmgBonus: number;
  allMartialArts: number;
  vsBossDmg: number;
  moBladeDmgBoost: number;
  hengBladeDmgBoost: number;
  umbrellaDmgBoost: number;
  ropeDartDmgBoost: number;
  gauntletDmgBoost: number;
  spearDmgBoost: number;
  swordDmgBoost: number;
  fanDmgBoost: number;
  dualBladesDmgBoost: number;
  singleTargetMysticDmgBoost: number;
  areaMysticDmgBoost: number;
};

export type EnemyProfile = {
  name: string;
  level: number;
  defense: number;
  physicalResistance: number;
  bellstrikeResistance: number;
  stonesplitResistance: number;
  silkbindResistance: number;
  bamboocutResistance: number;
  judgementResistance: number;
};

export const weaponIds = [
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
] as const;
export type WeaponId = (typeof weaponIds)[number];
const legacyUniversalWeaponIdSets: readonly (readonly WeaponId[])[] = [
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
];

export function normalizeStoredWeaponIds(value: unknown): WeaponId[] {
  const parsed = Array.isArray(value)
    ? [
        ...new Set(
          value.filter((item): item is WeaponId => typeof item === "string" && weaponIds.includes(item as WeaponId)),
        ),
      ]
    : [];
  const isLegacyUniversal = legacyUniversalWeaponIdSets.some(
    (legacyIds) => parsed.length === legacyIds.length && legacyIds.every((weapon) => parsed.includes(weapon)),
  );
  return isLegacyUniversal ? [...weaponIds] : parsed;
}
export type WeaponFamily =
  "HengBlade" | "MoBlade" | "Spear" | "Umbrella" | "RopeDart" | "Gauntlet" | "Sword" | "Fan" | "DualBlades";

export type StatKey = keyof CharacterStats;

export type StatDefinition = {
  key: StatKey;
  label: string;
  unit?: string;
  showUnitInLabel?: boolean;
  showUnitInInput?: boolean;
  step?: number;
  maximum?: number;
};
