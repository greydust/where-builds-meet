export type RotationPriority = { label: string; maxRoll?: number; increase: number; dpsDifference: number };
export type RotationSkillBreakdown = { id: string; name: string; casts: number; triggers: number; hits: number; abrasionRate: number; normalRate: number; criticalRate: number; affinityRate: number; damage: number; percentage: number };
export type RotationGroupBreakdown = { id: string; name: string; damage: number; percentage: number };
export type RotationBreakdown = {
  skills: RotationSkillBreakdown[];
  categories: RotationGroupBreakdown[];
  damageTypes: RotationGroupBreakdown[];
};

export const emptyRotationBreakdown = (): RotationBreakdown => ({ skills: [], categories: [], damageTypes: [] });

export type RotationMetrics = {
  totalDamage: number;
  dps: number;
  breakdown: RotationBreakdown;
  statPriority: RotationPriority[];
  attunementPriority: RotationPriority[];
  innerWayPriority: RotationPriority[];
  setupComparisons: Record<string, RotationPriority[]>;
};

type Listener = () => void;

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
