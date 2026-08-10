import type { CharacterStats, EnemyProfile, WeaponId } from "../types";
import { calculateRates } from "./effectiveStats";
import type { DerivedStats } from "./effectiveStats";
import { calculateStatsWithEffects, resolveFormulaValue, type EffectiveStatEffectContainer, type StatEffectContainer, type StatFormula } from "./statEffects";

export type AttunementStats = {
  physicalPenetration: number;
  formlessPenetration: number;
  phalanxbaneChargedBoost: number;
  phalanxbaneMartialBoost: number;
  snowpartingChargedBoost: number;
  snowpartingVariedComboBoost: number;
  snowpartingMartialBoost: number;
};

// Current level-100 test target. Move this to user-configurable encounter data later.
export const ENEMY_DEFENSE = 405;

export type DamageAction = {
  phyCoef?: unknown;
  phyBonus?: unknown;
  attrBonus?: unknown;
};
export type DamageOutcomeRates = { abrasion: number; normal: number; critical: number; affinity: number };
export type DamageBreakdown = { physical: number; bellstrike: number; stonesplit: number; silkbind: number; bamboocut: number; total: number; outcomeRates?: DamageOutcomeRates };

export type DamageContext = {
  stats: CharacterStats;
  attunement: AttunementStats;
  skillTags: string[];
  weapons: WeaponId[];
  buffs: string[];
  enemy: EnemyProfile;
  derivedStats: DerivedStats;
  effects: Record<string, unknown>[];
  isDot?: boolean;
};

const numberValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

function penetrationMultiplier(penetration: number, resistance = 0) {
  return penetration >= resistance
    ? 1 + (penetration - resistance) / 200
    : 1 + (penetration - resistance) / 100;
}

function mainAttribute(weapons: WeaponId[]) {
  if (weapons.includes("snowparting") || weapons.includes("phalanxbane")) return "stonesplit" as const;
  return undefined;
}

export function calculateDamageBreakdown(action: DamageAction, context: DamageContext): DamageBreakdown {
  const { stats: baseStats, attunement, skillTags, weapons, enemy, derivedStats: baseDerivedStats, effects } = context;
  const hasStatEffects = effects.some((effect) => (effect.stat && typeof effect.stat === "object") || (effect.effectiveStat && typeof effect.effectiveStat === "object"));
  const calculatedStats = hasStatEffects
    ? calculateStatsWithEffects(baseStats, effects as Array<StatEffectContainer & EffectiveStatEffectContainer>, enemy.judgementResistance)
    : undefined;
  const stats = calculatedStats?.stats ?? baseStats;
  const derivedStats = calculatedStats?.derivedStats ?? baseDerivedStats;
  const effectValue = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!value || typeof value !== "object" || Array.isArray(value) || !("formula" in value)) return 0;
    const formula = (value as { formula?: unknown }).formula;
    return formula && typeof formula === "object" && !Array.isArray(formula)
      ? resolveFormulaValue(formula as StatFormula, { ...stats, ...derivedStats }) ?? 0
      : 0;
  };
  const coefficient = numberValue(action.phyCoef);
  const physicalBonus = context.isDot ? 0 : numberValue(action.phyBonus);
  const attributeBonus = context.isDot ? 0 : numberValue(action.attrBonus);
  const path = mainAttribute(weapons);
  const minPhysicalAttack = derivedStats.effectiveMinPhys;
  const maxPhysicalAttack = derivedStats.effectiveMaxPhys;
  const averagePhysicalAttack = (minPhysicalAttack + maxPhysicalAttack) / 2;
  const attributeRanges = [
    [derivedStats.effectiveMinBellstrike, derivedStats.effectiveMaxBellstrike, stats.bellstrikePenetration, stats.bellstrikeDmgBonus, "bellstrike", enemy.bellstrikeResistance],
    [derivedStats.effectiveMinStonesplit, derivedStats.effectiveMaxStonesplit, stats.stonesplitPenetration, stats.stonesplitDmgBonus, "stonesplit", enemy.stonesplitResistance],
    [derivedStats.effectiveMinSilkbind, derivedStats.effectiveMaxSilkbind, stats.silkbindPenetration, stats.silkbindDmgBonus, "silkbind", enemy.silkbindResistance],
    [derivedStats.effectiveMinBamboocut, derivedStats.effectiveMaxBamboocut, stats.bamboocutPenetration, stats.bamboocutDmgBonus, "bamboocut", enemy.bamboocutResistance],
  ] as Array<[number, number, number, number, string, number]>;
  const innerWayDmgBonus = effects.reduce((total, effect) => total
    + (typeof effect.dmgBonus === "number" ? effect.dmgBonus : 0)
    + (typeof effect.hpDMGBonus === "number" && (!Array.isArray(effect.hpDMGBonusWeapons) || effect.hpDMGBonusWeapons.some((weapon) => weapons.includes(weapon as WeaponId))) ? effect.hpDMGBonus : 0), 0);
  const baseDmgBonus = effects.reduce((total, effect) => total
    + (typeof effect.baseDMGBonus === "number" ? effect.baseDMGBonus : 0), 0);
  const globalDmgBonus = effects.reduce((total, effect) => total
    + (typeof effect.globalDmgBonus === "number" ? effect.globalDmgBonus : 0), 0);
  const effectPhysicalPenetration = effects.reduce((total, effect) => total
    + effectValue(effect.physicalPenetration), 0);
  const effectStonesplitPenetration = effects.reduce((total, effect) => total
    + effectValue(effect.stonesplitPenetration), 0);
  const effectCritDmgBonus = effects.reduce((total, effect) => total
    + (typeof effect.critDmgBonus === "number" ? effect.critDmgBonus : 0), 0);
  const attunementBonus = skillTags.includes("PhalanxbaneBlade")
    ? (skillTags.includes("Charged") ? attunement.phalanxbaneChargedBoost : skillTags.includes("MartialArt") ? attunement.phalanxbaneMartialBoost : 0)
    : skillTags.includes("SnowpartingBlade")
      ? (skillTags.includes("Charged") ? attunement.snowpartingChargedBoost : skillTags.includes("VariedCombo") ? attunement.snowpartingVariedComboBoost : skillTags.includes("MartialArt") ? attunement.snowpartingMartialBoost : 0)
      : 0;
  const weaponArtBonus = skillTags.includes("MoBlade")
    ? stats.moBladeDmgBoost
    : skillTags.includes("HengBlade")
      ? stats.hengBladeDmgBoost
      : 0;
  const damageBonusCategory1 = stats.vsBossDmg
    + (skillTags.includes("MartialArts") ? stats.allMartialArts : 0)
    + weaponArtBonus
    + innerWayDmgBonus;
  const sharedBonus = (1 + baseDmgBonus) * (1 + damageBonusCategory1) * (1 + attunementBonus) * (1 + globalDmgBonus);
  const calculateAttributeDamage = (mode: "min" | "average" | "max") => attributeRanges.reduce((total, [minAttack, maxAttack, penetration, damageBonus, attribute, resistance]) => {
    const attack = mode === "min" ? minAttack : mode === "max" ? maxAttack : (minAttack + maxAttack) / 2;
    const resistanceAdjustment = effects.reduce((sum, effect) => sum + effectValue(effect[`${attribute}Resistance`]), 0);
    const damage = (coefficient * attack + (attribute === path ? attributeBonus : 0))
      * penetrationMultiplier(penetration + (attribute === "stonesplit" ? effectStonesplitPenetration : 0) + (attribute === path ? attunement.formlessPenetration : 0), resistance + resistanceAdjustment)
      * (1 + damageBonus)
      * (attribute === path ? 1.5 : 1);
    return { ...total, [attribute]: total[attribute as keyof typeof total] + damage };
  }, { bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0 });
  const calculateVariant = (damageType: "min" | "average" | "max", specialBonus: number) => {
    const physicalAttack = damageType === "min" ? minPhysicalAttack : damageType === "max" ? maxPhysicalAttack : averagePhysicalAttack;
    const physicalDamage = (coefficient * (physicalAttack - enemy.defense) + physicalBonus)
      * penetrationMultiplier(attunement.physicalPenetration + effectPhysicalPenetration, enemy.physicalResistance)
      * (1 + stats.physDmgBonus);
    const multiplier = sharedBonus * (1 + specialBonus);
    const attributeDamage = calculateAttributeDamage(damageType);
    return { physical: Math.max(0, physicalDamage * multiplier), bellstrike: attributeDamage.bellstrike * multiplier, stonesplit: attributeDamage.stonesplit * multiplier, silkbind: attributeDamage.silkbind * multiplier, bamboocut: attributeDamage.bamboocut * multiplier };
  };
  const effectiveCrit = derivedStats.effectiveCrit;
  const SteadfastGuaranteedCrit = effects.some((effect) => effect.SteadfastGuaranteedCrit === true)
    && (skillTags.includes("BurningHeart") || skillTags.includes("AnxiSoldier"));
  const rates = SteadfastGuaranteedCrit
    ? calculateRates({
      effectivePrecision: derivedStats.effectivePrecision,
      effectiveCrit,
      effectiveAffinity: derivedStats.effectiveAffinity,
      directCrit: derivedStats.directCrit,
      directAffinity: derivedStats.finalAffinity - derivedStats.effectiveAffinity,
    }, { SteadfastGuaranteedCrit: true })
    : {
      ...calculateRates({
        effectivePrecision: derivedStats.effectivePrecision,
        effectiveCrit,
        effectiveAffinity: derivedStats.effectiveAffinity,
        directCrit: derivedStats.directCrit,
        directAffinity: derivedStats.finalAffinity - derivedStats.effectiveAffinity,
      }),
    };
  const abrasionDamage = calculateVariant("min", 0);
  const normalDamage = calculateVariant("average", 0);
  const critDamage = calculateVariant("average", derivedStats.effectiveCritDmgBonus + effectCritDmgBonus);
  const affinityDamage = calculateVariant("max", stats.affinityDmgBonus);
  const weighted = (key: keyof typeof abrasionDamage) => abrasionDamage[key] * rates.abrasionRate + normalDamage[key] * rates.normalRate + critDamage[key] * rates.critRate + affinityDamage[key] * rates.affinityRate;
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

export function calculateDamage(action: DamageAction, context: DamageContext) {
  return calculateDamageBreakdown(action, context).total;
}
