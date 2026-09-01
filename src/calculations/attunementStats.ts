import type { AttunementStats } from "./damage";

export type AttunementOverrides = Partial<AttunementStats>;

/** Keep UI overrides final while hit calculation inputs exclude bonuses applied through character stats. */
export function resolveAttunementStats(
  defaults: AttunementStats,
  equipped: Partial<AttunementStats>,
  overrides: AttunementOverrides,
  characterStatBonuses: Partial<AttunementStats>,
) {
  const calculation = { ...defaults };
  const displayed = { ...defaults };

  for (const key of Object.keys(defaults) as Array<keyof AttunementStats>) {
    const bonus = characterStatBonuses[key] ?? 0;
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key);
    const displayedValue = hasOverride ? (overrides[key] ?? 0) : (equipped[key] ?? 0) + bonus;
    displayed[key] = displayedValue;
    calculation[key] = displayedValue - bonus;
  }

  return { calculation, displayed };
}
