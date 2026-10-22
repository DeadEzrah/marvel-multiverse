import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { buildActionRollRequest, resolveTargetingConfig } = await import("../lib/services/action-roll.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { resolveUtilityFocusAmount } = await import("../lib/services/utility-activation.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Healing/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const powers = Object.fromEntries(await Promise.all([
  "cure-all.json",
  "healing-hands.json",
  "lets-go.json",
  "never-surrender.json",
  "restore.json",
  "resurrect.json",
  "soothing-touch.json",
].map(async (fileName) => [fileName, await loadPower(fileName)])));

test("Healing utilities use exact touch targeting and Focus restoration formulas", async () => {
  const healer = { system: { focus: { value: 50 } } };
  const healingHands = powers["healing-hands.json"];
  const soothingTouch = powers["soothing-touch.json"];

  for (const power of [healingHands, soothingTouch]) {
    const targeting = resolveTargetingConfig(power);
    assert.equal(power.system.activation.mode, "utility");
    assert.equal(power.system.activation.target, "required");
    assert.equal(targeting.count, 1);
    assert.equal(power.system.targeting.rangeScaling, "reach");
    assert.equal(targeting.includeSelf, true);
    assert.deepEqual(await resolveUtilityFocusAmount(power, healer, 17), {
      success: true,
      amount: 17,
    });
  }

  assert.equal(healingHands.system.events[0].outcomes[0].amount, 10);
  assert.equal(
    soothingTouch.system.events[0].outcomes[0].formula,
    "@powerEvent.focusSpent"
  );
});

test("Let's Go and Never Surrender encode concentration resource guards", () => {
  const expected = {
    "lets-go.json": {
      kind: "lets-go",
      resource: "health",
      statusOnEnd: "unconscious",
      movementOnly: true,
    },
    "never-surrender.json": {
      kind: "never-surrender",
      resource: "focus",
      statusOnEnd: "demoralized",
      preventFocusSpend: true,
    },
  };

  for (const [fileName, subset] of Object.entries(expected)) {
    const power = powers[fileName];
    const effect = power.system.events[0].outcomes.find((outcome) => outcome.type === "active-effect");
    const metadata = effect.effect.flags["marvel-multiverse"].healingSupport;
    assert.equal(effect.duration.type, "concentration", fileName);
    assert.equal(metadata.endWhenAbove, 0, fileName);
    for (const [key, value] of Object.entries(subset)) {
      assert.equal(metadata[key], value, `${fileName}: ${key}`);
    }
  }
});

test("Cure-All uses Ego TN 12 and removes every listed acute condition", () => {
  const cureAll = powers["cure-all.json"];
  const target = {
    documentName: "Actor",
    uuid: "Actor.patient",
    name: "Patient",
  };
  const request = buildActionRollRequest({
    actor: { system: { abilities: { ego: { value: 4 } } } },
    source: cureAll,
    targets: [target],
  });
  const removedStatuses = cureAll.system.events[0].outcomes
    .filter((outcome) => outcome.type === "remove-status")
    .map((outcome) => outcome.statusId);

  assert.equal(request.ability, "ego");
  assert.equal(request.targetNumber, 12);
  assert.equal(request.dealsDamage, false);
  assert.deepEqual(removedStatuses, [
    "ablaze",
    "bleeding",
    "blinded",
    "corroding",
    "deafened",
    "demoralized",
    "paralyzed",
    "poisoned",
    "unconscious",
  ]);
  assert.equal(cureAll.system.events[3].trigger, "source-fantastic-success");
});

test("Restore and Resurrect preserve ordinary, Fantastic, and source costs", () => {
  const restore = powers["restore.json"];
  const resurrect = powers["resurrect.json"];

  assert.equal(restore.system.targetNumber, 20);
  assert.equal(resurrect.system.targetNumber, 10);
  assert.equal(restore.system.events[0].outcomes[0].formula, "1 - @focus.value");
  assert.equal(restore.system.events[2].outcomes[0].formula, "@focus.max");
  assert.equal(resurrect.system.events[0].outcomes[0].formula, "1 - @health.value");
  assert.equal(resurrect.system.events[2].outcomes[0].formula, "@health.max");
  assert.equal(resurrect.system.events[3].outcomes[0].formula, "@powerEvent.focusSpent - 20");
  assert.equal(resurrect.system.events[4].outcomes[0].type, "manual");
});

test("all Healing events and semantic profiles are valid", () => {
  const profileIds = new Set([
    "power.healing.target",
    "healing.focus",
    "healing.cure",
    "healing.sustain",
    "healing.restore",
    "healing.resurrect",
  ]);

  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    for (const profileId of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profileIds.has(profileId), true, `${fileName}: ${profileId}`);
    }
  }
});
