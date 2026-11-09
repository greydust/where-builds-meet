import generalBuffDefinitions from "@gamedata/buff/general.json"
import floatingGraceDefinitions from "@gamedata/buff/silkbind-deluge.json"
import strayhuntDefinitions from "@gamedata/debuff/bamboocut-draught.json"
import phantomChimeDefinitions from "@gamedata/debuff/bamboocut-dust.json"
import qiImbalanceDefinitions from "@gamedata/debuff/bellstrike-splendor.json"
import soulShakenDefinitions from "@gamedata/debuff/bellstrike-umbra.json"
import qingyisCharmDefinitions from "@gamedata/debuff/innerway.json"
import vulnerableDefinitions from "@gamedata/debuff/stonesplit-might.json"
import fearfulBladeDefinitions from "@gamedata/debuff/stonesplit-strength.json"

import { globalDebuffStorageKey } from "@/application/persistence/keys"
import type { TrackedEffect } from "@/calculations/rotationTimeline"
import { getPersistentItem } from "@/persistentStorage"

export { globalDebuffStorageKey }

export type GlobalDebuffState = {
  bossTalent: 0 | 0.15
  draught: "none" | "strayhunt" | "both"
  phantomChime: boolean
  qiImbalance: boolean
  soulShaken: boolean
  vulnerable: boolean
  fearfulBlade: boolean
  qingyisCharm: "none" | "T1" | "T6"
  floatingGrace: "none" | "mixed" | "deluge"
  silkbindWings: "none" | "yellow" | "blue" | "full"
}

export const defaultGlobalDebuffs: GlobalDebuffState = {
  bossTalent: 0,
  draught: "none",
  phantomChime: false,
  qiImbalance: false,
  soulShaken: false,
  vulnerable: false,
  fearfulBlade: false,
  qingyisCharm: "none",
  floatingGrace: "none",
  silkbindWings: "none",
}

export const globalDebuffRows = [
  { key: "phantomChime", name: "Phantom Chime", path: "Dust" },
  { key: "qiImbalance", name: "Qi Imbalance", path: "Splendor" },
  { key: "soulShaken", name: "Soul-Shaken + Shattered Stone", path: "Umbra" },
  { key: "vulnerable", name: "Vulnerable", path: "Might" },
  { key: "fearfulBlade", name: "Fearful Blade", path: "Strength" },
] as const

function normalizeDraught(source: Record<string, unknown>): GlobalDebuffState["draught"] {
  switch (source.draught) {
    case "none":
    case "strayhunt":
    case "both":
      return source.draught
    default:
      if (source.wildstrideDraught === true) return "both"
      if (source.strayhuntDraught === true) return "strayhunt"
      return "none"
  }
}

function draughtTimelineEffects(stage: GlobalDebuffState["draught"]): TrackedEffect[] {
  switch (stage) {
    case "none":
      return []
    case "strayhunt":
      return [permanentEffect("Strayhunt", definitions.Strayhunt)]
    case "both":
      return [
        permanentEffect("Strayhunt", definitions.Strayhunt),
        permanentEffect("Wildstride", definitions.Wildstride),
      ]
  }
}
export function normalizeGlobalDebuffs(value: unknown): GlobalDebuffState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaultGlobalDebuffs }
  const source = value as Record<string, unknown>
  const qingyisCharm = source.qingyisCharm === "T1" || source.qingyisCharm === "T6" ? source.qingyisCharm : "none"
  const floatingGrace =
    source.floatingGrace === "mixed" || source.floatingGrace === "deluge" ? source.floatingGrace : "none"
  return {
    bossTalent: source.bossTalent === 0.15 ? 0.15 : 0,
    draught: normalizeDraught(source),
    phantomChime: source.phantomChime === true,
    qiImbalance: source.qiImbalance === true,
    soulShaken: source.soulShaken === true,
    vulnerable: source.vulnerable === true,
    fearfulBlade: source.fearfulBlade === true,
    qingyisCharm,
    floatingGrace,
    silkbindWings: normalizeWingsSupport(source.silkbindWings),
  }
}

/**
 * Read the stored selection.
 *
 * The result is a fresh object per call, so it must not be read during a render. `loadoutStore`
 * holds one for the session and is the only caller, which is what keeps the selection's identity
 * stable: the measurement context holds it by reference and hands it to dependency arrays, so a
 * new object per read would make every consumer's inputs look changed on each render.
 */
export function loadGlobalDebuffs(): GlobalDebuffState {
  const source = getPersistentItem(globalDebuffStorageKey) ?? "null"
  try {
    return normalizeGlobalDebuffs(JSON.parse(source) as unknown)
  } catch {
    return { ...defaultGlobalDebuffs }
  }
}

const definitions = {
  Wildstride: strayhuntDefinitions.Wildstride,
  Strayhunt: strayhuntDefinitions.Strayhunt,
  PhantomChime: phantomChimeDefinitions.PhantomChime,
  QiImbalance: qiImbalanceDefinitions.QiImbalance,
  SoulShaken: soulShakenDefinitions.SoulShaken,
  ShatteredStone: soulShakenDefinitions.ShatteredStone,
  Vulnerable: vulnerableDefinitions.Vulnerable,
  FearfulBlade: fearfulBladeDefinitions.FearfulBlade,
  QingyisCharmT1: qingyisCharmDefinitions.QingyisCharmT1,
  QingyisCharmT6: qingyisCharmDefinitions.QingyisCharmT6,
  FloatingGrace: floatingGraceDefinitions.FloatingGrace,
  FloatingGraceDeluge: floatingGraceDefinitions.FloatingGraceDeluge,
} as const

function permanentEffect(name: string, definition: { maxStack?: number }): TrackedEffect {
  return { name, stack: definition.maxStack ?? 1, maxStack: definition.maxStack, persistent: true }
}

function normalizeWingsSupport(value: unknown): GlobalDebuffState["silkbindWings"] {
  switch (value) {
    case "yellow":
    case "blue":
    case "full":
      return value
    default:
      return "none"
  }
}

function wingsSupportEffects(state: GlobalDebuffState): TrackedEffect[] {
  switch (state.silkbindWings) {
    case "yellow":
      return [permanentEffect("WingsSupportYellow", { maxStack: 1 })]
    case "blue":
      return [permanentEffect("WingsSupportBlue", { maxStack: 1 })]
    case "full":
      return [permanentEffect("WingsSupportFull", { maxStack: 1 })]
    default:
      return []
  }
}

export function globalBuffTimelineEffects(state: GlobalDebuffState): TrackedEffect[] {
  return [
    ...floatingGraceTimelineEffects(state),
    ...wingsSupportEffects(state),
    ...(state.bossTalent === 0.15 ? [permanentEffect("BossTalent", generalBuffDefinitions.BossTalent)] : []),
  ]
}

function floatingGraceTimelineEffects(state: GlobalDebuffState): TrackedEffect[] {
  switch (state.floatingGrace) {
    case "mixed":
      return [permanentEffect("FloatingGrace", definitions.FloatingGrace)]
    case "deluge":
      return [permanentEffect("FloatingGraceDeluge", definitions.FloatingGraceDeluge)]
    case "none":
    default:
      return []
  }
}

export function globalDebuffTimelineEffects(state: GlobalDebuffState): TrackedEffect[] {
  const selectedDefinitions = [
    state.phantomChime ? (["PhantomChime", definitions.PhantomChime] as const) : undefined,
    state.qiImbalance ? (["QiImbalance", definitions.QiImbalance] as const) : undefined,
    state.soulShaken ? (["SoulShaken", definitions.SoulShaken] as const) : undefined,
    state.soulShaken ? (["ShatteredStone", definitions.ShatteredStone] as const) : undefined,
    state.vulnerable ? (["Vulnerable", definitions.Vulnerable] as const) : undefined,
    state.fearfulBlade ? (["FearfulBlade", definitions.FearfulBlade] as const) : undefined,
    state.qingyisCharm === "T1"
      ? (["QingyisCharmT1", definitions.QingyisCharmT1] as const)
      : state.qingyisCharm === "T6"
        ? (["QingyisCharmT6", definitions.QingyisCharmT6] as const)
        : undefined,
  ]
  return [
    ...draughtTimelineEffects(normalizeDraught(state)),
    ...selectedDefinitions.flatMap(entry => (entry ? [permanentEffect(entry[0], entry[1])] : [])),
  ]
}
