import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { validatePowerEvents } = await import("../lib/services/power-events.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Resize/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const files = [
  "grow-1.json",
  "grow-2.json",
  "grow-3.json",
  "grow-4.json",
  "growing-attack.json",
  "macrodimensional-travel.json",
  "microdimensional-travel.json",
  "resize-object.json",
  "resize-other.json",
  "shrink-1.json",
  "shrink-2.json",
  "shrink-3.json",
  "shrink-4.json",
  "shrinking-dodge.json",
];
const powers = Object.fromEntries(await Promise.all(
  files.map(async (fileName) => [fileName, await loadPower(fileName)])
));

test("Grow tiers expose exact maximum sizes and combat modifiers", () => {
  const expected = [
    { size: "huge", defense: -2, run: 5, reach: 5, damage: 2 },
    { size: "gigantic", defense: -3, run: 20, reach: 20, damage: 4 },
    { size: "titanic", defense: -4, run: 80, reach: 80, damage: 6 },
    { size: "gargantuan", defense: -5, run: 320, reach: 320, damage: 8 },
  ];

  expected.forEach((entry, index) => {
    const power = powers[`grow-${index + 1}.json`];
    assert.equal(power.system.resize.maximumSize, entry.size);
    assert.equal(power.system.resize.defenseModifier, entry.defense);
    assert.equal(power.system.resize.runSpeedMultiplier, entry.run);
    assert.equal(power.system.resize.reach, entry.reach);
    assert.equal(power.system.resize.meleeDamageMultiplierBonus, entry.damage);
    assert.equal(power.system.events[0].outcomes[0].effect.changes[0].value, entry.size);
  });
  assert.equal(powers["grow-2.json"].system.prerequisites, "Grow 1");
  assert.match(powers["grow-2.json"].system.effect, /gigantic/i);
});

test("Shrink tiers expose exact minimum sizes and defenses", () => {
  const expected = [
    { size: "little", defense: 2, damage: 0.25 },
    { size: "tiny", defense: 3, damage: 0 },
    { size: "miniature", defense: 4, damage: 0 },
    { size: "microscopic", defense: 5, damage: 0 },
  ];

  expected.forEach((entry, index) => {
    const power = powers[`shrink-${index + 1}.json`];
    assert.equal(power.system.resize.minimumSize, entry.size);
    assert.equal(power.system.resize.defenseModifier, entry.defense);
    assert.equal(power.system.resize.damageMultiplier, entry.damage);
    assert.equal(power.system.events[0].outcomes[0].effect.changes[0].value, entry.size);
  });
});

test("Growing Attack preserves attack automation and destination-size damage", () => {
  const power = powers["growing-attack.json"];

  assert.equal(power.system.cost, "5 Focus");
  assert.equal(power.system.attack, true);
  assert.equal(power.system.attackEdgeMode, "edge");
  assert.equal(power.system.targeting.count, 1);
  assert.equal(power.system.resize.damageUsesDestinationSize, true);
  assert.equal(power.system.resize.fantasticDamageMultiplier, 2);
  assert.equal(power.system.events[0].outcomes[0].statusId, "stunned");
});

test("Shrinking Dodge gives one Trouble to the selected triggering attacker", () => {
  const power = powers["shrinking-dodge.json"];
  const outcome = power.system.events[0].outcomes[0];

  assert.equal(power.system.cost, "5 Focus");
  assert.equal(power.system.activation.maxTargets, 1);
  assert.equal(power.system.targeting.targetFilter, "enemies");
  assert.equal(outcome.type, "future-roll-modifier");
  assert.equal(outcome.mode, "trouble");
  assert.equal(outcome.matchSource, false);
  assert.equal(outcome.matchTarget, false);
});

test("Resize Other and Resize Object preserve safe manual boundaries", () => {
  const object = powers["resize-object.json"];
  const other = powers["resize-other.json"];

  assert.equal(object.system.prerequisites, "Grow 2 or Shrink 2, Rank 3");
  assert.equal(object.system.range, "Reach");
  assert.equal(object.system.resize.objectSelectionManual, true);
  assert.equal(other.system.prerequisites, "Grow 2 or Shrink 2, Rank 3");
  assert.equal(other.system.activation.maxTargets, 1);
  assert.equal(other.system.resize.unwillingTargetRequiresStatus, "grappled");
  assert.equal(other.system.resize.sizeChoiceManual, true);
});

test("dimension travel and every Resize event/profile are valid", () => {
  assert.equal(powers["macrodimensional-travel.json"].system.resize.direction, "macro");
  assert.equal(powers["microdimensional-travel.json"].system.resize.direction, "micro");
  assert.equal(powers["microdimensional-travel.json"].system.description, "The character shrinks out of the universe.");

  const profiles = new Set([
    "resize.grow",
    "resize.shrink",
    "resize.growing-attack",
    "resize.other",
    "resize.dimension-travel",
  ]);
  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${fileName}: ${profile}`);
    }
  }
});
