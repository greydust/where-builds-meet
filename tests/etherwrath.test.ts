import { describe, expect, it } from "vitest"

import type { RotationRecord, SkillRecord, TimelineBuildInput } from "@/calculations/rotationTimeline"

import { withImmediateAttacks } from "./helpers/attack-response-fixtures"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { actionStateAt, rowCasting } from "./helpers/timelineRows"

// Ported from script/probe/check-etherwrath.mjs.
describe("etherwrath", () => {
  it("Etherwrath Direct Damage stacks, DOT/non-direct exclusion, and dodge checks passed", async () => {
    const weaponSets = (await import("../data/gear-set.json")).default
    const kiteBuffs = (await import("../data/buff/bamboocut-kite.json")).default
    const generalSkills = (await import("../data/skill/general.json")).default
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { normalizeBuildSetup, normalizeBuildSetupOverrides } = await import("../src/gear.ts")

    const fourPiece = weaponSets.Etherwrath.options["4"].effect
    const sparseSetup = normalizeBuildSetup({ weaponSets: { Etherwrath: 4 } })
    expect(
      sparseSetup.weaponSets.Etherwrath === 4 &&
        sparseSetup.weaponSets.Cleftpeak === 0 &&
        sparseSetup.weaponSets.RainWhisper === 0,
      "A sparse build set map must preserve Etherwrath and treat omitted sets as zero.",
    ).toBeTruthy()
    const sparseOverride = normalizeBuildSetupOverrides({ weaponSets: { Etherwrath: 4 } })
    expect(
      sparseOverride.weaponSets?.Etherwrath === 4,
      "A sparse saved set override must remain valid when new set definitions are added.",
    ).toBeTruthy()

    const hit = {
      name: "Etherwrath hit probe",
      castTime: 6,
      action: Array.from({ length: 6 }, (_, index) => ({
        type: "damage",
        phyCoef: 0,
        attrCoef: 0,
        phyBonus: 0,
        attrBonus: 0,
        time: index + 1,
      })),
      modifier: [],
      tags: ["DirectDamage"],
    }
    const observe = {
      name: "Etherwrath observer",
      castTime: 0,
      action: [{ type: "damage", phyCoef: 0, attrCoef: 0, phyBonus: 0, attrBonus: 0, time: 0 }],
      modifier: [],
      tags: ["DirectDamage"],
    }
    const timelineInput = (rotation: RotationRecord, skills: Record<string, SkillRecord>): TimelineBuildInput => ({
      rotation,
      skills: withImmediateAttacks(skills),
      eventDefinitions: {},
      dots: {},
      effectDefinitions: kiteBuffs,
      innerWayConditions: ["Etherwrath4P"],
      innerWayRules: [],
      setupEffects: [fourPiece],
      weapons: ["heavenwill", "skygrasp"],
    })
    const stackingTimeline = buildRotationTimeline(
      timelineInput({ name: "Stacking probe", steps: [{ type: "skill", skill: "Hit" }] }, { Hit: hit }),
    )
    const stackingRow = rowCasting(stackingTimeline, "Hit")
    expect(
      actionStateAt(stackingRow, 5).buffs.get("Etherwrath")?.stack === 5,
      "The sixth damage action must see the five stacks granted by the previous five hits.",
    ).toBeTruthy()
    const dodgeTimeline = buildRotationTimeline(
      timelineInput(
        {
          name: "Perfect Dodge probe",
          steps: [
            { type: "skill", skill: "PerfectDodgeCancel" },
            { type: "skill", skill: "Observe" },
          ],
        },
        { PerfectDodgeCancel: generalSkills.PerfectDodgeCancel, Observe: observe },
      ),
    )
    const dodgeObserver = rowCasting(dodgeTimeline, "Observe")
    expect(
      dodgeObserver.actionStates[0].buffs.get("Etherwrath")?.stack === 5,
      "Perfect Dodge must apply five Etherwrath stacks directly.",
    ).toBeTruthy()

    const dots = (await import("../data/dot/innerway.json")).default
    const directAndDot = {
      name: "Direct hit and bleed",
      castTime: 0,
      tags: ["DirectDamage"],
      action: [
        { type: "damage", phyCoef: 1, time: 0 },
        { type: "apply", target: "target", value: "WeepingBlood", time: 0 },
      ],
    }
    const watch = {
      name: "Non-direct observers",
      castTime: 9,
      tags: [],
      action: [2, 9].map(time => ({ type: "damage", phyCoef: 1, time })),
    }
    const dotInput = timelineInput(
      {
        name: "DOT exclusion",
        steps: [
          { type: "skill", skill: "Start" },
          { type: "skill", skill: "Watch" },
        ],
      },
      { Start: directAndDot, Watch: watch },
    )
    dotInput.dots = asSkillRecords(dots)
    dotInput.effectDefinitions = asEffectDefinitions({ ...kiteBuffs, ...dots })
    const dotTimeline = buildRotationTimeline(dotInput)
    const watched = rowCasting(dotTimeline, "Watch")
    const activeStack = watched.actionStates[0].buffs.get("Etherwrath")
    expect(
      activeStack?.stack === 1 && activeStack.expiresAt === 8,
      "A DOT tick must neither add nor refresh Etherwrath stacks.",
    ).toBeTruthy()
    expect(
      !actionStateAt(watched, 1).buffs.has("Etherwrath"),
      "DOT and untagged damage must not keep Etherwrath alive.",
    ).toBeTruthy()
    const dotOnly = buildRotationTimeline({
      ...dotInput,
      skills: {
        ...dotInput.skills,
        Start: { ...directAndDot, action: directAndDot.action.filter(action => action.type !== "damage") },
      },
    })
    expect(
      dotOnly.every(row => Object.values(row.actionStates).every(state => !state.buffs.has("Etherwrath"))),
      "DOT-only and untagged damage cannot initially activate Etherwrath.",
    ).toBeTruthy()
  })
})
