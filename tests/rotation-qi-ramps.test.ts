import assert from "node:assert/strict"

import { describe, expect, it } from "vitest"

import { defaultGlobalDebuffs } from "@/globalDebuffs"

import type { PathId } from "../src/application/contracts"
import { typedPathDefinitions, type PathDefinition } from "../src/application/gameData/paths"
import { buildPresetRotationBundle } from "../src/application/graduation"
import {
  buildRotationTimeline,
  canAnchorAttachedEvent,
  type AttachedEventTarget,
  type RotationRecord,
  type RotationStep,
  type TimelineRow,
} from "../src/calculations/rotationTimeline"
import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"
import { probeLoad } from "./helpers/probe-loader"
import { rowCasting } from "./helpers/timelineRows"

/**
 * The three Qi step shapes: anchored before an action, anchored after one, or
 * positioned at an authored battle time. Each field lives on a different member,
 * so each is read through a check that says which shape it is.
 */
type QiStep = Extract<RotationStep, { type: "event" }> & { event: "Qi" }
const qiStepOf = (row: TimelineRow): QiStep | undefined =>
  row.step.type === "event" && row.step.event === "Qi" ? row.step : undefined
/** The action this Qi step attaches to, or undefined when it carries an authored time. */
const attachmentOf = (step: QiStep): AttachedEventTarget | undefined =>
  "before" in step ? step.before : "after" in step ? step.after : undefined
/** The authored battle time this Qi step is positioned at, if it has one. */
const authoredTimeOf = (step: QiStep): number | undefined => ("startTime" in step ? step.startTime : undefined)

describe("preset Qi event attachments", () => {
  const rotationPaths = [
    "/data/rotation/bamboocut-wind/wind-dummy-1-min-infinite-vitality.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-infinite-vitality-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-1-min-double-stab.json",
    "/archive/rotation/stonesplit-strength/mixed-horse-tamer-standard-27s.json",
    "/archive/rotation/stonesplit-strength/mixed-horse-tamer-standard-27s-no-fcn.json",
    "/data/rotation/stonesplit-strength/pure-dummy-1-min.json",
    "/archive/rotation/stonesplit-strength/pure-horse-tamer-standard-27s.json",
    "/data/rotation/stonesplit-might/dummy-1-min.json",
    "/data/rotation/bamboocut-kite/dummy-1-min-infinite-vitality.json",
    "/data/rotation/bamboocut-kite/dummy-1-min-iv-bp.json",
    "/data/rotation/bamboocut-dust/dust-dummy-1-min.json",
    "/data/rotation/bamboocut-dust/dust-dummy-1-min-100pc.json",
  ]
  it.each(rotationPaths)("resolves authored Qi attachments using production inputs: %s", async rotationPath => {
    const rotation = (await probeLoad<{ default: RotationRecord }>(rotationPath)).default
    const match = Object.entries(typedPathDefinitions).find(([, entry]) =>
      rotationPath.includes("/" + entry.buildGroup + "/"),
    ) as [PathId, PathDefinition] | undefined
    assert(match, `No shipped path builds rotations under ${rotationPath}`)
    const [pathId, path] = match
    const lockedWeapons = path.lockedWeapons
    assert(lockedWeapons, `${rotationPath}'s path must lock its two martial arts.`)
    const bundle = buildPresetRotationBundle(
      {
        pathId: pathId as PathId,
        martialArts: lockedWeapons,
        rotation,
        breakthrough: "17",
        food: "None",
        divinecraft: "None",
        script: "None",
        skillOverrides: {},
        previewId: null,
        globalDebuffs: { ...defaultGlobalDebuffs },
      },
      path.defaultBuild,
    )
    expect(bundle).toBeDefined()
    const timeline = buildRotationTimeline(bundle!.timeline)
    const battleStart = timeline.find(row => row.battleStartTime !== undefined)?.battleStartTime ?? 0
    const qiRows = timeline.filter(row => qiStepOf(row) !== undefined)
    // The step of a Qi row, which the shape helpers read.
    const stepOf = (row: TimelineRow) => qiStepOf(row)!
    expect(qiRows.length).toBeGreaterThan(0)
    for (const row of qiRows) {
      const setIndex = row.actions.findIndex(action => action.type === "setQi")
      expect(setIndex).toBeGreaterThanOrEqual(0)
      const nextState = row.actionStates[setIndex + 1]
      expect(nextState).toBeDefined()
      expect(nextState.targetQiRatio).toBeCloseTo(stepOf(row).targetQiRatio, 8)
    }
    // An attached Qi step must land on the action it names. A fixed-time Qi step
    // carries no attachment and instead lands at its authored battle time, offset
    // by when the battle actually started.
    const attachedQiRows = qiRows.filter(row => attachmentOf(stepOf(row)) !== undefined)
    const fixedTimeQiRows = qiRows.filter(row => attachmentOf(stepOf(row)) === undefined)
    for (const row of attachedQiRows) {
      const attachment = attachmentOf(stepOf(row)) as AttachedEventTarget
      const source = timeline.find(candidate => candidate.id === row.sourceRowId)
      assert(source, `The Qi step at ${row.startTime} must name a source row.`)
      const trigger =
        attachment.trigger === undefined
          ? undefined
          : source.actions.filter(action => action.type === "trigger")[attachment.trigger]
      const target =
        attachment.trigger === undefined
          ? source
          : timeline.find(
              candidate =>
                candidate.kind === "trigger" &&
                candidate.triggerSource === "skill" &&
                candidate.sourceRowId === source.id &&
                candidate.step.skill === trigger?.value,
            )
      assert(target, `The attachment at ${row.startTime} must resolve to a timeline row.`)
      const expectedTime =
        target.startTime + (attachment.action === "start" ? 0 : Number(target.actions[attachment.action].time ?? 0))
      expect(row.startTime).toBeCloseTo(expectedTime, 8)
    }
    for (const row of fixedTimeQiRows) {
      const authored = authoredTimeOf(stepOf(row))
      expect(typeof authored).toBe("number")
      expect(row.startTime).toBeCloseTo(battleStart + Number(authored), 8)
    }
    // Every attachment to an executed in-window action must resolve, irrespective of preset ramp counts.
    for (const [index, step] of rotation.steps.entries()) {
      if (step.type !== "event" || step.event !== "Qi") continue
      const attachment = attachmentOf(step)
      // Fixed-time steps are positioned by their authored time, not by an anchor.
      if (!attachment) continue
      const nextIndex = rotation.steps.findIndex(
        (candidate, candidateIndex) => candidateIndex > index && canAnchorAttachedEvent(candidate, attachment),
      )
      const target = timeline.find(row => row.id === `rotation-${nextIndex}`)
      if (!target || target.skipped) continue
      const anchor = attachment.action
      const action = anchor === "start" ? undefined : target.actions[anchor]
      if (anchor !== "start" && (!action || action.type === "inactive")) continue
      expect(
        qiRows.some(row => row.id === `rotation-${index}`),
        `Executed attachment ${index} to ${target.id}/${target.step.skill} action ${anchor} must retain its Qi event`,
      ).toBe(true)
    }
  })
})

describe("preset Qi ramp coverage", () => {
  // The meter only ever moves where the rotation says so, so a preset's events have
  // to read as a repeating descent: 0.5999 then 0.3999 then the 0 that applies
  // Exhausted, whose expiry is what refills the meter for the next ramp. Values off
  // this cycle silently skew every target-Qi requirement that data gates on.
  const RAMP = [0.5999, 0.3999, 0]

  it("descends each preset's meter in 0.5999 / 0.3999 / 0 ramps that land inside the fight", async () => {
    const cases = await loadDpsSnapshotFixtures()
    expect(cases.length).toBeGreaterThan(0)
    for (const { id, pathId, rotation, fixture } of cases) {
      const bundle = buildPresetRotationBundle(
        { pathId, ...fixture, rotation: { ...rotation, ping: fixture.ping }, skillOverrides: {}, previewId: null },
        fixture.build,
      )
      expect(bundle, `${id}: failed to build the production calculation bundle.`).toBeDefined()
      const timeline = buildRotationTimeline(bundle!.timeline)
      const battleStart = timeline.find(row => row.battleStartTime !== undefined)?.battleStartTime ?? 0
      const battleEnd = timeline.find(row => row.step.type === "event" && row.step.event === "BattleEnd")?.startTime
      expect(battleEnd, `${id}: a measured preset needs a Battle End cutoff.`).toBeDefined()
      const window = battleEnd! - battleStart
      const rows = timeline
        .filter(row => row.step.type === "event" && row.step.event === "Qi" && !row.skipped)
        .sort((left, right) => left.startTime - right.startTime)
        .map(row => ({ ratio: (row.step as { targetQiRatio: number }).targetQiRatio, at: row.startTime - battleStart }))
      expect(rows.length, `${id}: the first ramp is ${RAMP.join(" / ")} and must be complete.`).toBeGreaterThanOrEqual(
        RAMP.length,
      )
      expect(
        rows.slice(0, RAMP.length).map(row => row.ratio),
        `${id}: the first ramp is ${RAMP.join(" / ")}.`,
      ).toEqual(RAMP)
      rows.forEach((row, index) => {
        const ratio = RAMP[index % RAMP.length]
        expect(row.ratio, `${id}: Qi event ${index} must be ${ratio}.`).toBe(ratio)
        // An event at or past the cutoff can never fire, so it is dead data.
        expect(row.at, `${id}: Qi event ${index} falls outside the fight.`).toBeLessThan(window)
      })
    }
  })
})

/** The Qi step anchored on the selected side of an action. */
function qiPlacementStep(placement: "before" | "after"): RotationStep {
  switch (placement) {
    case "before":
      return { type: "event", event: "Qi", before: { action: 0 }, targetQiRatio: 0 }
    case "after":
      return { type: "event", event: "Qi", after: { action: 0 }, targetQiRatio: 0 }
  }
}

describe("Qi attachment ordering", () => {
  it.each(["before", "after"] as const)("applies %s the selected hit and expires independently", placement => {
    const timeline = buildRotationTimeline({
      rotation: { name: "Attachment ordering", steps: [qiPlacementStep(placement), { type: "skill", skill: "Probe" }] },
      skills: {
        Probe: {
          name: "Probe",
          castTime: 2,
          tags: [],
          action: [0.2, 0.6, 1.3].map(time => ({ type: "damage", phyCoef: 1, time })),
        },
      },
      eventDefinitions: {
        Qi: {
          name: "Qi",
          castTime: 0,
          action: [
            { type: "setQi", time: 0 },
            {
              type: "apply",
              target: "target",
              value: "Depleted",
              time: 0,
              requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
            },
          ],
        },
      },
      effectDefinitions: { Depleted: { duration: 1, maxStack: 1, effect: [] } },
      dots: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })
    const row = rowCasting(timeline, "Probe")!
    const states = row.actions.map((_, index) => row.actionStates[index])
    expect(states.map(state => state.debuffs.has("Depleted"))).toEqual([placement === "before", true, false])
    expect(states[0].targetQiRatio).toBe(placement === "before" ? 0 : 1)
    expect(states[1].targetQiRatio).toBe(0)
  })
})
