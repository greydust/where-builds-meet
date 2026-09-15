import { assert, describe, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareDpsSnapshots, dpsSnapshotTolerance } from "./helpers/dps-snapshot-guard.mjs";

// Ported from script/probe/check-dps-snapshots.mjs.
describe("dps-snapshots", () => {
  it("compares each implemented path against its accepted DPS snapshot", async () => {
    const snapshotFile = new URL("./snapshots/path-dps.json", import.meta.url);
    const paths = JSON.parse(await readFile(new URL("../data/path.json", import.meta.url), "utf8"));
    const pathIds = Object.keys(paths)
      .filter((id) => paths[id].status === "available")
      .sort();
    assert(pathIds.length, "No implemented paths found for DPS snapshots.");
    // Snapshot refresh is review-gated: DPS_UPDATE_IDS is unset in check mode,
    // "all" refreshes every path, otherwise a space-separated path-id list.
    // Example: DPS_UPDATE_IDS="bamboocutKite silkbindDeluge" npm run snapshots:dps:update
    const rawUpdateIds = (process.env.DPS_UPDATE_IDS ?? "").trim();
    let updateIds = [];
    if (rawUpdateIds) {
      updateIds = rawUpdateIds === "all" ? pathIds : rawUpdateIds.split(/\s+/);
      assert(
        updateIds.length ||
          new Set(updateIds).size !== updateIds.length ||
          updateIds.some((id) => !pathIds.includes(id)),
        `Choose reviewed paths explicitly: DPS_UPDATE_IDS="<pathId...>" (or "all") npm run snapshots:dps:update. Available: ${pathIds.join(", ")}`,
      );
    }
    let snapshot;
    try {
      snapshot = JSON.parse(await readFile(snapshotFile, "utf8"));
      assert(
        !(
          snapshot.schemaVersion !== 1 ||
          !snapshot.cases ||
          typeof snapshot.cases !== "object" ||
          Array.isArray(snapshot.cases)
        ),
        "Invalid DPS snapshot format.",
      );
    } catch (error) {
      if (error.code !== "ENOENT" || !updateIds.length) throw error;
      snapshot = { schemaVersion: 1, cases: {} };
    }

    // Explicit settings prevent browser preferences or changing defaults from moving the baseline.
    const environment = {
      breakthrough: "17",
      food: "SimmeringFishSlices",
      divinecraft: "Fire",
      script: "None",
      globalDebuffs: {
        phantomChime: false,
        qiImbalance: false,
        soulShaken: false,
        vulnerable: false,
        fearfulBlade: false,
        qingyisCharm: "none",
        floatingGrace: "none",
      },
    };

    const { buildPresetRotationBundle } = await import("../src/App.tsx");
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
    const actual = {};
    for (const pathId of pathIds) {
      const path = paths[pathId];
      const rotation = (await probeLoad(`/data/rotation/${path.buildGroup}/${path.defaultRotation}.json`)).default;
      const fixture = {
        build: path.defaultBuild,
        rotation: path.defaultRotation,
        martialArts: path.lockedWeapons,
        ...environment,
      };
      const bundle = buildPresetRotationBundle(
        { pathId, martialArts: path.lockedWeapons, rotation, ...environment, skillOverrides: {} },
        path.defaultBuild,
      );
      assert(bundle, `${pathId}: failed to build the production preset calculation bundle.`);
      const { metrics, duration } = calculateRotationBaseline(bundle);
      actual[pathId] = { fixture, dps: metrics.dps, totalDamage: metrics.totalDamage, duration };
      const previous = snapshot.cases[pathId]?.dps;
      const change =
        previous > 0
          ? `; baseline ${previous.toFixed(2)}, change ${(((metrics.dps - previous) / previous) * 100).toFixed(2)}%`
          : "; no accepted baseline";
      console.log(`${pathId}: ${metrics.dps.toFixed(2)} DPS${change}`);
    }
    // Reject invalid outputs even when the user explicitly requests an update.
    const invalid = compareDpsSnapshots(actual, actual);
    assert(!invalid.length, invalid.join("\n"));
    if (updateIds.length) {
      const next = { ...snapshot.cases };
      for (const pathId of updateIds) next[pathId] = actual[pathId];
      if (rawUpdateIds === "all") for (const id of Object.keys(next)) if (!pathIds.includes(id)) delete next[id];
      const value = {
        schemaVersion: 1,
        cases: Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b))),
      };
      const formatterCli = join(dirname(createRequire(import.meta.url).resolve("oxfmt/package.json")), "bin", "oxfmt");
      const formatted = execFileSync(
        process.execPath,
        [formatterCli, "--stdin-filepath", fileURLToPath(snapshotFile)],
        { input: `${JSON.stringify(value, null, 2)}\n`, encoding: "utf8" },
      );
      await writeFile(snapshotFile, formatted, "utf8");
      console.log(`Updated reviewed DPS snapshots: ${updateIds.join(", ")}. Inspect and commit the snapshot diff.`);
    } else {
      const failures = compareDpsSnapshots(snapshot.cases, actual);
      assert(
        !failures.length,
        `${failures.join("\n")}\nReview each change. Fix regressions; update only paths whose changes have been confirmed correct. Never refresh snapshots automatically to make this check pass.`,
      );
      console.log(
        `All implemented paths remain within ${dpsSnapshotTolerance * 100}% of their accepted DPS snapshots.`,
      );
    }
  });
});
