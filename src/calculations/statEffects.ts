import type { CharacterStats, WeaponId } from "../types";
import { calculateDerivedStats, type DerivedStats } from "./effectiveStats";
import { resolveSegmentValue } from "./dynamicValues";
import { applyCharacterStatCaps, calculationStatMaximum } from "./statCaps";

export type StatFormula = {
  source: string;
  multiplier?: number;
  offset?: number;
  min?: number;
  max?: number;
  round?: number;
};

export type FormulaStatValue = { formula: StatFormula };
export type SegmentStatValue = { function: "segment"; param1: string | number; param2: number[]; param3: number[] };
export type StatEffectValues = Partial<Record<keyof CharacterStats, number | FormulaStatValue | SegmentStatValue>>;
export type StatEffectContainer = { stat?: StatEffectValues };
export type EffectiveStatEffectContainer = { effectiveStat?: StatEffectValues };
export type StatConversion = { from: string; to: string; ratio: number; max?: number };
export type StatConversionEffectContainer = { convert?: StatConversion | StatConversion[] };

const normalizeInternalValue = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000;

export function applyStatConversions<T extends Record<string, number>>(
  currentStats: T,
  effects: StatConversionEffectContainer[],
) {
  const convertedStats: Record<string, number> = { ...currentStats };
  const conversions = effects.flatMap((effect) => {
    if (Array.isArray(effect.convert)) return effect.convert;
    return effect.convert ? [effect.convert] : [];
  });

  for (const conversion of conversions) {
    const source = convertedStats[conversion.from];
    const target = convertedStats[conversion.to];
    if (
      typeof source !== "number" ||
      !Number.isFinite(source) ||
      typeof target !== "number" ||
      !Number.isFinite(target) ||
      typeof conversion.ratio !== "number" ||
      !Number.isFinite(conversion.ratio)
    )
      continue;
    const maximum =
      typeof conversion.max === "number" && Number.isFinite(conversion.max)
        ? Math.max(0, conversion.max)
        : Number.POSITIVE_INFINITY;
    const targetMaximum = calculationStatMaximum(conversion.to);
    const targetCapacity =
      targetMaximum !== undefined && conversion.ratio > 0
        ? Math.max(0, targetMaximum - target) / conversion.ratio
        : Number.POSITIVE_INFINITY;
    const convertedAmount = Math.min(Math.max(0, source), maximum, targetCapacity);
    convertedStats[conversion.from] = normalizeInternalValue(source - convertedAmount);
    convertedStats[conversion.to] = normalizeInternalValue(
      Math.min(targetMaximum ?? Number.POSITIVE_INFINITY, target + convertedAmount * conversion.ratio),
    );
  }

  return convertedStats as T;
}

export function resolveFormulaValue(formula: StatFormula, sources: Record<string, unknown>) {
  const source = sources[formula.source];
  if (typeof source !== "number" || !Number.isFinite(source)) return undefined;
  let value = source * (formula.multiplier ?? 1) + (formula.offset ?? 0);
  if (typeof formula.min === "number") value = Math.max(formula.min, value);
  if (typeof formula.max === "number") value = Math.min(formula.max, value);
  if (typeof formula.round === "number") {
    const precision = 10 ** formula.round;
    value = Math.round(value * precision) / precision;
  }
  return value;
}

export function applyStatEffects(baseStats: CharacterStats, effects: StatEffectContainer[]) {
  const adjustedStats = { ...baseStats };
  const statEffects = effects.flatMap((effect) => (effect.stat ? [effect.stat] : []));

  // Apply fixed values first so formulas read the character's fully adjusted
  // source stat regardless of JSON ordering.
  statEffects.forEach((statEffect) =>
    Object.entries(statEffect).forEach(([key, value]) => {
      if (key in adjustedStats && typeof value === "number") {
        const statKey = key as keyof CharacterStats;
        adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + value);
      }
    }),
  );
  statEffects.forEach((statEffect) =>
    Object.entries(statEffect).forEach(([key, value]) => {
      if (!(key in adjustedStats) || !value || typeof value !== "object") return;
      const resolved =
        "formula" in value
          ? resolveFormulaValue((value as FormulaStatValue).formula, adjustedStats)
          : resolveSegmentValue(value, adjustedStats);
      if (resolved === undefined) return;
      const statKey = key as keyof CharacterStats;
      adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + resolved);
    }),
  );
  return applyCharacterStatCaps(adjustedStats);
}

export function applyDerivedStatEffects(
  baseStats: CharacterStats,
  effects: StatEffectContainer[],
  derivedStats: DerivedStats,
) {
  const adjustedStats = { ...baseStats };
  const statEffects = effects.flatMap((effect) => (effect.stat ? [effect.stat] : []));
  statEffects.forEach((statEffect) =>
    Object.entries(statEffect).forEach(([key, value]) => {
      if (!(key in adjustedStats) || !value || typeof value !== "object") return;
      if ("formula" in value) {
        const formula = (value as FormulaStatValue).formula;
        // Formulas backed by character stats were already handled by applyStatEffects.
        if (formula.source in baseStats) return;
        const resolved = resolveFormulaValue(formula, derivedStats as unknown as Record<string, unknown>);
        if (resolved === undefined) return;
        const statKey = key as keyof CharacterStats;
        adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + resolved);
        return;
      }
      const source = (value as SegmentStatValue).param1;
      if (typeof source === "string" && source in baseStats) return;
      const resolved = resolveSegmentValue(value, derivedStats as unknown as Record<string, number | undefined>);
      if (resolved === undefined) return;
      const statKey = key as keyof CharacterStats;
      adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + resolved);
    }),
  );
  return applyCharacterStatCaps(adjustedStats);
}

export function collectEffectiveStatEffects(stats: CharacterStats, effects: EffectiveStatEffectContainer[]) {
  const result: Partial<CharacterStats> = {};
  const effectiveStatEffects = effects.flatMap((effect) => (effect.effectiveStat ? [effect.effectiveStat] : []));
  effectiveStatEffects.forEach((statEffect) =>
    Object.entries(statEffect).forEach(([key, value]) => {
      if (!(key in stats)) return;
      const statKey = key as keyof CharacterStats;
      const resolved =
        typeof value === "number"
          ? value
          : value && typeof value === "object" && "formula" in value
            ? (resolveFormulaValue((value as FormulaStatValue).formula, stats) ?? 0)
            : (resolveSegmentValue(value, stats) ?? 0);
      result[statKey] = normalizeInternalValue((result[statKey] ?? 0) + resolved);
    }),
  );
  return result;
}

export function calculateStatsWithEffects(
  baseStats: CharacterStats,
  effects: Array<StatEffectContainer & EffectiveStatEffectContainer>,
  judgementResistance: number,
  weapons: WeaponId[] = [],
) {
  const directlyAdjustedStats = applyStatEffects(baseStats, effects);
  const initialEffectiveStat = collectEffectiveStatEffects(directlyAdjustedStats, effects);
  const initialDerivedStats = calculateDerivedStats(
    directlyAdjustedStats,
    judgementResistance,
    initialEffectiveStat,
    weapons,
  );
  const stats = applyDerivedStatEffects(directlyAdjustedStats, effects, initialDerivedStats);
  const effectiveStat = collectEffectiveStatEffects(stats, effects);
  const derivedStats = calculateDerivedStats(stats, judgementResistance, effectiveStat, weapons);
  return { stats, effectiveStat, derivedStats };
}

export type CharacterStatOverrides = Partial<CharacterStats>;

export function calculateStatsWithOverrides(
  baseStats: CharacterStats,
  effects: Array<StatEffectContainer & EffectiveStatEffectContainer>,
  judgementResistance: number,
  overrides: CharacterStatOverrides,
  weapons: WeaponId[] = [],
) {
  const adjustedBaseStats = { ...baseStats };
  const overrideEntries = Object.entries(overrides).filter(
    (entry): entry is [keyof CharacterStats, number] =>
      entry[0] in adjustedBaseStats && typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );

  // Solve the raw input required to produce each requested final value. Re-running
  // the shared pipeline after every correction also lets an overridden source
  // stat feed formula effects before a dependent overridden stat is corrected.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const result = calculateStatsWithEffects(adjustedBaseStats, effects, judgementResistance, weapons);
    let largestCorrection = 0;
    for (const [key, targetValue] of overrideEntries) {
      const correction = targetValue - result.stats[key];
      adjustedBaseStats[key] = normalizeInternalValue(adjustedBaseStats[key] + correction);
      largestCorrection = Math.max(largestCorrection, Math.abs(correction));
    }
    if (largestCorrection < 1e-9) return { baseStats: adjustedBaseStats, ...result };
  }

  return {
    baseStats: adjustedBaseStats,
    ...calculateStatsWithEffects(adjustedBaseStats, effects, judgementResistance, weapons),
  };
}
