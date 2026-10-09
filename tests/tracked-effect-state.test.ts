import { describe, expect, it } from "vitest"

import {
  effectState,
  mapTrackedEffects,
  reuseTrackedEffectState,
  trackedEffectMetadata,
} from "@/calculations/trackedEffectState"

describe("effect lifecycle cache reuse", () => {
  const bonus = { critDmgBonus: 0.15 }
  const buff = {
    name: "Buff",
    stack: 1,
    maxStack: 3,
    expiresAt: 10,
    sourceRowId: "first",
    unconditionalDamageEffects: bonus,
  }

  it("reuses requirement metadata while preserving refreshed expiry and ownership", () => {
    const previous = effectState([buff])
    const original = trackedEffectMetadata(previous)
    const next = mapTrackedEffects(previous, effect => ({ ...effect, expiresAt: 18, sourceRowId: "second" }))
    const refreshed = trackedEffectMetadata(next)
    expect(refreshed.names).toBe(original.names)
    expect(refreshed.stacks).toBe(original.stacks)
    expect(refreshed.requirementKey).toBe(original.requirementKey)
    expect(refreshed.nextExpiry).toBe(18)
    expect(refreshed.self.get("Buff")?.sourceRowId).toBe("second")
    expect(original.self.get("Buff")?.expiresAt).toBe(10)
    expect(reuseTrackedEffectState(previous, next)).toBe(true)
  })

  it("does not reuse changed stacks, contributions, membership, or summation order", () => {
    const previous = effectState([buff])
    const original = trackedEffectMetadata(previous)
    const next = effectState([{ ...buff, stack: 2, unconditionalDamageEffects: { critDmgBonus: 0.3 } }])
    expect(reuseTrackedEffectState(previous, next)).toBe(false)
    expect(trackedEffectMetadata(next).stacks.Buff).toBe(2)
    expect(trackedEffectMetadata(next).requirementKey).not.toBe(original.requirementKey)
    expect(reuseTrackedEffectState(previous, effectState())).toBe(false)
    const other = { ...buff, name: "Other" }
    expect(reuseTrackedEffectState(effectState([buff, other]), effectState([other, buff]))).toBe(false)
  })

  it("updates the self snapshot in a party and invalidates recipient changes", () => {
    const teammate = { ...buff, playerRecipientIndex: 1, expiresAt: 12 }
    const previous = effectState([buff, teammate])
    const original = trackedEffectMetadata(previous)
    const next = mapTrackedEffects(previous, effect => ({ ...effect, expiresAt: 20 }))
    const refreshed = trackedEffectMetadata(next)
    expect(refreshed.stacks).toBe(original.stacks)
    expect(refreshed.self.size).toBe(1)
    expect(refreshed.self.get("Buff")?.expiresAt).toBe(20)
    expect(refreshed.nextExpiry).toBe(20)
    expect(reuseTrackedEffectState(effectState([buff]), effectState([teammate]))).toBe(false)
  })
})
