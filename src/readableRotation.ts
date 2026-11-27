import { defaultSkillMaps, skillCategoryByWeapon } from "@/application/gameData/skills"
import type { TimelineRow } from "@/calculations/rotationTimeline"
import { weaponIds, type WeaponId } from "@/types"

const formatSeconds = (value: number) => `${Number(value.toFixed(3))}s`

const weaponLabels: Record<WeaponId, string> = {
  boshanQuyueSpear: "Blue",
  jueyuXuanfengSpear: "Red",
  snowparting: "Heng",
  phalanxbane: "Mo",
  thundercry: "Thundercry",
  stormbreaker: "Spear",
  everspring: "Umbrella",
  unfettered: "RD",
  heavenwill: "Gauntlet",
  skygrasp: "RD",
  namelessSword: "Sword",
  namelessSpear: "Spear",
  strategicSword: "Sword",
  heavenquakerSpear: "Spear",
  vernalUmbrella: "Umbrella",
  inkwellFan: "Fan",
  panaceaFan: "Fan",
  soulshadeUmbrella: "Umbrella",
  infernalTwinblades: "DB",
  mortalRopeDart: "RD",
  skystrikeGauntlets: "Gauntlet",
  rivenTwinblades: "TB",
  museflowWaistDrum: "Drum",
  willowbendFan: "Fan",
}

function readableAction(row: TimelineRow) {
  if (row.step.type === "event") {
    switch (row.step.event) {
      case "MartialArt": {
        const weapon = row.step.martialArt
        return { weapon, name: `Scroll to ${weaponLabels[weapon]}`, switchesWeapon: true }
      }
      case "Delay":
        if (!row.step.automatic && row.step.duration > 0)
          return { name: `Wait ${formatSeconds(row.step.duration)}`, switchesWeapon: false }
        return
      default:
        return
    }
  }
  const skillId = row.step.skill ?? ""
  const skill = row.skill
  const weapon =
    skill?.martialArt ??
    weaponIds.find(id => {
      const category = skillCategoryByWeapon[id]
      return category !== undefined && Object.hasOwn(defaultSkillMaps[category], skillId)
    })
  const label = weapon && weaponLabels[weapon]
  if (label && (skill?.tags?.includes("Conversion") || skill?.tags?.includes("Tab"))) {
    return { weapon, name: `Tab to ${label}`, switchesWeapon: true }
  }
  const shortName = skill?.shortName?.trim()
  const prefix = `${label} `
  const name =
    label && shortName?.startsWith(prefix)
      ? shortName.slice(prefix.length)
      : shortName || skill?.name?.trim() || skillId
  return { weapon, name, switchesWeapon: false }
}

export function readableRotationText(
  timeline: TimelineRow[],
  startAnchor: { rowId: string; actionIndex?: number },
  anchorTime: number,
) {
  const rotationRows = timeline
    .filter(row => row.kind === "rotation" && !row.skipped)
    .sort((left, right) => (left.rotationIndex ?? 0) - (right.rotationIndex ?? 0))
  const skillRows = rotationRows.filter(row => row.step.type === "skill")
  const umbrellaThrows = new Map<string, number>()
  for (const row of timeline) {
    if (
      row.kind === "trigger" &&
      row.sourceRowId &&
      !row.skipped &&
      /^ScarletSpinStage[1-4]$/.test(row.step.skill ?? "")
    ) {
      umbrellaThrows.set(row.sourceRowId, (umbrellaThrows.get(row.sourceRowId) ?? 0) + 1)
    }
  }
  const breakRows = new Set<string>(
    skillRows.filter(row => row.step.type === "skill" && row.step.causesBreak).map(row => row.id),
  )
  const breakEvents = timeline.filter(
    row =>
      row.kind === "rotation" &&
      row.step.type === "event" &&
      row.step.event === "Qi" &&
      row.step.targetQiRatio === 0 &&
      !row.skipped,
  )
  breakEvents.forEach(breakEvent => {
    const containingRow =
      skillRows.find(row => row.id === breakEvent.sourceRowId) ??
      skillRows.find(
        row =>
          breakEvent.startTime >= row.startTime - 1e-6 &&
          breakEvent.startTime <= row.startTime + row.effectiveCastTime + 1e-6,
      )
    if (containingRow) breakRows.add(containingRow.id)
  })
  function annotatedName(row: TimelineRow, name: string) {
    const notes: string[] = []
    if (row.step.type === "skill") {
      switch (row.step.skill) {
        case "ScarletSpin": {
          const count = umbrellaThrows.get(row.id) ?? 0
          if (!row.pendingCalculation) notes.push(`${count} ${count === 1 ? "Throw" : "Throws"}`)
          break
        }
        case "CycloneWaltz": {
          const count = row.actions.filter(
            (action, index) => action.type === "damage" && row.actionStates[index]?.combatOrder !== undefined,
          ).length
          if (!row.pendingCalculation) notes.push(`${count} ${count === 1 ? "Hit" : "Hits"}`)
          break
        }
        default:
          if (row.step.duration !== undefined) notes.push(`hold ${formatSeconds(row.step.duration)}`)
      }
    }
    if (row.id === startAnchor.rowId) {
      const hitNumber =
        startAnchor.actionIndex === undefined
          ? 0
          : row.actions.slice(0, startAnchor.actionIndex + 1).filter(action => action.type === "damage").length
      notes.push(hitNumber > 0 ? `start at hit ${hitNumber}` : "start")
    } else if (row.step.event !== "Delay" && row.startTime < anchorTime - 1e-6) {
      const beforeStart = anchorTime - row.startTime
      notes.push(`-${formatSeconds(Math.round(beforeStart * 2) / 2 || beforeStart)}`)
    }
    if (breakRows.has(row.id)) notes.push("break")
    return notes.length ? `${name} (${notes.join(", ")})` : name
  }

  const groups: Array<{
    text: string
    name: string
    weapon?: WeaponId
    switchesWeapon: boolean
    separator: string
    count: number
  }> = []
  let previousSkillWeapon: WeaponId | undefined
  for (const row of rotationRows) {
    const action = readableAction(row)
    if (!action) continue
    const { weapon, switchesWeapon } = action
    const name = annotatedName(row, action.name)
    const previous = groups.at(-1)
    if (previous?.name === name && previous.weapon === weapon && previous.switchesWeapon === switchesWeapon) {
      previous.count += 1
    } else {
      const text =
        weapon && weapon !== previousSkillWeapon && !switchesWeapon ? `${weaponLabels[weapon]} ${name}` : name
      const sameWeaponSequence = weapon && previous?.weapon === weapon && !switchesWeapon && !previous.switchesWeapon
      let separator = ""
      if (previous) separator = sameWeaponSequence ? ", " : " > "
      groups.push({ text, name, weapon, switchesWeapon, separator, count: 1 })
    }
    previousSkillWeapon = row.step.type === "skill" ? weapon : undefined
  }
  return groups.map(({ separator, text, count }) => `${separator}${text}${count > 1 ? ` x${count}` : ""}`).join("")
}
