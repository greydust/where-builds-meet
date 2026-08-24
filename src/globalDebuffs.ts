import phantomChimeDefinitions from "../data/debuff/bamboocut-dust.json";
import qiImbalanceDefinitions from "../data/debuff/bellstrike-splendor.json";
import soulShakenDefinitions from "../data/debuff/bellstrike-umbra.json";
import qingyisCharmDefinitions from "../data/debuff/innerway.json";
import vulnerableDefinitions from "../data/debuff/stonesplit-might.json";
import fearfulBladeDefinitions from "../data/debuff/stonesplit-strength.json";
import floatingGraceDefinitions from "../data/buff/silkbind-deluge.json";
import type { TrackedEffect } from "./calculations/rotationTimeline";
import { getPersistentItem } from "./persistentStorage";

export const globalDebuffStorageKey = "wwm-global-debuffs-session-v1";

export type GlobalDebuffState = {
  phantomChime: boolean;
  qiImbalance: boolean;
  soulShaken: boolean;
  vulnerable: boolean;
  fearfulBlade: boolean;
  qingyisCharm: "none" | "T1" | "T6";
  floatingGrace: "none" | "mixed" | "deluge";
};

export const defaultGlobalDebuffs: GlobalDebuffState = {
  phantomChime: false,
  qiImbalance: false,
  soulShaken: false,
  vulnerable: false,
  fearfulBlade: false,
  qingyisCharm: "none",
  floatingGrace: "none",
};

export const globalDebuffRows = [
  { key: "phantomChime", name: "Phantom Chime", path: "Dust" },
  { key: "qiImbalance", name: "Qi Imbalance", path: "Splendor" },
  { key: "soulShaken", name: "Soul-Shaken", path: "Umbra" },
  { key: "vulnerable", name: "Vulnerable", path: "Might" },
  { key: "fearfulBlade", name: "Fearful Blade", path: "Strength" },
] as const;

export function normalizeGlobalDebuffs(value: unknown): GlobalDebuffState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaultGlobalDebuffs };
  const source = value as Record<string, unknown>;
  const qingyisCharm = source.qingyisCharm === "T1" || source.qingyisCharm === "T6" ? source.qingyisCharm : "none";
  const floatingGrace =
    source.floatingGrace === "mixed" || source.floatingGrace === "deluge" ? source.floatingGrace : "none";
  return {
    phantomChime: source.phantomChime === true,
    qiImbalance: source.qiImbalance === true,
    soulShaken: source.soulShaken === true,
    vulnerable: source.vulnerable === true,
    fearfulBlade: source.fearfulBlade === true,
    qingyisCharm,
    floatingGrace,
  };
}

export function loadGlobalDebuffs(): GlobalDebuffState {
  try {
    return normalizeGlobalDebuffs(JSON.parse(getPersistentItem(globalDebuffStorageKey) ?? "null"));
  } catch {
    return { ...defaultGlobalDebuffs };
  }
}

const definitions = {
  PhantomChime: phantomChimeDefinitions.PhantomChime,
  QiImbalance: qiImbalanceDefinitions.QiImbalance,
  SoulShaken: soulShakenDefinitions.SoulShaken,
  Vulnerable: vulnerableDefinitions.Vulnerable,
  FearfulBlade: fearfulBladeDefinitions.FearfulBlade,
  QingyisCharmT1: qingyisCharmDefinitions.QingyisCharmT1,
  QingyisCharmT6: qingyisCharmDefinitions.QingyisCharmT6,
  FloatingGrace: floatingGraceDefinitions.FloatingGrace,
  FloatingGraceDeluge: floatingGraceDefinitions.FloatingGraceDeluge,
} as const;

function permanentEffect(name: string, definition: { maxStack?: number }): TrackedEffect {
  return { name, stack: definition.maxStack ?? 1, maxStack: definition.maxStack, persistent: true };
}

export function globalBuffTimelineEffects(state: GlobalDebuffState): TrackedEffect[] {
  switch (state.floatingGrace) {
    case "mixed":
      return [permanentEffect("FloatingGrace", definitions.FloatingGrace)];
    case "deluge":
      return [permanentEffect("FloatingGraceDeluge", definitions.FloatingGraceDeluge)];
    case "none":
      return [];
  }
}

export function globalDebuffTimelineEffects(state: GlobalDebuffState): TrackedEffect[] {
  const selectedDefinitions = [
    state.phantomChime ? (["PhantomChime", definitions.PhantomChime] as const) : undefined,
    state.qiImbalance ? (["QiImbalance", definitions.QiImbalance] as const) : undefined,
    state.soulShaken ? (["SoulShaken", definitions.SoulShaken] as const) : undefined,
    state.vulnerable ? (["Vulnerable", definitions.Vulnerable] as const) : undefined,
    state.fearfulBlade ? (["FearfulBlade", definitions.FearfulBlade] as const) : undefined,
    state.qingyisCharm === "T1"
      ? (["QingyisCharmT1", definitions.QingyisCharmT1] as const)
      : state.qingyisCharm === "T6"
        ? (["QingyisCharmT6", definitions.QingyisCharmT6] as const)
        : undefined,
  ];
  return selectedDefinitions.flatMap((entry) => (entry ? [permanentEffect(entry[0], entry[1])] : []));
}
