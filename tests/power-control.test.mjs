import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { resolveUtilityTargetLimits } = await import("../lib/services/utility-activation.mjs");
const { validateTargetPrerequisites } = await import("../lib/services/target-prerequisites.mjs");
const { parseFocusCost } = await import("../lib/focus-automation.mjs");

const directory = new URL("../packs/_source/powers/Power Control/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Power Control contains thirteen structured powers", () => {
  assert.equal(files.length, 13);
  for (const [file, power] of Object.entries(powers)) {
    assert.equal(typeof power.system.powerControl, "object", `${file}: missing Power Control rules`);
  }
});

test("copy and boost activations enforce target range and concentration", () => {
  const rankFour = { system: { attributes: { rank: { value: 4 } } } };
  const copyPower = powers["copy-power.json"];
  assert.deepEqual(
    [
      resolveUtilityTargetLimits(copyPower, rankFour).minimum,
      resolveUtilityTargetLimits(copyPower, rankFour).maximum,
    ],
    [1, 1],
  );
  assert.equal(copyPower.system.activation.range, 10);
  assert.equal(copyPower.system.activation.concentrationStatusIncludesSource, true);
  assert.equal(copyPower.system.cost, "5 Focus");
  assert.equal(
    copyPower.system.events[0].outcomes.some((outcome) => outcome.type === "active-effect" && outcome.duration?.type === "concentration"),
    true,
  );

  const cloneMoves = powers["clone-moves.json"];
  assert.equal(cloneMoves.system.activation.range, 10);
  assert.equal(cloneMoves.system.targeting.requiresLineOfSight, true);
  assert.equal(cloneMoves.system.powerControl.requiredOrigin, "Special Training");

  const bump = powers["bump-power.json"];
  assert.equal(bump.system.activation.range, 5);
  assert.deepEqual(parseFocusCost(bump.system.cost), {
    valid: true,
    type: "variable",
    minimum: 5,
    maximum: null,
    originalText: "5 or more Focus",
    confidence: "high",
  });
  assert.equal(powers["boost-powers.json"].system.powerControl.mode, "boost-all-powers");
  assert.equal(powers["clone-powers.json"].system.powerControl.mode, "clone-all-powers");
  assert.equal(powers["copy-ability.json"].system.activation.range, 10);
  assert.equal(powers["copy-trait.json"].system.activation.range, 10);
  for (const file of [
    "boost-powers.json",
    "bump-power.json",
    "clone-moves.json",
    "clone-powers.json",
    "copy-ability.json",
    "copy-power.json",
    "copy-trait.json",
  ]) {
    assert.equal(
      powers[file].system.events[0].outcomes.some((outcome) => outcome.type === "active-effect" && outcome.duration?.type === "concentration"),
      true,
      `${file}: concentration marker`,
    );
  }
});

test("attack workflows preserve Ego targeting, exact range, and no-damage rules", () => {
  const attacks = [
    ["dampen-power.json", 20, null],
    ["shut-down-powers.json", 20, null],
    ["steal-powers.json", 1, "grappled"],
    ["swipe-power.json", 1, "grappled"],
    ["swap-powers.json", 2, null],
  ];

  for (const [file, range, prerequisiteStatus] of attacks) {
    const system = powers[file].system;
    assert.equal(system.attack, true, `${file}: attack workflow`);
    assert.equal(system.ability, "ego", `${file}: Ego ability`);
    assert.equal(system.attackTarget, "ego", `${file}: Ego defense`);
    assert.equal(system.damage.enabled, false, `${file}: no Health damage`);
    assert.equal(system.targeting.range, range, `${file}: range`);
    assert.equal(system.targeting.defense, "ego", `${file}: targeting defense`);
    assert.equal(system.events.some((event) => event.trigger === "source-success"), true, `${file}: success outcome`);
    assert.equal(
      system.events.flatMap((event) => event.outcomes).some((outcome) => outcome.type === "active-effect" && outcome.duration?.type === "concentration"),
      true,
      `${file}: concentration lifecycle`,
    );
    if (prerequisiteStatus) {
      const prerequisites = system.targeting.prerequisites;
      assert.equal(validateTargetPrerequisites(prerequisites).valid, true, `${file}: target prerequisite schema`);
      assert.equal(prerequisites[0].value, prerequisiteStatus, `${file}: grabbed-target requirement`);
    }
  }

  assert.equal(powers["swap-powers.json"].system.targeting.rangeScaling, "rank");
  assert.equal(powers["steal-powers.json"].system.targeting.rangeScaling, "reach");
  assert.equal(powers["swipe-power.json"].name, "Swipe Power");
  assert.equal(parseFocusCost(powers["dampen-power.json"].system.cost).valid, false);
  assert.equal(powers["dampen-power.json"].system.events[0].outcomes[0].type, "manual");
});

test("Power Slider keeps its subjective shifts explicit", () => {
  const slider = powers["power-slider.json"].system.powerControl;
  assert.deepEqual(slider.criteria, ["confidence", "faith", "media-popularity", "narrator-approved"]);
  assert.equal(slider.requiresNarratorAdjudication, true);
  assert.equal(slider.boost.rangeAreaDurationMultiplier, 2);
  assert.equal(slider.boost.damageMultiplierBonus, 1);
  assert.equal(slider.dampen.rangeAreaDurationMultiplier, 0.5);
  assert.equal(slider.dampen.damageMultiplierPenalty, 1);
  assert.deepEqual(slider.duration, { combat: "one-combat", outsideCombat: "one-day" });
});

test("all Power Control events and effect-profile aliases validate", async () => {
  for (const [file, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${file}: ${JSON.stringify(validation.issues)}`);
  }

  const manifest = JSON.parse(await readFile(new URL("../assets/effects-manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.fallbacks["power.control.copy"], "telepathy.command");
  assert.equal(manifest.fallbacks["power.control.attack"], "telepathy.mental-impact");
});
