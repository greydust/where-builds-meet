import { assert, describe, it } from "vitest"

import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { WeaponId } from "@/types"

import { castStep } from "./helpers/rotationSteps"

/**
 * A bundle carrying only what the fingerprint reads.
 *
 * The fingerprint reads the rotation and the martial-art list, and the probe passes
 * exactly those, so the rest of the bundle is absent rather than defaulted.
 */
const probeBundle = (rotation: RotationRecord, weapons: WeaponId[] = []): RotationSimulationBundle =>
  ({ timeline: { rotation }, weapons }) as unknown as RotationSimulationBundle

// Ported from script/probe/check-calculation-fingerprint-cache.mjs.
describe("calculation-fingerprint", () => {
  it("Fingerprint probe passed", async () => {
    const { calculationFingerprint, rotationBundleFingerprint } =
      await import("@/calculations/calculationFingerprint.ts")
    const setupA = calculationFingerprint({ stats: { minPhys: 1 }, selector: "A", rotation: ["SkillA"] })
    const setupB = calculationFingerprint({ stats: { minPhys: 2 }, selector: "B", rotation: ["SkillA"] })
    const setupC = calculationFingerprint({ stats: { minPhys: 3 }, selector: "C", rotation: ["SkillA"] })

    assert(new Set([setupA, setupB, setupC]).size === 3, "Distinct setup inputs produced duplicate fingerprints.")

    const namedRotationBundle = (
      name: string,
      skill: string,
      weapons: WeaponId[] = ["snowparting", "phalanxbane"],
    ): RotationSimulationBundle => probeBundle({ name, steps: [castStep(skill)] }, weapons)
    const rotationA = rotationBundleFingerprint(namedRotationBundle("First name", "SkillA"))
    const renamedRotationA = rotationBundleFingerprint(namedRotationBundle("Renamed", "SkillA"))
    const rotationB = rotationBundleFingerprint(namedRotationBundle("First name", "SkillB"))
    const reversedMartialArts = rotationBundleFingerprint(
      namedRotationBundle("First name", "SkillA", ["phalanxbane", "snowparting"]),
    )
    assert(rotationA === renamedRotationA, "Display-only rotation names changed the calculation fingerprint.")
    assert(rotationA !== rotationB, "Different rotation step content produced the same fingerprint.")
    assert(rotationA !== reversedMartialArts, "Different ordered martial-art selections produced the same fingerprint.")

    // Each setting the fingerprint must notice. The probe passes a rotation only,
    // so the bundle is the rotation and the weapon list the function reads.
    const rotationSettings: Array<[string, Partial<RotationRecord>]> = [
      ["target HP", { targetHP: 100000 }],
      ["practice target", { targetType: "Boss" }],
      ["group size", { groupSize: 5 }],
      ["enemy count", { enemyCount: 3 }],
      ["infinite Vitality", { infiniteVitality: true }],
      ["battle-start event timing", { eventTimeReference: "battleStart" }],
      ["battle start anchor", { start: { step: 0, action: 0 } }],
    ]
    const baseRotation: RotationRecord = { name: "Settings", steps: [{ type: "skill", skill: "SkillA" }], groupSize: 1 }
    const baseSettingsFingerprint = rotationBundleFingerprint(probeBundle(baseRotation))
    for (const [label, setting] of rotationSettings) {
      const changedFingerprint = rotationBundleFingerprint(probeBundle({ ...baseRotation, ...setting }))
      assert(
        changedFingerprint !== baseSettingsFingerprint,
        `Changing ${label} did not change the rotation calculation fingerprint.`,
      )
    }
  })
})
