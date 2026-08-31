export type RotationPriority = {
  label: string;
  maxRoll?: number;
  increase: number;
  dpsDifference: number;
  healingIncrease: number;
  hpsDifference: number;
};
export type RotationSkillBreakdown = {
  id: string;
  name: string;
  casts: number;
  triggers: number;
  hits: number;
  abrasionRate: number;
  normalRate: number;
  criticalRate: number;
  affinityRate: number;
  damage: number;
  percentage: number;
};
export type RotationHealingSkillBreakdown = {
  id: string;
  name: string;
  casts: number;
  triggers: number;
  heals: number;
  normalRate: number;
  criticalRate: number;
  healing: number;
  percentage: number;
};
export type RotationCastBreakdown = {
  id: string;
  skillId: string;
  name: string;
  casts: number;
  averageCastTime: number;
  averageDps?: number;
  averageDpsWithBuff?: number;
  averageDamage: number;
  averageDamageWithBuff?: number;
  damage: number;
  damageWithBuff?: number;
  percentage: number;
};
export type RotationHealingCastBreakdown = {
  id: string;
  skillId: string;
  name: string;
  casts: number;
  averageCastTime: number;
  averageHps?: number;
  averageHealing: number;
  healing: number;
  percentage: number;
};
export type RotationGroupBreakdown = { id: string; name: string; damage: number; percentage: number };
export type RotationHealingGroupBreakdown = { id: string; name: string; healing: number; percentage: number };
export type RotationEffectCoverage = {
  id: string;
  averageStacks: number;
  timeCoverage?: number;
};
export type RotationBreakdown = {
  skills: RotationSkillBreakdown[];
  healingSkills: RotationHealingSkillBreakdown[];
  casts: RotationCastBreakdown[];
  healingCasts: RotationHealingCastBreakdown[];
  categories: RotationGroupBreakdown[];
  healingCategories: RotationHealingGroupBreakdown[];
  damageTypes: RotationGroupBreakdown[];
  healingTypes: RotationHealingGroupBreakdown[];
  buffCoverage: RotationEffectCoverage[];
  debuffCoverage: RotationEffectCoverage[];
};

export const emptyRotationBreakdown = (): RotationBreakdown => ({
  skills: [],
  healingSkills: [],
  casts: [],
  healingCasts: [],
  categories: [],
  healingCategories: [],
  damageTypes: [],
  healingTypes: [],
  buffCoverage: [],
  debuffCoverage: [],
});

export type RotationMetrics = {
  totalDamage: number;
  dps: number;
  totalHealing: number;
  hps: number;
  expectedHawkwingStacks?: number;
  breakdown: RotationBreakdown;
  statPriority: RotationPriority[];
  attunementPriority: RotationPriority[];
  innerWayPriority: RotationPriority[];
  setupComparisons: Record<string, RotationPriority[]>;
};

type Listener = () => void;

export const rotationCalculationCategories = [
  "baseline",
  "statPriority",
  "attunementPriority",
  "weaponSets",
  "armorSets",
  "bowRingSet",
  "arsenal",
  "globalDebuffs",
  "innerWays",
  "script",
  "divinecraft",
  "food",
] as const;
export type RotationCalculationCategory = (typeof rotationCalculationCategories)[number];
export type RotationCalculationCategoryStatus = { recalculating: boolean; progress: number };
export type RotationCalculationStatus = Record<RotationCalculationCategory, RotationCalculationCategoryStatus>;

const idleCategoryStatus = (): RotationCalculationCategoryStatus => ({ recalculating: false, progress: 1 });
let calculationStatus = Object.fromEntries(
  rotationCalculationCategories.map((category) => [category, idleCategoryStatus()]),
) as RotationCalculationStatus;
const calculationStatusListeners = new Set<Listener>();

let currentMetrics: RotationMetrics | undefined;
const listeners = new Set<Listener>();

export function getRotationMetrics() {
  return currentMetrics;
}

export function publishRotationMetrics(metrics: RotationMetrics) {
  currentMetrics = metrics;
  listeners.forEach((listener) => listener());
}

export function subscribeToRotationMetrics(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRotationCalculationStatus() {
  return calculationStatus;
}

export function subscribeToRotationCalculationStatus(listener: Listener) {
  calculationStatusListeners.add(listener);
  return () => calculationStatusListeners.delete(listener);
}

export function beginRotationCalculation() {
  calculationStatus = Object.fromEntries(
    rotationCalculationCategories.map((category) => [category, { recalculating: true, progress: 0 }]),
  ) as RotationCalculationStatus;
  calculationStatusListeners.forEach((listener) => listener());
}

export function publishRotationCategoryProgress(category: RotationCalculationCategory, progress: number) {
  const normalized = Math.min(1, Math.max(0, progress));
  const current = calculationStatus[category];
  if (current.recalculating && current.progress === normalized) return;
  calculationStatus = {
    ...calculationStatus,
    [category]: { recalculating: true, progress: normalized },
  };
  calculationStatusListeners.forEach((listener) => listener());
}

export function completeRotationCalculationCategory(category: RotationCalculationCategory) {
  const current = calculationStatus[category];
  if (!current.recalculating && current.progress === 1) return;
  calculationStatus = {
    ...calculationStatus,
    [category]: { recalculating: false, progress: 1 },
  };
  calculationStatusListeners.forEach((listener) => listener());
}

export function endRotationCalculation() {
  let changed = false;
  const next = { ...calculationStatus };
  for (const category of rotationCalculationCategories) {
    if (!next[category].recalculating) continue;
    next[category] = { ...next[category], recalculating: false };
    changed = true;
  }
  if (!changed) return;
  calculationStatus = next;
  calculationStatusListeners.forEach((listener) => listener());
}
