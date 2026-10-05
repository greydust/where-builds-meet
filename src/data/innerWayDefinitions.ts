import adaptiveSteel from "../../data/innerway/adaptive-steel.json"
import artOfResistance from "../../data/innerway/art-of-resistance.json"
import battleAnthem from "../../data/innerway/battle-anthem.json"
import bitterSeasons from "../../data/innerway/bitter-seasons.json"
import blossomBarrage from "../../data/innerway/blossom-barrage.json"
import breakingPoint from "../../data/innerway/breaking-point.json"
import celestialVigor from "../../data/innerway/celestial-vigor.json"
import divineRoulette from "../../data/innerway/divine-roulette.json"
import echoesOfOblivion from "../../data/innerway/echoes-of-oblivion.json"
import empiricalEdge from "../../data/innerway/empirical-edge.json"
import envigoratedWarrior from "../../data/innerway/envigorated-warrior.json"
import eonpour from "../../data/innerway/eonpour.json"
import esotericRevival from "../../data/innerway/esoteric-revival.json"
import evasiveCharge from "../../data/innerway/evasive-charge.json"
import eveningSnow from "../../data/innerway/evening-snow.json"
import exquisiteScenery from "../../data/innerway/exquisite-scenery.json"
import fivefoldBleed from "../../data/innerway/fivefold-bleed.json"
import frostCladNight from "../../data/innerway/frost-clad-night.json"
import furyHarvest from "../../data/innerway/fury-harvest.json"
import gourdToss from "../../data/innerway/gourd-toss.json"
import heartOfFire from "../../data/innerway/heart-of-fire.json"
import insightfulStrike from "../../data/innerway/insightful-strike.json"
import lightAndShadowAlike from "../../data/innerway/light-and-shadow-alike.json"
import lightAnew from "../../data/innerway/light-anew.json"
import mendingLoom from "../../data/innerway/mending-loom.json"
import mistwing from "../../data/innerway/mistwing.json"
import moraleChant from "../../data/innerway/morale-chant.json"
import mountainsMight from "../../data/innerway/mountains-might.json"
import phantomRally from "../../data/innerway/phantom-rally.json"
import restoringBlossom from "../../data/innerway/restoring-blossom.json"
import riptideReflex from "../../data/innerway/riptide-reflex.json"
import rockSolid from "../../data/innerway/rock-solid.json"
import royalRemedy from "../../data/innerway/royal-remedy.json"
import sandswirlTail from "../../data/innerway/sandswirl-tail.json"
import seasonalEdge from "../../data/innerway/seasonal-edge.json"
import shadowAssault from "../../data/innerway/shadow-assault.json"
import skyGripped from "../../data/innerway/sky-gripped.json"
import skyspeak from "../../data/innerway/skyspeak.json"
import soaringHigh from "../../data/innerway/soaring-high.json"
import songOfTang from "../../data/innerway/song-of-tang.json"
import starReacher from "../../data/innerway/star-reacher.json"
import steadfastDevotion from "../../data/innerway/steadfast-devotion.json"
import steadfastStance from "../../data/innerway/steadfast-stance.json"
import swordHorizon from "../../data/innerway/sword-horizon.json"
import swordMorph from "../../data/innerway/sword-morph.json"
import throatPiercingArt from "../../data/innerway/throat-piercing-art.json"
import thunderousBloom from "../../data/innerway/thunderous-bloom.json"
import towlineSweep from "../../data/innerway/towline-sweep.json"
import trappedBeast from "../../data/innerway/trapped-beast.json"
import vendetta from "../../data/innerway/vendetta.json"
import vitalLeech from "../../data/innerway/vital-leech.json"
import volutefit from "../../data/innerway/volutefit.json"
import wildfireSpark from "../../data/innerway/wildfire-spark.json"
import wildfireSurge from "../../data/innerway/wildfire-surge.json"
import windBeneathWings from "../../data/innerway/wind-beneath-wings.json"
import wolfchasersArt from "../../data/innerway/wolfchasers-art.json"

/**
 * A tier's authored effect, as the data files carry it. The rule that applies it
 * supplies `source` and `tier` around this, which is what `InnerWayEffectRule`
 * adds. Solo Level tables live under `rawStat` until they are resolved.
 */
export type InnerWayTierEffect = {
  trigger?: Record<string, unknown>[]
  effect?: Record<string, unknown>[]
  listen?: Record<string, unknown>[]
  [key: string]: unknown
}

export type InnerWayDefinition = {
  name: string
  tags?: string[]
  altersTimeline: boolean
  effect: Record<string, InnerWayTierEffect>
}

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
} satisfies Record<string, InnerWayDefinition>

export function innerWayAvailableForTag(innerWay: string, requiredTag?: string) {
  if (!innerWay || !requiredTag) return true
  const definition = innerWayDefinitions[innerWay as keyof typeof innerWayDefinitions] as InnerWayDefinition | undefined
  return definition?.tags?.includes(requiredTag) === true
}

/** Eligible entries for the path selectors, ordered by the data name rather than registry order. */
export function innerWayEntriesForTag(requiredTag?: string) {
  return Object.entries(innerWayDefinitions)
    .filter(([innerWay]) => innerWayAvailableForTag(innerWay, requiredTag))
    .toSorted(([, left], [, right]) => left.name.localeCompare(right.name))
}

/** Resolve authored Solo Level tables before effects enter the shared stat pipeline. */
export function innerWayDefinitionForSoloLevel(definition: InnerWayDefinition, soloLevel: number): InnerWayDefinition {
  if (!Number.isInteger(soloLevel) || soloLevel < 0) throw new RangeError("Invalid Solo Level: " + soloLevel)
  const effect = Object.fromEntries(
    Object.entries(definition.effect).map(([id, value]) => {
      const tier = value as InnerWayTierEffect
      if (!tier.effect) return [id, tier]
      return [
        id,
        {
          ...tier,
          effect: tier.effect.map(item => {
            const rawStat = item.rawStat as Record<string, number | { bySoloLevel: (number | null)[] }> | undefined
            if (!rawStat) return item
            return Object.assign({}, item, {
              rawStat: Object.fromEntries(
                Object.entries(rawStat).map(([stat, amount]) => {
                  if (typeof amount === "number") return [stat, amount]
                  const selected = amount.bySoloLevel[soloLevel]
                  if (selected === undefined)
                    throw new RangeError(
                      definition.name + " " + id + " " + stat + " has no value for Solo Level " + soloLevel,
                    )
                  return [stat, selected ?? 0]
                }),
              ),
            })
          }),
        },
      ]
    }),
  )
  return { ...definition, effect }
}
