import type { WeaponId } from "../types";

export type MartialArtTalent<Effect> = { name: string; effect?: Effect[] };

/** Select only the configured rank; each rank is a complete, independent talent list. */
export function martialArtEffectsForRank<Effect extends object>(
  definitions: Partial<Record<WeaponId, { talent: MartialArtTalent<Effect>[][] }>>,
  weapons: readonly WeaponId[],
  rank: number,
) {
  return Array.from(new Set(weapons)).flatMap((weapon) =>
    (definitions[weapon]?.talent[rank] ?? []).flatMap((talent) =>
      (talent.effect ?? []).map((effect) => Object.assign({}, effect, { statStage: "talent" as const })),
    ),
  );
}
