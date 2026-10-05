import type { RotationStep } from "@/calculations/rotationTimeline"

/**
 * Fixtures for the rotation steps a spec drives a timeline with.
 *
 * These return `RotationStep` rather than a plain object on purpose. An untyped
 * local helper widens the `type` tag to `string`, and the step then no longer
 * fits the discriminated union that a rotation is built from, so every spec that
 * declared its own `cast`/`delay` also had to cast the rotation around it.
 */

/** A step that casts `skill`, optionally overriding its cast time or conditions. */
export function castStep(
  skill: string,
  options: { duration?: number; causesBreak?: boolean; condition?: string } = {},
): RotationStep {
  return { type: "skill", skill, ...options }
}

/** A step that waits `duration` seconds before the next one runs. */
export function delayStep(duration: number): RotationStep {
  return { type: "event", event: "Delay", duration }
}
