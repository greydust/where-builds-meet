export type CharacterStats = {
  minPhys: number;
  maxPhys: number;
  precision: number;
  crit: number;
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
  maxEndurance: number;
  maxVitality: number;
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
  bamboocutDmgBonus: number;
  critDmgBonus: number;
  affinityDmgBonus: number;
  allMartialArts: number;
  vsBossDmg: number;
  moBladeDmgBoost: number;
  hengBladeDmgBoost: number;
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

export type WeaponId = "snowparting" | "phalanxbane";

export type StatKey = keyof CharacterStats;

export type StatDefinition = {
  key: StatKey;
  label: string;
  unit?: string;
  showUnitInLabel?: boolean;
  showUnitInInput?: boolean;
  step?: number;
};
