import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { weaponSetDefinitions } from "@/gear"

import type { RotationSimulationBaseline, RotationSimulationBundle } from "../src/calculations/rotationCalculator.ts"
import type { EditableObject, RotationStep } from "../src/calculations/rotationTimeline.ts"
import { castStep, delayStep } from "./helpers/rotationSteps"

// Ported from script/probe/check-wts-cast-snapshot.mjs.
describe("wts-cast-snapshot", () => {
  it("WTS cast snapshots: exact cast state, food, buff expiry, recasting, nearby-skill isolation, Hawkwing/Etherwrath feedback, expected and sampled healing verified", async () => {
    const { calculateRotationBaseline, calculateSimulatedRotationRun, calculateRotationComparisons } =
      await import("../src/calculations/rotationCalculator.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const mystic = (await import("../data/skill/mystic.json")).default
    const mysticBuffs = (await import("../data/buff/mystic.json")).default
    const general = (await import("../data/buff/general.json")).default
    const kite = (await import("../data/buff/bamboocut-kite.json")).default
    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 100,
      minSilkbind: 50,
      maxSilkbind: 50,
      precision: 1,
      directAffinity: 1,
    }
    const enemy = {
      name: "Snapshot",
      level: 96,
      defense: 0,
      judgementResistance: 0,
      physicalResistance: 0,
      silkbindResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      bamboocutResistance: 0,
    }
    const boost = {
      name: "Attack",
      duration: 0.25,
      maxStack: 1,
      effect: [
        {
          effect: {
            physicalAttackBonus: 0.5,
            silkbindAttackBonus: 0.2,
            healingBonus: 8,
            dmgBonus: 9,
            physicalPenetration: 100,
          },
        },
      ],
    }
    const base: RotationSimulationBundle = {
      stats,
      enemy,
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      attunement: emptyAttunementStats,
      startAnchor: { rowId: "rotation-0" },
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
      timeline: {
        rotation: { name: "WTS cast snapshot", steps: [] },
        skills: {
          WorldToSword: { ...mystic.WorldToSword, cooldown: 0 },
          QiBlade: mystic.QiBlade,
          Boost: { name: "Boost", castTime: 0, action: [{ type: "apply", target: "self", value: "Attack", time: 0 }] },
          Observe: { name: "Observe", castTime: 0, action: [] },
          Hit: {
            name: "Hit",
            castTime: 0.1,
            tags: ["DirectDamage"],
            action: [{ type: "damage", phyCoef: 1, time: 0.1 }],
          },
          Heal: { name: "Heal", castTime: 0.1, tags: ["Heal"], action: [{ type: "heal", phyBonus: 2200, time: 0.1 }] },
          AttackHeal: {
            name: "Attack Heal",
            castTime: 0.1,
            tags: ["Heal"],
            action: [{ type: "heal", phyCoef: 1, time: 0.1 }],
          },
          Misleading: {
            name: "Nearby skill",
            castTime: 0.1,
            tags: ["Nearby"],
            action: [{ type: "heal", phyCoef: 1, time: 0.1 }],
          },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {
          WorldToSword: mysticBuffs.WorldToSword,
          Attack: boost,
          Hawkwing: general.Hawkwing,
          Etherwrath: kite.Etherwrath,
        },
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["panaceaFan", "soulshadeUmbrella"],
        initialResources: { Vitality: 1000 },
        resourceMaximums: { Vitality: 1000 },
        maxHP: 1000,
      },
    }
    const fixture = (steps: RotationStep[], setupEffects: EditableObject[] = []): RotationSimulationBundle => ({
      ...base,
      timeline: { ...base.timeline, rotation: { ...base.timeline.rotation, steps }, setupEffects },
    })
    /** The accumulator threshold each Observe row recorded, in cast order. */
    const observed = (result: RotationSimulationBaseline) =>
      result.timeline
        .filter(row => row.step.skill === "Observe")
        .map((row, index) => {
          const threshold = row.buffs.get("WorldToSword")?.accumulatorThreshold
          assert(typeof threshold === "number", `The Observe row at ${index} must record its WTS threshold.`)
          return threshold
        })
    const near = (actual: number, expected: number, message: string) =>
      assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} vs ${expected}`)
    const noAdjacentDamage = calculateRotationBaseline(fixture([castStep("WorldToSword"), castStep("Observe")]))
    near(observed(noAdjacentDamage)[0], 2100, "A cast without nearby damage/healing still gets a threshold")
    const expiry = calculateRotationBaseline(
      fixture([
        castStep("Boost"),
        castStep("WorldToSword"),
        castStep("Observe"),
        delayStep(0.5),
        castStep("Observe"),
        castStep("WorldToSword"),
        castStep("Observe"),
      ]),
    )
    observed(expiry).forEach((value, index) =>
      near(
        value,
        [2880, 2880, 2100][index],
        "Attack buffs snapshot and stay frozen after expiration; recast refreshes",
      ),
    )
    const laterBuff = calculateRotationBaseline(
      fixture([
        castStep("WorldToSword"),
        castStep("Boost"),
        castStep("Observe"),
        castStep("WorldToSword"),
        castStep("Observe"),
      ]),
    )
    observed(laterBuff).forEach((value, index) =>
      near(value, [2100, 2880][index], "A buff after casting affects only the next cast"),
    )
    const nearby = calculateRotationBaseline(
      fixture(
        [castStep("WorldToSword"), castStep("Misleading"), castStep("Observe")],
        [{ requirement: [{ target: "skillTag", value: "Nearby" }], effect: { physicalAttackBonus: 9 } }],
      ),
    )
    near(observed(nearby)[0], 2100, "The following skill cannot donate its skill-specific attack multiplier")
    const food = calculateRotationBaseline(
      fixture([castStep("WorldToSword"), castStep("Observe")], [{ effectiveStat: { minPhys: 10, maxPhys: 20 } }]),
    )
    near(observed(food)[0], 2280, "Food belongs in the effective attack snapshot")
    // A four-piece set's option carries its proc trigger; the effect is read as-is.
    const setTrigger = (id: string): EditableObject => {
      const option = weaponSetDefinitions[id as keyof typeof weaponSetDefinitions]?.options["4"]
      const effect = option?.effect
      const list = Array.isArray(effect) ? effect[0] : effect
      const trigger = (list as { trigger?: EditableObject } | undefined)?.trigger
      assert(trigger, `Expected the four-piece ${id} option to carry its proc trigger.`)
      return { trigger }
    }
    const hawk = setTrigger("Hawkwing")
    const ew = setTrigger("Etherwrath")
    for (const [label, setup, bonus] of [
      ["Hawkwing", hawk, 24],
      ["Etherwrath", ew, 25.2],
    ] as Array<[string, EditableObject, number]>) {
      const before = calculateRotationBaseline(
        fixture([castStep("Hit"), castStep("WorldToSword"), castStep("Observe")], [setup]),
      )
      near(observed(before)[0], 2100 + bonus, `${label} procs before WTS enter its snapshot`)
      const feedbackFixture = fixture(
        [
          castStep("WorldToSword"),
          castStep("Heal"),
          delayStep(1),
          castStep("Observe"),
          castStep("WorldToSword"),
          castStep("Observe"),
          castStep("AttackHeal"),
          delayStep(0.5),
        ],
        [setup],
      )
      const feedback = calculateRotationBaseline(feedbackFixture)
      near(observed(feedback)[0], 2100, `${label} from a Qi Blade cannot alter the first activation`)
      near(
        observed(feedback)[1],
        2100 + bonus,
        `${label} from the first activation's Qi Blade enters the second snapshot`,
      )
      assert.equal(feedback.metrics.breakdown.skills.find(skill => skill.id === "QiBlade")?.hits, 1)
      const sampled = calculateSimulatedRotationRun(feedbackFixture, () => 0.5)
      const heal = sampled.resolvedSequence.find(
        ({ entry }) => entry.context.skillTags.includes("Heal") && entry.action.phyCoef === 1,
      )
      assert(
        heal?.entry.context.buffs.includes("WorldToSword"),
        "The sampled Heal must run with World to Sword active.",
      )
      const sampledHealing = heal?.breakdown.healing
      assert(sampledHealing, "A healing action must report its healing breakdown.")
      near(
        sampledHealing.total,
        label === "Hawkwing" ? 102 : 101.2,
        "Sampled healing includes the attack proc from the earlier Qi Blade",
      )
    }
    for (const [steps, blades] of [
      [[castStep("Boost"), castStep("WorldToSword"), castStep("Heal"), delayStep(0.5)], 0],
      [[castStep("WorldToSword"), castStep("Boost"), castStep("Heal"), delayStep(0.5)], 1],
    ] as Array<[RotationStep[], number]>) {
      const sampledFixture = fixture(steps)
      sampledFixture.timeline.effectDefinitions = {
        ...base.timeline.effectDefinitions,
        Attack: { ...boost, effect: [{ effect: { physicalAttackBonus: 0.5, silkbindAttackBonus: 0.2 } }] },
      }
      const run = calculateSimulatedRotationRun(sampledFixture, () => 0.5)
      assert.equal(
        run.resolvedSequence.filter(({ entry }) => entry.context.skillTags.includes("QiBlade")).length,
        blades,
        "Sampled runs freeze the threshold at casting, before any later attack buff",
      )
    }
    const fractionalHawk = fixture(
      [castStep("Hit"), castStep("WorldToSword"), castStep("Observe"), castStep("AttackHeal")],
      [hawk],
    )
    fractionalHawk.stats = { ...stats, directAffinity: 0.5 }
    near(
      observed(calculateRotationBaseline(fractionalHawk))[0],
      2112,
      "Expected mode snapshots expected Hawkwing stacks",
    )
    const compareFixture = fixture([castStep("WorldToSword"), castStep("Heal"), delayStep(0.5)])
    compareFixture.statPriority = [{ label: "Higher attack", stats: { ...stats, minPhys: 200, maxPhys: 200 } }]
    const comparison = calculateRotationComparisons(compareFixture, calculateRotationBaseline(compareFixture))
    near(
      comparison.statPriority[0].dpsDifference,
      -calculateRotationBaseline(compareFixture).metrics.dps,
      "Raising the variant threshold above the fixed heal removes its Qi Blade",
    )
    const periodicFixture = fixture([
      castStep("WorldToSword"),
      castStep("Heal"),
      delayStep(0.5),
      castStep("ApplyHOT"),
      delayStep(2.6),
    ])
    periodicFixture.timeline.skills = {
      ...base.timeline.skills,
      ApplyHOT: { name: "Apply HOT", castTime: 0, action: [{ type: "apply", target: "self", value: "HOT", time: 0 }] },
    }
    // `tags` is load-bearing on a shipped effect definition — ten of them carry one —
    // but the declared effect definition omits it, so the entry is named here rather
    // than written inline: an inline literal is checked against the declared fields
    // and would silently lose the tag.
    const hot = {
      name: "HOT",
      duration: 3,
      maxStack: 1,
      tags: ["Heal"],
      periodic: { interval: 1, firstTick: 1, action: [{ type: "heal", phyBonus: 2200, time: 0 }] },
    }
    periodicFixture.timeline.effectDefinitions = { ...base.timeline.effectDefinitions, HOT: hot }
    const periodic = calculateRotationBaseline(periodicFixture)
    assert.equal(
      periodic.metrics.breakdown.skills.find(skill => skill.id === "QiBlade")?.triggers,
      3,
      "Periodic heals created after earlier Qi Blades must all feed WTS, regardless of generated row IDs",
    )
    near(periodic.metrics.totalHealing, 6600, "The accumulator and reported HPS use the same three heals")
  })
})
