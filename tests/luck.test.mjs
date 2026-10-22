import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { resolveTargetingConfig } = await import("../lib/services/action-roll.mjs");
const { parseFocusCost } = await import("../lib/focus-automation.mjs");
const {
  resolveConcentrationMaintenance,
  validatePowerEvents,
} = await import("../lib/services/power-events.mjs");
const { resolveUtilityTargetLimits } = await import("../lib/services/utility-activation.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Luck/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const fileNames = [
  "charmed-life.json",
  "evil-eye.json",
  "jinx-you-all.json",
  "jinx-you.json",
  "lucky-me.json",
  "lucky-us.json",
  "lucky-you.json",
  "real-jinx.json",
  "wish-you-luck.json",
];

const powers = Object.fromEntries(await Promise.all(
  fileNames.map(async (fileName) => [fileName, await loadPower(fileName)])
));

test("Luck concentration powers preserve exact activation and upkeep costs", () => {
  const expectedCosts = {
    "evil-eye.json": 5,
    "jinx-you-all.json": 10,
    "jinx-you.json": 5,
    "lucky-me.json": 3,
    "lucky-us.json": 10,
    "lucky-you.json": 5,
    "wish-you-luck.json": 5,
  };

  for (const [fileName, amount] of Object.entries(expectedCosts)) {
    const power = powers[fileName];
    const cost = parseFocusCost(power.system.cost);
    assert.deepEqual(
      { valid: cost.valid, value: cost.value, cadence: cost.cadence },
      { valid: true, value: amount, cadence: "turn" },
      fileName
    );
    const concentrationOutcomes = power.system.events
      .flatMap((event) => event.outcomes)
      .filter((outcome) => outcome.duration?.type === "concentration");
    assert.ok(concentrationOutcomes.length > 0, fileName);
    assert.deepEqual(resolveConcentrationMaintenance(power), {
      resource: "focus",
      amount,
      cadence: "turn",
    }, fileName);
  }
});

test("rank-scaled Luck powers enforce line of sight, allegiance, range, and target caps", () => {
  const cases = {
    "evil-eye.json": { filter: "enemies", count: 1 },
    "jinx-you-all.json": { filter: "enemies", count: 4 },
    "lucky-us.json": { filter: "allies", count: 4 },
    "wish-you-luck.json": { filter: "allies", count: 1 },
  };

  for (const [fileName, expected] of Object.entries(cases)) {
    const power = { ...powers[fileName], actor: { system: { attributes: { rank: { value: 4 } } } } };
    const targeting = resolveTargetingConfig(power);
    assert.equal(targeting.count, expected.count, fileName);
    assert.equal(targeting.range, 20, fileName);
    assert.equal(targeting.requiresLineOfSight, true, fileName);
    assert.equal(targeting.targetFilter, expected.filter, fileName);
    const limits = resolveUtilityTargetLimits(power, power.actor);
    assert.equal(limits.maximum, expected.count, `${fileName}: utility maximum`);
    assert.equal(limits.minimum, 1, `${fileName}: utility minimum`);
  }
});

test("Jinx You is a touch attack with Fantastic-only non-doubled damage", () => {
  const power = powers["jinx-you.json"];

  assert.equal(power.system.ability, "mle");
  assert.equal(power.system.attackTarget, "agl");
  assert.equal(power.system.targeting.rangeScaling, "reach");
  assert.equal(power.system.targeting.targetFilter, "enemies");
  assert.equal(power.system.damage.requiresFantastic, true);
  assert.equal(power.system.damage.doubleOnFantastic, false);
  assert.equal(power.system.events[0].trigger, "target-hit");
});

test("Charmed Life and Real Jinx use permanent non-stacking transferred effects", () => {
  const charmed = powers["charmed-life.json"].effects[0];
  const realJinx = powers["real-jinx.json"].effects[0];
  const charmedModifier = charmed.flags["marvel-multiverse"].actionRollModifier;
  const realJinxModifier = realJinx.flags["marvel-multiverse"].defensiveRollModifier;

  assert.equal(charmed.transfer, true);
  assert.equal(charmedModifier.mode, "edge");
  assert.equal(charmedModifier.selection, "optional");
  assert.equal(charmedModifier.oncePerRound, true);
  assert.equal(charmedModifier.nonStacking, true);
  assert.equal(realJinx.transfer, true);
  assert.equal(realJinxModifier.mode, "trouble");
  assert.equal(realJinxModifier.requiresAttack, true);
  assert.equal(realJinxModifier.nonStacking, true);
});

test("all Luck events and semantic profiles are valid", () => {
  const profileIds = new Set(["luck.good", "luck.jinx", "melee.miss"]);

  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    for (const profileId of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profileIds.has(profileId), true, `${fileName}: ${profileId}`);
    }
  }
});
