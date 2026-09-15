import { assert, describe, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";
import { readdir, readFile } from "node:fs/promises";

// Ported from script/probe/check-innerway-stat-visibility.mjs.
describe("innerway-stat-visibility", () => {
  it("Inner Way T2/T5 stat visibility checks passed", async () => {
    const { allStatDefinitions, emptyStats } = await import("../src/data/statDefinitions.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts");
    const { calculateHealingBreakdown } = await import("../src/calculations/healing.ts");
    const { resolveAttunementStats } = await import("../src/calculations/attunementStats.ts");
    const { innerWayDefinitions, innerWayDefinitionForSoloLevel } = await probeLoad("/src/data/innerWayDefinitions.ts");
    const visibleStats = new Set(allStatDefinitions.map(({ key }) => key));
    const innerWayFiles = (await readdir("data/innerway")).filter((fileName) => fileName.endsWith(".json"));

    assert(
      !visibleStats.has("physicalPenetration") && "physicalPenetration" in emptyStats,
      "Physical Penetration must remain a shared calculation stat rather than a Character Stats field.",
    );
    assert(
      "physicalResistance" in emptyStats && !visibleStats.has("physicalResistance"),
      "Physical Resistance must remain available to calculations but hidden from Character Stats.",
    );

    const physicalPenetrationOutput = (physicalPenetration, calculate) => {
      const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, physicalPenetration };
      return calculate(
        { type: calculate === calculateHealingBreakdown ? "heal" : "damage", phyCoef: 1, attrCoef: 1 },
        {
          stats,
          attunement: {},
          skillTags: [],
          weapons: [],
          buffs: [],
          enemy: {
            name: "Inner Way stat visibility probe",
            level: 96,
            defense: 0,
            physicalResistance: 10,
            bellstrikeResistance: 0,
            stonesplitResistance: 0,
            silkbindResistance: 0,
            bamboocutResistance: 0,
            judgementResistance: 0,
          },
          derivedStats: calculateDerivedStats(stats, 0),
          effects: [],
        },
      ).total;
    };
    assert(
      physicalPenetrationOutput(5.1, calculateDamageBreakdown) > physicalPenetrationOutput(0, calculateDamageBreakdown),
      "The Physical Penetration character stat must increase physical damage.",
    );
    assert(
      physicalPenetrationOutput(5.1, calculateHealingBreakdown) >
        physicalPenetrationOutput(0, calculateHealingBreakdown),
      "The Physical Penetration character stat must increase physical healing.",
    );

    for (const fileName of innerWayFiles) {
      const definition = innerWayDefinitionForSoloLevel(
        JSON.parse(await readFile(`data/innerway/${fileName}`, "utf8")),
        17,
      );
      const id = Object.keys(definition.effect)[0].replace(/T0$/, "");
      assert(
        innerWayDefinitions[id]?.name === definition.name,
        `${fileName} must be registered under its tier ID prefix.`,
      );
      for (const tier of [2, 5]) {
        const tierDefinition = Object.entries(definition.effect ?? {}).find(([key]) => key.endsWith(`T${tier}`))?.[1];
        if (!tierDefinition?.effect) continue;
        for (const effect of tierDefinition.effect) {
          assert(
            effect.rawStat && !effect.requirement && !effect.target && !effect.modify,
            `${definition.name} T${tier} must express its unconditional bonus through the shared stat pipeline.`,
          );
          for (const stat of Object.keys(effect.rawStat)) {
            assert(stat in emptyStats, `${definition.name} T${tier} uses unknown stat ${stat}.`);
            assert(
              stat === "physicalPenetration" ||
                stat === "formlessPenetration" ||
                stat === "physicalResistance" ||
                visibleStats.has(stat),
              `${definition.name} T${tier} stat ${stat} must be visible in its Stats-page section.`,
            );
          }
        }
      }
    }

    const attunementDefaults = { physicalPenetration: 0, formlessPenetration: 0 };
    const resolvedAttunement = resolveAttunementStats(
      attunementDefaults,
      { physicalPenetration: 10 },
      {},
      { physicalPenetration: 5.1 },
    );
    assert(
      resolvedAttunement.displayed.physicalPenetration === 15.1 &&
        resolvedAttunement.calculation.physicalPenetration === 10,
      "Inner Way Physical Penetration must update the displayed Attunement Stats total without duplicating its calculation.",
    );
  });
});
