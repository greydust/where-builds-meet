import { readFile } from "node:fs/promises";

const mysticSkills = JSON.parse(await readFile("data/skill/mystic.json", "utf8"));
const skill = mysticSkills.BurstingNine;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const approximately = (actual, expected) => Math.abs(actual - expected) < 1e-9;

assert(skill?.castTime === 1.3, "Bursting Nine must have a 1.3-second cast time.");
assert(skill.action?.length === 9, "Bursting Nine must contain nine actions.");
assert(
  skill.action.every((action) => action.type === "damage" && action.time === 1.3),
  "All hits must land at cast end.",
);
assert(
  skill.action[0].phyCoef === 2.546 && skill.action[0].phyBonus === 365,
  "Bursting Nine's first hit values are incorrect.",
);
assert(
  approximately(skill.action[1].phyCoef, skill.action[0].phyCoef * 0.3) &&
    approximately(skill.action[1].phyBonus, skill.action[0].phyBonus * 0.3),
  "Bursting Nine's second hit must use 30% of the first hit.",
);
assert(
  skill.action
    .slice(2)
    .every(
      (action) =>
        approximately(action.phyCoef, skill.action[0].phyCoef * 0.1) &&
        approximately(action.phyBonus, skill.action[0].phyBonus * 0.1),
    ),
  "Bursting Nine's third through ninth hits must each use 10% of the first hit.",
);

const twoShots = mysticSkills.BurstingNine2Shots;
assert(twoShots?.castTime === 1.7, "Bursting Nine 2 Shots must have a 1.7-second cast time.");
assert(twoShots.action?.length === 18, "Bursting Nine 2 Shots must contain eighteen actions.");
assert(
  twoShots.action.slice(0, 9).every((action) => action.type === "damage" && action.time === 1.3) &&
    twoShots.action.slice(9).every((action) => action.type === "damage" && action.time === 1.7),
  "Bursting Nine 2 Shots must place its first volley at 1.3 seconds and its second at cast end.",
);
assert(
  twoShots.action
    .slice(0, 9)
    .every(
      (action, index) =>
        action.phyCoef === skill.action[index].phyCoef && action.phyBonus === skill.action[index].phyBonus,
    ),
  "Bursting Nine 2 Shots must retain the original first nine hits.",
);
assert(
  twoShots.action
    .slice(9)
    .every(
      (action, index) =>
        approximately(action.phyCoef, twoShots.action[index].phyCoef * 0.5) &&
        approximately(action.phyBonus, twoShots.action[index].phyBonus * 0.5),
    ),
  "Bursting Nine 2 Shots' second nine hits must be half of the corresponding first nine hits.",
);

console.log("Bursting Nine skill data checks passed.");
