import general from "../../data/skill/general.json"
import type { SkillRecord } from "../../src/calculations/rotationTimeline"
import { asSkillRecords } from "./shippedData"

// Isolate reward/cooldown tests from encounter alignment: a synthetic incoming
// hit resolves just after the defensive cast opens its window at the same time.
// Real fixed-time and dummy attacks are covered in attack-response.test.ts.
export function withImmediateAttacks(skills: Record<string, SkillRecord>): Record<string, SkillRecord> {
  return Object.fromEntries(
    Object.entries({ ...asSkillRecords(general), ...skills }).map(([id, skill]) => {
      if (!skill.attackResponse && !skill.tags?.some(tag => tag === "PerfectDodge" || tag === "Dodge")) {
        return [id, skill]
      }
      if (skill.tags?.includes("Triggered")) return [id, skill]
      return [
        id,
        {
          ...skill,
          attackResponse: skill.attackResponse ?? {
            endMargin: 0.1,
            durationFrom: "PerfectDodge",
            onSuccess: "PerfectDodgeSuccess",
          },
          action: [...(skill.action ?? []), { type: "takeDamage", damage: 1, time: 0 }],
        },
      ]
    }),
  )
}
