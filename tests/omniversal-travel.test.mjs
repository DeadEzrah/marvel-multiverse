import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { parseFocusCost } = await import("../lib/focus-automation.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const {
  resolveUtilityFocusAmount,
  resolveUtilityTargetLimits,
} = await import("../lib/services/utility-activation.mjs");
const { validateTargetPrerequisites } = await import("../lib/services/target-prerequisites.mjs");

const directory = new URL("../packs/_source/powers/Omniversal Travel/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Omniversal Travel contains sixteen structured powers", () => {
  assert.equal(files.length, 16);
  for (const [file, power] of Object.entries(powers)) {
    assert.equal(typeof power.system.omniversalTravel, "object", `${file}: family metadata`);
    assert.equal(validatePowerEvents(power.system.events).valid, true, `${file}: event schema`);
  }
});

test("self travel utilities preserve scope and Narrator-owned placement", () => {
  for (const [file, scope] of [
    ["dimensional-travel.json", "dimension"],
    ["multiversal-travel.json", "universe"],
    ["time-travel.json", "time"],
  ]) {
    const power = powers[file];
    assert.equal(power.system.activation.target, "none", `${file}: self activation`);
    assert.equal(power.system.cost, "10 Focus", `${file}: Focus cost`);
    assert.equal(power.system.omniversalTravel.mode, "self", `${file}: mode`);
    assert.equal(power.system.omniversalTravel.scope, scope, `${file}: scope`);
    assert.equal(power.system.omniversalTravel.crossSceneMovementManual, true, `${file}: safe placement boundary`);
    assert.equal(power.system.effectProfiles.activation, "omniversal.travel", `${file}: effect profile`);
  }

  assert.equal(powers["time-travel.json"].system.action, "Standard or movement");
  assert.equal(powers["time-travel.json"].system.trigger, "");
});

test("together travel requires one touched target without guessing willingness", () => {
  const rankThree = { system: { attributes: { rank: { value: 3 } } } };
  for (const file of [
    "dimensional-travel-together.json",
    "multiversal-travel-together.json",
    "time-travel-together.json",
  ]) {
    const power = powers[file];
    const limits = resolveUtilityTargetLimits(power, rankThree);
    assert.deepEqual([limits.minimum, limits.maximum], [1, 1], `${file}: target limits`);
    assert.equal(power.system.targeting.range, 1, `${file}: Reach range`);
    assert.equal(power.system.targeting.rangeScaling, "reach", `${file}: Reach scaling`);
    assert.equal(power.system.omniversalTravel.unwillingTargetMustBeGrabbed, true, `${file}: willingness boundary`);
  }
});

test("other travel uses a grabbed-target Ego attack without damage", () => {
  for (const file of [
    "dimensional-travel-other.json",
    "multiversal-travel-other.json",
    "time-travel-other.json",
  ]) {
    const system = powers[file].system;
    assert.equal(system.attack, true, `${file}: attack workflow`);
    assert.equal(system.ability, "ego", `${file}: ability`);
    assert.equal(system.attackTarget, "vig", `${file}: defense`);
    assert.equal(system.damage.enabled, false, `${file}: no damage`);
    assert.equal(system.targeting.rangeScaling, "reach", `${file}: Reach scaling`);
    assert.equal(validateTargetPrerequisites(system.targeting.prerequisites).valid, true, `${file}: prerequisite schema`);
    assert.equal(system.targeting.prerequisites[0].value, "grappled", `${file}: grabbed target`);
    assert.equal(system.events[0].trigger, "target-hit", `${file}: successful travel only`);
  }
});

test("portals create concentration-owned source markers", () => {
  for (const file of ["dimensional-portal.json", "multiversal-portal.json", "time-portal.json"]) {
    const system = powers[file].system;
    const marker = system.events[0].outcomes.find((outcome) => outcome.type === "active-effect");
    assert.equal(system.activation.target, "none", `${file}: no selected target`);
    assert.equal(system.cost, "15 Focus", `${file}: Focus cost`);
    assert.equal(system.omniversalTravel.bidirectional, true, `${file}: bidirectional`);
    assert.equal(marker.duration.type, "concentration", `${file}: concentration marker`);
    assert.equal(system.effectProfiles.activation, "omniversal.portal", `${file}: portal effect`);
  }
});

test("Time-Out powers accept prepaid fifteen-Focus round blocks", async () => {
  const actor = {
    system: {
      attributes: { rank: { value: 3 } },
      focus: { value: 100 },
    },
  };

  for (const file of ["time-out.json", "time-out-bubble.json", "time-out-tag.json"]) {
    assert.deepEqual(parseFocusCost(powers[file].system.cost), {
      valid: true,
      type: "variable",
      minimum: 15,
      maximum: null,
      step: 15,
      cadence: "round",
      originalText: powers[file].system.cost,
      confidence: "high",
    }, `${file}: per-round Focus parser`);
  }

  assert.deepEqual(
    [
      resolveUtilityTargetLimits(powers["time-out.json"], actor).minimum,
      resolveUtilityTargetLimits(powers["time-out.json"], actor).maximum,
    ],
    [0, 0],
  );
  assert.deepEqual(
    [
      resolveUtilityTargetLimits(powers["time-out-bubble.json"], actor).minimum,
      resolveUtilityTargetLimits(powers["time-out-bubble.json"], actor).maximum,
    ],
    [0, 3],
  );
  assert.deepEqual(
    [
      resolveUtilityTargetLimits(powers["time-out-tag.json"], actor).minimum,
      resolveUtilityTargetLimits(powers["time-out-tag.json"], actor).maximum,
    ],
    [1, 1],
  );

  assert.deepEqual(
    await resolveUtilityFocusAmount(powers["time-out.json"], actor, 30),
    { success: true, amount: 30 },
  );
  assert.deepEqual(
    await resolveUtilityFocusAmount(powers["time-out.json"], actor, 20),
    { success: false, reason: "invalid-focus-amount" },
  );
});

test("Instant Replay preserves its once-per-battle manual reroll boundary", () => {
  const replay = powers["instant-replay.json"].system;
  assert.equal(replay.activation.target, "none");
  assert.equal(replay.omniversalTravel.usesPerBattle, 1);
  assert.equal(replay.omniversalTravel.replacesOriginalCheck, true);
  assert.equal(replay.omniversalTravel.rerollManual, true);
});

test("Omniversal semantic aliases reuse verified travel effects", async () => {
  const manifest = JSON.parse(await readFile(new URL("../assets/effects-manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.fallbacks["omniversal.travel"], "movement.teleport");
  assert.equal(manifest.fallbacks["omniversal.portal"], "movement.teleport");
  assert.equal(manifest.fallbacks["omniversal.time"], "movement.superspeed");
});
