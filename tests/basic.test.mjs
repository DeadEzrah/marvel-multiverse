import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { getDefenseValue } = await import("../lib/services/action-roll.mjs");
const { applyPowerOutcomes, validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { resolveUtilityTargetLimits } = await import("../lib/services/utility-activation.mjs");

const directory = new URL("../packs/_source/powers/Basic/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Basic contains 46 structured powers with valid events", () => {
  assert.equal(files.length, 46);
  for (const [file, power] of Object.entries(powers)) {
    assert.equal(typeof power.system.basic, "object", `${file}: family metadata`);
    assert.equal(validatePowerEvents(power.system.events).valid, true, `${file}: event schema`);
  }
});

test("ability tiers preserve exact bonuses and corrected progression", () => {
  const tierFamilies = {
    accuracy: "agl",
    brilliance: "log",
    discipline: "ego",
    mighty: "mle",
  };
  for (const [family, ability] of Object.entries(tierFamilies)) {
    for (let tier = 1; tier <= 4; tier += 1) {
      const power = powers[`${family}-${tier}.json`];
      assert.equal(power.system.basic.tier, tier);
      assert.equal(power.system.basic.ability, ability);
      const changes = power.effects[0].changes;
      assert.equal(changes.find((change) => change.key.endsWith(".damageMultiplier")).value, tier);
      assert.equal(changes.find((change) => change.key.endsWith(".noncom")).value, tier);
    }
  }

  assert.equal(powers["discipline-2.json"].system.effect.includes("+2"), true);
  assert.equal(powers["mighty-1.json"].system.prerequisites, "Rank 2");
  assert.equal(powers["mighty-2.json"].system.basic.liftingSizeIncrease, 2);
  assert.match(powers["mighty-2.json"].system.effect, /two sizes/);
});

test("damage-reduction tiers and Reinforced Skeleton retain transferred defenses", () => {
  for (const [family, path] of [["sturdy", "system.healthDamageReduction"], ["uncanny", "system.focusDamageReduction"]]) {
    for (let tier = 1; tier <= 4; tier += 1) {
      const power = powers[`${family}-${tier}.json`];
      assert.equal(power.effects[0].changes[0].key, path);
      assert.equal(power.effects[0].changes[0].value, tier);
      assert.equal(power.system.basic[family === "sturdy" ? "healthDamageReduction" : "focusDamageReduction"], tier);
    }
  }
  assert.equal(powers["reinforced-skeleton.json"].effects[0].changes[0].value, 1);
  assert.equal(powers["reinforced-skeleton.json"].system.basic.healthDamageReduction, 1);
});

test("Basic defense substitutions use the better eligible defense", () => {
  const actor = {
    system: {
      abilities: {
        agl: { defense: 12 },
        mle: { defense: 18 },
        ego: { defense: 14 },
        log: { defense: 16 },
      },
    },
    items: [
      powers["brawling.json"],
      powers["evasion.json"],
      powers["integrity.json"],
      powers["wisdom.json"],
    ],
  };

  assert.equal(getDefenseValue(actor, "agl"), 18);
  assert.equal(getDefenseValue(actor, "mle"), 18);
  assert.equal(getDefenseValue(actor, "ego"), 16);
  assert.equal(getDefenseValue(actor, "log"), 16);
});

test("Flight tiers use Rank-times-Run combat speed and exact noncombat multipliers", () => {
  for (const [file, multiplier] of [["flight-1.json", 3], ["flight-2.json", 50]]) {
    const power = powers[file];
    const changes = power.effects[0].changes;
    assert.equal(changes.find((change) => change.key.endsWith(".active")).value, true);
    assert.equal(changes.find((change) => change.key.endsWith(".calc")).value, "rank-runspeed");
    assert.equal(changes.find((change) => change.key.endsWith(".noncom")).value, multiplier);
    assert.equal(power.system.basic.noncombatMultiplier, multiplier);
  }
});

test("Group Flight and Inspiration enforce ally targeting and maintained effects", () => {
  const groupFlight = powers["group-flight.json"];
  const inspiration = powers["inspiration.json"];
  const groupLimits = resolveUtilityTargetLimits(groupFlight, {
    system: {
      abilities: { ego: { value: 4 } },
      attributes: { rank: { value: 3 } },
    },
  });
  const inspirationLimits = resolveUtilityTargetLimits(inspiration, {});

  assert.deepEqual([groupLimits.minimum, groupLimits.maximum], [1, 4]);
  assert.equal(groupFlight.system.targeting.range, 5);
  assert.equal(groupFlight.system.targeting.rangeScaling, "rank");
  assert.equal(groupFlight.system.events[0].outcomes[0].duration.type, "concentration");
  assert.deepEqual([inspirationLimits.minimum, inspirationLimits.maximum], [1, 1]);
  assert.equal(inspiration.system.events[0].outcomes[0].effect.changes.length, 6);
  assert.equal(inspiration.system.events[0].outcomes[0].duration.type, "start-of-source-turn");
});

test("Energy Absorption converts the latest Health damage up to double Focus maximum", () => {
  const power = powers["energy-absorption.json"].system;
  const outcomes = power.events[0].outcomes;

  assert.equal(power.activation.reactionType, "incoming-health-damage");
  assert.equal(outcomes[0].type, "healing");
  assert.equal(outcomes[0].useReactionDamage, true);
  assert.equal(outcomes[1].type, "resource-change");
  assert.equal(outcomes[1].resource, "focus");
  assert.equal(outcomes[1].useReactionDamage, true);
  assert.equal(outcomes[1].maximumResourceMultiplier, 2);
});

test("Energy Absorption restores Health and caps converted Focus at double maximum", async () => {
  const originalFoundry = globalThis.foundry;
  const originalFromUuidSync = globalThis.fromUuidSync;
  const originalGame = globalThis.game;
  const actor = {
    uuid: "Actor.absorber",
    documentName: "Actor",
    system: {
      health: { value: 10, max: 100 },
      focus: { value: 190, max: 100 },
    },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        const path = key.split(".");
        let target = this;
        for (const part of path.slice(0, -1)) target = target[part];
        target[path.at(-1)] = value;
      }
    },
  };
  const item = {
    ...powers["energy-absorption.json"],
    uuid: "Item.energy-absorption",
  };
  const flags = {
    rollContext: {
      actorUuid: actor.uuid,
      itemUuid: item.uuid,
      targetUuids: [],
    },
    reactionContext: {
      appliedDamage: 20,
      responseDamage: 20,
      previousValue: 30,
    },
  };
  const message = {
    uuid: "ChatMessage.energy-absorption",
    getFlag: (_scope, key) => flags[key] ?? null,
    async update() {},
  };
  globalThis.game = {
    ...originalGame,
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } },
    settings: {
      get: (_scope, key) => key === "enableExperimentalPowerOutcomes",
    },
  };
  globalThis.foundry = {
    utils: {
      getProperty: (object, property) => property.split(".").reduce((value, key) => value?.[key], object),
    },
  };
  globalThis.fromUuidSync = (uuid) => {
    if (uuid === actor.uuid) return actor;
    if (uuid === item.uuid) return item;
    return null;
  };

  try {
    const result = await applyPowerOutcomes(message, {
      item,
      eventIds: ["energy-absorption-conversion"],
      triggers: ["action-declared"],
    });

    assert.equal(result.success, true);
    assert.equal(actor.system.health.value, 30);
    assert.equal(actor.system.focus.value, 200);
  } finally {
    globalThis.foundry = originalFoundry;
    globalThis.fromUuidSync = originalFromUuidSync;
    globalThis.game = originalGame;
  }
});

test("Healing Factor, Slow-Motion Dodge and Wisecracker expose exact automation", () => {
  const healing = powers["healing-factor.json"].system;
  const dodge = powers["slow-motion-dodge.json"];
  const wisecracker = powers["wisecracker.json"].system;
  const defensive = dodge.effects[0].flags["marvel-multiverse"].defensiveRollModifier;

  assert.equal(healing.events[0].trigger, "end-of-source-turn");
  assert.equal(healing.events[0].outcomes[0].formula, "@abilities.res.value");
  assert.equal(defensive.mode, "trouble");
  assert.deepEqual(defensive.defenses, ["agl"]);
  assert.equal(defensive.requiresAttack, true);
  assert.equal(wisecracker.targeting.defense, "ego");
  assert.equal(wisecracker.damage.type, "focus");
  assert.equal(wisecracker.damage.doubleOnFantastic, true);
  assert.equal(wisecracker.events[0].outcomes[0].statusId, "stunned");
});

test("subjective Basic powers retain explicit safe boundaries", () => {
  assert.equal(powers["anger.json"].system.basic.sheetChangesManual, true);
  assert.equal(powers["combat-trickery.json"].system.basic.dieReplacementManual, true);
  assert.equal(powers["disguise.json"].system.basic.appearanceMutationManual, true);
  assert.equal(powers["environmental-protection.json"].system.basic.selectedProtectionsManual, true);
  assert.equal(powers["iconic-weapon.json"].system.basic.weaponDefinitionManual, true);
  assert.equal(powers["shape-shift.json"].system.basic.formAndAbilitiesManual, true);
  assert.equal(powers["heightened-senses-2.json"].system.basic.situationalChecksManual, true);
  assert.equal(powers["wisecracker.json"].system.basic.triggerSelectionManual, true);
});

test("Basic semantic aliases resolve to registered effects", async () => {
  const manifest = JSON.parse(await readFile(new URL("../assets/effects-manifest.json", import.meta.url), "utf8"));
  const aliases = [
    "basic.passive",
    "basic.defense",
    "basic.anger",
    "basic.trick",
    "basic.transform",
    "basic.absorb",
    "basic.flight",
    "basic.healing",
    "basic.sense",
    "basic.weapon",
    "basic.inspire",
    "basic.dodge",
    "basic.taunt",
    "basic.mental-impact",
  ];
  for (const alias of aliases) {
    assert.equal(typeof manifest.fallbacks[alias], "string", alias);
  }
  assert.equal(manifest.fallbacks["basic.flight"], "telekinesis.lift");
});
