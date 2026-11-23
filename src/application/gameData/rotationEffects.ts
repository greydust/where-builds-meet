import resourceEventDefinitions from "@gamedata/event.json"

import type { SkillRecord } from "@/calculations/rotationTimeline"
import { dataText } from "@/i18n"

export const rotationEventDefinitions: Record<string, SkillRecord> = {
  ...resourceEventDefinitions,
  Controlled: {
    name: "Event: Controlled",
    castTime: 0,
    action: [{ type: "apply", target: "target", value: "Controlled", stack: 1, time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  MartialArt: {
    name: "Action: Switch Martial Art",
    castTime: 0,
    action: [{ type: "switchMartialArt", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  BossGeneralDamageBoost: {
    name: "Event: Boss General Damage Boost",
    castTime: 0,
    action: [{ type: "apply", target: "self", value: "BossGeneralDamageBoost", stack: 1, time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  ShieldBroken: {
    name: "Event: Shield Broken",
    castTime: 0,
    action: [
      { type: "consume", target: "self", value: "Shield", stack: "all", time: 0 },
      {
        type: "apply",
        target: "self",
        value: "HardenedFoe",
        stack: 1,
        requirement: [{ target: "self", value: "ArtOfResistanceT6" }],
        time: 0,
      },
    ],
    modifier: [],
    tags: ["Event"],
  },
  BattleEnd: { name: "Event: Battle End", castTime: 0, action: [], modifier: [], tags: ["Event"] },
  Delay: { name: "Action: Delay", castTime: 0, action: [], modifier: [], tags: ["Event"] },
  Move: { name: "Event: Move", castTime: 0, action: [{ type: "move", time: 0 }], modifier: [], tags: ["Event"] },
  SelfHP: { name: "Event: Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }], modifier: [], tags: ["Event"] },
  TakeDamage: {
    name: "Event: Take Damage",
    castTime: 0,
    action: [{ type: "takeDamage", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  HP: { name: "Event: HP", castTime: 0, action: [{ type: "setTargetHP", time: 0 }], modifier: [], tags: ["Event"] },
  Qi: {
    name: "Event: Qi",
    castTime: 0,
    action: [
      { type: "setQi", time: 0 },
      {
        type: "apply",
        target: "target",
        value: "Exhausted",
        stack: 1,
        requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
        time: 0,
      },
    ],
    modifier: [],
    tags: ["Event"],
  },
  Buff: {
    name: "Event: Buff",
    castTime: 0,
    action: [{ type: "apply", target: "self", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  Debuff: {
    name: "Event: Debuff",
    castTime: 0,
    action: [{ type: "apply", target: "target", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
}

export function rotationEventDisplayName(eventId: string) {
  const key = `${eventId.charAt(0).toLowerCase()}${eventId.slice(1)}`
  return dataText(`game.event.${key}`, rotationEventDefinitions[eventId]?.name ?? eventId)
}
