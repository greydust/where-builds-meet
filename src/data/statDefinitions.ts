import type { CharacterStats, StatDefinition } from "../types";
import { DIRECT_CRIT_RATE_CAP } from "../calculations/statCaps";

export const combatStats: StatDefinition[] = [
  { key: "minPhys", label: "Min Physical Attack" },
  { key: "maxPhys", label: "Max Physical Attack" },
  { key: "power", label: "Power" },
  { key: "agility", label: "Agility" },
  { key: "momentum", label: "Momentum" },
  { key: "precision", label: "Precision Rate", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "crit", label: "Critical Rate", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  {
    key: "directCrit",
    label: "Direct Critical Rate",
    unit: "%",
    showUnitInLabel: false,
    showUnitInInput: true,
    maximum: DIRECT_CRIT_RATE_CAP,
  },
  { key: "affinity", label: "Affinity Rate", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "directAffinity", label: "Direct Affinity Rate", unit: "%", showUnitInLabel: false, showUnitInInput: true },
];

export const martialArtsStats: StatDefinition[] = [
  { key: "minBellstrike", label: "Min Bellstrike Attack" },
  { key: "maxBellstrike", label: "Max Bellstrike Attack" },
  { key: "minStonesplit", label: "Min Stonesplit Attack" },
  { key: "maxStonesplit", label: "Max Stonesplit Attack" },
  { key: "minSilkbind", label: "Min Silkbind Attack" },
  { key: "maxSilkbind", label: "Max Silkbind Attack" },
  { key: "minBamboocut", label: "Min Bamboocut Attack" },
  { key: "maxBamboocut", label: "Max Bamboocut Attack" },
  { key: "minVoidAttack", label: "Min Void Attack" },
  { key: "maxVoidAttack", label: "Max Void Attack" },
];

export const survivalStats: StatDefinition[] = [
  { key: "body", label: "Body" },
  { key: "defense", label: "Defense" },
  { key: "maxHp", label: "Max HP" },
  { key: "physicalDefense", label: "Physical Defense" },
  { key: "maxEndurance", label: "Max Endurance" },
  { key: "maxVitality", label: "Max Vitality" },
];

export const defenseStats: StatDefinition[] = [
  { key: "bellstrikePenetration", label: "Bellstrike Penetration" },
  { key: "silkbindPenetration", label: "Silkbind Penetration" },
  { key: "stonesplitPenetration", label: "Stonesplit Penetration" },
  { key: "bamboocutPenetration", label: "Bamboocut Penetration" },
  { key: "physDmgBonus", label: "Phys DMG Bonus", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  {
    key: "bellstrikeDmgBonus",
    label: "Bellstrike DMG Bonus",
    unit: "%",
    showUnitInLabel: false,
    showUnitInInput: true,
  },
  {
    key: "stonesplitDmgBonus",
    label: "Stonesplit DMG Bonus",
    unit: "%",
    showUnitInLabel: false,
    showUnitInInput: true,
  },
  { key: "silkbindDmgBonus", label: "Silkbind DMG Bonus", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "bamboocutDmgBonus", label: "Bamboocut DMG Bonus", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "allMartialArts", label: "All Martial Arts", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "vsBossDmg", label: "vs Boss DMG", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "moBladeDmgBoost", label: "Art of Mo Blade", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "hengBladeDmgBoost", label: "Art of Heng Blade", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "critDmgBonus", label: "Crit DMG Bonus", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "affinityDmgBonus", label: "Affinity DMG Bonus", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  {
    key: "singleTargetMysticDmgBoost",
    label: "Single-Target Mystic Skill DMG Boost",
    unit: "%",
    showUnitInLabel: false,
    showUnitInInput: true,
  },
  {
    key: "areaMysticDmgBoost",
    label: "Area Mystic Skill DMG Boost",
    unit: "%",
    showUnitInLabel: false,
    showUnitInInput: true,
  },
  { key: "umbrellaDmgBoost", label: "Art of Umbrella", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "ropeDartDmgBoost", label: "Art of Rope Dart", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "gauntletDmgBoost", label: "Art of Gauntlet", unit: "%", showUnitInLabel: false, showUnitInInput: true },
  { key: "spearDmgBoost", label: "Art of Spear", unit: "%", showUnitInLabel: false, showUnitInInput: true },
];

export const allStatDefinitions = [...combatStats, ...survivalStats, ...martialArtsStats, ...defenseStats];

export const emptyStats = Object.fromEntries(allStatDefinitions.map(({ key }) => [key, 0])) as CharacterStats;
emptyStats.effectiveCritBonus = 0;
emptyStats.heavensWillRegen = 0;
