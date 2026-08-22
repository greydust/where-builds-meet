import { createServer } from "vite";
import phalanxbaneSkills from "../../data/skill/phalanxbane-blade.json" with { type: "json" };

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const closeTo = (left, right) => Math.abs(left - right) < 1e-6;
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = {
    name: "Probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const bundle = (skills, rotation, setupEffects = [], effectDefinitions = {}, initialBuffs = []) => ({
    timeline: {
      rotation,
      skills,
      eventDefinitions: {},
      dots: {},
      effectDefinitions,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects,
      weapons: [],
      initialBuffs,
    },
    startAnchor: { rowId: "rotation-0" },
    stats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(stats, 0),
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });

  const referencedSubActions = new Set(
    Object.values(phalanxbaneSkills).flatMap((skill) =>
      Array.isArray(skill.subAction)
        ? skill.subAction.flatMap((entry) =>
            typeof entry === "string" ? [entry] : [entry.value, entry.fallback].filter(Boolean),
          )
        : [],
    ),
  );
  referencedSubActions.forEach((skillId) => {
    assert(phalanxbaneSkills[skillId], `Sub-action ${skillId} must have a skill definition.`);
    assert(phalanxbaneSkills[skillId].tags?.includes("SubAction"), `${skillId} must carry the SubAction tag.`);
  });
  Object.entries(phalanxbaneSkills)
    .filter(([, skill]) => skill.tags?.includes("SubAction"))
    .forEach(([skillId]) =>
      assert(referencedSubActions.has(skillId), `${skillId} is not referenced by a parent skill.`),
    );

  const genericSkills = {
    Composite: {
      name: "Composite",
      castTime: 0,
      action: [],
      subAction: [{ value: "Warmup" }, { value: "Strike" }],
      modifier: [],
      tags: ["DirectDamage"],
    },
    Warmup: {
      name: "Warmup",
      castTime: 1,
      action: [{ type: "apply", target: "self", value: "Ready", time: 1 }],
      modifier: [],
      tags: ["SubAction"],
    },
    Strike: {
      name: "Strike",
      castTime: 2,
      action: [{ type: "damage", phyCoef: 1, time: 2 }],
      modifier: [
        {
          requirement: [{ target: "self", value: "Ready" }],
          effect: { castTimeMultiplier: 0.5, dmgBonus: 0.5 },
        },
      ],
      tags: ["DirectDamage", "SpecialTag", "SubAction"],
    },
    Following: { name: "Following", castTime: 1, action: [], modifier: [], tags: [] },
  };
  const generic = calculateRotationBaseline(
    bundle(
      genericSkills,
      {
        name: "Multi-action probe",
        steps: [
          { type: "skill", skill: "Composite" },
          { type: "skill", skill: "Following" },
        ],
      },
      [{ requirement: [{ target: "skillTag", value: "SpecialTag" }], effect: { dmgBonus: 0.25 } }],
      { Ready: { name: "Ready", duration: 10, maxStack: 1, effect: [] } },
    ),
  );
  const compositeRow = generic.timeline.find((row) => row.id === "rotation-0");
  const followingRow = generic.timeline.find((row) => row.id === "rotation-1");
  assert(compositeRow && followingRow, "The composite and following rotation rows must exist.");
  assert(
    closeTo(compositeRow.effectiveCastTime, 2) && closeTo(followingRow.startTime, 2),
    "Sub-actions must consume sequential time and apply their timing modifiers at their own start.",
  );
  assert(
    compositeRow.actions.length === 2 &&
      closeTo(compositeRow.actions[0].time, 1) &&
      closeTo(compositeRow.actions[1].time, 2),
    "Sub-action actions must be flattened into the parent skill at their effective times.",
  );
  assert(
    compositeRow.actionSkillTags?.[1]?.includes("SpecialTag") &&
      compositeRow.actionModifierEffects?.[1]?.some((effect) => effect.dmgBonus === 0.5),
    "Each flattened action must retain its sub-action tags and modifiers.",
  );
  assert(
    closeTo(generic.actionBreakdowns["rotation-0:1"].total, 175),
    "Damage must use both the sub-action modifier and sub-action tag requirements.",
  );
  assert(
    generic.metrics.breakdown.casts.some(
      (cast) => cast.skillId === "Composite" && closeTo(cast.damage, 175) && closeTo(cast.averageCastTime, 2),
    ) && !generic.metrics.breakdown.casts.some((cast) => cast.skillId === "Strike"),
    "Sub-action damage and cast time must belong to the parent skill breakdown.",
  );

  const conditionalSkills = {
    ConditionalComposite: {
      name: "Conditional composite",
      castTime: 0,
      action: [],
      subAction: [
        {
          value: "LongBranch",
          requirement: [{ target: "self", value: "ChooseLong" }],
          fallback: "ShortBranch",
        },
      ],
      modifier: [],
      tags: [],
    },
    LongBranch: {
      name: "Long branch",
      castTime: 2,
      action: [
        { type: "damage", phyCoef: 1, time: 1 },
        { type: "damage", phyCoef: 2, time: 1.5 },
        { type: "damage", phyCoef: 3, time: 2 },
      ],
      modifier: [],
      tags: ["SubAction"],
    },
    ShortBranch: {
      name: "Short branch",
      castTime: 1,
      action: [{ type: "damage", phyCoef: 4, time: 1 }],
      modifier: [],
      tags: ["SubAction"],
    },
    ConditionalFollowing: { name: "Following", castTime: 1, action: [], modifier: [], tags: [] },
  };
  const conditionalRotation = {
    name: "Conditional sub-action probe",
    steps: [
      { type: "skill", skill: "ConditionalComposite" },
      { type: "skill", skill: "ConditionalFollowing" },
    ],
  };
  const chooseLongDefinition = { ChooseLong: { name: "Choose long", duration: 10, maxStack: 1, effect: [] } };
  const fallbackResult = calculateRotationBaseline(bundle(conditionalSkills, conditionalRotation));
  const fallbackRow = fallbackResult.timeline.find((row) => row.id === "rotation-0");
  const fallbackFollowing = fallbackResult.timeline.find((row) => row.id === "rotation-1");
  assert(
    fallbackRow?.effectiveCastTime === 1 && fallbackFollowing?.startTime === 1,
    "A failed conditional sub-action requirement must select and time its fallback.",
  );
  assert(
    fallbackRow.actions.filter((action) => action.type === "damage").length === 1 &&
      fallbackRow.actions.filter((action) => action.type === "inactive").length === 2,
    "A shorter fallback must leave its unused stable action slots inert.",
  );
  const primaryResult = calculateRotationBaseline(
    bundle(conditionalSkills, conditionalRotation, [], chooseLongDefinition, [{ name: "ChooseLong", stack: 1 }]),
  );
  const primaryRow = primaryResult.timeline.find((row) => row.id === "rotation-0");
  assert(
    primaryRow?.effectiveCastTime === 2 && primaryRow.actions.filter((action) => action.type === "damage").length === 3,
    "A passing conditional sub-action requirement must select every primary action.",
  );

  const startBoundSkills = {
    Primer: {
      name: "Primer",
      castTime: 0,
      action: [
        { type: "apply", target: "self", value: "InnerPassion", time: 0 },
        { type: "apply", target: "self", value: "ChargeEnhancement", time: 0 },
      ],
      modifier: [],
      tags: [],
    },
    BoundComposite: {
      name: "Bound composite",
      castTime: 0,
      action: [],
      subAction: [{ value: "BoundCharge" }, { value: "BoundSlam" }],
      modifier: [],
      tags: [],
    },
    BoundCharge: {
      name: "Bound charge",
      castTime: 1,
      action: [
        {
          type: "consume",
          target: "self",
          value: {
            operator: "first",
            operand: ["InnerPassion", "ChargeEnhancement"],
            resolveAt: "skillStart",
          },
          stack: 1,
          time: 1.01,
        },
      ],
      modifier: [],
      tags: ["SubAction"],
    },
    BoundSlam: {
      name: "Bound slam",
      castTime: 0.1,
      action: [{ type: "damage", phyCoef: 1, time: 0 }],
      modifier: [
        {
          requirement: [{ target: "self", value: "InnerPassion" }],
          effect: { dmgBonus: 0.5 },
        },
      ],
      tags: ["SubAction"],
    },
    Inspect: { name: "Inspect", castTime: 0, action: [], modifier: [], tags: [] },
  };
  const startBoundRotation = {
    name: "Start-bound consume probe",
    steps: [
      { type: "skill", skill: "Primer" },
      { type: "skill", skill: "BoundComposite" },
      { type: "skill", skill: "Inspect" },
    ],
  };
  const startBoundDefinitions = (innerPassionDuration) => ({
    InnerPassion: { name: "Inner Passion", duration: innerPassionDuration, maxStack: 1, effect: [] },
    ChargeEnhancement: { name: "Charge Enhancement", duration: 10, maxStack: 1, effect: [] },
  });
  const expiredSelection = calculateRotationBaseline(
    bundle(startBoundSkills, startBoundRotation, [], startBoundDefinitions(0.5)),
  );
  const afterExpiredSelection = expiredSelection.timeline.find((row) => row.id === "rotation-2");
  assert(
    afterExpiredSelection?.buffs.some((effect) => effect.name === "ChargeEnhancement"),
    "A start-bound consume must not fall through when its selected effect expires before execution.",
  );

  const liveSelection = calculateRotationBaseline(
    bundle(startBoundSkills, startBoundRotation, [], startBoundDefinitions(10)),
  );
  const liveComposite = liveSelection.timeline.find((row) => row.id === "rotation-1");
  const afterLiveSelection = liveSelection.timeline.find((row) => row.id === "rotation-2");
  assert(
    liveComposite?.actionModifierEffects?.[1]?.some((effect) => effect.dmgBonus === 0.5),
    "The following component must snapshot its modifier before the delayed consume executes.",
  );
  assert(
    !afterLiveSelection?.buffs.some((effect) => effect.name === "InnerPassion") &&
      afterLiveSelection?.buffs.some((effect) => effect.name === "ChargeEnhancement"),
    "A live start-bound selection must consume only the effect selected at component start.",
  );

  const assertBoundConsume = (chargeId, slamId, expectedTime) => {
    const consume = phalanxbaneSkills[chargeId].action.find((action) => action.type === "consume");
    assert(
      consume?.value?.resolveAt === "skillStart" && closeTo(consume.time, expectedTime),
      `${chargeId} must consume its start-bound acceleration effect after charging.`,
    );
    assert(
      !phalanxbaneSkills[slamId].action.some((action) => action.type === "consume"),
      `${slamId} must not consume the acceleration effect at slam start.`,
    );
  };
  assertBoundConsume("PhalanxbaneHeavyCharge2", "PhalanxbaneHeavySlam2", 0.96);
  assertBoundConsume("PhalanxbaneHeavyCharge3", "PhalanxbaneHeavySlam3", 1.61);

  const phalanxbane = calculateRotationBaseline(
    bundle(phalanxbaneSkills, {
      name: "Phalanxbane multi-action probe",
      steps: [
        { type: "skill", skill: "PhalanxbaneHeavyCharged1" },
        { type: "skill", skill: "PhalanxbaneQ" },
      ],
    }),
  );
  const charged = phalanxbane.timeline.find((row) => row.id === "rotation-0");
  const afterCharged = phalanxbane.timeline.find((row) => row.id === "rotation-1");
  assert(charged && afterCharged, "The Phalanxbane charged and following rows must exist.");
  assert(
    closeTo(charged.effectiveCastTime, 1.4375) && closeTo(afterCharged.startTime, 1.4375),
    "Burning Heart 1st Stage must preserve its previous total cast time.",
  );
  assert(
    charged.actions
      .filter((action) => action.type === "damage")
      .every((action) => charged.actionSkillTags?.[charged.actions.indexOf(action)]?.includes("SubAction")),
    "Burning Heart damage actions must use their component skill tags.",
  );
  assert(
    phalanxbane.metrics.breakdown.casts.some(
      (cast) => cast.skillId === "PhalanxbaneHeavyCharged1" && cast.damage > 0,
    ) && !phalanxbane.metrics.breakdown.casts.some((cast) => cast.skillId === "PhalanxbaneHeavySlam1"),
    "Burning Heart component damage must be collected under the main charged skill.",
  );

  console.log(
    "Sequential multi-action timing, state, tags, modifiers, ownership, and start-bound consume checks passed.",
  );
} finally {
  await viteServer.close();
}
