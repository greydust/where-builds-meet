import type { CharacterStats } from "../types";

// Level 96 baseline. Keep this as a named setting so it can become user-configurable later.
export const JUDGEMENT_RESISTANCE = 0.65;

export type DerivedStats = {
  effectiveMinPhys: number;
  effectiveMaxPhys: number;
  effectiveMinBellstrike: number;
  effectiveMaxBellstrike: number;
  effectiveMinSilkbind: number;
  effectiveMaxSilkbind: number;
  effectiveMinStonesplit: number;
  effectiveMaxStonesplit: number;
  effectiveMinBamboocut: number;
  effectiveMaxBamboocut: number;
  effectivePrecision: number;
  effectiveCrit: number;
  effectiveAffinity: number;
  effectiveCritDmgBonus: number;
  directCrit: number;
  finalCrit: number;
  finalAffinity: number;
  abrasionRate: number;
  normalRate: number;
  critRate: number;
  affinityRate: number;
};

export type RateCalculation = {
  effectivePrecision: number;
  effectiveCrit: number;
  effectiveAffinity: number;
  finalAffinity: number;
  finalCrit: number;
  abrasionRate: number;
  normalRate: number;
  critRate: number;
  affinityRate: number;
};

export function calculateRates(
  input: {
    effectivePrecision: number;
    effectiveCrit: number;
    effectiveAffinity: number;
    directCrit: number;
    directAffinity: number;
  },
  options: { SteadfastGuaranteedCrit?: boolean } = {},
): RateCalculation {
  const clampRate = (value: number) => Math.min(1, Math.max(0, value));
  const finalAffinity = clampRate(input.effectiveAffinity + input.directAffinity);
  const baseFinalCrit =
    finalAffinity + input.directCrit + input.effectiveCrit <= 1
      ? (input.effectiveCrit + input.directCrit) * input.effectivePrecision
      : (1 - finalAffinity) * input.effectivePrecision;
  const SteadfastGuaranteedCrit = options.SteadfastGuaranteedCrit === true;
  if (SteadfastGuaranteedCrit && baseFinalCrit >= 0.75) {
    return {
      effectivePrecision: input.effectivePrecision,
      effectiveCrit: input.effectiveCrit,
      effectiveAffinity: input.effectiveAffinity,
      finalAffinity,
      finalCrit: 1,
      abrasionRate: 0,
      normalRate: 0,
      critRate: 1,
      affinityRate: 0,
    };
  }
  const directCrit = input.directCrit + (SteadfastGuaranteedCrit ? 0.15 : 0);
  const uncappedFinalCrit = SteadfastGuaranteedCrit
    ? finalAffinity + directCrit + input.effectiveCrit <= 1
      ? (input.effectiveCrit + directCrit) * input.effectivePrecision
      : (1 - finalAffinity) * input.effectivePrecision
    : baseFinalCrit;
  const finalCrit = clampRate(uncappedFinalCrit);
  const abrasionRate = (1 - input.effectivePrecision) * (1 - finalAffinity);
  const affinityRate = finalAffinity;
  const critRate = finalCrit;
  return {
    effectivePrecision: input.effectivePrecision,
    effectiveCrit: input.effectiveCrit,
    effectiveAffinity: input.effectiveAffinity,
    finalAffinity,
    finalCrit,
    abrasionRate,
    affinityRate,
    critRate,
    normalRate: Math.max(0, 1 - abrasionRate - affinityRate - critRate),
  };
}

export function calculateDerivedStats(
  stats: CharacterStats,
  judgementResistance = JUDGEMENT_RESISTANCE,
  effectiveStat: Partial<CharacterStats> = {},
): DerivedStats {
  const effectiveMax = (min: number, max: number) => Math.max(min, max);
  const effectiveValue = (key: keyof CharacterStats) =>
    stats[key] + (typeof effectiveStat[key] === "number" ? effectiveStat[key]! : 0);
  const minPhys = effectiveValue("minPhys");
  const maxPhys = effectiveValue("maxPhys");
  const minBellstrike = effectiveValue("minBellstrike");
  const maxBellstrike = effectiveValue("maxBellstrike");
  const minStonesplit = effectiveValue("minStonesplit");
  const maxStonesplit = effectiveValue("maxStonesplit");
  const minSilkbind = effectiveValue("minSilkbind");
  const maxSilkbind = effectiveValue("maxSilkbind");
  const minBamboocut = effectiveValue("minBamboocut");
  const maxBamboocut = effectiveValue("maxBamboocut");
  const normalizedStonesplitMax = effectiveMax(minStonesplit, maxStonesplit);
  const stonesplitWithVoidMin = minStonesplit + effectiveValue("minVoidAttack");
  const stonesplitWithVoidMax = normalizedStonesplitMax + effectiveValue("maxVoidAttack");
  const effectiveMinStonesplit = stonesplitWithVoidMin;
  const effectiveMaxStonesplit = Math.max(stonesplitWithVoidMin, stonesplitWithVoidMax);
  const precision = effectiveValue("precision");
  const crit = effectiveValue("crit");
  const effectiveCritBonus = effectiveValue("effectiveCritBonus");
  const affinity = effectiveValue("affinity");
  const directCrit = effectiveValue("directCrit");
  const directAffinity = effectiveValue("directAffinity");
  const effectivePrecision = Math.min(
    1,
    (precision - judgementResistance) / (1 + judgementResistance) + judgementResistance,
  );
  const effectiveCrit = Math.min(0.8, crit / (1 + judgementResistance) + effectiveCritBonus);
  const effectiveAffinity = Math.min(0.4, affinity / (1 + judgementResistance));
  const rates = calculateRates({ effectivePrecision, effectiveCrit, effectiveAffinity, directCrit, directAffinity });

  return {
    effectiveMinPhys: minPhys,
    effectiveMaxPhys: effectiveMax(minPhys, maxPhys),
    effectiveMinBellstrike: minBellstrike,
    effectiveMaxBellstrike: effectiveMax(minBellstrike, maxBellstrike),
    effectiveMinSilkbind: minSilkbind,
    effectiveMaxSilkbind: effectiveMax(minSilkbind, maxSilkbind),
    effectiveMinStonesplit,
    effectiveMaxStonesplit,
    effectiveMinBamboocut: minBamboocut,
    effectiveMaxBamboocut: effectiveMax(minBamboocut, maxBamboocut),
    effectivePrecision,
    effectiveCrit,
    effectiveAffinity,
    effectiveCritDmgBonus: effectiveValue("critDmgBonus"),
    directCrit,
    finalCrit: rates.finalCrit,
    finalAffinity: rates.finalAffinity,
    abrasionRate: rates.abrasionRate,
    normalRate: rates.normalRate,
    critRate: rates.critRate,
    affinityRate: rates.affinityRate,
  };
}
