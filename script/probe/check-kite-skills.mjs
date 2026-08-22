import { readFile } from "node:fs/promises";

const skills = JSON.parse(await readFile("data/skill/heavenwill-gauntlets.json", "utf8"));
const ropeDartSkills = JSON.parse(await readFile("data/skill/skygrasp-rope-dart.json", "utf8"));
const buffs = JSON.parse(await readFile("data/buff/bamboocut-kite.json", "utf8"));
const debuffs = JSON.parse(await readFile("data/debuff/bamboocut-kite.json", "utf8"));
const soaringHigh = JSON.parse(await readFile("data/innerway/soaring-high.json", "utf8"));
const skyGripped = JSON.parse(await readFile("data/innerway/sky-gripped.json", "utf8"));
const kiteAlternativeInnerWays = await Promise.all(
  ["breaking-point", "morale-chant", "envigorated-warrior"].map(async (file) =>
    JSON.parse(await readFile(`data/innerway/${file}.json`, "utf8")),
  ),
);
const declared = skills.HeavenwillDeclared;
const mandate = skills.CelestialMandate;
const righteousReign = skills.RighteousReign5thHit;
const righteousReignCancel = skills.RighteousReign6thHitCancel;
const lightAttackFalcon = skills.LightAttackFalcon;
const allUnderJustice = skills.AllUnderJustice;
const vileCondemned = skills.VileCondemned;
const heavensUnity = buffs.HeavensUnity;
const heavensMight = debuffs.HeavensMight;
const skyGrasped = ropeDartSkills.SkyGrasped;
const snaringLashCancel = ropeDartSkills.SnaringLashCancel;
const snaringLash = ropeDartSkills.SnaringLash;

if (!declared) throw new Error("Heavenwill Declared must be defined.");
if (declared.castTime !== 0.9) throw new Error("Heavenwill Declared must have a 0.9-second cast time.");
if (declared.action.length !== 2 || declared.action.some((action) => action.type !== "damage" || action.time !== 0.9))
  throw new Error("Both Heavenwill Declared damage actions must land at cast end.");

const [firstHit, secondHit] = declared.action;
if (firstHit.phyCoef !== 0.2201 || firstHit.phyBonus !== 61 || firstHit.attrBonus !== 33)
  throw new Error("Heavenwill Declared's first hit data is incorrect.");
if (secondHit.phyCoef !== 0.8804 || secondHit.phyBonus !== 244 || secondHit.attrBonus !== 132)
  throw new Error("Heavenwill Declared's second hit data is incorrect.");
if (!declared.tags.includes("HeavenwillGauntlets") || !declared.tags.includes("MartialArt"))
  throw new Error("Heavenwill Declared must carry its martial-art tags.");

if (!mandate) throw new Error("Celestial Mandate must be defined.");
if (mandate.castTime !== 1.23) throw new Error("Celestial Mandate must have a 1.23-second cast time.");
const mandateDamage = mandate.action.filter((action) => action.type === "damage");
if (mandateDamage.length !== 5 || mandateDamage.some((action) => action.time !== 1.23))
  throw new Error("All five Celestial Mandate damage actions must land at cast end.");
for (const hit of mandateDamage.slice(0, 4)) {
  if (hit.phyCoef !== 0.2293 || hit.phyBonus !== 63 || hit.attrBonus !== 34)
    throw new Error("Celestial Mandate's first four hit values are incorrect.");
}
const mandateFinalHit = mandateDamage[4];
if (mandateFinalHit.phyCoef !== 0.6115 || mandateFinalHit.phyBonus !== 169 || mandateFinalHit.attrBonus !== 92)
  throw new Error("Celestial Mandate's final hit values are incorrect.");
const mandateResource = mandate.action.filter((action) => action.type === "addResource");
if (
  mandateResource.length !== 1 ||
  mandateResource[0].value !== "HeavensWill" ||
  mandateResource[0].amount !== 0.1 ||
  mandateResource[0].additionalAmount?.amount !== 0.2 ||
  mandateResource[0].additionalAmount?.requirement?.[0]?.value !== "HeavensUnity"
)
  throw new Error("Celestial Mandate's conditional Heaven's Will generation is incorrect.");
if (!mandate.tags.includes("Falcon")) throw new Error("Celestial Mandate must carry the Falcon tag.");
if (!heavensUnity || heavensUnity.duration !== 24 || heavensUnity.maxStack !== 1 || heavensUnity.refresh !== true)
  throw new Error("Heaven's Unity must be a refreshing, single-stack buff with a 24-second duration.");
if (
  !heavensMight ||
  heavensMight.duration !== 15 ||
  heavensMight.maxStack !== 1 ||
  heavensMight.refresh !== true ||
  heavensMight.effect?.[0]?.effect?.hpDMGBonus !== 0.1 ||
  heavensMight.effect?.[0]?.requirement?.[0]?.operator !== "or" ||
  !heavensMight.effect[0].requirement[0].operand?.some((requirement) => requirement.value === "Falcon") ||
  !heavensMight.effect[0].requirement[0].operand?.some((requirement) => requirement.value === "VileCondemned")
)
  throw new Error("Heaven's Might must grant 10% HP damage to Falcon or Vile Condemned skills for 15 seconds.");
if (!righteousReign) throw new Error("Righteous Reign 5th Hit must be defined.");
if (righteousReign.castTime !== 0.8) throw new Error("Righteous Reign 5th Hit must have a 0.8-second cast time.");
if (
  righteousReign.action.length !== 1 ||
  righteousReign.action[0].type !== "damage" ||
  righteousReign.action[0].time !== 0.8 ||
  righteousReign.action[0].phyCoef !== 0.4674 ||
  righteousReign.action[0].phyBonus !== 130 ||
  righteousReign.action[0].attrBonus !== 71
)
  throw new Error("Righteous Reign 5th Hit's cast-end damage data is incorrect.");
if (!righteousReign.tags.includes("LightAttack"))
  throw new Error("Righteous Reign 5th Hit must carry the LightAttack tag.");
if (!righteousReignCancel) throw new Error("Righteous Reign 6th Hit [Cancel] must be defined.");
if (righteousReignCancel.castTime !== 0.36)
  throw new Error("Righteous Reign 6th Hit [Cancel] must have a 0.36-second cast time.");
const righteousReignCancelDamage = righteousReignCancel.action[0];
const righteousReignCancelTrigger = righteousReignCancel.action[1];
if (
  righteousReignCancelDamage?.type !== "damage" ||
  righteousReignCancelDamage.time !== 0.36 ||
  righteousReignCancelDamage.phyCoef !== 0.8202 ||
  righteousReignCancelDamage.phyBonus !== 228 ||
  righteousReignCancelDamage.attrBonus !== 124
)
  throw new Error("Righteous Reign 6th Hit [Cancel]'s cast-end damage data is incorrect.");
if (
  righteousReignCancelTrigger?.type !== "trigger" ||
  righteousReignCancelTrigger.time !== 0.36 ||
  righteousReignCancelTrigger.value !== "LightAttackFalcon"
)
  throw new Error("Righteous Reign 6th Hit [Cancel] must trigger Light Attack Falcon at cast end.");
if (!lightAttackFalcon?.tags.includes("Falcon") || !lightAttackFalcon.tags.includes("Triggered"))
  throw new Error("Light Attack Falcon must be a Falcon-tagged triggered skill.");
if (
  lightAttackFalcon.castTime !== 0 ||
  lightAttackFalcon.action.length !== 1 ||
  lightAttackFalcon.action[0].type !== "damage" ||
  lightAttackFalcon.action[0].time !== 0.6 ||
  lightAttackFalcon.action[0].phyCoef !== 0.748
)
  throw new Error("Light Attack Falcon's delayed damage data is incorrect.");
if (!allUnderJustice) throw new Error("All Under Justice must be defined.");
if (allUnderJustice.castTime !== 1) throw new Error("All Under Justice must have a 1-second cast time.");
if (allUnderJustice.action.length !== 4 || allUnderJustice.action.some((action) => action.time !== 1))
  throw new Error("All four All Under Justice hits must land at cast end.");
for (const hit of allUnderJustice.action.slice(0, 3)) {
  if (hit.type !== "damage" || hit.phyCoef !== 0.4884 || hit.phyBonus !== 135 || hit.attrBonus !== 73)
    throw new Error("All Under Justice's first three hit values are incorrect.");
}
const allUnderJusticeFinalHit = allUnderJustice.action[3];
if (
  allUnderJusticeFinalHit.type !== "damage" ||
  allUnderJusticeFinalHit.phyCoef !== 0.9769 ||
  allUnderJusticeFinalHit.phyBonus !== 270 ||
  allUnderJusticeFinalHit.attrBonus !== 147
)
  throw new Error("All Under Justice's final hit values are incorrect.");
if (!allUnderJustice.tags.includes("Special")) throw new Error("All Under Justice must carry the Special tag.");
if (
  !vileCondemned ||
  vileCondemned.subAction?.[0]?.value !== "VileCondemnedCharge" ||
  vileCondemned.subAction?.[1]?.value !== "VileCondemnedEndHit" ||
  vileCondemned.subAction?.[1]?.fallback !== "VileCondemnedHit" ||
  !vileCondemned.tags.includes("Charged")
)
  throw new Error("Vile Condemned must declare its charged two-component sequence.");
if (
  !skills.VileCondemnedHit.tags.includes("VileCondemned") ||
  !skills.VileCondemnedEndHit.tags.includes("VileCondemned")
)
  throw new Error("Both Vile Condemned release definitions must carry the VileCondemned tag.");
const vileEndReference = vileCondemned.subAction[1];
if (!vileEndReference.requirement?.some((requirement) => requirement.value === "SoaringHighT0"))
  throw new Error("Vile Condemned End Hit must require Soaring High T0.");
const soaringHighT0Effect = soaringHigh.effect?.SoaringHighT0?.effect?.[0];
if (soaringHigh.altersTimeline !== true || !soaringHigh.tags.includes("BamboocutKite"))
  throw new Error("Soaring High must be a timeline-altering Bamboocut Kite inner way.");
if (kiteAlternativeInnerWays.some((innerWay) => !innerWay.tags.includes("BamboocutKite")))
  throw new Error("Breaking Point, Morale Chant, and Envigorated Warrior must be available to Bamboocut Kite.");
if (
  soaringHighT0Effect?.effect?.hpDMGBonus !== 0.2 ||
  soaringHighT0Effect.requirement?.[0]?.operator !== "or" ||
  !soaringHighT0Effect.requirement[0].operand?.some((requirement) => requirement.value === "Falcon") ||
  !soaringHighT0Effect.requirement[0].operand?.some((requirement) => requirement.value === "VileCondemned")
)
  throw new Error("Soaring High T0 must grant 20% HP damage to Falcon or Vile Condemned skills.");
if (soaringHigh.effect?.SoaringHighT2?.effect?.[0]?.stat?.minPhys !== 74.4)
  throw new Error("Soaring High T2 must grant 74.4 minimum physical attack.");
const soaringHighT3Trigger = soaringHigh.effect?.SoaringHighT3?.trigger?.[0];
if (
  !soaringHighT3Trigger?.requirement?.some(
    (requirement) => requirement.target === "skillTag" && requirement.value === "Falcon",
  ) ||
  !soaringHighT3Trigger.requirement.some(
    (requirement) => requirement.target === "target" && requirement.value === "Exhausted",
  ) ||
  soaringHighT3Trigger.action?.[0]?.type !== "clearCD" ||
  soaringHighT3Trigger.action[0].value !== "VileCondemnedEndHit"
)
  throw new Error("Soaring High T3 must clear End Hit cooldown when Falcon damage hits an exhausted target.");

if (!skyGrasped) throw new Error("Sky Grasped must be defined.");
if (skyGrasped.castTime !== 0.9) throw new Error("Sky Grasped must have a 0.9-second cast time.");
const [skyGraspedDamage, skyGrippedDamage, skyGrippedResource, skyGraspedUnity] = skyGrasped.action;
if (
  skyGrasped.action.length !== 4 ||
  skyGraspedDamage?.type !== "damage" ||
  skyGraspedDamage.time !== 0.9 ||
  skyGraspedDamage.phyCoef !== 1.2503 ||
  skyGraspedDamage.phyBonus !== 347 ||
  skyGraspedDamage.attrBonus !== 189
)
  throw new Error("Sky Grasped's cast-end damage data is incorrect.");
if (
  skyGrippedDamage?.type !== "damage" ||
  skyGrippedDamage.phyCoef !== 1.87 ||
  skyGrippedDamage.time !== 0.9 ||
  !skyGrippedDamage.requirement?.some(
    (requirement) => requirement.target === "self" && requirement.value === "SkyGrippedT3",
  ) ||
  !skyGrippedDamage.requirement?.some(
    (requirement) => requirement.target === "equippedMartialArt" && requirement.value === "heavenwill",
  )
)
  throw new Error("Sky Gripped T3 must add Sky Grasped's conditional 187% damage action after its first hit.");
if (
  skyGrippedResource?.type !== "addResource" ||
  skyGrippedResource.value !== "HeavensWill" ||
  skyGrippedResource.amount !== 0.25 ||
  skyGrippedResource.time !== 0.9 ||
  JSON.stringify(skyGrippedResource.requirement) !== JSON.stringify(skyGrippedDamage.requirement)
)
  throw new Error("Sky Gripped T3 must restore 0.25 Heaven's Will under the same conditions as its extra hit.");
if (
  skyGraspedUnity?.type !== "apply" ||
  skyGraspedUnity.target !== "self" ||
  skyGraspedUnity.value !== "HeavensUnity" ||
  skyGraspedUnity.stack !== 1 ||
  skyGraspedUnity.reapply !== true ||
  skyGraspedUnity.time !== 0.9
)
  throw new Error("Sky Grasped must apply and refresh Heaven's Unity after its cast-end hit.");
if (!skyGrasped.tags.includes("SkygraspRopeDart") || !skyGrasped.tags.includes("Special"))
  throw new Error("Sky Grasped must carry its martial-art and Special tags.");

if (!snaringLashCancel) throw new Error("Snaring Lash [Cancel] must be defined.");
if (snaringLashCancel.castTime !== 0.6) throw new Error("Snaring Lash [Cancel] must have a 0.6-second cast time.");
const snaringLashDamage = snaringLashCancel.action[0];
const snaringLashMight = snaringLashCancel.action[1];
if (
  snaringLashCancel.action.length !== 2 ||
  snaringLashDamage?.type !== "damage" ||
  snaringLashDamage.time !== 0.6 ||
  snaringLashDamage.phyCoef !== 0.4975 ||
  snaringLashDamage.phyBonus !== 137 ||
  snaringLashDamage.attrBonus !== 75
)
  throw new Error("Snaring Lash [Cancel]'s cast-end damage data is incorrect.");
if (
  snaringLashMight?.type !== "apply" ||
  snaringLashMight.target !== "target" ||
  snaringLashMight.value !== "HeavensMight" ||
  snaringLashMight.time !== 0.6 ||
  snaringLashMight.requirement?.[0]?.value !== "SkyGrippedT0"
)
  throw new Error("Snaring Lash [Cancel] must apply Heaven's Might immediately after its first hit at Sky Gripped T0.");
if (!snaringLashCancel.tags.includes("SkygraspRopeDart") || !snaringLashCancel.tags.includes("MartialArt"))
  throw new Error("Snaring Lash [Cancel] must carry its martial-art tags.");

if (!snaringLash) throw new Error("Snaring Lash must be defined.");
if (snaringLash.castTime !== 1.7) throw new Error("Snaring Lash must have a 1.7-second cast time.");
const [snaringLashFirstHit, snaringLashMightFull, snaringLashSecondHit] = snaringLash.action;
if (
  snaringLash.action.length !== 3 ||
  snaringLashFirstHit?.type !== "damage" ||
  snaringLashFirstHit.time !== 0.6 ||
  snaringLashFirstHit.phyCoef !== 0.4975 ||
  snaringLashFirstHit.phyBonus !== 137 ||
  snaringLashFirstHit.attrBonus !== 75
)
  throw new Error("Snaring Lash must retain the cancel variant's first hit at 0.6 seconds.");
if (JSON.stringify(snaringLashMightFull) !== JSON.stringify(snaringLashMight))
  throw new Error("Both Snaring Lash variants must apply Heaven's Might identically after the shared first hit.");
if (
  snaringLashSecondHit?.type !== "damage" ||
  snaringLashSecondHit.time !== 1.7 ||
  snaringLashSecondHit.phyCoef !== 1.1609 ||
  snaringLashSecondHit.phyBonus !== 321 ||
  snaringLashSecondHit.attrBonus !== 175
)
  throw new Error("Snaring Lash's follow-up hit data is incorrect.");
if (!snaringLash.tags.includes("SkygraspRopeDart") || !snaringLash.tags.includes("MartialArt"))
  throw new Error("Snaring Lash must carry its martial-art tags.");

if (skyGripped.altersTimeline !== true || !skyGripped.tags.includes("BamboocutKite"))
  throw new Error("Sky Gripped must be a timeline-altering Bamboocut Kite inner way.");
if (skyGripped.effect?.SkyGrippedT1?.effect?.[0]?.modify?.duration !== 24)
  throw new Error("Sky Gripped T1 must extend Heaven's Might to 24 seconds.");
if (skyGripped.effect?.SkyGrippedT2?.effect?.[0]?.stat?.crit !== 0.077)
  throw new Error("Sky Gripped T2 must grant 7.7% Critical Rate.");
const skyGrippedT3Effect = skyGripped.effect?.SkyGrippedT3?.effect?.[0];
if (
  skyGrippedT3Effect?.effect?.qiDMGBonus !== 0.3 ||
  skyGrippedT3Effect.requirement?.[0]?.operator !== "or" ||
  !skyGrippedT3Effect.requirement[0].operand?.some((requirement) => requirement.value === "Falcon") ||
  !skyGrippedT3Effect.requirement[0].operand?.some((requirement) => requirement.value === "VileCondemned")
)
  throw new Error("Sky Gripped T3 must record its deferred Falcon and Vile Condemned Qi damage bonus.");
if (skyGripped.effect?.SkyGrippedT5?.effect?.[0]?.stat?.critDmgBonus !== 0.04)
  throw new Error("Sky Gripped T5 must grant 4% Critical Damage Bonus.");
const skyGrippedT6Effect = skyGripped.effect?.SkyGrippedT6?.effect?.[0];
if (
  skyGrippedT6Effect?.effect?.critDmgBonus !== 0.1 ||
  !skyGrippedT6Effect.requirement?.some(
    (requirement) => requirement.target === "skillTag" && requirement.value === "Charged",
  ) ||
  !skyGrippedT6Effect.requirement?.some(
    (requirement) => requirement.target === "target" && requirement.value === "HeavensMight",
  )
)
  throw new Error("Sky Gripped T6 must grant Charged skills 10% Critical Damage against Heaven's Might.");
const skyGrippedT6Listener = skyGripped.effect?.SkyGrippedT6?.listen?.[0];
if (
  skyGrippedT6Listener?.event !== "damage" ||
  skyGrippedT6Listener.cooldown !== 18 ||
  !skyGrippedT6Listener.requirement?.some(
    (requirement) => requirement.target === "skillTag" && requirement.value === "Charged",
  ) ||
  !skyGrippedT6Listener.requirement?.some(
    (requirement) => requirement.target === "target" && requirement.value === "HeavensMight",
  ) ||
  skyGrippedT6Listener.action?.type !== "trigger" ||
  skyGrippedT6Listener.action.value !== "SkyGrippedReplay" ||
  skyGrippedT6Listener.action.parameter?.damage !== "event.damage"
)
  throw new Error("Sky Gripped T6 must replay the first eligible Charged damage event every 18 seconds.");
const skyGrippedReplay = skills.SkyGrippedReplay;
if (
  !skyGrippedReplay?.tags.includes("Replayed") ||
  !skyGrippedReplay.tags.includes("Triggered") ||
  skyGrippedReplay.action?.length !== 3 ||
  skyGrippedReplay.action.some((action) => action.type !== "replay") ||
  Math.abs(skyGrippedReplay.action.reduce((total, action) => total + action.coef, 0) - 0.4) > 1e-12
)
  throw new Error("Sky Gripped Replay must distribute exactly 40% replay damage across three fixed ticks.");

console.log("Kite skill definition checks passed.");
