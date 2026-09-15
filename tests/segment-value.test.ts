import { assert, describe, it } from "vitest";

// Ported from script/probe/check-segment-value.mjs.
describe("segment-value", () => {
  it("Segment boundary, overflow, and per-action timing checks passed", async () => {
    const { resolveSegmentValue } = await import("../src/calculations/dynamicValues.ts");
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const segment = { function: "segment", param1: "actionTime", param2: [1.5, 2.5], param3: [-0.7, -1, -1.2] };
    assert(
      resolveSegmentValue(segment, { actionTime: 1.5 }) === -1,
      "A value equal to the first threshold must use the next segment.",
    );
    assert(
      resolveSegmentValue(segment, { actionTime: 2 }) === -1,
      "A value between thresholds must use the matching segment.",
    );
    assert(
      resolveSegmentValue(segment, { actionTime: 3 }) === -1.2,
      "A value above every threshold must use the overflow segment.",
    );

    for (const [input, expected] of [
      [1.499999, -0.7],
      [2.499999, -1],
      [2.5, -1.2],
    ]) {
      assert(
        resolveSegmentValue(segment, { actionTime: input }) === expected,
        "Exclusive segment boundary failed at " + input,
      );
    }
    const { deserializeSkillOverrides, serializeSkillOverrides } = await import("../src/skillOverrides.ts");
    for (const threshold of [-2, 0, 1.3375, Number.MAX_VALUE]) {
      const legacy = { function: "segment", param1: "distance", param2: [threshold], param3: [2, 3] };
      for (const version of [undefined, 2]) {
        const overrides = { Buff: { Probe: { effect: [{ effect: { dmgBonus: legacy } }] } } };
        const converted = deserializeSkillOverrides(version ? { version, overrides } : overrides);
        const saved = deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(converted)));
        const migratedSegment = saved.Buff.Probe.effect[0].effect.dmgBonus;
        for (const input of [threshold - 1, threshold, threshold + 1, Number.MIN_VALUE, Number.MAX_VALUE]) {
          if (!Number.isFinite(input)) continue;
          assert(
            resolveSegmentValue(migratedSegment, { distance: input }) === (input <= threshold ? 2 : 3),
            "Legacy segment migration changed its result at " + input,
          );
        }
      }
    }
    const fresh = { Buff: { Probe: { effect: [{ effect: { dmgBonus: segment } }] } } };
    const reloaded = deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(fresh)));
    assert(
      resolveSegmentValue(reloaded.Buff.Probe.effect[0].effect.dmgBonus, { actionTime: 1.5 }) === -1,
      "New exclusive thresholds must not migrate again.",
    );

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
    });
    const row = timeline[0];
    assert(row.effectiveCastTime === 1, "The cast end above 1.5s must receive the overflow modifier.");
    assert(row.actions[0].time === 0.5, "An action equal to 1.5s must receive the next segment modifier.");
    assert(row.actions[1].time === 1, "An action above 1.5s must receive the overflow modifier.");
    const mystic = (await import("../data/skill/mystic.json")).default;
    for (const id of ["DragonsBreath2", "DragonsBreathSmolder2"]) {
      const rows = buildRotationTimeline({
        rotation: { name: "Dragon timing preservation", infiniteVitality: true, steps: [{ type: "skill", skill: id }] },
        skills: mystic,
        eventDefinitions: {},
        dots: {},
        effectDefinitions: { Intoxicated: {} },
        initialBuffs: [{ name: "Intoxicated", stack: 1 }],
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
      });
      const cast = rows.find((row) => row.kind === "rotation");
      const hits = cast.actions.filter((action) => action.type === "damage");
      assert(Math.abs(cast.effectiveCastTime - 1.7375) < 1e-9, id + " must preserve its adjusted cast duration.");
      assert(Math.abs(hits[0].time - 0.6375) < 1e-9, id + " must preserve its first hit time.");
      assert(
        hits.slice(1).every((hit) => Math.abs(hit.time - 1.7375) < 1e-9),
        id + " must preserve its later hit times.",
      );
    }
  });
});
