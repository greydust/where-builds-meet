import { requirementsPass, type EditableObject } from "./rotationTimeline"
import { trackedEffectMetadata, type EffectState } from "./trackedEffectState"

function collectNumericRequirements(requirements: unknown[]) {
  const numericRequirements: EditableObject[] = []
  const numericKeys = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== "object") return
    const condition = value as EditableObject
    switch (condition.target) {
      case "resource":
      case "distance":
      case "selfHPPercentage":
      case "targetHPPercentage":
      case "targetQiPercentage":
      case "endurancePercentage":
        if (!numericKeys.has(JSON.stringify(condition))) {
          numericKeys.add(JSON.stringify(condition))
          numericRequirements.push(condition)
        }
        break
    }
    Object.values(condition).forEach(visit)
  }
  requirements.forEach(visit)
  return numericRequirements
}

/** Run-local preparation. Numerical predicates are keyed by their result, so HP changes
 * that stay on the same side of a threshold do not rebuild contributions. */
export function createPreparedEffectState(requirements: unknown[]) {
  const numericRequirements = collectNumericRequirements(requirements)
  const states = new Map<string, EditableObject[]>()
  const identities = new WeakMap<object, number>()
  let nextIdentity = 0
  const modifierKeys = new WeakMap<object, { key: string; requirements: EditableObject[] }>()
  const emptyConditions = new Set<string>()
  const identity = (value: object) => {
    let id = identities.get(value)
    if (id === undefined) {
      id = nextIdentity++
      identities.set(value, id)
    }
    return id
  }
  return (
    buffs: EffectState,
    debuffs: EffectState,
    resources: Parameters<typeof requirementsPass>[6],
    state: Parameters<typeof requirementsPass>[7],
    staticEffects: object,
    modifiers: object,
    resolve: () => EditableObject[],
  ) => {
    let modifierKey = modifierKeys.get(modifiers)
    if (modifierKey === undefined) {
      modifierKey = { key: JSON.stringify(modifiers), requirements: collectNumericRequirements([modifiers]) }
      modifierKeys.set(modifiers, modifierKey)
    }
    const predicates = [...numericRequirements, ...modifierKey.requirements].map(requirement =>
      requirementsPass([requirement], buffs, debuffs, [], emptyConditions, [], resources, state) ? 1 : 0,
    )
    const key = JSON.stringify([
      identity(staticEffects),
      modifierKey.key,
      trackedEffectMetadata(buffs).requirementKey,
      trackedEffectMetadata(debuffs).requirementKey,
      state?.currentMartialArt,
      state?.currentWeapon,
      predicates,
    ])
    let effects = states.get(key)
    if (!effects) {
      effects = resolve()
      states.set(key, effects)
    }
    return effects
  }
}
