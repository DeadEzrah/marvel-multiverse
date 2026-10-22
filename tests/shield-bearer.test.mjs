import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { validatePowerEvents } = await import("../lib/services/power-events.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Shield Bearer/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const files = [
  "brace-for-impact.json",
  "do-this-all-day.json",
  "hurled-shield-bash.json",
  "hurled-shield-block.json",
  "hurled-shield-deflection.json",
  "immovable.json",
  "rico-shield.json",
  "shield-1.json",
  "shield-2.json",
  "shield-3.json",
  "shield-4.json",
  "shield-bash.json",
  "shield-deflection.json",
  "shield-wall.json",
];
const powers = Object.fromEntries(await Promise.all(
  files.map(async (fileName) => [fileName, await loadPower(fileName)])
));

test("Shield tiers grant exact concentration-owned Health Damage Reduction", () => {
  for (let tier = 1; tier <= 4; tier += 1) {
    const power = powers[`shield-${tier}.json`];
    const outcome = power.system.events[0].outcomes[0];
    assert.equal(power.system.numbered, tier);
    assert.equal(power.system.shieldBearer.tier, tier);
    assert.equal(power.system.shieldBearer.healthDamageReduction, tier);
    assert.equal(outcome.effect.changes[0].key, "system.healthDamageReduction");
    assert.equal(outcome.effect.changes[0].value, tier);
    assert.equal(outcome.duration.type, "concentration");
    assert.deepEqual(power.effects, []);
  }
  assert.equal(powers["shield-4.json"].system.prerequisites, "Shield 3, Rank 6");
});

test("Shield Bearer recovery and mitigation preserve variable Focus scaling", () => {
  const recovery = powers["do-this-all-day.json"];
  const brace = powers["brace-for-impact.json"];

  assert.equal(recovery.system.action, "Standard");
  assert.equal(recovery.system.cost, "5 or more Focus");
  assert.equal(recovery.system.focusScaling.benefitPerFocus, 2);
  assert.equal(recovery.system.events[0].outcomes[0].type, "healing");
  assert.equal(brace.system.activation.reactionType, "incoming-physical-damage");
  assert.equal(brace.system.focusScaling.benefitPerFocus, 1);
  assert.equal(brace.system.shieldBearer.physicalOnly, true);
});

test("shield attacks use exact targeting, damage, and Fantastic prone", () => {
  const bash = powers["shield-bash.json"];
  const hurled = powers["hurled-shield-bash.json"];
  const rico = powers["rico-shield.json"];

  assert.equal(bash.system.targeting.rangeScaling, "reach");
  assert.equal(bash.system.damage.doubleOnFantastic, true);
  assert.equal(hurled.system.targeting.range, 10);
  assert.equal(hurled.system.targeting.rangeScaling, "rank");
  assert.equal(hurled.system.damage.doubleOnFantastic, true);
  assert.equal(hurled.system.shieldBearer.returnsAtStartOfNextTurn, true);
  assert.equal(rico.system.damage.doubleOnFantastic, false);
  assert.equal(rico.system.shieldBearer.repeatWhileFantastic, true);
  assert.equal(rico.system.shieldBearer.rangeBetweenTargetsAddsToRoll, true);
  for (const power of [bash, hurled, rico]) {
    assert.equal(power.system.events[0].outcomes[0].statusId, "prone");
  }
});

test("Shield Deflection reactions apply one-use Trouble to the attacker", () => {
  for (const fileName of ["shield-deflection.json", "hurled-shield-deflection.json"]) {
    const power = powers[fileName];
    const outcome = power.system.events[0].outcomes[0];
    assert.equal(power.system.activation.maxTargets, 1);
    assert.equal(power.system.targeting.targetFilter, "enemies");
    assert.equal(outcome.type, "future-roll-modifier");
    assert.equal(outcome.mode, "trouble");
    assert.equal(outcome.matchSource, false);
    assert.equal(outcome.matchTarget, false);
  }
  assert.equal(powers["hurled-shield-deflection.json"].system.activation.rangePerRank, 5);
});

test("Hurled Shield Block derives temporary DR from the source Shield tier", () => {
  const block = powers["hurled-shield-block.json"];
  const outcome = block.system.events[0].outcomes[0];

  assert.equal(block.system.cost, "5 Focus");
  assert.equal(block.system.activation.maxTargets, 1);
  assert.equal(block.system.activation.rangePerRank, 5);
  assert.equal(block.system.targeting.targetFilter, "allies");
  assert.deepEqual(outcome.sourcePowerTier, {
    powerSet: "Shield Bearer",
    namePrefix: "Shield ",
  });
  assert.equal(outcome.effect.changes[0].value, "@sourcePowerTier");
  assert.equal(outcome.duration.type, "manual");
});

test("Immovable and Shield Wall retain their exact defensive boundaries", () => {
  const immovable = powers["immovable.json"];
  const wall = powers["shield-wall.json"];
  const modifier = wall.system.events[0].outcomes[0].effect.flags["marvel-multiverse"].defensiveRollModifier;

  assert.equal(immovable.system.shieldBearer.spacesPerMeleeDefense, 1);
  assert.equal(immovable.system.shieldBearer.preventsProneWhenReducedToZero, true);
  assert.equal(wall.system.action, "Movement");
  assert.equal(wall.system.shieldBearer.breakConcentrationOnMovementAction, true);
  assert.equal(modifier.mode, "trouble");
  assert.equal(modifier.requiresAttack, true);
  assert.equal(modifier.nonStacking, true);
  assert.equal(wall.system.events[0].outcomes[0].duration.type, "concentration");
});

test("all Shield Bearer events and semantic profiles are valid", () => {
  const profiles = new Set([
    "shield-bearer.guard",
    "shield-bearer.wall",
    "shield-bearer.recover",
    "shield-bearer.brace",
    "shield-bearer.deflect",
    "shield-bearer.bash",
    "shield-bearer.throw",
    "shield-bearer.impact",
    "shield-bearer.return",
    "melee.hit.heavy",
  ]);
  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${fileName}: ${profile}`);
    }
  }
});
