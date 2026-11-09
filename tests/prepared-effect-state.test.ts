import { describe, expect, it, vi } from "vitest"

import { createPreparedEffectState } from "@/calculations/preparedEffectState"
import {
  buildRotationTimeline,
  requirementsPass,
  type TrackedEffect,
  type TimelineBuildInput,
} from "@/calculations/rotationTimeline"
import { trackedEffectMetadata, effectState, effectKey } from "@/calculations/trackedEffectState"

describe("prepared combat state", () => {
  it("separates cached effects across martial-art and weapon-family switches", () => {
    const rules = [
      { requirement: [{ target: "currentMartialArt", value: "jueyuXuanfengSpear" }], effect: { hpDMGBonus: 0.1 } },
      { requirement: [{ target: "currentWeapon", value: "Spear" }], effect: { flatAttackBonus: 0.15 } },
    ]
    const prepare = createPreparedEffectState(rules)
    const empty = effectState()
    const staticEffects = {}
    const modifiers: object[] = []
    const resolve = (currentMartialArt: "jueyuXuanfengSpear" | "boshanQuyueSpear", currentWeapon: "Spear" | "Fan") => {
      const state = { currentMartialArt, currentWeapon }
      return prepare(empty, empty, {}, state, staticEffects, modifiers, () =>
        rules
          .filter(rule => requirementsPass(rule.requirement, empty, empty, [], new Set(), [], {}, state))
          .map(rule => rule.effect),
      )
    }
    const redSpear = resolve("jueyuXuanfengSpear", "Spear")
    expect(redSpear).toEqual([{ hpDMGBonus: 0.1 }, { flatAttackBonus: 0.15 }])
    expect(resolve("boshanQuyueSpear", "Spear")).toEqual([{ flatAttackBonus: 0.15 }])
    expect(resolve("boshanQuyueSpear", "Fan")).toEqual([])
    expect(resolve("jueyuXuanfengSpear", "Spear")).toBe(redSpear)
  })
  it.each([false, true])("tracks resource thresholds inside action modifiers (active first=%s)", activeFirst => {
    const prepare = createPreparedEffectState([])
    const skill = {}
    const buffs = effectState()
    const modifiers = [
      {
        requirement: [{ target: "resource", value: "Energy", comparison: ">=", amount: 100 }],
        effect: { GuaranteedAffinity: true },
      },
    ]
    const resolveAt = (energy: number) =>
      prepare(buffs, buffs, { Energy: energy }, {}, skill, modifiers, () =>
        energy >= 100 ? [{ GuaranteedAffinity: true }] : [],
      )
    const first = resolveAt(activeFirst ? 100 : 99)
    const second = resolveAt(activeFirst ? 99 : 100)
    expect(first).toEqual(activeFirst ? [{ GuaranteedAffinity: true }] : [])
    expect(second).toEqual(activeFirst ? [] : [{ GuaranteedAffinity: true }])
    expect(resolveAt(101)).toBe(activeFirst ? first : second)
    expect(resolveAt(98)).toBe(activeFirst ? second : first)
  })
  it.each([false, true])("uses skill candidate order independently of insertion order (reversed=%s)", reversed => {
    const names = reversed ? ["Second", "First"] : ["First", "Second"]
    const input: TimelineBuildInput = {
      rotation: {
        name: "Explicit selection",
        steps: [
          { type: "skill", skill: "Consume" },
          { type: "skill", skill: "Observe" },
        ],
      },
      initialBuffs: names.map(name => ({ name, stack: 1 })),
      skills: {
        Consume: {
          castTime: 1,
          action: [
            { type: "damage", time: 0 },
            {
              type: "consume",
              target: "self",
              value: { operator: "first", operand: ["First", "Second"] },
              stack: "all",
              time: 0.5,
            },
          ],
        },
        Observe: { castTime: 1, action: [{ type: "damage", time: 0 }] },
      },
      effectDefinitions: { First: {}, Second: {} },
      eventDefinitions: {},
      dots: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    }
    const rows = buildRotationTimeline(input)
    const before = rows[0].actionStates[0].buffs
    const after = rows[1].actionStates[0].buffs
    expect(before).toBeInstanceOf(Map)
    expect(before.has("First")).toBe(true)
    expect(before.has("Second")).toBe(true)
    expect(after.has("First")).toBe(false)
    expect(after.has("Second")).toBe(true)
    const cloned = structuredClone(rows)
    expect(cloned[0].actionStates[0].buffs).toEqual(before)
    expect(cloned[1].actionStates[0].buffs).toEqual(after)
  })

  it("uses the same prepared state when insertion order differs", () => {
    const prepare = createPreparedEffectState([])
    const skill = {}
    const resolve = vi.fn<() => Array<{ dmgBonus: number }>>(() => [{ dmgBonus: 0.1 }])
    const effects = [
      { name: "A", stack: 1 },
      { name: "B", stack: 2 },
    ]
    const first = prepare(effectState(effects), effectState(), {}, {}, skill, [], resolve)
    expect(prepare(effectState([...effects].reverse()), effectState(), {}, {}, skill, [], resolve)).toBe(first)
    expect(resolve).toHaveBeenCalledTimes(1)
  })
  it("indexes self and teammate stacks without confusing recipients or changing historical snapshots", () => {
    const before: TrackedEffect[] = [
      { name: "Buff", stack: 5, maxStack: 5, playerRecipientIndex: 1, expiresAt: 4 },
      { name: "Buff", stack: 2, maxStack: 5, expiresAt: 3 },
    ]
    const conditions = new Set<string>()
    const has = (effects: TrackedEffect[], stack: unknown) =>
      requirementsPass([{ target: "self", value: "Buff", stack }], effectState(effects), effectState(), [], conditions)
    expect(has(before, 3)).toBe(false)
    expect(has(before, 2)).toBe(true)
    expect(has(before, "max")).toBe(false)
    const after = [before[0], { ...before[1], stack: 5, expiresAt: 8 }]
    expect(has(after, "max")).toBe(true)
    expect(has(before, "max")).toBe(false)
    expect(trackedEffectMetadata(effectState(before)).nextExpiry).toBe(3)
    expect(effectState(after).get(effectKey("Buff", 1))).toBe(before[0])
    expect(effectState(after).get("Buff")?.stack).toBe(5)
    expect(structuredClone(effectState(after)).get("Buff")?.stack).toBe(5)
    expect(
      requirementsPass(
        [{ target: "target", value: "Buff", stack: "max" }],
        effectState(),
        effectState(after),
        [],
        conditions,
      ),
    ).toBe(true)
    expect(has([], 1)).toBe(false)
  })

  it("reuses contributions across refresh and numeric changes until a requirement outcome changes", () => {
    const requirement = [
      {
        operator: "or",
        operand: [
          { target: "resource", value: "Energy", comparison: ">=", amount: 5 },
          { target: "selfHPPercentage", comparison: "<", compareTo: "targetHPPercentage" },
        ],
      },
    ]
    const prepare = createPreparedEffectState([{ modify: { effect: [{ requirement }] } }])
    const skill = {}
    const resolve = vi.fn<() => Array<{ stat: { minPhys: number } }>>(() => [{ stat: { minPhys: 10 } }])
    const buff = { name: "Buff", stack: 1, expiresAt: 3 }
    const first = prepare(
      effectState([buff]),
      effectState([]),
      { Energy: 1 },
      { selfHPPercentage: 90, targetHPPercentage: 50 },
      skill,
      [],
      resolve,
    )
    const refreshed = prepare(
      effectState([{ ...buff, expiresAt: 8, sourceRowId: "new" }]),
      effectState([]),
      { Energy: 4 },
      { selfHPPercentage: 80, targetHPPercentage: 50 },
      skill,
      [],
      resolve,
    )
    expect(refreshed).toBe(first)
    expect(resolve).toHaveBeenCalledTimes(1)
    const resourceChange = prepare(
      effectState([buff]),
      effectState([]),
      { Energy: 5 },
      { selfHPPercentage: 80, targetHPPercentage: 50 },
      skill,
      [],
      resolve,
    )
    expect(resourceChange).not.toBe(first)
    const hpChange = prepare(
      effectState([buff]),
      effectState([]),
      { Energy: 1 },
      { selfHPPercentage: 40, targetHPPercentage: 50 },
      skill,
      [],
      resolve,
    )
    expect(hpChange).not.toBe(first)
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  it("separates counterfactual membership, stacks, skill tags and action modifiers", () => {
    const prepare = createPreparedEffectState([])
    const skill = {}
    const buffs = [{ name: "Buff", stack: 1 }]
    const resolve = vi.fn<() => Array<{ dmgBonus: number }>>(() => [{ dmgBonus: 0.1 }])
    const full = prepare(effectState(buffs), effectState([]), {}, {}, skill, [], resolve)
    expect(prepare(effectState([]), effectState([]), {}, {}, skill, [], resolve)).not.toBe(full)
    expect(prepare(effectState([{ name: "Buff", stack: 2 }]), effectState([]), {}, {}, skill, [], resolve)).not.toBe(
      full,
    )
    expect(prepare(effectState(buffs), effectState([]), {}, {}, {}, [], resolve)).not.toBe(full)
    expect(prepare(effectState(buffs), effectState([]), {}, {}, skill, [{ dmgBonus: 0.2 }], resolve)).not.toBe(full)
    expect(prepare(effectState(buffs), effectState([]), {}, {}, skill, [], resolve)).toBe(full)
    expect(resolve).toHaveBeenCalledTimes(5)
  })
})
