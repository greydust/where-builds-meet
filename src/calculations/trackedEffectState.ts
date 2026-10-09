import type { TrackedEffect } from "./rotationTimeline"

/** Authoritative immutable snapshot. Keys identify an effect and its recipient, never priority. */
export type EffectState = ReadonlyMap<string, TrackedEffect>
export function effectKey(name: string, recipient = 0): string {
  return recipient === 0 ? name : JSON.stringify([name, recipient])
}
export function effectState(effects: Iterable<TrackedEffect> = []): EffectState {
  return new Map(Array.from(effects, effect => [effectKey(effect.name, effect.playerRecipientIndex), effect]))
}
export function mapTrackedEffects(
  effects: EffectState,
  transform: (effect: TrackedEffect) => TrackedEffect | undefined,
): EffectState {
  const next = new Map<string, TrackedEffect>()
  let changed = false
  for (const [key, effect] of effects) {
    const value = transform(effect)
    if (value) next.set(key, value)
    if (value !== effect) changed = true
  }
  if (!changed) return effects
  reuseTrackedEffectState(effects, next)
  return next
}
export function filterTrackedEffects(effects: EffectState, keep: (effect: TrackedEffect) => boolean): EffectState {
  return mapTrackedEffects(effects, effect => (keep(effect) ? effect : undefined))
}
type EffectMetadata = {
  self: EffectState
  names: string[]
  stacks: Record<string, number>
  nextExpiry: number
  requirementKey: string
}
const metadata = new WeakMap<EffectState, EffectMetadata>()

/** Carry derived state across lifecycle changes without retaining old snapshots.
 * Contribution identity and iteration order must match to preserve exact sums.
 * Live tracked objects (including expiry and ownership) always come from next. */
export function reuseTrackedEffectState(previous: EffectState, next: EffectState): boolean {
  if (previous === next) return true
  if (previous.size !== next.size) return false
  const oldEntries = previous.entries()
  let sameRequirements = true
  let sameContributions = true
  let nextExpiry = Infinity
  for (const [key, effect] of next) {
    const oldEntry = oldEntries.next().value
    if (!oldEntry || oldEntry[0] !== key) return false
    const old = oldEntry[1]
    const sameRecipient = (old.playerRecipientIndex ?? 0) === (effect.playerRecipientIndex ?? 0)
    sameRequirements &&=
      sameRecipient && old.name === effect.name && old.stack === effect.stack && old.maxStack === effect.maxStack
    sameContributions &&= sameRecipient && old.unconditionalDamageEffects === effect.unconditionalDamageEffects
    nextExpiry = Math.min(nextExpiry, effect.expiresAt ?? Infinity)
  }
  const cached = sameRequirements ? metadata.get(previous) : undefined
  if (cached) {
    metadata.set(next, {
      self:
        cached.self === previous
          ? next
          : filterTrackedEffects(next, effect => (effect.playerRecipientIndex ?? 0) === 0),
      names: cached.names,
      stacks: cached.stacks,
      requirementKey: cached.requirementKey,
      nextExpiry,
    })
  }
  return sameContributions
}

export function trackedEffectMetadata(effects: EffectState): EffectMetadata {
  const cached = metadata.get(effects)
  if (cached) return cached
  const values = Array.from(effects.values())
  const result = {
    self: filterTrackedEffects(effects, effect => (effect.playerRecipientIndex ?? 0) === 0),
    names: values.map(effect => effect.name),
    stacks: Object.fromEntries(
      values.filter(effect => (effect.playerRecipientIndex ?? 0) === 0).map(effect => [effect.name, effect.stack ?? 1]),
    ),
    nextExpiry: values.reduce((expiry, effect) => Math.min(expiry, effect.expiresAt ?? Infinity), Infinity),
    // Canonical identity ignores insertion order and lifecycle metadata.
    requirementKey: JSON.stringify(
      Array.from(effects, ([key, effect]) => [key, effect.stack, effect.maxStack]).sort((a, b) =>
        String(a[0]).localeCompare(String(b[0])),
      ),
    ),
  }
  metadata.set(effects, result)
  return result
}
