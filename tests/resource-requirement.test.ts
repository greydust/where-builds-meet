import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import type { TimelineRow } from "@/calculations/rotationTimeline"

import { effectState } from "../src/calculations/trackedEffectState"
import { probeLoad } from "./helpers/probe-loader.js"
import { actionStateAt } from "./helpers/timelineRows"

/** Heaven's Will left on the final scheduled action, named when none was scheduled. */
function lastHeavensWill(rows: TimelineRow[]) {
  const last = rows.at(-1)
  assert(last, "The Mandate probe must schedule a final action.")
  const state = actionStateAt(last, 0)
  return state.resources.HeavensWill
}

// Ported from script/probe/check-resource-requirement.mjs.
describe("resource-requirement", () => {
  it("Numeric resource action and requirement checks passed", async () => {
    const { buildRotationTimeline, requirementsPass } = await probeLoad<
      typeof import("../src/calculations/rotationTimeline")
    >("/src/calculations/rotationTimeline.ts")
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const system = JSON.parse(await readFile("data/system.json", "utf8"))
    const heavenwillSkills = JSON.parse(await readFile("data/skill/heavenwill-gauntlets.json", "utf8"))
    const mysticSkills = JSON.parse(await readFile("data/skill/mystic.json", "utf8"))
    const kiteBuffs = JSON.parse(await readFile("data/buff/bamboocut-kite.json", "utf8"))
    const requirement = [{ target: "resource", value: "HeavensWill", comparison: ">=", amount: 1 }]

    const systemCharacter = calculateStatsWithEffects(emptyStats, [system.baseStats], 0).stats
    expect(
      systemCharacter.heavensWillRegen === 0.1,
      "The innate character pipeline must provide 0.1 Heaven's Will per second.",
    ).toBeTruthy()
    expect(
      system.initialResources.HeavensWill === 2,
      "Heaven's Will must start at the system-defined value of two.",
    ).toBeTruthy()

    expect(
      !requirementsPass(requirement, effectState([]), effectState([]), [], new Set(), ["heavenwill", "skygrasp"], {}),
      "A missing resource must default to zero.",
    ).toBeTruthy()
    expect(
      requirementsPass(requirement, effectState([]), effectState([]), [], new Set(), ["heavenwill", "skygrasp"], {
        HeavensWill: 1,
      }),
      "A resource equal to the threshold must pass a greater-than-or-equal requirement.",
    ).toBeTruthy()
    expect(
      !requirementsPass(
        [{ target: "resource", value: "HeavensWill", comparison: ">", amount: 1 }],
        effectState([]),
        effectState([]),
        [],
        new Set(),
        ["heavenwill", "skygrasp"],
        { HeavensWill: 1 },
      ),
      "Resource comparisons must preserve their declared operator.",
    ).toBeTruthy()

    const timeline = buildRotationTimeline({
      rotation: { name: "Resource probe", steps: [{ type: "skill", skill: "ResourceSequence" }] },
      skills: {
        ResourceSequence: {
          name: "Resource Sequence",
          castTime: 1,
          action: [
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 0 },
            { type: "addResource", value: "HeavensWill", amount: 1, time: 0 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 0 },
            { type: "consumeResource", value: "HeavensWill", amount: 1, time: 0 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 0 },
          ],
          modifier: [],
          tags: ["MartialArts", "SkygraspRopeDart"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["heavenwill", "skygrasp"],
    })
    const row = timeline[0]
    expect(
      (row.actionStates[0].resources.HeavensWill ?? 0) === 0 &&
        row.actionStates[2].resources.HeavensWill === 1 &&
        row.actionStates[4].resources.HeavensWill === 0,
      "Resource actions must affect only subsequent actions in timeline order.",
    ).toBeTruthy()

    const regenerationTimeline = buildRotationTimeline({
      rotation: { name: "Resource regeneration probe", steps: [{ type: "skill", skill: "RegenerationSequence" }] },
      skills: {
        RegenerationSequence: {
          name: "Regeneration Sequence",
          castTime: 10,
          action: [
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 0 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 5 },
            { type: "consumeResource", value: "HeavensWill", amount: 0.25, time: 5 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 5 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 10 },
          ],
          modifier: [],
          tags: ["MartialArts", "SkygraspRopeDart"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["heavenwill", "skygrasp"],
      resourceRegeneration: { HeavensWill: 0.1 },
    })
    const regenerationStates = regenerationTimeline[0].actionStates
    expect(
      (regenerationStates[0].resources.HeavensWill ?? 0) === 0 &&
        regenerationStates[1].resources.HeavensWill === 0.5 &&
        regenerationStates[3].resources.HeavensWill === 0.25 &&
        regenerationStates[4].resources.HeavensWill === 0.75,
      "Resource regeneration must accrue by elapsed time and preserve same-time action ordering.",
    ).toBeTruthy()

    const fightStartTimeline = buildRotationTimeline({
      rotation: {
        name: "Fight-start resource regeneration probe",
        start: { step: 1 },
        steps: [
          { type: "skill", skill: "PrepullSequence" },
          { type: "skill", skill: "CombatSequence" },
        ],
      },
      skills: {
        PrepullSequence: {
          name: "Prepull Sequence",
          castTime: 5,
          action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }],
          modifier: [],
          tags: ["General"],
        },
        CombatSequence: {
          name: "Combat Sequence",
          castTime: 5,
          action: [
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 0 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 5 },
          ],
          modifier: [],
          tags: ["MartialArts", "SkygraspRopeDart"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["heavenwill", "skygrasp"],
      initialResources: system.initialResources,
      resourceRegeneration: { HeavensWill: systemCharacter.heavensWillRegen },
      resourceMaximums: system.resourceMaximums,
    })
    expect(
      fightStartTimeline[0].actionStates[0].resources.HeavensWill === 2 &&
        fightStartTimeline[1].actionStates[0].resources.HeavensWill === 2 &&
        fightStartTimeline[1].actionStates[1].resources.HeavensWill === 2.5,
      "Heaven's Will must not regenerate during prepull time and must begin regenerating at fight start.",
    ).toBeTruthy()

    const buildMandateTimeline = (withUnity: boolean) =>
      buildRotationTimeline({
        rotation: {
          name: `Celestial Mandate ${withUnity ? "with" : "without"} Heaven's Unity`,
          steps: [
            ...(withUnity ? [{ type: "skill", skill: "ApplyHeavensUnity" } as const] : []),
            { type: "skill", skill: "CelestialMandate" },
            { type: "skill", skill: "ObserveHeavensWill" },
          ],
        },
        skills: {
          ...heavenwillSkills,
          ApplyHeavensUnity: {
            name: "Apply Heaven's Unity",
            castTime: 0,
            action: [{ type: "apply", target: "self", value: "HeavensUnity", time: 0 }],
            modifier: [],
            tags: ["General"],
          },
          ObserveHeavensWill: {
            name: "Observe Heaven's Will",
            castTime: 0.01,
            action: [{ type: "damage", phyCoef: 0, attrCoef: 0, time: 0.01 }],
            modifier: [],
            tags: ["General"],
          },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: kiteBuffs,
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["heavenwill", "skygrasp"],
      })

    const withoutUnity = lastHeavensWill(buildMandateTimeline(false))
    const unityTimeline = buildMandateTimeline(true)
    const withUnity = lastHeavensWill(unityTimeline)
    expect(
      withoutUnity === 0.1,
      "Celestial Mandate must generate 0.1 Heaven's Will without Heaven's Unity.",
    ).toBeTruthy()
    expect(withUnity === 0.3, "Celestial Mandate must generate 0.3 Heaven's Will with Heaven's Unity.").toBeTruthy()

    const vitalityTimeline = buildRotationTimeline({
      rotation: {
        name: "Vitality event probe",
        steps: [
          { type: "skill", skill: "VitalitySequence" },
          { type: "skill", skill: "ObserveVitality" },
        ],
      },
      skills: {
        VitalitySequence: {
          name: "Vitality Sequence",
          castTime: 2.1,
          action: [
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 0 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 1 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 2.1 },
            { type: "takeDamage", damage: 250, time: 2.1 },
          ],
          modifier: [],
          tags: ["General"],
        },
        ObserveVitality: {
          name: "Observe Vitality",
          castTime: 0.1,
          action: [{ type: "damage", phyCoef: 0, attrCoef: 0, time: 0.1 }],
          modifier: [],
          tags: ["General"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["heavenwill", "skygrasp"],
      initialResources: { Vitality: 0 },
      resourceMaximums: { Vitality: 100 },
      resourceEvents: system.resourceEvents,
      maxHP: 1000,
    })
    const vitalityStates = vitalityTimeline[0].actionStates
    expect(
      vitalityStates[0].resources.Vitality === 0 &&
        vitalityStates[1].resources.Vitality === 2 &&
        vitalityStates[2].resources.Vitality === 2 &&
        vitalityTimeline[1].actionStates[0].resources.Vitality === 14,
      "Attack Vitality must respect its cooldown, while actual Max-HP loss grants stepped Vitality.",
    ).toBeTruthy()

    const mysticVitalityTimeline = buildRotationTimeline({
      rotation: {
        name: "Mystic Vitality probe",
        steps: [
          { type: "skill", skill: "SoaringSpin1" },
          { type: "skill", skill: "ObserveVitality" },
        ],
      },
      skills: {
        ...mysticSkills,
        ObserveVitality: {
          name: "Observe Vitality",
          castTime: 0,
          action: [{ type: "setResource", value: "ObservedVitality", amount: 1, time: 0 }],
          modifier: [],
          tags: ["General"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["heavenwill", "skygrasp"],
      initialResources: { Vitality: 40 },
      resourceMaximums: { Vitality: 40 },
      resourceEvents: system.resourceEvents,
    })
    expect(
      mysticVitalityTimeline[1].resources.Vitality === 27,
      "A direct Mystic cast must consume its Vitality once and may regain Vitality from its attack.",
    ).toBeTruthy()
  })
})
