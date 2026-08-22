import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const skills = JSON.parse(await readFile("data/skill/skygrasp-rope-dart.json", "utf8"));
  const buffs = JSON.parse(await readFile("data/buff/bamboocut-kite.json", "utf8"));
  const debuffs = JSON.parse(await readFile("data/debuff/bamboocut-kite.json", "utf8"));
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const observer = {
    name: "Observe Kite State",
    castTime: 0.01,
    action: [{ type: "damage", phyCoef: 0, time: 0.01 }],
    modifier: [],
    tags: ["General"],
  };
  const build = (skill, innerWayConditions, weapons = ["heavenwill", "skygrasp"]) =>
    buildRotationTimeline({
      rotation: {
        name: "Sky Gripped probe",
        steps: [
          { type: "skill", skill },
          { type: "skill", skill: "ObserveKiteState" },
        ],
      },
      skills: { ...skills, ObserveKiteState: observer },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { ...buffs, ...debuffs },
      innerWayConditions,
      innerWayRules: [],
      setupEffects: [],
      weapons,
      resourceMaximums: { HeavensWill: 4 },
    });

  const lashWithoutT0 = build("SnaringLash", []);
  const lashWithT0 = build("SnaringLash", ["SkyGrippedT0"]);
  const lashWithoutT0SecondHit = lashWithoutT0[0].actionStates[2];
  const lashWithT0SecondHit = lashWithT0[0].actionStates[2];
  assert(
    !lashWithoutT0SecondHit.debuffs.some((effect) => effect.name === "HeavensMight"),
    "Snaring Lash must not apply Heaven's Might without Sky Gripped T0.",
  );
  assert(
    lashWithT0SecondHit.debuffs.some((effect) => effect.name === "HeavensMight"),
    "Snaring Lash must apply Heaven's Might before its second hit with Sky Gripped T0.",
  );

  const skyGraspedWithGauntlets = build("SkyGrasped", ["SkyGrippedT3"]);
  const skyGraspedWithoutGauntlets = build("SkyGrasped", ["SkyGrippedT3"], ["skygrasp", "stormbreaker"]);
  assert(
    skyGraspedWithGauntlets.at(-1).actionStates[0].resources.HeavensWill === 0.25,
    "Sky Gripped T3 must restore 0.25 Heaven's Will when Heavenwill Gauntlets are equipped.",
  );
  assert(
    (skyGraspedWithoutGauntlets.at(-1).actionStates[0].resources.HeavensWill ?? 0) === 0,
    "Sky Gripped T3 must not restore Heaven's Will without Heavenwill Gauntlets equipped.",
  );

  console.log("Sky Gripped timeline checks passed.");
} finally {
  await viteServer.close();
}
