import phantomChimeDefinitions from "../data/debuff/bamboocut-dust.json";
import qiImbalanceDefinitions from "../data/debuff/bellstrike-splendor.json";
import soulShakenDefinitions from "../data/debuff/bellstrike-umbra.json";
import qingyisCharmDefinitions from "../data/debuff/innerway.json";
import vulnerableDefinitions from "../data/debuff/stonesplit-might.json";
import fearfulBladeDefinitions from "../data/debuff/stonesplit-strength.json";
import type { TrackedEffect } from "./calculations/rotationTimeline";

export const globalDebuffStorageKey = "wwm-global-debuffs-session-v1";

export type GlobalDebuffState = {
  phantomChime: boolean;
  qiImbalance: boolean;
  soulShaken: boolean;
  vulnerable: boolean;
  fearfulBlade: boolean;
  qingyisCharm: "none" | "T1" | "T6";
};

export const defaultGlobalDebuffs: GlobalDebuffState = {
  phantomChime: false,
  qiImbalance: false,
  soulShaken: false,
  vulnerable: false,
  fearfulBlade: false,
  qingyisCharm: "none",
};

export const globalDebuffRows = [
  { key: "phantomChime", name: "Phantom Chime (Dust)" },
  { key: "qiImbalance", name: "Qi Imbalance (Splendor)" },
  { key: "soulShaken", name: "Soul-Shaken (Umbra)" },
  { key: "vulnerable", name: "Vulnerable (Might)" },
  { key: "fearfulBlade", name: "Fearful Blade (Strength)" },
] as const;

export function normalizeGlobalDebuffs(value: unknown): GlobalDebuffState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...defaultGlobalDebuffs };
  const source = value as Record<string, unknown>;
  const qingyisCharm = source.qingyisCharm === "T1" || source.qingyisCharm === "T6" ? source.qingyisCharm : "none";
  return {
    phantomChime: source.phantomChime === true,
    qiImbalance: source.qiImbalance === true,
    soulShaken: source.soulShaken === true,
    vulnerable: source.vulnerable === true,
    fearfulBlade: source.fearfulBlade === true,
    qingyisCharm,
  };
}

export function loadGlobalDebuffs(): GlobalDebuffState {
  if (typeof sessionStorage === "undefined") return { ...defaultGlobalDebuffs };
  try {
    return normalizeGlobalDebuffs(JSON.parse(sessionStorage.getItem(globalDebuffStorageKey) ?? "null"));
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
} as const;

export function globalDebuffTimelineEffects(state: GlobalDebuffState): TrackedEffect[] {
  const selectedDefinitions = [
    state.phantomChime ? ["PhantomChime", definitions.PhantomChime] as const : undefined,
    state.qiImbalance ? ["QiImbalance", definitions.QiImbalance] as const : undefined,
    state.soulShaken ? ["SoulShaken", definitions.SoulShaken] as const : undefined,
    state.vulnerable ? ["Vulnerable", definitions.Vulnerable] as const : undefined,
    state.fearfulBlade ? ["FearfulBlade", definitions.FearfulBlade] as const : undefined,
    state.qingyisCharm === "T1" ? ["QingyisCharmT1", definitions.QingyisCharmT1] as const : state.qingyisCharm === "T6" ? ["QingyisCharmT6", definitions.QingyisCharmT6] as const : undefined,
  ];
  return selectedDefinitions.flatMap((entry) => entry ? [{ name: entry[0], stack: entry[1].maxStack ?? 1, maxStack: entry[1].maxStack, persistent: true }] : []);
}
