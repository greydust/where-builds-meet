import { readFile } from "node:fs/promises";

const rotation = JSON.parse(await readFile("data/rotation/bamboocut-kite/dummy-1-min-infinite-vitality.json", "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(rotation.name === "Dummy 1 Min Infinite Vitality", "The Kite rotation must keep its preset name.");
assert(rotation.martialArts.join(",") === "heavenwill,skygrasp", "The Kite rotation must declare both martial arts.");
assert(
  rotation.start.step === 2 && rotation.start.action === 0 && rotation.steps[2].skill === "SkyGrasped",
  "The fight must start on Sky Grasped's first damage action.",
);

const skillSteps = rotation.steps.filter((step) => step.type === "skill");
for (const [index, step] of skillSteps.entries()) {
  if (!["FluteOfTheTidesCancel", "LeapingToad", "SnaringLashCancel"].includes(step.skill)) continue;
  assert(skillSteps[index + 1]?.skill === "Deflect", `${step.skill} must be followed by Deflect.`);
}
for (const [index, step] of skillSteps.entries()) {
  if (step.skill !== "RighteousReign6thHitCancel") continue;
  const nextSkill = skillSteps[index + 1]?.skill;
  assert(
    nextSkill !== "Deflect" || skillSteps[index + 2]?.skill === "VileCondemned",
    "A6 must not gain an implicit Deflect outside the explicitly declared break sequence.",
  );
}

const breakIndex = rotation.steps.findIndex(
  (step) => step.type === "skill" && step.skill === "VileCondemned" && step.causesBreak,
);
const breakEvent = rotation.steps[breakIndex - 1];
assert(
  breakEvent?.type === "event" &&
    breakEvent.event === "Qi" &&
    breakEvent.targetQiRatio === 0 &&
    breakEvent.after?.action === 0,
  "The break must set Qi to zero immediately after the declared Charged hit.",
);
assert(
  rotation.steps.at(-1)?.event === "BattleEnd" && rotation.steps.at(-1)?.startTime === 60,
  "The one-minute dummy rotation must end at 60 seconds after fight start.",
);

console.log("Kite dummy rotation checks passed.");
