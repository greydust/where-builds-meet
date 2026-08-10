import type { CharacterStats } from "../types";
import { calculateDerivedStats, type DerivedStats } from "./effectiveStats";

export type StatFormula = {
  source: string;
  multiplier?: number;
  offset?: number;
  min?: number;
  max?: number;
  round?: number;
};

export type FormulaStatValue = { formula: StatFormula };
export type StatEffectValues = Partial<Record<keyof CharacterStats, number | FormulaStatValue>>;
export type StatEffectContainer = { stat?: StatEffectValues };
export type EffectiveStatEffectContainer = { effectiveStat?: StatEffectValues };

const normalizeInternalValue = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000;

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
  const statEffects = effects.flatMap((effect) => effect.stat ? [effect.stat] : []);

  // Apply fixed values first so formulas read the character's fully adjusted
  // source stat regardless of JSON ordering.
  statEffects.forEach((statEffect) => Object.entries(statEffect).forEach(([key, value]) => {
    if (key in adjustedStats && typeof value === "number") {
      const statKey = key as keyof CharacterStats;
      adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + value);
    }
  }));
  statEffects.forEach((statEffect) => Object.entries(statEffect).forEach(([key, value]) => {
    if (!(key in adjustedStats) || !value || typeof value !== "object" || !("formula" in value)) return;
    const resolved = resolveFormulaValue((value as FormulaStatValue).formula, adjustedStats);
    if (resolved === undefined) return;
    const statKey = key as keyof CharacterStats;
    adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + resolved);
  }));
  return adjustedStats;
}

export function applyDerivedStatEffects(baseStats: CharacterStats, effects: StatEffectContainer[], derivedStats: DerivedStats) {
  const adjustedStats = { ...baseStats };
  const statEffects = effects.flatMap((effect) => effect.stat ? [effect.stat] : []);
  statEffects.forEach((statEffect) => Object.entries(statEffect).forEach(([key, value]) => {
    if (!(key in adjustedStats) || !value || typeof value !== "object" || !("formula" in value)) return;
    const formula = (value as FormulaStatValue).formula;
    // Formulas backed by character stats were already handled by applyStatEffects.
    if (formula.source in baseStats) return;
    const resolved = resolveFormulaValue(formula, derivedStats as unknown as Record<string, unknown>);
    if (resolved === undefined) return;
    const statKey = key as keyof CharacterStats;
    adjustedStats[statKey] = normalizeInternalValue(adjustedStats[statKey] + resolved);
  }));
  return adjustedStats;
}

export function collectEffectiveStatEffects(stats: CharacterStats, effects: EffectiveStatEffectContainer[]) {
  const result: Partial<CharacterStats> = {};
  const effectiveStatEffects = effects.flatMap((effect) => effect.effectiveStat ? [effect.effectiveStat] : []);
  effectiveStatEffects.forEach((statEffect) => Object.entries(statEffect).forEach(([key, value]) => {
    if (!(key in stats)) return;
    const statKey = key as keyof CharacterStats;
    const resolved = typeof value === "number"
      ? value
      : value && typeof value === "object" && "formula" in value
        ? resolveFormulaValue((value as FormulaStatValue).formula, stats) ?? 0
        : 0;
    result[statKey] = normalizeInternalValue((result[statKey] ?? 0) + resolved);
  }));
  return result;
}

export function calculateStatsWithEffects(baseStats: CharacterStats, effects: Array<StatEffectContainer & EffectiveStatEffectContainer>, judgementResistance: number) {
  const directlyAdjustedStats = applyStatEffects(baseStats, effects);
  const initialEffectiveStat = collectEffectiveStatEffects(directlyAdjustedStats, effects);
  const initialDerivedStats = calculateDerivedStats(directlyAdjustedStats, judgementResistance, initialEffectiveStat);
  const stats = applyDerivedStatEffects(directlyAdjustedStats, effects, initialDerivedStats);
  const effectiveStat = collectEffectiveStatEffects(stats, effects);
  const derivedStats = calculateDerivedStats(stats, judgementResistance, effectiveStat);
  return { stats, effectiveStat, derivedStats };
}

export type CharacterStatOverrides = Partial<CharacterStats>;

export function calculateStatsWithOverrides(
  baseStats: CharacterStats,
  effects: Array<StatEffectContainer & EffectiveStatEffectContainer>,
  judgementResistance: number,
  overrides: CharacterStatOverrides,
) {
  const adjustedBaseStats = { ...baseStats };
  const overrideEntries = Object.entries(overrides).filter((entry): entry is [keyof CharacterStats, number] => (
    entry[0] in adjustedBaseStats && typeof entry[1] === "number" && Number.isFinite(entry[1])
  ));

  // Solve the raw input required to produce each requested final value. Re-running
  // the shared pipeline after every correction also lets an overridden source
  // stat feed formula effects before a dependent overridden stat is corrected.
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const result = calculateStatsWithEffects(adjustedBaseStats, effects, judgementResistance);
    let largestCorrection = 0;
    for (const [key, targetValue] of overrideEntries) {
      const correction = targetValue - result.stats[key];
      adjustedBaseStats[key] = normalizeInternalValue(adjustedBaseStats[key] + correction);
      largestCorrection = Math.max(largestCorrection, Math.abs(correction));
    }
    if (largestCorrection < 1e-9) return { baseStats: adjustedBaseStats, ...result };
  }

  return { baseStats: adjustedBaseStats, ...calculateStatsWithEffects(adjustedBaseStats, effects, judgementResistance) };
}
