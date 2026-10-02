import { describe, expect, it } from "vitest"

import { migrateVendettaTokenStep } from "../src/rotationEditing"
import { exportRotationEntries, mergeImportedRotationEntries } from "../src/rotationTransfer"
import { deserializeSkillOverrides, serializeSkillOverrides } from "../src/skillOverrides"

describe("Vendetta Token target migration", () => {
  it("preserves manual event anchors and stacks through import and subsequent export", () => {
    const legacy = {
      type: "event" as const,
      event: "Buff" as const,
      before: { action: 0 },
      buff: "VendettaToken",
      stack: 1,
    }
    const expected = { type: "event", event: "Debuff", before: { action: 0 }, debuff: "VendettaToken", stack: 1 }
    expect(migrateVendettaTokenStep(legacy)).toEqual(expected)
    const imported = mergeImportedRotationEntries(
      [],
      JSON.parse(
        exportRotationEntries([
          {
            id: "token",
            martialArts: ["infernalTwinblades", "mortalRopeDart"],
            rotation: { name: "Token", steps: [legacy, { type: "skill", skill: "InfernalLight1" }] },
          },
        ]),
      ),
    )
    expect(imported.importedCount).toBe(1)
    expect(imported.entries[0].rotation.steps[0]).toEqual(expected)
    const roundtrip = mergeImportedRotationEntries([], JSON.parse(exportRotationEntries(imported.entries)))
    expect(roundtrip.entries[0].rotation.steps).toEqual(imported.entries[0].rotation.steps)
    expect(legacy.event).toBe("Buff")
  })

  it("preserves customized definitions and retargets stored actions and conditions", () => {
    const requirementOf = (modifier: unknown) => (modifier as { requirement: unknown }).requirement
    const legacy = {
      version: 3,
      overrides: {
        Buff: {
          VendettaToken: { name: "Custom Token", duration: 23, effect: [{ effect: { dmgBonus: 0.7 } }] },
          Keep: { duration: 9 },
        },
        Mortal: {
          BladeboundThreadCancel: {
            action: [{ type: "apply", target: "self", value: "VendettaToken", time: 0.4 }],
            modifier: [{ requirement: [{ target: "self", value: "VendettaToken" }], effect: { dmgBonus: 0.2 } }],
          },
        },
      },
    }
    const result = deserializeSkillOverrides(legacy)
    expect(result.Buff).toEqual({ Keep: { duration: 9 } })
    expect(result.Debuff?.VendettaToken).toEqual({ ...legacy.overrides.Buff.VendettaToken, shared: false })
    expect(result.Mortal?.BladeboundThreadCancel.action?.[0]).toEqual({
      type: "apply",
      target: "target",
      value: "VendettaToken",
      time: 0.4,
    })
    expect(requirementOf(result.Mortal?.BladeboundThreadCancel.modifier?.[0])).toEqual([
      { target: "target", value: "VendettaToken" },
    ])
    expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(result)))).toEqual(result)
    expect(legacy.overrides.Buff.VendettaToken.duration).toBe(23)
    expect(legacy.overrides.Mortal.BladeboundThreadCancel.action[0].target).toBe("self")
  })
})
