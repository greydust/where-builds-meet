/**
 * The guard runs from plain Node, so it stays a `.mjs` script beside the specs.
 * These are the shapes it reads: the fields it compares, and the fixture record
 * whose exact text it also requires to be unchanged.
 */
export declare const dpsSnapshotUlpBudget: number

/** One rotation's accepted numbers, plus the environment that produced them. */
export type DpsSnapshotCase = { dps: number; totalDamage: number; duration: number; fixture: unknown }

export declare function compareDpsSnapshots(
  expected: Record<string, DpsSnapshotCase>,
  actual: Record<string, DpsSnapshotCase>,
): string[]
