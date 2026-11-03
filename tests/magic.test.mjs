import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { resolveDamage, resolveDamageConfig } = await import("../lib/services/damage-resolver.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { resolveUtilityTargetLimits } = await import("../lib/services/utility-activation.mjs");

const directory = new URL("../packs/_source/powers/Magic/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Magic contains 28 structured powers with valid events", () => {
  assert.equal(files.length, 28);
  for (const [file, power] of Object.entries(powers)) {
    assert.equal(typeof power.system.magic, "object", `${file}: family metadata`);
    assert.equal(validatePowerEvents(power.system.events).valid, true, `${file}: event schema`);
  }
});

test("Magic attacks use their rules-defined defenses, ranges and damage resources", () => {
  const bolts = powers["bolts-of-balthakk.json"].system;
  const flare = powers["flare.json"].system;
  const penance = powers["penance-stare.json"].system;

  assert.equal(bolts.attackKind, "ranged");
  assert.equal(bolts.targeting.defense, "agl");
  assert.equal(bolts.targeting.range, 20);
  assert.equal(bolts.damage.ability, "agl");
  assert.equal(bolts.damage.includeFocusBonusInBase, true);
  assert.deepEqual(bolts.focusScaling, {
    enabled: true,
    mode: "damage",
    benefitPerFocus: 1,
    focusPerBenefit: 2,
  });

  assert.equal(flare.targeting.area.distance, 5);
  assert.equal(flare.damage.requiresFantastic, true);
  assert.equal(flare.damage.scale, 1);
  assert.equal(flare.damage.doubleOnFantastic, false);

  assert.equal(penance.targeting.range, 3);
  assert.equal(penance.targeting.rangeScaling, "rank");
  assert.equal(penance.damage.type, "focus");
  assert.deepEqual(penance.damage.targetTagScales, [{ tag: "Heroic", scale: 0.5 }]);
});

test("Heroic Penance Stare targets take half of resolved Focus damage", () => {
  const source = powers["penance-stare.json"];
  const attacker = {
    system: {
      abilities: {
        ego: { value: 4, damageMultiplier: 2 },
      },
    },
  };
  const baseTarget = {
    system: {
      focusDamageReduction: 0,
      tags: [],
    },
  };
  const heroicTarget = {
    system: {
      focusDamageReduction: 0,
      tags: [{ name: "Heroic" }],
    },
  };
  const config = resolveDamageConfig(source);
  const input = {
    attacker,
    source,
    rollContext: { ability: "ego" },
    rollResult: { isSuccess: true, isFantastic: false, marvelDie: 3 },
    config,
  };

  const normal = resolveDamage({ ...input, target: baseTarget });
  const heroic = resolveDamage({ ...input, target: heroicTarget });

  assert.equal(normal.finalDamage, 10);
  assert.equal(heroic.finalDamage, 5);
  assert.equal(heroic.targetTagScale, 0.5);
  assert.equal(heroic.matchedTargetTag, "Heroic");
});

test("Magic statuses and concentration durations preserve Fantastic outcomes", () => {
  const crimson = powers["crimson-bands-of-cyttorak.json"].system;
  const morpheus = powers["mists-of-morpheus.json"].system;
  const penance = powers["penance-stare.json"].system;

  assert.equal(crimson.events[0].outcomes[0].statusId, "paralyzed");
  assert.equal(crimson.events[0].outcomes[0].duration.type, "concentration");
  assert.equal(crimson.magic.escapeTargetNumber, 20);
  assert.equal(morpheus.events[1].outcomes[0].type, "remove-status");
  assert.equal(morpheus.events[1].outcomes[1].statusId, "unconscious");
  assert.equal(morpheus.events[1].outcomes[1].duration.type, "concentration");
  assert.equal(penance.events[0].outcomes[0].statusId, "paralyzed");
  assert.equal(penance.events[0].outcomes[0].duration.value, 1);
});

test("Drain powers require grabbed targets and preserve healing boundaries", () => {
  for (const file of ["brain-drain.json", "leech-life.json"]) {
    const system = powers[file].system;
    assert.equal(system.targeting.range, 1, file);
    assert.equal(system.targeting.prerequisites[0].type, "status", file);
    assert.equal(system.targeting.prerequisites[0].value, "grappled", file);
    assert.equal(system.magic.normalHealingScale, 0.5, file);
    assert.equal(system.magic.fantasticHealingScale, 1, file);
    assert.equal(system.events[0].outcomes[0].type, "manual", file);
  }
  assert.equal(powers["brain-drain.json"].system.damage.type, "focus");
  assert.equal(powers["leech-life.json"].system.damage.type, "health");
});

test("Possession, portals, illusions and environment powers expose safe boundaries", () => {
  const possession = powers["possession.json"].system;
  const portal = powers["summon-portal.json"].system;
  const images = powers["images-of-ikonn.json"].system;
  const munnopor = powers["mists-of-munnopor.json"].system;
  const vapors = powers["vapors-of-valtorr.json"].system;

  assert.equal(possession.targeting.maximumFocus, 0);
  assert.equal(possession.events[0].outcomes[0].duration.type, "concentration");
  assert.equal(possession.magic.harmResistanceTriggerManual, true);
  assert.equal(portal.magic.crossSceneMovementManual, true);
  assert.equal(portal.events[0].outcomes[0].duration.type, "concentration");
  assert.equal(images.magic.duplicateControlManual, true);
  assert.equal(munnopor.magic.environmentalEnforcementManual, true);
  assert.equal(vapors.targeting.required, false);
  assert.equal(vapors.magic.initialCreationHasNoAttack, true);
  assert.equal(vapors.magic.laterAttackWithinMist, true);
  assert.equal(powers["possess-vehicle.json"].system.magic.controlRangePerRank, 20);
  assert.equal(powers["possess-vehicle.json"].system.magic.hellfireContactDamageMultiplier, "rank");
  assert.equal(powers["winds-of-watoomb.json"].system.magic.fogControllerCheck.defense, "ego");
});

test("Magic utility targeting enforces rank ranges and target counts", () => {
  const probability = powers["probability-manipulation-hex.json"];
  const vehicle = powers["possess-vehicle.json"];
  const probabilityLimits = resolveUtilityTargetLimits(probability, { rank: 4 });
  const vehicleLimits = resolveUtilityTargetLimits(vehicle, {});

  assert.deepEqual([probabilityLimits.minimum, probabilityLimits.maximum], [1, 1]);
  assert.equal(probability.system.targeting.range, 5);
  assert.equal(probability.system.targeting.rangeScaling, "rank");
  assert.deepEqual([vehicleLimits.minimum, vehicleLimits.maximum], [1, 1]);
  assert.equal(vehicle.system.magic.vehicleMutationManual, true);
});

test("Magic semantic aliases resolve to registered effects", async () => {
  const manifest = JSON.parse(await readFile(new URL("../assets/effects-manifest.json", import.meta.url), "utf8"));
  const aliases = {
    "magic.astral": "telepathy.astral",
    "magic.attack": "power.energy.blast",
    "magic.impact": "power.energy.impact",
    "magic.bind": "power.hellfire.bind",
    "magic.hex": "telepathy.command",
    "magic.mist": "power.magic.vapors.activation",
    "magic.portal": "movement.teleport",
    "magic.sense": "telepathy.sense",
    "magic.shield": "defense.shield",
  };

  for (const [alias, effect] of Object.entries(aliases)) {
    assert.equal(manifest.fallbacks[alias], effect, alias);
  }
});
