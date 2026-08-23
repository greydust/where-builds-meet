import adaptiveSteel from "../../data/innerway/adaptive-steel.json";
import artOfResistance from "../../data/innerway/art-of-resistance.json";
import battleAnthem from "../../data/innerway/battle-anthem.json";
import breakingPoint from "../../data/innerway/breaking-point.json";
import envigoratedWarrior from "../../data/innerway/envigorated-warrior.json";
import empiricalEdge from "../../data/innerway/empirical-edge.json";
import exquisiteScenery from "../../data/innerway/exquisite-scenery.json";
import frostCladNight from "../../data/innerway/frost-clad-night.json";
import moraleChant from "../../data/innerway/morale-chant.json";
import soaringHigh from "../../data/innerway/soaring-high.json";
import skyGripped from "../../data/innerway/sky-gripped.json";
import steadfastDevotion from "../../data/innerway/steadfast-devotion.json";
import throatPiercingArt from "../../data/innerway/throat-piercing-art.json";

export type InnerWayDefinition = {
  name: string;
  tags?: string[];
  altersTimeline: boolean;
  effect: Record<string, unknown>;
};

export const innerWayDefinitions = {
  FrostCladNight: frostCladNight,
  MoraleChant: moraleChant,
  SteadfastDevotion: steadfastDevotion,
  ThroatPiercingArt: throatPiercingArt,
  BreakingPoint: breakingPoint,
  EnvigoratedWarrior: envigoratedWarrior,
  EmpiricalEdge: empiricalEdge,
  ExquisiteScenery: exquisiteScenery,
  ArtOfResistance: artOfResistance,
  BattleAnthem: battleAnthem,
  AdaptiveSteel: adaptiveSteel,
  SoaringHigh: soaringHigh,
  SkyGripped: skyGripped,
} satisfies Record<string, InnerWayDefinition>;

export function innerWayAvailableForTag(innerWay: string, requiredTag?: string) {
  if (!innerWay || !requiredTag) return true;
  const definition = innerWayDefinitions[innerWay as keyof typeof innerWayDefinitions] as
    InnerWayDefinition | undefined;
  return definition?.tags?.includes(requiredTag) === true;
}

export function innerWayEntriesForTag(requiredTag?: string) {
  return Object.entries(innerWayDefinitions).filter(([innerWay]) => innerWayAvailableForTag(innerWay, requiredTag));
}
