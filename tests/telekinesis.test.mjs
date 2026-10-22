import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { resolveTargetingConfig } = await import("../lib/services/action-roll.mjs");
const { resolveDamageConfig } = await import("../lib/services/damage-resolver.mjs");
const { parseFocusCost } = await import("../lib/focus-automation.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Telekinesis/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const files = [
  "group-levitation.json",
  "levitation.json",
  "telekenetic-attack.json",
  "telekenetic-barrier.json",
  "telekenetic-crush.json",
  "telekenetic-grab.json",
  "telekenetic-manipulation.json",
  "telekenetic-protection-1.json",
  "telekenetic-protection-2.json",
  "telekenetic-protection-3.json",
  "telekenetic-protection-4.json",
  "telekenetic-reinforcement.json",
  "telekenetic-sphere.json",
  "telekenetic-toss.json",
];
const powers = Object.fromEntries(await Promise.all(
  files.map(async (fileName) => [fileName, await loadPower(fileName)])
));

test("Levitation activates Flight at Run Speed and Group Levitation scales exactly", () => {
  const changes = powers["levitation.json"].effects[0].changes;
  assert.equal(changes.find((change) => change.key.endsWith(".active")).value, true);
  assert.equal(changes.find((change) => change.key.endsWith(".calc")).value, "runspeed");

  const group = powers["group-levitation.json"];
  assert.equal(group.system.activation.maxTargetsPerRank, 1);
  assert.equal(group.system.targeting.range, 5);
  assert.equal(group.system.targeting.rangeScaling, "rank");
  assert.equal(group.system.events[0].outcomes[0].duration.type, "concentration");
});

test("Telekinetic Attack uses exact range, damage, and Fantastic stun", () => {
  const power = powers["telekenetic-attack.json"];
  const targeting = resolveTargetingConfig(power);
  const damage = resolveDamageConfig(power);

  assert.equal(targeting.range, 5);
  assert.equal(power.system.targeting.rangeScaling, "rank");
  assert.equal(targeting.defense, "mle");
  assert.equal(damage.enabled, true);
  assert.equal(damage.doubleOnFantastic, true);
  assert.equal(power.system.events[0].outcomes[0].statusId, "stunned");
});

test("Telekinetic Barrier requires line of sight and never deals automatic damage", () => {
  const power = powers["telekenetic-barrier.json"];
  assert.equal(power.system.targeting.area.requiresLineOfSight, true);
  assert.equal(power.system.targeting.area.distance, 2);
  assert.equal(power.system.targeting.area.distanceScaling, "rank");
  assert.equal(resolveDamageConfig(power).enabled, false);
  assert.equal(power.system.events.some((event) => event.id === "telekinetic-barrier-durability"), true);
});

test("Telekinetic Crush requires a grabbed target and pins on a Fantastic hit", () => {
  const power = powers["telekenetic-crush.json"];
  assert.equal(power.system.targeting.prerequisites[0].value, "grappled");
  assert.equal(power.system.targeting.rangeScaling, "reach");
  assert.equal(resolveDamageConfig(power).doubleOnFantastic, true);
  assert.equal(power.system.events[0].outcomes[0].statusId, "restrained");
});

test("Telekinetic Grab cannot deal damage and owns its restrained statuses", () => {
  const power = powers["telekenetic-grab.json"];
  assert.equal(resolveDamageConfig(power).enabled, false);
  assert.deepEqual(power.system.escape.removesStatuses, ["grappled", "restrained"]);
  assert.equal(power.system.escape.targetNumber, 20);
  assert.deepEqual(
    power.system.events.map((event) => event.outcomes[0].statusId),
    ["grappled", "restrained"],
  );
  assert.equal(power.system.events.every((event) => event.outcomes[0].duration.type === "concentration"), true);
});

test("Telekinetic Protection tiers preserve exact all-or-nothing thresholds", () => {
  for (let tier = 1; tier <= 4; tier += 1) {
    const power = powers[`telekenetic-protection-${tier}.json`];
    const threshold = tier * 10;
    const marker = power.system.events[0].outcomes[0];
    assert.equal(power.system.telekinesis.damageThreshold, threshold);
    assert.equal(marker.effect.flags["marvel-multiverse"].telekineticProtection.threshold, threshold);
    assert.equal(marker.duration.type, "concentration");
  }
});

test("Reinforcement and Sphere expose variable protection contracts", () => {
  const reinforcement = powers["telekenetic-reinforcement.json"];
  const sphere = powers["telekenetic-sphere.json"];
  assert.equal(parseFocusCost(reinforcement.system.cost).type, "variable");
  assert.equal(parseFocusCost(sphere.system.cost).type, "variable");
  assert.equal(reinforcement.system.targeting.prerequisites[0].value, "telekineticProtection");
  assert.equal(sphere.system.targeting.area.shape, "circle");
  assert.equal(sphere.system.targeting.area.origin, "source");
  assert.equal(sphere.system.targeting.area.distanceScaling, "rank");
  assert.equal(resolveDamageConfig(sphere).requiresFantastic, true);
});

test("Telekinetic Toss avoids incorrect single-target automatic damage", () => {
  const power = powers["telekenetic-toss.json"];
  assert.equal(resolveDamageConfig(power).enabled, false);
  assert.equal(power.system.telekinesis.thrownCharacterTakesRegularDamageOnFailure, true);
  assert.equal(power.system.telekinesis.collisionTargetTakesRegularDamageOnSuccess, true);
  assert.equal(power.system.events.some((event) => event.trigger === "after-roll"), true);
  assert.equal(power.system.events[0].outcomes[0].statusId, "prone");
});

test("all Telekinesis events and semantic profiles are valid", () => {
  const profiles = new Set([
    "defense.telekinetic.wall",
    "telekinesis.lift",
    "telekinesis.attack",
    "telekinesis.impact",
    "telekinesis.crush",
    "telekinesis.grab",
    "telekinesis.manipulate",
    "telekinesis.protection",
    "telekinesis.sphere",
    "telekinesis.toss",
  ]);
  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${fileName}: ${profile}`);
    }
  }
});
