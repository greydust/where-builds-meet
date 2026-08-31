import attunementJson from "../../data/attunement.json";
import { weaponArtBonus, type DamageAction, type DamageContext } from "./damage";
import { resolveMultiplyValue, resolveSegmentValue } from "./dynamicValues";
import { calculateStatsWithEffects, resolveFormulaValue, type StatFormula } from "./statEffects";
import { DEFAULT_TARGET_HP_RATIO } from "./combatDefaults";

type AttunementDefinition = {
  effect?: { stat?: Record<string, number>; tags?: string[]; excludeTags?: string[] };
};

const attunementDefinitions = attunementJson as Record<string, AttunementDefinition>;

export const BASE_CRITICAL_HEALING_BONUS = 0.5;

export type HealingBreakdown = {
  physical: number;
  silkbind: number;
  total: number;
  normalRate?: number;
  criticalRate?: number;
};

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

function effectValue(
  value: unknown,
  context: DamageContext,
  stats: DamageContext["stats"],
  derivedStats: DamageContext["derivedStats"],
) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const parameters = {
    distance: context.distance ?? 1,
    maxHp: stats.maxHp,
    currentHPPercentage: (context.currentHPRatio ?? 1) * 100,
    missingHPPercentage: (1 - (context.currentHPRatio ?? 1)) * 100,
    targetHPPercentage: (context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO) * 100,
    missingTargetHPPercentage: (1 - (context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO)) * 100,
  };
  const multiplied = resolveMultiplyValue(value, parameters);
  if (multiplied !== undefined) return multiplied;
  const segmented = resolveSegmentValue(value, parameters);
  if (segmented !== undefined) return segmented;
  const formula = (value as Record<string, unknown>).formula;
  return formula && typeof formula === "object" && !Array.isArray(formula)
    ? (resolveFormulaValue(formula as StatFormula, { ...stats, ...derivedStats }) ?? 0)
    : 0;
}

function matchingAttunementStats(context: DamageContext) {
  let physicalPenetration = 0;
  let healingBonus = 0;
  for (const [key, value] of Object.entries(context.attunement)) {
    const definition = attunementDefinitions[key];
    const requiredTags = definition?.effect?.tags;
    if (requiredTags && !requiredTags.every((tag) => context.skillTags.includes(tag))) continue;
    const excludedTags = definition?.effect?.excludeTags;
    if (excludedTags?.some((tag) => context.skillTags.includes(tag))) continue;
    const stats = definition?.effect?.stat;
    physicalPenetration += value * numberValue(stats?.physicalPenetration);
    healingBonus += value * numberValue(stats?.healingBonus);
  }
  return { physicalPenetration, healingBonus };
}

/** Resolve one healing action from the same hit-time stats and effects used by damage actions. */
export function calculateHealingBreakdown(action: DamageAction, context: DamageContext): HealingBreakdown {
  const hasStatEffects = context.effects.some(
    (effect) =>
      (effect.stat && typeof effect.stat === "object") ||
      (effect.effectiveStat && typeof effect.effectiveStat === "object"),
  );
  const calculated = hasStatEffects
    ? calculateStatsWithEffects(context.stats, context.effects, context.enemy.judgementResistance, context.weapons)
    : undefined;
  const stats = calculated?.stats ?? context.stats;
  const derivedStats = calculated?.derivedStats ?? context.derivedStats;
  const unconditional = context.unconditionalDamageEffects ?? {};
  let physicalAttackBonus = unconditional.physicalAttackBonus ?? 0;
  let silkbindAttackBonus = unconditional.silkbindAttackBonus ?? 0;
  let physicalPenetration = unconditional.physicalPenetration ?? 0;
  let silkbindPenetration = stats.silkbindPenetration + (unconditional.silkbindPenetration ?? 0);
  let healingBonus = 0;
  let criticalHealingBonus = 0;

  for (const effect of context.effects) {
    physicalAttackBonus += effectValue(effect.physicalAttackBonus, context, stats, derivedStats);
    silkbindAttackBonus += effectValue(effect.silkbindAttackBonus, context, stats, derivedStats);
    physicalPenetration += effectValue(effect.physicalPenetration, context, stats, derivedStats);
    silkbindPenetration += effectValue(effect.silkbindPenetration, context, stats, derivedStats);
    healingBonus += effectValue(effect.healingBonus, context, stats, derivedStats);
    criticalHealingBonus += effectValue(effect.criticalHealingBonus, context, stats, derivedStats);
  }

  const attunement = matchingAttunementStats(context);
  physicalPenetration += attunement.physicalPenetration;
  healingBonus += attunement.healingBonus;

  const coefficient = numberValue(action.phyCoef);
  const averagePhysicalAttack =
    ((derivedStats.effectiveMinPhys + derivedStats.effectiveMaxPhys) / 2) * (1 + physicalAttackBonus);
  const averageSilkbindAttack =
    ((derivedStats.effectiveMinSilkbind + derivedStats.effectiveMaxSilkbind) / 2) * (1 + silkbindAttackBonus);
  const physical =
    (averagePhysicalAttack * coefficient + numberValue(action.phyBonus)) * (1 + physicalPenetration / 200);
  const silkbind =
    (averageSilkbindAttack * coefficient + numberValue(action.attrBonus)) *
    (1 + silkbindPenetration / 200) *
    (1 + stats.silkbindHealingBonus);
  const criticalRate = Math.min(
    1,
    Math.max(0, (derivedStats.effectiveCrit + derivedStats.directCrit) * derivedStats.effectivePrecision),
  );
  const criticalMultiplier = 1 + criticalRate * (BASE_CRITICAL_HEALING_BONUS + criticalHealingBonus);
  const martialArtHealingBonus = context.skillTags.includes("MartialArts")
    ? stats.allMartialArts + weaponArtBonus(stats, context.skillTags)
    : 0;
  const generalMultiplier = 1 + healingBonus + martialArtHealingBonus;

  return {
    physical: Math.max(0, physical * criticalMultiplier * generalMultiplier),
    silkbind: Math.max(0, silkbind * criticalMultiplier * generalMultiplier),
    total: Math.max(0, (physical + silkbind) * criticalMultiplier * generalMultiplier),
    normalRate: 1 - criticalRate,
    criticalRate,
  };
}
