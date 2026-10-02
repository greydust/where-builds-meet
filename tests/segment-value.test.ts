import { assert, describe, expect, it } from "vitest"

import type { EditableObject } from "@/calculations/rotationTimeline"
import type { SkillOverrides } from "@/skillOverrides"

/**
 * The `dmgBonus` segment the Probe override carries.
 *
 * Overrides nest per category, per skill, per effect, so the segment is four levels
 * down a record whose action list is untyped; reading it directly failed on the
 * lookup rather than on the segment.
 */
function probeDmgBonus(overrides: SkillOverrides): unknown {
  const effect = overrides.Buff?.Probe?.effect
  assert(Array.isArray(effect) && effect.length > 0, "The Probe override must carry an effect list.")
  const [first] = effect as Array<{ effect?: EditableObject }>
  const segment = first?.effect?.dmgBonus
  assert(segment !== undefined, "The Probe override's first effect must carry a dmgBonus segment.")
  return segment
}

/** The numeric field `key` on `action`, named when the action does not carry it. */
function actionNumber(action: EditableObject, key: string) {
  const value = action[key]
  assert(typeof value === "number", `Expected the action to carry a numeric ${key}.`)
  return value
}

// Ported from script/probe/check-segment-value.mjs.
describe("segment-value", () => {
  it("Segment boundary, overflow, and per-action timing checks passed", async () => {
    const { resolveSegmentValue } = await import("../src/calculations/dynamicValues.ts")
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const segment = { function: "segment", param1: "actionTime", param2: [1.5, 2.5], param3: [-0.7, -1, -1.2] }
    expect(
      resolveSegmentValue(segment, { actionTime: 1.5 }) === -1,
      "A value equal to the first threshold must use the next segment.",
    ).toBeTruthy()
    expect(
      resolveSegmentValue(segment, { actionTime: 2 }) === -1,
      "A value between thresholds must use the matching segment.",
    ).toBeTruthy()
    expect(
      resolveSegmentValue(segment, { actionTime: 3 }) === -1.2,
      "A value above every threshold must use the overflow segment.",
    ).toBeTruthy()

    for (const [input, expected] of [
      [1.499999, -0.7],
      [2.499999, -1],
      [2.5, -1.2],
    ]) {
      assert(
        resolveSegmentValue(segment, { actionTime: input }) === expected,
        "Exclusive segment boundary failed at " + input,
      )
    }
    const { deserializeSkillOverrides, serializeSkillOverrides } = await import("../src/skillOverrides.ts")
    for (const threshold of [-2, 0, 1.3375, Number.MAX_VALUE]) {
      const legacy = { function: "segment", param1: "distance", param2: [threshold], param3: [2, 3] }
      for (const version of [undefined, 2]) {
        const overrides = { Buff: { Probe: { effect: [{ effect: { dmgBonus: legacy } }] } } }
        const converted = deserializeSkillOverrides(version ? { version, overrides } : overrides)
        const saved = deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(converted)))
        const migratedSegment = probeDmgBonus(saved)
        for (const input of [threshold - 1, threshold, threshold + 1, Number.MIN_VALUE, Number.MAX_VALUE]) {
          if (!Number.isFinite(input)) continue
          assert(
            resolveSegmentValue(migratedSegment, { distance: input }) === (input <= threshold ? 2 : 3),
            "Legacy segment migration changed its result at " + input,
          )
        }
      }
    }
    const fresh = { Buff: { Probe: { effect: [{ effect: { dmgBonus: segment } }] } } }
    const reloaded = deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(fresh)))
    expect(
      resolveSegmentValue(probeDmgBonus(reloaded), { actionTime: 1.5 }) === -1,
      "New exclusive thresholds must not migrate again.",
    ).toBeTruthy()

    const timeline = buildRotationTimeline({
      rotation: { name: "Segment timing probe", steps: [{ type: "skill", skill: "Probe" }] },
      skills: {
        Probe: {
          name: "Probe",
          castTime: 2,
          action: [
            { type: "damage", time: 1.5 },
            { type: "damage", time: 2 },
          ],
          modifier: [
            {
              effect: {
                castTimeModifier: { function: "segment", param1: "actionTime", param2: [1.5], param3: [-0.7, -1] },
              },
            },
          ],
          tags: [],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })
    const row = timeline[0]
    expect(row.effectiveCastTime === 1, "The cast end above 1.5s must receive the overflow modifier.").toBeTruthy()
    expect(row.actions[0].time === 0.5, "An action equal to 1.5s must receive the next segment modifier.").toBeTruthy()
    expect(row.actions[1].time === 1, "An action above 1.5s must receive the overflow modifier.").toBeTruthy()
    const mystic = (await import("../data/skill/mystic.json")).default
    for (const id of ["DragonsBreath2", "DragonsBreathSmolder2"]) {
      const rows = buildRotationTimeline({
        rotation: { name: "Dragon Intoxicated timing", infiniteVitality: true, steps: [{ type: "skill", skill: id }] },
        skills: mystic,
        eventDefinitions: {},
        dots: {},
        effectDefinitions: { Intoxicated: {} },
        initialBuffs: [{ name: "Intoxicated", stack: 1 }],
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
      })
      const cast = rows.find(row => row.kind === "rotation")
      assert(cast, "The Intoxicated probe must schedule one rotation row.")
      const hits = cast.actions.filter(action => action.type === "damage")
      assert(
        Math.abs(cast.effectiveCastTime - 1.6975969436363636) < 1e-9,
        id + " must resolve the Intoxicated route's cast duration.",
      )
      assert(
        Math.abs(actionNumber(hits[0] ?? {}, "time") - 0.6064791536363635) < 1e-9,
        id + " must resolve the first hit using its own timing segment.",
      )
      assert(
        hits.slice(1).every(hit => Math.abs(actionNumber(hit, "time") - 1.6975969436363636) < 1e-9),
        id + " must resolve later hits using the second timing segment.",
      )
    }
  })
})
