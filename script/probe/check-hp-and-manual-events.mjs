import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { buildRotationTimeline, mergeCalculatedTimelineState } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationTimeline.ts",
  );
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const generalDebuffs = (await viteServer.ssrLoadModule("/data/debuff/general.json")).default;
  const scripts = (await viteServer.ssrLoadModule("/data/script.json")).default;
  const generalSkills = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  assert(
    mysticBuffs.DragonHeadTide.global === true,
    "Dragon Head - Tide must remain an always-active rule from the Mystic buff definitions.",
  );
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  const eventDefinitions = {
    SelfHP: { name: "Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }], tags: ["Event"] },
    TakeDamage: {
      name: "Take Damage",
      castTime: 0,
      action: [{ type: "takeDamage", time: 0 }],
      tags: ["Event"],
    },
    HP: { name: "HP", castTime: 0, action: [{ type: "setTargetHP", time: 0 }], tags: ["Event"] },
    Qi: {
      name: "Qi",
      castTime: 0,
      action: [
        { type: "setQi", time: 0 },
        {
          type: "apply",
          target: "target",
          value: "Exhausted",
          requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
          time: 0,
        },
      ],
      tags: ["Event"],
    },
    Buff: { name: "Buff", castTime: 0, action: [{ type: "apply", target: "self", time: 0 }], tags: ["Event"] },
    Debuff: { name: "Debuff", castTime: 0, action: [{ type: "apply", target: "target", time: 0 }], tags: ["Event"] },
    Controlled: {
      name: "Controlled",
      castTime: 0,
      action: [{ type: "apply", target: "target", value: "Controlled", time: 0 }],
      tags: ["Event"],
    },
  };
  const baseInput = {
    eventDefinitions,
    dots: {},
    effectDefinitions: { ...generalBuffs, ...mysticBuffs, ...generalDebuffs },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  };

  const hit = {
    name: "Hit",
    castTime: 2,
    action: [
      { type: "damage", phyCoef: 1, time: 0 },
      { type: "damage", phyCoef: 1, time: 1 },
    ],
    modifier: [],
    tags: ["DragonHeadTide", "HP"],
  };
  const noDamage = {
    name: "No Damage",
    castTime: 1,
    action: [{ type: "move", distance: 1, time: 0.5 }],
    modifier: [],
    tags: [],
  };
  const hpRotation = {
    name: "HP probe",
    steps: [
      { type: "event", event: "SelfHP", before: { action: 1 }, currentHPRatio: 0.8 },
      { type: "skill", skill: "Hit" },
    ],
    start: { step: 1 },
  };
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
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
  const hpResult = calculateRotationBaseline({
    timeline: {
      ...baseInput,
      rotation: hpRotation,
      skills: { Hit: hit },
      setupEffects: mysticBuffs.DragonHeadTide.effect,
    },
    startAnchor: { rowId: "rotation-1" },
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
  const fullHPHit = hpResult.actionBreakdowns["rotation-1:0"].total;
  const missingHPHit = hpResult.actionBreakdowns["rotation-1:1"].total;
  assert(
    closeTo(missingHPHit / fullHPHit, 1.09),
    "Twenty missing HP percentage points must grant Dragon Head 9% damage at hit time.",
  );

  const targetHPResult = calculateRotationBaseline({
    timeline: {
      ...baseInput,
      rotation: {
        name: "Target HP probe",
        targetHP: 10000,
        steps: [
          { type: "skill", skill: "Hit" },
          { type: "skill", skill: "NoDamage" },
        ],
      },
      skills: { Hit: hit, NoDamage: noDamage },
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
  const firstTargetHit = targetHPResult.actionBreakdowns["rotation-0:0"].total;
  const targetHPRow = targetHPResult.timeline.find((row) => row.id === "rotation-0");
  const noDamageRow = targetHPResult.timeline.find((row) => row.id === "rotation-1");
  const finalTargetHPRatio = Math.max(0, 1 - (firstTargetHit * 2) / 10000);
  assert(
    closeTo(targetHPRow.actionStates[1].targetHPRatio, Math.max(0, 1 - firstTargetHit / 10000)),
    "Specified target HP must decrease by each preceding calculated damage result.",
  );
  assert(
    closeTo(noDamageRow.targetHPRatio, finalTargetHPRatio) &&
      closeTo(noDamageRow.actionStates[0].targetHPRatio, finalTargetHPRatio),
    "A non-damaging skill and its actions must inherit target HP from the preceding damage action.",
  );
  const structuralTargetHPTimeline = buildRotationTimeline({
    ...baseInput,
    rotation: {
      name: "Target HP probe",
      targetHP: 10000,
      steps: [
        { type: "skill", skill: "Hit" },
        { type: "skill", skill: "NoDamage" },
      ],
    },
    skills: { Hit: hit, NoDamage: noDamage },
  });
  const displayedTargetHPTimeline = mergeCalculatedTimelineState(structuralTargetHPTimeline, targetHPResult.timeline);
  const displayedHitRow = displayedTargetHPTimeline.find((row) => row.id === "rotation-0");
  const displayedNoDamageRow = displayedTargetHPTimeline.find((row) => row.id === "rotation-1");
  assert(
    closeTo(displayedHitRow.actionStates[1].targetHPRatio, Math.max(0, 1 - firstTargetHit / 10000)) &&
      closeTo(displayedNoDamageRow.targetHPRatio, finalTargetHPRatio),
    "The editor's structural timeline must display target-HP snapshots from its completed calculation.",
  );
  const implicitTargetHPTimeline = buildRotationTimeline({
    ...baseInput,
    rotation: { name: "Implicit target HP probe", steps: [{ type: "skill", skill: "Hit" }] },
    skills: { Hit: hit },
  });
  assert(
    implicitTargetHPTimeline[0].targetHPRatio === 0.99 &&
      Object.values(implicitTargetHPTimeline[0].actionStates).every((state) => state.targetHPRatio === 0.99),
    "A rotation without preset target HP must expose the implicit 99% target state to every hit.",
  );
  const hpHitRow = hpResult.timeline.find((row) => row.id === "rotation-1");
  assert(
    hpHitRow.actionStates[0].currentHPRatio === 1 && hpHitRow.actionStates[1].currentHPRatio === 0.8,
    "The attached HP event must change only its target and subsequent action snapshots.",
  );

  const timedDamageTimeline = buildRotationTimeline({
    ...baseInput,
    rotation: {
      name: "Timed damage probe",
      eventTimeReference: "battleStart",
      steps: [
        { type: "skill", skill: "Hit" },
        { type: "event", event: "TakeDamage", startTime: 1, damage: 70 },
      ],
      start: { step: 0 },
    },
    skills: { Hit: hit },
    setupEffects: [scripts.Revelry.effect],
    maxHP: 100,
  });
  const timedDamageRow = timedDamageTimeline.find((row) => row.id === "rotation-1");
  const timedDamageHitRow = timedDamageTimeline.find((row) => row.id === "rotation-0");
  assert(closeTo(timedDamageRow.startTime, 1), "Take Damage must resolve at its fight-relative start time.");
  assert(
    closeTo(timedDamageHitRow.actionStates[0].currentHPRatio, 1) &&
      closeTo(timedDamageHitRow.actionStates[1].currentHPRatio, 0.3),
    "Timed damage must affect only actions after its declared timestamp.",
  );
  assert(
    timedDamageHitRow.actionStates[1].buffs.some((effect) => effect.name === "Revelry"),
    "Timed damage must continue to activate Take Damage setup triggers.",
  );

  const avoidedDamageTimeline = buildRotationTimeline({
    ...baseInput,
    rotation: {
      name: "Avoided damage probe",
      eventTimeReference: "battleStart",
      steps: [
        { type: "skill", skill: "DeflectSuccessful" },
        { type: "event", event: "TakeDamage", startTime: 0.1, damage: 20 },
        { type: "skill", skill: "PerfectDodge" },
        { type: "event", event: "TakeDamage", startTime: 0.5, damage: 20 },
        { type: "skill", skill: "Deflect" },
        { type: "event", event: "TakeDamage", startTime: 1, damage: 20 },
        { type: "skill", skill: "NoDamage" },
      ],
      start: { step: 0 },
    },
    skills: {
      DeflectSuccessful: generalSkills.DeflectSuccessful,
      PerfectDodge: generalSkills.PerfectDodge,
      Deflect: generalSkills.Deflect,
      NoDamage: noDamage,
    },
    effectDefinitions: {
      ...baseInput.effectDefinitions,
      DamageSeen: { name: "Damage Seen", duration: 10, maxStack: 1, effect: [] },
    },
    setupEffects: [
      {
        trigger: {
          event: "takeDamage",
          action: { type: "apply", target: "self", value: "DamageSeen" },
        },
      },
    ],
    maxHP: 100,
  });
  const successfulDeflectDamage = avoidedDamageTimeline.find((row) => row.id === "rotation-1");
  const perfectDodgeDamage = avoidedDamageTimeline.find((row) => row.id === "rotation-3");
  const ordinaryDeflectDamage = avoidedDamageTimeline.find((row) => row.id === "rotation-5");
  const afterAvoidance = avoidedDamageTimeline.find((row) => row.id === "rotation-6");
  assert(
    successfulDeflectDamage.actions[0].damage === 0 && perfectDodgeDamage.actions[0].damage === 0,
    "Take Damage inside Successful Deflect or Perfect Dodge cast time must resolve to zero.",
  );
  assert(
    ordinaryDeflectDamage.actions[0].damage === 20 && closeTo(afterAvoidance.currentHPRatio, 0.8),
    "Ordinary Deflect must not avoid Take Damage.",
  );
  assert(
    !ordinaryDeflectDamage.buffs.some((effect) => effect.name === "DamageSeen") &&
      afterAvoidance.buffs.some((effect) => effect.name === "DamageSeen"),
    "Avoided damage must not fire take-damage triggers, while a real hit still must.",
  );

  const takeDamageAttachmentTimeline = buildRotationTimeline({
    ...baseInput,
    rotation: {
      name: "Take Damage attachment probe",
      eventTimeReference: "battleStart",
      steps: [
        { type: "event", event: "Qi", before: { action: 0 }, targetQiRatio: 0 },
        { type: "event", event: "TakeDamage", startTime: 1, damage: 70 },
        { type: "skill", skill: "Hit" },
      ],
      start: { step: 2 },
    },
    skills: { Hit: hit },
    maxHP: 100,
  });
  const attachedQiRow = takeDamageAttachmentTimeline.find((row) => row.id === "rotation-0");
  const takeDamageAnchorRow = takeDamageAttachmentTimeline.find((row) => row.id === "rotation-1");
  assert(
    attachedQiRow.sourceRowId === takeDamageAnchorRow.id &&
      closeTo(attachedQiRow.startTime, takeDamageAnchorRow.startTime),
    "An attached Qi event must resolve against the following fixed-time Take Damage event.",
  );
  assert(
    takeDamageAnchorRow.actionStates[0].targetQiRatio === 0,
    "An event attached before Take Damage must update state before Take Damage resolves.",
  );

  const skillAttachmentPastTakeDamageTimeline = buildRotationTimeline({
    ...baseInput,
    rotation: {
      name: "Skill attachment after Take Damage probe",
      eventTimeReference: "battleStart",
      steps: [
        { type: "event", event: "Qi", before: { action: 1 }, targetQiRatio: 0 },
        { type: "event", event: "TakeDamage", startTime: 1, damage: 70 },
        { type: "skill", skill: "Hit" },
      ],
      start: { step: 2 },
    },
    skills: { Hit: hit },
    maxHP: 100,
  });
  const skillAttachedQiRow = skillAttachmentPastTakeDamageTimeline.find((row) => row.id === "rotation-0");
  const skillAnchorPastTakeDamageRow = skillAttachmentPastTakeDamageTimeline.find((row) => row.id === "rotation-2");
  assert(
    skillAttachedQiRow.sourceRowId === skillAnchorPastTakeDamageRow.id &&
      closeTo(skillAttachedQiRow.startTime, skillAnchorPastTakeDamageRow.startTime + 1),
    "An action target unsupported by Take Damage must continue to the following skill anchor.",
  );

  const durationProbe = {
    name: "Duration probe",
    castTime: 13,
    action: [
      { type: "damage", phyCoef: 1, time: 0 },
      { type: "damage", phyCoef: 1, time: 2.9 },
      { type: "damage", phyCoef: 1, time: 3.1 },
      { type: "damage", phyCoef: 1, time: 9.9 },
      { type: "damage", phyCoef: 1, time: 10.1 },
      { type: "damage", phyCoef: 1, time: 12.4 },
      { type: "damage", phyCoef: 1, time: 12.6 },
    ],
    modifier: [],
    tags: [],
  };
  const manualTimeline = buildRotationTimeline({
    ...baseInput,
    rotation: {
      name: "Manual effects",
      eventTimeReference: "battleStart",
      steps: [
        { type: "event", event: "Buff", before: { action: "start" }, buff: "Flute" },
        { type: "event", event: "Debuff", before: { action: "start" }, debuff: "Controlled" },
        { type: "event", event: "Qi", after: { action: 0 }, targetQiRatio: 0 },
        { type: "skill", skill: "Probe" },
      ],
      start: { step: 3 },
    },
    skills: { Probe: durationProbe },
  });
  const probeRow = manualTimeline.find((row) => row.id === "rotation-3");
  assert(
    probeRow.actionStates[1].debuffs.some((effect) => effect.name === "Controlled"),
    "A manual Debuff event must use Controlled's default duration.",
  );
  assert(
    !probeRow.actionStates[2].debuffs.some((effect) => effect.name === "Controlled"),
    "Controlled must expire at its data-defined duration.",
  );
  assert(
    probeRow.actionStates[3].debuffs.some((effect) => effect.name === "Exhausted"),
    "Exhausted must use its data-defined default duration.",
  );
  assert(
    !probeRow.actionStates[4].debuffs.some((effect) => effect.name === "Exhausted"),
    "Exhausted must expire after its data-defined default duration.",
  );
  assert(
    probeRow.actionStates[3].targetQiRatio === 0,
    `Qi zero must remain active while Exhausted is active (saw ${probeRow.actionStates[3].targetQiRatio}).`,
  );
  assert(probeRow.actionStates[4].targetQiRatio === 1, "Exhausted expiration must restore Qi to 100%.");
  assert(
    probeRow.actionStates[5].buffs.some((effect) => effect.name === "Flute"),
    "A manual Buff event must use the selected buff's default duration.",
  );
  assert(
    !probeRow.actionStates[6].buffs.some((effect) => effect.name === "Flute"),
    "The manually applied buff must expire at its data-defined duration.",
  );

  console.log("Self HP, target HP, Qi exhaustion, and manual effect duration checks passed.");
} finally {
  await viteServer.close();
}
