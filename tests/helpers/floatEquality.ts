import assert from "node:assert/strict"

/**
 * Whether two numbers agree to within `tolerance`.
 *
 * A missing or non-finite `actual` never agrees. The specs that used a bare
 * `Math.abs(actual - expected) < tolerance` and those that guarded with
 * `Number.isFinite` agree on this: an absent value reaches the comparison as
 * NaN, and NaN fails it either way.
 */
export function isClose(actual: number | undefined, expected: number, tolerance: number): boolean {
  return actual !== undefined && Number.isFinite(actual) && Math.abs(actual - expected) < tolerance
}

/**
 * `isClose` as an assertion, naming both values when they disagree. `tolerance`
 * comes before the optional `message` so it always holds a position of its own.
 */
export function assertClose(actual: number | undefined, expected: number, tolerance: number, message?: string): void {
  const difference = `${actual} != ${expected}`
  assert(isClose(actual, expected, tolerance), message ? `${message}: ${difference}` : difference)
}
