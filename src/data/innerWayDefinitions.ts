import windBeneathWings from "../../data/innerway/wind-beneath-wings.json";
import eveningSnow from "../../data/innerway/evening-snow.json";
import steadfastStance from "../../data/innerway/steadfast-stance.json";
import shadowAssault from "../../data/innerway/shadow-assault.json";
import sandswirlTail from "../../data/innerway/sandswirl-tail.json";
import bitterSeasons from "../../data/innerway/bitter-seasons.json";
import vitalLeech from "../../data/innerway/vital-leech.json";
import divineRoulette from "../../data/innerway/divine-roulette.json";
import evasiveCharge from "../../data/innerway/evasive-charge.json";
import lightAndShadowAlike from "../../data/innerway/light-and-shadow-alike.json";
import heartOfFire from "../../data/innerway/heart-of-fire.json";
import mountainsMight from "../../data/innerway/mountains-might.json";
import wildfireSpark from "../../data/innerway/wildfire-spark.json";
import swordMorph from "../../data/innerway/sword-morph.json";
import wolfchasersArt from "../../data/innerway/wolfchasers-art.json";
import swordHorizon from "../../data/innerway/sword-horizon.json";
import gourdToss from "../../data/innerway/gourd-toss.json";
import thunderousBloom from "../../data/innerway/thunderous-bloom.json";
import starReacher from "../../data/innerway/star-reacher.json";
import blossomBarrage from "../../data/innerway/blossom-barrage.json";
import restoringBlossom from "../../data/innerway/restoring-blossom.json";
import esotericRevival from "../../data/innerway/esoteric-revival.json";
import mendingLoom from "../../data/innerway/mending-loom.json";
import trappedBeast from "../../data/innerway/trapped-beast.json";
import rockSolid from "../../data/innerway/rock-solid.json";
import echoesOfOblivion from "../../data/innerway/echoes-of-oblivion.json";
import vendetta from "../../data/innerway/vendetta.json";
import riptideReflex from "../../data/innerway/riptide-reflex.json";
import phantomRally from "../../data/innerway/phantom-rally.json";
import towlineSweep from "../../data/innerway/towline-sweep.json";
import lightAnew from "../../data/innerway/light-anew.json";
import songOfTang from "../../data/innerway/song-of-tang.json";
import wildfireSurge from "../../data/innerway/wildfire-surge.json";
import celestialVigor from "../../data/innerway/celestial-vigor.json";
import eonpour from "../../data/innerway/eonpour.json";
import skyspeak from "../../data/innerway/skyspeak.json";
import mistwing from "../../data/innerway/mistwing.json";
import volutefit from "../../data/innerway/volutefit.json";
import adaptiveSteel from "../../data/innerway/adaptive-steel.json";
import artOfResistance from "../../data/innerway/art-of-resistance.json";
import battleAnthem from "../../data/innerway/battle-anthem.json";
import breakingPoint from "../../data/innerway/breaking-point.json";
import envigoratedWarrior from "../../data/innerway/envigorated-warrior.json";
import empiricalEdge from "../../data/innerway/empirical-edge.json";
import exquisiteScenery from "../../data/innerway/exquisite-scenery.json";
import frostCladNight from "../../data/innerway/frost-clad-night.json";
import fivefoldBleed from "../../data/innerway/fivefold-bleed.json";
import furyHarvest from "../../data/innerway/fury-harvest.json";
import insightfulStrike from "../../data/innerway/insightful-strike.json";
import moraleChant from "../../data/innerway/morale-chant.json";
import royalRemedy from "../../data/innerway/royal-remedy.json";
import seasonalEdge from "../../data/innerway/seasonal-edge.json";
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
  RoyalRemedy: royalRemedy,
  FuryHarvest: furyHarvest,
  InsightfulStrike: insightfulStrike,
  SeasonalEdge: seasonalEdge,
  FivefoldBleed: fivefoldBleed,
  WindBeneathWings: windBeneathWings,
  EveningSnow: eveningSnow,
  SteadfastStance: steadfastStance,
  ShadowAssault: shadowAssault,
  SandswirlTail: sandswirlTail,
  BitterSeasons: bitterSeasons,
  VitalLeech: vitalLeech,
  DivineRoulette: divineRoulette,
  EvasiveCharge: evasiveCharge,
  LightAndShadowAlike: lightAndShadowAlike,
  HeartOfFire: heartOfFire,
  MountainsMight: mountainsMight,
  WildfireSpark: wildfireSpark,
  SwordMorph: swordMorph,
  WolfchasersArt: wolfchasersArt,
  SwordHorizon: swordHorizon,
  GourdToss: gourdToss,
  ThunderousBloom: thunderousBloom,
  StarReacher: starReacher,
  BlossomBarrage: blossomBarrage,
  RestoringBlossom: restoringBlossom,
  EsotericRevival: esotericRevival,
  MendingLoom: mendingLoom,
  TrappedBeast: trappedBeast,
  RockSolid: rockSolid,
  EchoesOfOblivion: echoesOfOblivion,
  Vendetta: vendetta,
  RiptideReflex: riptideReflex,
  PhantomRally: phantomRally,
  TowlineSweep: towlineSweep,
  LightAnew: lightAnew,
  SongOfTang: songOfTang,
  WildfireSurge: wildfireSurge,
  CelestialVigor: celestialVigor,
  Eonpour: eonpour,
  Skyspeak: skyspeak,
  Mistwing: mistwing,
  Volutefit: volutefit,
} satisfies Record<string, InnerWayDefinition>;

export function innerWayAvailableForTag(innerWay: string, requiredTag?: string) {
  if (!innerWay || !requiredTag) return true;
  const definition = innerWayDefinitions[innerWay as keyof typeof innerWayDefinitions] as
    | InnerWayDefinition
    | undefined;
  return definition?.tags?.includes(requiredTag) === true;
}

export function innerWayEntriesForTag(requiredTag?: string) {
  return Object.entries(innerWayDefinitions).filter(([innerWay]) => innerWayAvailableForTag(innerWay, requiredTag));
}

/** Resolve authored Solo Level tables before effects enter the shared stat pipeline. */
export function innerWayDefinitionForSoloLevel(definition: InnerWayDefinition, soloLevel: number): InnerWayDefinition {
  if (!Number.isInteger(soloLevel) || soloLevel < 0) throw new RangeError("Invalid Solo Level: " + soloLevel);
  const effect = Object.fromEntries(
    Object.entries(definition.effect).map(([id, value]) => {
      const tier = value as { effect?: Record<string, unknown>[] };
      if (!tier.effect) return [id, tier];
      return [
        id,
        {
          ...tier,
          effect: tier.effect.map((item) => {
            const rawStat = item.rawStat as Record<string, number | { bySoloLevel: (number | null)[] }> | undefined;
            if (!rawStat) return item;
            return Object.assign({}, item, {
              rawStat: Object.fromEntries(
                Object.entries(rawStat).map(([stat, amount]) => {
                  if (typeof amount === "number") return [stat, amount];
                  const selected = amount.bySoloLevel[soloLevel];
                  if (selected === undefined)
                    throw new RangeError(
                      definition.name + " " + id + " " + stat + " has no value for Solo Level " + soloLevel,
                    );
                  return [stat, selected ?? 0];
                }),
              ),
            });
          }),
        },
      ];
    }),
  );
  return { ...definition, effect };
}
