import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

// Ported from script/probe/check-martial-art-talents.mjs.
describe("martial-art-talents", () => {
  it("All martial arts: conversions, raw attributes, thresholds, tag isolation, conditional damage, and talent triggers passed", async () => {
    const read = async (path) => JSON.parse(await readFile(path, "utf8"));
    const close = (actual, expected, label) =>
      assert(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);
    const { martialArtEffectsForRank } = await import("../src/data/martialArtTalents.ts");
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const mapping = (await read("data/official/profile-map.json")).martialArts;
    const system = await read("data/system.json");
    const martialArtFiles = await readdir("data/martial-art");
    const martialArtPayloads = await Promise.all(
      martialArtFiles.map(async (filename) => [filename, await read(`data/martial-art/${filename}`)] as const),
    );
    const arts = {};
    for (const [, art] of martialArtPayloads) {
      const identity = Object.values(mapping).find((m) => m.name.toLowerCase() === art.name.toLowerCase());
      arts[identity.weapon] = art;
    }
    const effectDirectories = ["buff", "debuff"];
    const effectFiles = await Promise.all(
      effectDirectories.map(async (dir) => [dir, await readdir(`data/${dir}`)] as const),
    );
    const effectPayloads = await Promise.all(
      effectFiles.flatMap(([dir, files]) =>
        files.map(async (file) => [dir, file, await read(`data/${dir}/${file}`)] as const),
      ),
    );
    const effectDefinitions = {};
    for (const [, , payload] of effectPayloads) Object.assign(effectDefinitions, payload);
    const baseCases = [
      ["strategicSword", "power", "affinity", 0.000152, 0.04256],
      ["namelessSword", "momentum", "maxPhys", 0.264, 73.92],
      ["heavenquakerSpear", "power", "maxPhys", 0.264, 73.92],
      ["namelessSpear", "momentum", "affinity", 0.000152, 0.04256],
      ...[
        "panaceaFan",
        "phalanxbane",
        "mortalRopeDart",
        "skygrasp",
        "vernalUmbrella",
        "unfettered",
        "rivenTwinblades",
      ].map((w) => [w, "agility", "crit", 0.000304, 0.08512]),
      ...[
        "inkwellFan",
        "infernalTwinblades",
        "soulshadeUmbrella",
        "snowparting",
        "heavenwill",
        "everspring",
        "skystrikeGauntlets",
      ].map((w) => [w, "agility", "minPhys", 0.264, 73.92]),
    ];
    for (const [weapon, source, target, rate, cap] of baseCases) {
      for (const amount of [0, 140, 280, 560]) {
        const effects = martialArtEffectsForRank(arts, [weapon], 13).filter((e) => !e.requirement);
        const stats = calculateStatsWithEffects({ ...emptyStats, [source]: amount }, effects, 0, [weapon]).stats;
        close(stats[target], Math.min(amount * rate, cap), `${weapon} base-stat conversion`);
      }
    }
    for (const weapon of Object.keys(arts)) {
      const effect = martialArtEffectsForRank(arts, [weapon], 13).filter((e) => e.rawStat);
      const sheet = calculateStatsWithEffects(emptyStats, effect, 0, [weapon]);
      const raw = Object.entries(sheet.rawStats).filter(
        ([key, value]) => value && /^(min|max)(Bellstrike|Stonesplit|Silkbind|Bamboocut)$/.test(key),
      );
      for (const amount of [100, 1000]) {
        const base = { ...emptyStats };
        for (const [key] of raw) base[key] = amount;
        const scaled = calculateStatsWithEffects(base, effect, 0, [weapon]);
        for (const [key, value] of Object.entries(effect[0].stat)) {
          const maximumInput = value.formula.source.startsWith("max");
          let rate;
          switch (key.endsWith("Penetration")) {
            case true:
              rate = maximumInput ? 0.0336 : 0.0672;
              break;
            case false:
              rate = maximumInput ? 0.000168 : 0.000336;
              break;
          }
          close(
            scaled.stats[key],
            Math.min((amount + sheet.rawStats[value.formula.source]) * rate, key.endsWith("Penetration") ? 22 : 0.11),
            `${weapon} attribute conversion includes raw talent and caps`,
          );
        }
      }
    }
    const talentEffects = (weapon, name) =>
      martialArtEffectsForRank(
        {
          [weapon]: {
            talent: [...Array.from({ length: 13 }, () => []), arts[weapon].talent[13].filter((t) => t.name === name)],
          },
        },
        [weapon],
        13,
      );
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
    const run = (weapon, name, tags, options = {}) => {
      const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1, ...options.stats };
      const result = calculateRotationBaseline({
        timeline: {
          rotation: { name: "Talent behavior", steps: [{ type: "skill", skill: "Hit" }] },
          skills: { Hit: { castTime: 1, tags, action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }] } },
          effectDefinitions,
          eventDefinitions: {},
          dots: {},
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects: talentEffects(weapon, name),
          weapons: [weapon],
          initialResources: system.initialResources,
          ...options.timeline,
        },
        startAnchor: { rowId: "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy: { ...enemy, ...options.enemy },
        attunement: {},
        weapons: [weapon],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      });
      return { result, damage: Object.values(result.actionBreakdowns)[0] };
    };
    for (const [weapon, name, resource] of [
      ["skygrasp", "Heaven's Will DMG Boost", "HeavensWill"],
      ["snowparting", "Critical DMG Up", "BladeMomentum"],
    ]) {
      for (const amount of [0, 1, 1.01]) {
        const stats = { crit: 0.6 };
        const { damage } = run(weapon, name, [], { stats, timeline: { initialResources: { [resource]: amount } } });
        let expected = 1000;
        if (amount > 1) expected *= weapon === "skygrasp" ? 1.09 : 1 + damage.outcomeRates.critical * 0.21;
        close(damage.physical, expected, `${weapon} strict one-bar threshold`);
      }
    }
    const snowpartingStart = run("snowparting", "Critical DMG Up", [], { stats: { crit: 0.6 } });
    close(
      snowpartingStart.damage.physical,
      1126,
      "System starting Blade Momentum enables Snowparting's 21% Critical DMG bonus at 60% Critical Rate",
    );
    for (const minPhys of [49, 50, 749, 750, 1000]) {
      for (const [weapon, name, tags] of [
        ["inkwellFan", "Heavy Attack Pursuit Enhancement", ["MoonShatterSpring"]],
        ["vernalUmbrella", "Trajectory Calculation Enhancement", ["VernalUmbrella", "Ballistic"]],
      ]) {
        const { damage } = run(weapon, name, tags, { stats: { minPhys, crit: 1 } });
        close(
          damage.physical,
          ((minPhys + 1000) / 2) * (1 + damage.outcomeRates.critical * Math.min(15, Math.floor(minPhys / 50)) * 0.024),
          `${weapon} 50-point damage steps`,
        );
        close(
          run(weapon, name, ["Other"], { stats: { minPhys, crit: 1 } }).damage.physical,
          (minPhys + 1000) / 2,
          `${weapon} unrelated attacks`,
        );
      }
    }
    for (const status of [undefined, "Immobilized", "Airborne"]) {
      const { damage } = run("vernalUmbrella", "Trajectory Skill Enhancement", ["VernalUmbrella", "Ballistic"], {
        enemy: { physicalResistance: 20 },
        timeline: { initialDebuffs: status ? [{ name: status, stack: 1 }] : [] },
      });
      close(damage.physical, status ? 950 : 850, "Ballistic resistance ignores 5 or 15 points");
    }
    for (const qi of [29.99, 30]) {
      const { damage } = run("inkwellFan", "Low Qi Follow-up Enhancement", ["MoonShatterSpring"], {
        timeline: {
          rotation: {
            name: "Low Qi",
            steps: [
              { type: "event", event: "Qi", before: { action: "start" }, targetQiRatio: qi / 100 },
              { type: "skill", skill: "Hit" },
            ],
          },
          eventDefinitions: { Qi: { action: [{ type: "setQi", time: 0 }] } },
        },
      });
      close(damage.outcomeRates.critical, qi < 30 ? 0.3 : 0, "Low-Qi critical chance threshold");
      close(damage.physical, qi < 30 ? 1080 : 1000, "Low-Qi HP damage threshold");
    }
    for (const [weapon, name, tags] of [
      ["thundercry", "Charge Calculation Enhancement", ["ThundercryBlade", "Charged"]],
      ["heavenwill", "Perfect Dodge Enhancement", ["VileCondemned"]],
    ]) {
      close(
        run(weapon, name, tags, { stats: { precision: 0.7 } }).damage.outcomeRates.abrasion,
        0,
        `${weapon} supported no-Abrasion conversion`,
      );
      close(
        run(weapon, name, ["Other", "Charged"], { stats: { precision: 0.7 } }).damage.outcomeRates.abrasion,
        0.3,
        `${weapon} no cross-weapon conversion`,
      );
    }
    close(
      run("thundercry", "Charge Critical Hit Enhancement", ["ThundercryBlade", "Charged"], { stats: { maxHp: 90000 } })
        .damage.outcomeRates.critical,
      0.24,
      "Thundercry fixed and scaling Critical Rate",
    );
    close(
      run("thundercry", "Charge Calculation Enhancement", ["ThundercryBlade", "Charged"], {
        stats: { maxHp: 150000, crit: 1 },
      }).damage.physical,
      1144.8,
      "Thundercry effective attack and Critical DMG",
    );
    close(
      run("unfettered", "Soulbreak Critical Boost", [], {
        stats: { crit: 0.6 },
        timeline: { initialDebuffs: [{ name: "Soulbreak", stack: 1 }] },
      }).damage.physical,
      1162,
      "Soulbreak conditional critical damage",
    );
    close(
      run("phalanxbane", "Iron Guards Penetration Up", [], {
        timeline: { initialBuffs: [{ name: "IronGuard", stack: 1 }] },
      }).damage.physical,
      1144.8,
      "Iron Guard penetration stacks with its existing 8% damage bonus",
    );
    close(
      run("phalanxbane", "Iron Guards Penetration Up", []).damage.physical,
      1000,
      "Iron Guard absence removes bonus",
    );
    const cast = (skill) => ({ type: "skill", skill });
    const delay = (duration) => ({ type: "event", event: "Delay", duration });
    const timeline = (setupEffects, steps, skills, extra = {}) =>
      buildRotationTimeline({
        rotation: { name: "Talent triggers", steps },
        skills,
        effectDefinitions,
        eventDefinitions: {},
        dots: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects,
        weapons: [],
        ...extra,
      });
    const observe = { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] };
    const startingResourceRows = timeline(
      [],
      [cast("Observe"), delay(60), cast("Observe")],
      { Observe: observe },
      { initialResources: system.initialResources },
    ).filter((row) => row.step.skill === "Observe");
    for (const row of startingResourceRows) {
      close(row.actionStates[0].resources.BladeMomentum, 4, "Blade Momentum stays at four without resource actions");
      close(row.actionStates[0].resources.BattleWill, 4, "Battle Will stays at four without resource actions");
    }
    const rows = timeline(
      [
        ...talentEffects("rivenTwinblades", "Increased Binge Point Gain"),
        ...talentEffects("skystrikeGauntlets", "Inebriate Dodge Enhancement"),
      ],
      [cast("Carouse"), cast("Dodge"), cast("Dodge"), delay(1), cast("Dodge"), cast("Observe")],
      {
        Carouse: { castTime: 0, tags: ["HeroesBlood"], action: [] },
        Dodge: { castTime: 0, tags: ["PerfectDodge"], action: [] },
        Observe: observe,
      },
    );
    const final = rows.findLast((r) => r.step.skill === "Observe");
    close(final.resources.Binge, 10, "Carouse dodge gain has a shared one-second cooldown");
    close(final.buffs.find((b) => b.name === "Carouse").expiresAt, 20, "Carouse lasts twenty seconds");
    const soulRows = timeline(
      talentEffects("heavenquakerSpear", "Damage Over Time Enhancement"),
      [...Array.from({ length: 6 }, () => cast("Charged")), cast("Observe")],
      { Charged: { ...observe, tags: ["HeavenQuakerSpear", "Charged"] }, Observe: observe },
    );
    close(
      soulRows.at(-1).debuffs.find((b) => b.name === "SoulShaken").stack,
      5,
      "Heavenquaker trigger applies capped Soul-Shaken stacks",
    );
    for (const [grace, baseBonus] of [
      ["FloatingGrace", 0.1],
      ["FloatingGraceDeluge", 0.24],
    ]) {
      const graceSkills = {
        Grace: {
          castTime: 0,
          action: [{ type: "apply", target: "self", value: grace, duration: 12, reapply: true, time: 0 }],
        },
        Exhaust: {
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "Exhausted", duration: 1, reapply: true, time: 0 }],
        },
        LongExhaust: {
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "Exhausted", duration: 30, reapply: true, time: 0 }],
        },
        ConsumeGrace: {
          castTime: 0,
          action: [{ type: "consume", target: "self", value: grace, stack: "all", time: 0 }],
        },
        Observe: observe,
      };
      const graceSteps = [
        cast("Grace"),
        cast("Observe"),
        cast("Exhaust"),
        cast("Observe"),
        delay(1.1),
        cast("Observe"),
        cast("LongExhaust"),
        delay(5.1),
        cast("Observe"),
        cast("ConsumeGrace"),
        cast("Observe"),
        cast("Grace"),
        cast("Observe"),
        delay(12.1),
        cast("Observe"),
      ];
      const graceRun = (enabled, extra = {}) =>
        run("soulshadeUmbrella", "Buff Enhancement", [], {
          timeline: {
            rotation: { name: "Floating Grace exhaustion conditions", steps: graceSteps },
            skills: graceSkills,
            setupEffects: enabled ? talentEffects("soulshadeUmbrella", "Buff Enhancement") : [],
            ...extra,
          },
        }).result;
      const ordinary = graceRun(false);
      const talented = graceRun(true);
      const damage = (result) =>
        result.baseline
          .filter((entry) => entry.action.type === "damage")
          .map((entry) => result.actionBreakdowns[entry.id].physical);
      const ordinaryDamage = damage(ordinary);
      const talentedDamage = damage(talented);
      assert.equal(talentedDamage.length, 7);
      for (let index = 0; index < talentedDamage.length; index++) {
        const bonusActive = [1, 3, 5].includes(index);
        close(
          talentedDamage[index],
          ordinaryDamage[index] * (bonusActive ? (1 + baseBonus + 0.05) / (1 + baseBonus) : 1),
          `${grace}: Exhausted and Floating Grace must overlap; bonus follows consumption, expiry and reapplication`,
        );
      }
      assert(
        talented.timeline.every((row) => !row.buffs.some((buff) => buff.name === "SoulshadeExhaustedBoost")),
        "The talent must not create a separate visible buff",
      );
      const permanent = {
        rotation: { name: "Permanent Floating Grace", steps: [cast("Observe")] },
        initialBuffs: [{ name: grace, stack: 1, persistent: true }],
        initialDebuffs: [{ name: "Exhausted", stack: 1 }],
      };
      close(
        damage(graceRun(true, permanent))[0],
        (damage(graceRun(false, permanent))[0] * (1 + baseBonus + 0.05)) / (1 + baseBonus),
        `${grace}: a supplied permanent buff receives the equipped Soulshade talent without needing a cast`,
      );
    }
  });
});
