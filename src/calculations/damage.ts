import type { CharacterStats, EnemyProfile, WeaponId } from "../types";
import attunementJson from "../../data/attunement.json";
import { calculateRates } from "./effectiveStats";
import type { DerivedStats } from "./effectiveStats";
import {
  calculateStatsWithEffects,
  applyStatConversions,
  resolveFormulaValue,
  type EffectiveStatEffectContainer,
  type StatConversionEffectContainer,
  type StatEffectContainer,
  type StatFormula,
} from "./statEffects";
import { resolveMultiplyValue, resolveSegmentValue } from "./dynamicValues";

type AttunementDefinition = {
  effect?: { stat?: Record<string, number>; tags?: string[]; excludeTags?: string[] };
};
const attunementDefinitions = attunementJson as Record<string, AttunementDefinition>;

export type AttunementStats = {
  physicalPenetration: number;
  formlessPenetration: number;
  physicalResistance: number;
  phalanxbaneChargedBoost: number;
  phalanxbaneMartialBoost: number;
  snowpartingChargedBoost: number;
  snowpartingVariedComboBoost: number;
  snowpartingMartialBoost: number;
  thundercryChargedBoost: number;
  thundercryShieldBoost: number;
  thundercrySpecialBoost: number;
  stormbreakerChargedBoost: number;
  stormbreakerSpecialBoost: number;
  everspringMartialBoost: number;
  everspringSpecialBoost: number;
  unfetteredChargedBoost: number;
  unfetteredSpecialBoost: number;
  unfetteredMartialBoost: number;
  heavenwillChargedBoost: number;
  heavenwillMartialBoost: number;
  heavenwillLightVariedComboBoost: number;
  skygraspHeavyBoost: number;
  skygraspSpecialBoost: number;
};

// Current level-96 test target. Move this to user-configurable encounter data later.
export const ENEMY_DEFENSE = 405;

export type DamageAction = {
  phyCoef?: unknown;
  phyBonus?: unknown;
  attrBonus?: unknown;
  coef?: unknown;
};
export type DamageOutcome = "abrasion" | "normal" | "critical" | "affinity";
export type DamageOutcomeRates = { abrasion: number; normal: number; critical: number; affinity: number };
export type DamageBreakdown = {
  physical: number;
  bellstrike: number;
  stonesplit: number;
  silkbind: number;
  bamboocut: number;
  total: number;
  outcomeRates?: DamageOutcomeRates;
  outcome?: DamageOutcome;
};
type AttackRollMode = "min" | "average" | "max" | "simulate";

export type DamageContext = {
  stats: CharacterStats;
  attunement: AttunementStats;
  skillTags: string[];
  weapons: WeaponId[];
  buffs: string[];
  enemy: EnemyProfile;
  derivedStats: DerivedStats;
  effects: Record<string, unknown>[];
  distance?: number;
  currentHPRatio?: number;
  targetHPRatio?: number;
  isDot?: boolean;
};

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function penetrationMultiplier(penetration: number, resistance = 0) {
  return penetration >= resistance ? 1 + (penetration - resistance) / 200 : 1 + (penetration - resistance) / 100;
}

function mainAttribute(weapons: WeaponId[]) {
  let hasBamboocutWeapon = false;
  for (const weapon of weapons) {
    switch (weapon) {
      case "snowparting":
      case "phalanxbane":
      case "thundercry":
      case "stormbreaker":
        return "stonesplit" as const;
      case "everspring":
      case "unfettered":
      case "heavenwill":
      case "skygrasp":
        hasBamboocutWeapon = true;
        break;
    }
  }
  if (hasBamboocutWeapon) return "bamboocut" as const;
}

function weaponArtBonus(stats: CharacterStats, skillTags: string[]) {
  for (const tag of skillTags) {
    switch (tag) {
      case "MoBlade":
        return stats.moBladeDmgBoost;
      case "HengBlade":
        return stats.hengBladeDmgBoost;
      case "Spear":
        return stats.spearDmgBoost;
      case "Gauntlet":
        return stats.gauntletDmgBoost;
      case "RopeDart":
        return stats.ropeDartDmgBoost;
      case "Umbrella":
        return stats.umbrellaDmgBoost;
    }
  }
  return 0;
}

function mysticSkillDamageBonus(stats: CharacterStats, skillTags: string[]) {
  for (const tag of skillTags) {
    switch (tag) {
      case "SingleTargetMystic":
        return stats.singleTargetMysticDmgBoost;
      case "AreaMystic":
        return stats.areaMysticDmgBoost;
    }
  }
  return 0;
}

function calculateDamageBreakdownInternal(
  action: DamageAction,
  context: DamageContext,
  random?: () => number,
): DamageBreakdown {
  const { stats: baseStats, attunement, skillTags, weapons, enemy, derivedStats: baseDerivedStats, effects } = context;
  const hasStatEffects = effects.some(
    (effect) =>
      (effect.stat && typeof effect.stat === "object") ||
      (effect.effectiveStat && typeof effect.effectiveStat === "object"),
  );
  const calculatedStats = hasStatEffects
    ? calculateStatsWithEffects(
        baseStats,
        effects as Array<StatEffectContainer & EffectiveStatEffectContainer>,
        enemy.judgementResistance,
      )
    : undefined;
  const stats = calculatedStats?.stats ?? baseStats;
  const derivedStats = calculatedStats?.derivedStats ?? baseDerivedStats;
  const effectValue = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
    const objectValue = value as Record<string, unknown>;
    const dynamicParameters = {
      distance: context.distance ?? 1,
      maxHp: stats.maxHp,
      currentHPPercentage: (context.currentHPRatio ?? 1) * 100,
      missingHPPercentage: (1 - (context.currentHPRatio ?? 1)) * 100,
      targetHPPercentage: (context.targetHPRatio ?? 1) * 100,
      missingTargetHPPercentage: (1 - (context.targetHPRatio ?? 1)) * 100,
    };
    const multiplied = resolveMultiplyValue(value, dynamicParameters);
    if (multiplied !== undefined) return multiplied;
    const segmented = resolveSegmentValue(value, dynamicParameters);
    if (segmented !== undefined) return segmented;
    const formula = objectValue.formula;
    return formula && typeof formula === "object" && !Array.isArray(formula)
      ? (resolveFormulaValue(formula as StatFormula, { ...stats, ...derivedStats }) ?? 0)
      : 0;
  };
  const coefficient = numberValue(action.phyCoef);
  const physicalBonus = context.isDot ? 0 : numberValue(action.phyBonus);
  const attributeBonus = context.isDot ? 0 : numberValue(action.attrBonus);
  const path = mainAttribute(weapons);
  const attackBonus = (type: string) =>
    effects.reduce((total, effect) => total + effectValue(effect[`${type}AttackBonus`]), 0);
  const physicalAttackMultiplier = 1 + attackBonus("physical");
  const minPhysicalAttack = derivedStats.effectiveMinPhys * physicalAttackMultiplier;
  const maxPhysicalAttack = derivedStats.effectiveMaxPhys * physicalAttackMultiplier;
  const averagePhysicalAttack = (minPhysicalAttack + maxPhysicalAttack) / 2;
  const attributeRanges = [
    [
      derivedStats.effectiveMinBellstrike * (1 + attackBonus("bellstrike")),
      derivedStats.effectiveMaxBellstrike * (1 + attackBonus("bellstrike")),
      stats.bellstrikePenetration,
      stats.bellstrikeDmgBonus,
      "bellstrike",
      enemy.bellstrikeResistance,
    ],
    [
      derivedStats.effectiveMinStonesplit * (1 + attackBonus("stonesplit")),
      derivedStats.effectiveMaxStonesplit * (1 + attackBonus("stonesplit")),
      stats.stonesplitPenetration,
      stats.stonesplitDmgBonus,
      "stonesplit",
      enemy.stonesplitResistance,
    ],
    [
      derivedStats.effectiveMinSilkbind * (1 + attackBonus("silkbind")),
      derivedStats.effectiveMaxSilkbind * (1 + attackBonus("silkbind")),
      stats.silkbindPenetration,
      stats.silkbindDmgBonus,
      "silkbind",
      enemy.silkbindResistance,
    ],
    [
      derivedStats.effectiveMinBamboocut * (1 + attackBonus("bamboocut")),
      derivedStats.effectiveMaxBamboocut * (1 + attackBonus("bamboocut")),
      stats.bamboocutPenetration,
      stats.bamboocutDmgBonus,
      "bamboocut",
      enemy.bamboocutResistance,
    ],
  ] as Array<[number, number, number, number, string, number]>;
  const innerWayDmgBonus = effects.reduce(
    (total, effect) =>
      total +
      effectValue(effect.dmgBonus) +
      (!Array.isArray(effect.hpDMGBonusWeapons) ||
      effect.hpDMGBonusWeapons.some((weapon) => weapons.includes(weapon as WeaponId))
        ? effectValue(effect.hpDMGBonus)
        : 0),
    0,
  );
  const baseDmgBonus = effects.reduce((total, effect) => total + effectValue(effect.baseDMGBonus), 0);
  const globalDmgBonus = effects.reduce(
    (total, effect) => total + effectValue(effect.globalDmgBonus) + effectValue(effect.globalHPDMGBonus),
    0,
  );
  const globalBellstrikeDmgBonus = effects.reduce(
    (total, effect) => total + effectValue(effect.globalBellstrikeDMGBonus),
    0,
  );
  const dotDamageBonus = context.isDot
    ? effects.reduce((total, effect) => total + effectValue(effect.dotDamage), 0)
    : 0;
  const effectPhysicalPenetration = effects.reduce(
    (total, effect) => total + effectValue(effect.physicalPenetration),
    0,
  );
  const defenseBonus = effects.reduce((total, effect) => total + effectValue(effect.defenseBonus), 0);
  const physicalResistanceAdjustment = effects.reduce(
    (total, effect) => total + effectValue(effect.physicalResistance),
    0,
  );
  const effectAttributePenetration = (attribute: string) =>
    effects.reduce((total, effect) => total + effectValue(effect[`${attribute}Penetration`]), 0);
  const effectCritDmgBonus = effects.reduce((total, effect) => total + effectValue(effect.critDmgBonus), 0);
  const effectAffinityDmgBonus = effects.reduce((total, effect) => total + effectValue(effect.affinityDmgBonus), 0);
  const attributeDmgBonus = effects.reduce((total, effect) => total + effectValue(effect.attributeDMGBonus), 0);
  const attunementStat = (target: string) =>
    Object.entries(attunement).reduce((total, [key, value]) => {
      const definition = attunementDefinitions[key];
      const matchTags = definition?.effect?.tags;
      if (matchTags && !matchTags.every((tag) => skillTags.includes(tag))) return total;
      const excludeTags = definition?.effect?.excludeTags;
      if (excludeTags?.some((tag) => skillTags.includes(tag))) return total;
      const multiplier = definition.effect?.stat?.[target];
      return total + (typeof multiplier === "number" && Number.isFinite(multiplier) ? value * multiplier : 0);
    }, 0);
  const attunementBonus = attunementStat("attunementDMGBonus");
  const attunementPhysicalPenetration = attunementStat("physicalPenetration");
  const attunementFormlessPenetration = attunementStat("formlessPenetration");
  const skillWeaponArtBonus = weaponArtBonus(stats, skillTags);
  const mysticSkillBonus = mysticSkillDamageBonus(stats, skillTags);
  const damageBonusCategory1 =
    stats.vsBossDmg +
    (skillTags.includes("MartialArts") ? stats.allMartialArts : 0) +
    skillWeaponArtBonus +
    mysticSkillBonus +
    innerWayDmgBonus;
  const physicalSharedBonus = (1 + baseDmgBonus) * (1 + damageBonusCategory1) * (1 + attunementBonus);
  const attributeSharedBonus =
    (1 + baseDmgBonus) * (1 + damageBonusCategory1 + attributeDmgBonus) * (1 + attunementBonus);
  const randomUnit = () => Math.min(1 - Number.EPSILON, Math.max(0, random?.() ?? 0.5));
  const attackValue = (minimum: number, maximum: number, mode: AttackRollMode) => {
    switch (mode) {
      case "min":
        return minimum;
      case "max":
        return maximum;
      case "simulate":
        return minimum === maximum ? minimum : minimum + (maximum - minimum) * randomUnit();
      case "average":
        return (minimum + maximum) / 2;
    }
  };
  const calculateAttributeDamage = (mode: AttackRollMode) =>
    attributeRanges.reduce(
      (total, [minAttack, maxAttack, penetration, damageBonus, attribute, resistance]) => {
        const attack = attackValue(minAttack, maxAttack, mode);
        const resistanceAdjustment = effects.reduce(
          (sum, effect) => sum + effectValue(effect[`${attribute}Resistance`]),
          0,
        );
        const damage =
          (coefficient * attack + (attribute === path ? attributeBonus : 0)) *
          penetrationMultiplier(
            penetration +
              effectAttributePenetration(attribute) +
              (attribute === path ? attunementFormlessPenetration : 0),
            resistance + resistanceAdjustment,
          ) *
          (1 + damageBonus) *
          (attribute === path ? 1.5 : 1);
        return { ...total, [attribute]: total[attribute as keyof typeof total] + damage };
      },
      { bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0 },
    );
  const calculateVariant = (damageType: AttackRollMode, specialBonus: number) => {
    const physicalAttack =
      damageType === "average" ? averagePhysicalAttack : attackValue(minPhysicalAttack, maxPhysicalAttack, damageType);
    const adjustedEnemyDefense = enemy.defense * (1 + defenseBonus);
    const physicalDamage =
      (coefficient * (physicalAttack - adjustedEnemyDefense) + physicalBonus) *
      penetrationMultiplier(
        attunementPhysicalPenetration + effectPhysicalPenetration,
        enemy.physicalResistance + physicalResistanceAdjustment,
      ) *
      (1 + stats.physDmgBonus);
    const physicalMultiplier = physicalSharedBonus * (1 + specialBonus) * (1 + dotDamageBonus);
    const attributeMultiplier = attributeSharedBonus * (1 + specialBonus) * (1 + dotDamageBonus);
    const globalMultiplier = 1 + globalDmgBonus;
    const attributeDamage = calculateAttributeDamage(damageType);
    return {
      physical: Math.max(0, physicalDamage * physicalMultiplier * globalMultiplier),
      bellstrike: attributeDamage.bellstrike * attributeMultiplier * (globalMultiplier + globalBellstrikeDmgBonus),
      stonesplit: attributeDamage.stonesplit * attributeMultiplier * globalMultiplier,
      silkbind: attributeDamage.silkbind * attributeMultiplier * globalMultiplier,
      bamboocut: attributeDamage.bamboocut * attributeMultiplier * globalMultiplier,
    };
  };
  const rateStats = {
    effectivePrecision: derivedStats.effectivePrecision,
    effectiveCrit: derivedStats.effectiveCrit,
    effectiveAffinity: derivedStats.effectiveAffinity,
    directCrit: derivedStats.directCrit,
    directAffinity: derivedStats.finalAffinity - derivedStats.effectiveAffinity,
    finalAffinity: derivedStats.finalAffinity,
  };
  const convertedRateStats = effects.some((effect) => effect.convert !== undefined)
    ? applyStatConversions(rateStats, effects as StatConversionEffectContainer[])
    : rateStats;
  const SteadfastGuaranteedCrit =
    effects.some((effect) => effect.SteadfastGuaranteedCrit === true) &&
    (skillTags.includes("BurningHeart") || skillTags.includes("AnxiSoldier"));
  const rates = calculateRates(convertedRateStats, { SteadfastGuaranteedCrit });
  if (random) {
    const outcomeRoll = randomUnit();
    let outcome: DamageOutcome;
    switch (true) {
      case outcomeRoll < rates.abrasionRate:
        outcome = "abrasion";
        break;
      case outcomeRoll < rates.abrasionRate + rates.normalRate:
        outcome = "normal";
        break;
      case outcomeRoll < rates.abrasionRate + rates.normalRate + rates.critRate:
        outcome = "critical";
        break;
      default:
        outcome = "affinity";
    }
    let selectedDamage: ReturnType<typeof calculateVariant>;
    switch (outcome) {
      case "abrasion":
        selectedDamage = calculateVariant("min", 0);
        break;
      case "affinity":
        selectedDamage = calculateVariant("max", stats.affinityDmgBonus + effectAffinityDmgBonus);
        break;
      case "critical":
        selectedDamage = calculateVariant("simulate", derivedStats.effectiveCritDmgBonus + effectCritDmgBonus);
        break;
      case "normal":
        selectedDamage = calculateVariant("simulate", 0);
        break;
    }
    return {
      ...selectedDamage,
      total:
        selectedDamage.physical +
        selectedDamage.bellstrike +
        selectedDamage.stonesplit +
        selectedDamage.silkbind +
        selectedDamage.bamboocut,
      outcome,
      outcomeRates: {
        abrasion: outcome === "abrasion" ? 1 : 0,
        normal: outcome === "normal" ? 1 : 0,
        critical: outcome === "critical" ? 1 : 0,
        affinity: outcome === "affinity" ? 1 : 0,
      },
    };
  }
  const abrasionDamage = calculateVariant("min", 0);
  const normalDamage = calculateVariant("average", 0);
  const critDamage = calculateVariant("average", derivedStats.effectiveCritDmgBonus + effectCritDmgBonus);
  const affinityDamage = calculateVariant("max", stats.affinityDmgBonus + effectAffinityDmgBonus);
  const weighted = (key: keyof typeof abrasionDamage) =>
    abrasionDamage[key] * rates.abrasionRate +
    normalDamage[key] * rates.normalRate +
    critDamage[key] * rates.critRate +
    affinityDamage[key] * rates.affinityRate;
  const physical = weighted("physical");
  const bellstrike = weighted("bellstrike");
  const stonesplit = weighted("stonesplit");
  const silkbind = weighted("silkbind");
  const bamboocut = weighted("bamboocut");
  return {
    physical,
    bellstrike,
    stonesplit,
    silkbind,
    bamboocut,
    total: physical + bellstrike + stonesplit + silkbind + bamboocut,
    outcomeRates: {
      abrasion: rates.abrasionRate,
      normal: rates.normalRate,
      critical: rates.critRate,
      affinity: rates.affinityRate,
    },
  };
}

export function calculateDamageBreakdown(action: DamageAction, context: DamageContext): DamageBreakdown {
  return calculateDamageBreakdownInternal(action, context);
}

export function calculateSimulatedDamageBreakdown(
  action: DamageAction,
  context: DamageContext,
  random: () => number = Math.random,
): DamageBreakdown & { outcome: DamageOutcome } {
  return calculateDamageBreakdownInternal(action, context, random) as DamageBreakdown & { outcome: DamageOutcome };
}

export function calculateDamage(action: DamageAction, context: DamageContext) {
  return calculateDamageBreakdown(action, context).total;
}
