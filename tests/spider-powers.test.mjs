import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { validatePowerEvents } = await import("../lib/services/power-events.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Spider-Powers/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const files = [
  "jump-1.json", "jump-2.json", "jump-3.json", "razorwebs.json", "repulse.json",
  "spider-dodge.json", "spider-pheromones.json", "spider-sense.json", "spider-strike.json",
  "stick-around.json", "venom-bash.json", "venom-blast.json", "venom-burst.json",
  "venom-sword.json", "wallcrawling.json", "webcasting.json", "webgliding.json",
  "webgrabbing.json", "webslinging.json", "webtrapping.json",
];
const powers = Object.fromEntries(await Promise.all(
  files.map(async (fileName) => [fileName, await loadPower(fileName)])
));

test("Spider movement powers use exact Run Speed calculations", () => {
  assert.equal(powers["jump-1.json"].effects[0].changes[1].value, "runspeed");
  assert.equal(powers["jump-2.json"].effects[0].changes[1].value, "rank-runspeed");
  assert.equal(powers["jump-2.json"].effects[0].changes[2].value, 3);
  assert.equal(powers["jump-3.json"].effects[0].changes[1].value, "rank-runspeed");
  assert.equal(powers["jump-3.json"].effects[0].changes[2].value, 50);
  assert.equal(powers["webgliding.json"].effects[0].changes[1].value, "double-runspeed");
  assert.equal(powers["webslinging.json"].effects[0].changes[1].value, "triple-runspeed");
  assert.equal(powers["wallcrawling.json"].effects[0].changes[0].value, "runspeed");
});

test("web attacks preserve exact damage and condition contracts", () => {
  const cast = powers["webcasting.json"];
  const grab = powers["webgrabbing.json"];
  const razor = powers["razorwebs.json"];

  assert.equal(cast.system.damage.enabled, false);
  assert.equal(cast.system.events[1].outcomes[0].statusId, "restrained");
  assert.equal(cast.system.escape.targetNumber, 20);
  assert.equal(grab.system.damage.enabled, false);
  assert.equal(grab.system.events[0].outcomes[0].statusId, "grappled");
  assert.equal(grab.system.spiderPowers.fantasticPinnedOptional, true);
  assert.equal(razor.system.damage.doubleOnFantastic, false);
  assert.equal(razor.system.events[0].outcomes[0].statusId, "bleeding");
});

test("Spider-Strike supports one or two targets and half/full damage", () => {
  const strike = powers["spider-strike.json"];
  assert.equal(strike.system.targeting.minCount, 1);
  assert.equal(strike.system.targeting.count, 2);
  assert.equal(strike.system.damage.scale, 0.5);
  assert.equal(strike.system.damage.doubleOnFantastic, true);
  assert.equal(strike.system.events[0].outcomes[0].statusId, "paralyzed");
  assert.equal(strike.system.escape.targetNumber, 20);
});

test("Venom attacks preserve damage-gated stun and concentration sword", () => {
  for (const fileName of ["venom-bash.json", "venom-blast.json"]) {
    const power = powers[fileName];
    assert.equal(power.system.damage.doubleOnFantastic, true);
    assert.equal(power.system.events[0].trigger, "health-damage-applied");
    assert.equal(power.system.events[0].requirements[0].type, "target-fantastic-hit");
  }
  const burst = powers["venom-burst.json"];
  assert.equal(burst.system.damage.requiresFantastic, true);
  assert.equal(burst.system.damage.scale, 0.25);
  const sword = powers["venom-sword.json"];
  assert.equal(sword.system.spiderPowers.meleeDamageMultiplierBonus, 2);
  assert.equal(sword.system.spiderPowers.focusUpkeepPerRound, 5);
  assert.equal(sword.system.events[0].outcomes[0].duration.type, "concentration");
});

test("Spider reactions and permanent sense modifiers are scoped safely", () => {
  const dodge = powers["spider-dodge.json"];
  const modifier = dodge.system.events[0].outcomes[0];
  assert.equal(modifier.type, "future-roll-modifier");
  assert.equal(modifier.mode, "trouble");
  assert.equal(modifier.matchSource, false);
  const sense = powers["spider-sense.json"];
  const defensive = sense.effects[0].flags["marvel-multiverse"].defensiveRollModifier;
  assert.equal(defensive.mode, "trouble");
  assert.deepEqual(defensive.defenses, ["vig"]);
  assert.equal(sense.system.spiderPowers.agilityDefenseBonus, 2);
});

test("creative and persistent powers expose exact manual boundaries", () => {
  assert.equal(powers["repulse.json"].system.spiderPowers.resistTargetNumber, 16);
  assert.equal(powers["repulse.json"].system.spiderPowers.jumpBonusPerRank, 1);
  assert.equal(powers["stick-around.json"].system.spiderPowers.escapeTargetNumber, 16);
  assert.equal(powers["webtrapping.json"].system.spiderPowers.entryCheckTargetNumber, 20);
  assert.equal(powers["webtrapping.json"].system.spiderPowers.durationMinutesPerRank, 15);
  assert.equal(powers["spider-pheromones.json"].system.spiderPowers.circumstanceManual, true);
});

test("all Spider-Powers events and semantic profiles are valid", () => {
  const profiles = new Set([
    "spider.web-attack", "spider.web-impact", "spider.web-area", "spider.strike",
    "spider.venom-melee", "spider.venom-ranged", "spider.venom-impact",
    "spider.venom-burst", "spider.venom-sword", "spider.repulse", "spider.dodge",
    "spider.pheromones",
  ]);
  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${fileName}: ${profile}`);
    }
  }
});
