import assert from "node:assert/strict"

import { describe, it } from "vitest"

import type {
  EditableObject,
  InnerWayEffectRule,
  TimelineBuildInput,
  TimelineRow,
} from "@/calculations/rotationTimeline"

import { withImmediateAttacks } from "./helpers/attack-response-fixtures"
import { castStep } from "./helpers/rotationSteps"
import { asSkillRecords } from "./helpers/shippedData"

/** Every effect the given talent rank declares, flattened across its entries. */
function rankEffects(
  talent: { talent: Array<Array<{ name: string; effect?: EditableObject[] }>> },
  rank: number,
): EditableObject[] {
  return (talent.talent[rank] ?? []).flatMap(entry => entry.effect ?? [])
}

// Ported from script/probe/check-echoes-t4.mjs.
describe("echoes-t4", () => {
  it("Echoes T4 rolling window, definite-hit filtering, cooldown isolation, charge restoration, and waiting casts passed", async () => {
    const damage = (time: number, extra: EditableObject = {}): EditableObject => ({
      type: "damage",
      phyCoef: 1,
      time,
      ...extra,
    })
    const noEffect: EditableObject = {}
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { calculateEditorTimeline } = await import("../src/calculations/editorTimeline.ts")
    const infernal = asSkillRecords((await import("../data/skill/infernal-twinblades.json")).default)
    const echoes = (await import("../data/innerway/echoes-of-oblivion.json")).default
    const talent = (await import("../data/martial-art/infernal-twinblades.json")).default
    const trigger = echoes.effect.EchoesOfOblivionT4.trigger?.[0]
    assert(trigger, "Echoes of Oblivion T4 must declare its trigger.")
    // An empty literal is not assignable to Record<string, unknown>, so the no-op effect is named.
    const rule: InnerWayEffectRule = { source: "EchoesOfOblivion", tier: 4, effect: noEffect, trigger }
    const spent = [castStep("AddledMind"), castStep("AddledMind"), castStep("AddledMind")]
    const times = (rows: TimelineRow[]) =>
      rows.filter(row => row.step.skill === "AddledMind" && !row.skipped).map(row => row.startTime)
    const input = (actions: EditableObject[], extra: Partial<TimelineBuildInput> = {}): TimelineBuildInput => ({
      rotation: {
        name: "Echoes T4 charge reset",
        steps: [...spent, castStep("Driver"), ...spent, { type: "event", event: "Delay", duration: 30 }],
      },
      skills: {
        ...infernal,
        // Isolate the rolling-hit driver from Addled Mind's own damage and cast duration.
        AddledMind: { ...infernal.AddledMind, castTime: 0, action: [], modifier: [] },
        Driver: { castTime: 0, action: [{ type: "trigger", value: "Hits", time: 0 }] },
        Hits: { castTime: 0, tags: ["Triggered", "DirectDamage"], action: actions },
        ChanceBurst: {
          castTime: 0,
          tags: ["Triggered", "DirectDamage"],
          action: Array.from({ length: 6 }, () => damage(0)),
        },
      },
      effectDefinitions: {},
      dots: {},
      eventDefinitions: {},
      weapons: ["infernalTwinblades", "mortalRopeDart"],
      innerWayConditions: ["EchoesOfOblivionT4"],
      innerWayRules: [rule],
      setupEffects: [],
      ...extra,
    })
    const build = (
      actions: EditableObject[],
      { procRoll, ...extra }: { procRoll?: (key: string) => number } & Partial<TimelineBuildInput> = {},
    ): TimelineRow[] => buildRotationTimeline(input(actions, extra), procRoll)
    const six = Array.from({ length: 6 }, () => damage(1))
    assert.deepEqual(
      times(build(six)),
      [0, 0, 0, 1, 15, 15],
      "Six same-time hits restore exactly one charge and wake one waiting cast",
    )
    assert.deepEqual(
      times(build(six, { innerWayRules: [], innerWayConditions: [] })),
      [0, 0, 0, 15, 15, 15],
      "Without T4 all three charges recover after 15 seconds",
    )
    assert.deepEqual(times(build(six.slice(1))), [0, 0, 0, 15, 15, 15], "Five hits do not reset a charge")
    assert.deepEqual(
      times(build([0, 0.4, 0.8, 1.2, 1.6, 2].map(time => damage(time)))),
      [0, 0, 0, 2, 15, 15],
      "The rolling window includes its exact two-second boundary",
    )
    assert.deepEqual(
      times(build([0, 0.4, 0.8, 1.2, 1.6, 2.01].map(time => damage(time)))),
      [0, 0, 0, 15, 15, 15],
      "Hits older than two seconds cannot complete the threshold",
    )
    assert.deepEqual(
      times(build([...six, ...[9.1, 9.4, 9.7, 10, 10.3, 10.6, 10.9, 11].map(time => damage(time))])),
      [0, 0, 0, 1, 11, 15],
      "The ten-second cooldown is independent; hits during cooldown remain in the rolling window",
    )
    const repeated = [...six, ...six.map(action => ({ ...action, time: 1.1 }))]
    assert.deepEqual(
      times(build(repeated)),
      [0, 0, 0, 1, 15, 15],
      "A second rapid burst cannot bypass the trigger cooldown",
    )
    for (const probability of [0, 0.25, 0.999, 1]) {
      assert.deepEqual(
        times(build([...six.slice(1), damage(1, { hitProbability: probability, damageScale: probability })])),
        [0, 0, 0, 15, 15, 15],
        "Probability-weighted rows never complete the expected hit threshold, even at weight one",
      )
    }
    assert.deepEqual(
      times(build(six.map(action => ({ ...action, damageScale: 0.5 })))),
      [0, 0, 0, 1, 15, 15],
      "Damage scaling alone must not exclude definite hits",
    )
    assert.deepEqual(
      times(build([{ type: "trigger", value: "ChanceBurst", chance: 0.5, time: 1 }])),
      [0, 0, 0, 15, 15, 15],
      "A real expected chance-triggered burst must not reset Addled Mind",
    )
    assert.deepEqual(
      times(build([{ type: "trigger", value: "ChanceBurst", chance: 0.5, time: 1 }], { procRoll: () => 0 })),
      [0, 0, 0, 1, 15, 15],
      "Sampled successful procs consist of actual hits and can reset a charge",
    )
    assert.deepEqual(
      times(build([{ type: "trigger", value: "ChanceBurst", chance: 0.5, time: 1 }], { procRoll: () => 0.9 })),
      [0, 0, 0, 15, 15, 15],
      "Sampled failed procs do not contribute hits",
    )
    assert.deepEqual(
      times(build([...six.slice(1), { type: "heal", phyCoef: 1, time: 1 }])),
      [0, 0, 0, 15, 15, 15],
      "Healing does not complete a damage-hit window",
    )
    const staggered = input(
      six.map(action => ({ ...action, time: 1 })),
      {
        rotation: {
          name: "Preserve independent timers",
          steps: [
            castStep("AddledMind"),
            { type: "event", event: "Delay", duration: 2 },
            castStep("AddledMind"),
            { type: "event", event: "Delay", duration: 2 },
            castStep("AddledMind"),
            castStep("Driver"),
            ...spent,
          ],
        },
      },
    )
    assert.deepEqual(
      times(buildRotationTimeline(staggered)),
      [0, 2, 4, 5, 17, 19],
      "One restored charge must preserve both other recovery times",
    )
    const full = input(six, {
      rotation: {
        name: "No banking at capacity",
        steps: [castStep("Driver"), { type: "event", event: "Delay", duration: 2 }, ...spent, castStep("AddledMind")],
      },
    })
    assert.deepEqual(
      times(buildRotationTimeline(full)),
      [2, 2, 2, 17],
      "A reset at full capacity cannot bank an extra charge",
    )
    const isolated = {
      ...rule,
      source: "IndependentProbe",
      trigger: { ...trigger, action: [{ type: "addResource", value: "ProbeResets", amount: 1 }] },
    }
    const isolationRows = build(repeated, { innerWayRules: [rule, isolated] })
    const lastIsolationRow = isolationRows.at(-1)
    assert(lastIsolationRow, "The isolation probe must produce at least one row.")
    assert.equal(lastIsolationRow.resources.ProbeResets, 1, "Each trigger owns its own cooldown and hit history")
    const editorInput = input(six)
    const editor = calculateEditorTimeline(editorInput)
    assert.equal(editor.rotation, editorInput.rotation, "Reset-driven waiting must not mutate the saved rotation")
    assert.deepEqual(
      times(editor.timeline),
      [0, 0, 0, 1, 15, 15],
      "Editor and calculation must share the same reset timing",
    )
    // A dodge talent reset must not start or consume the separate T4 cooldown.
    const combined = input(six, {
      rotation: {
        name: "Independent dodge and T4 resets",
        steps: [
          ...spent,
          castStep("Dodge"),
          castStep("AddledMind"),
          castStep("Driver"),
          castStep("AddledMind"),
          castStep("AddledMind"),
        ],
      },
      setupEffects: rankEffects(talent, 13),
    })
    combined.skills.Dodge = { castTime: 0, tags: ["PerfectDodge"], action: [] }
    combined.skills = withImmediateAttacks(combined.skills)
    assert.deepEqual(
      times(buildRotationTimeline(combined)),
      [0, 0, 0, 0, 1, 15],
      "Dodge charge restoration and T4 use independent cooldowns",
    )
  })
})
