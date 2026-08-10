import { existsSync } from "node:fs";
import { createServer } from "vite";

const definitions = (await import("../../data/divinecraft.json", { with: { type: "json" } })).default;
const defaultSetup = (await import("../../data/default-setup.json", { with: { type: "json" } })).default;
const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const damage = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
const statDefinitions = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
const effectiveStats = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

assert(Object.keys(definitions).length === 7, "Divinecraft data must contain exactly seven choices.");
assert(defaultSetup.divinecraft === "Fire", "Fire must be the default Divinecraft.");
assert(definitions.PoisonFire.available === false && definitions.PoisonWater.available === false, "The two Poison-first choices must remain unavailable.");
for (const definition of Object.values(definitions)) {
  assert(existsSync(`public/divinecraft/${definition.image}`), `Missing Divinecraft image: ${definition.image}`);
}

const stats = { ...statDefinitions.emptyStats, minPhys: 100, maxPhys: 100 };
const context = {
  stats,
  attunement: {
    physicalPenetration: 0,
    formlessPenetration: 0,
    phalanxbaneChargedBoost: 0,
    phalanxbaneMartialBoost: 0,
    snowpartingChargedBoost: 0,
    snowpartingVariedComboBoost: 0,
    snowpartingMartialBoost: 0,
  },
  weapons: ["snowparting"],
  skillTags: [],
  buffs: [],
  enemy: {
    name: "Probe",
    level: 1,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  },
  derivedStats: effectiveStats.calculateDerivedStats(stats, 0),
  effects: [],
};
const damageFor = (id) => damage.calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects: [definitions[id].effect] }).total;
const baseline = damage.calculateDamageBreakdown({ phyCoef: 1 }, context).total;
assert(Math.abs(damageFor("Fire") / baseline - 1.015) < 1e-9, "Fire HP damage must apply as a 1.5% Category 1 bonus.");
assert(Math.abs(damageFor("WaterFire") / baseline - 1.014) < 1e-9, "Water-Fire HP damage must apply as a 1.4% Category 1 bonus.");
assert(Math.abs(damageFor("WaterPoison") / baseline - 1.01) < 1e-9, "Water-Poison HP damage must apply as a 1% Category 1 bonus.");
assert(Math.abs(damageFor("FireWater") - damageFor("Fire")) < 1e-9, "Stored Qi damage must remain inert until implemented.");
assert(Math.abs(damageFor("FirePoison") - damageFor("Fire")) < 1e-9, "Stored healing-triggered Vitality gain must remain inert until implemented.");

console.log("Divinecraft data and supported-effect checks passed.");
await viteServer.close();
