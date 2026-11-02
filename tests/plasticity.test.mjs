import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const {
  resolveUtilityTargetLimits,
} = await import("../lib/services/utility-activation.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { validateTargetPrerequisites } = await import("../lib/services/target-prerequisites.mjs");

const directory = new URL("../packs/_source/powers/Placticity/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Plasticity contains thirteen powers with structured family data", () => {
  assert.equal(files.length, 13);
  for (const [file, power] of Object.entries(powers)) {
    assert.equal(typeof power.system.plasticity, "object", `${file}: missing Plasticity data`);
  }
});

test("Body Sheet and Stilt Steps create reversible concentration effects", () => {
  const bodySheet = powers["body-sheet.json"];
  assert.equal(bodySheet.system.activation.concentrationStatusIncludesSource, true);
  assert.deepEqual(bodySheet.effects, []);
  const bodySheetEffect = bodySheet.system.events[0].outcomes.find((outcome) => outcome.type === "active-effect");
  assert.equal(bodySheetEffect.duration.type, "concentration");
  assert.equal(bodySheetEffect.effect.changes.find((change) => change.key === "system.healthDamageReduction").value, 3);
  assert.deepEqual(
    bodySheetEffect.effect.changes.filter((change) => change.key === "system.movement.glide.calc").map((change) => change.value),
    ["runspeed", 2],
  );

  const stiltSteps = powers["stilt-steps.json"];
  assert.deepEqual(stiltSteps.effects, []);
  const movementEffect = stiltSteps.system.events[0].outcomes.find((outcome) => outcome.type === "active-effect");
  assert.equal(movementEffect.duration.type, "concentration");
  assert.deepEqual(
    movementEffect.effect.changes.map(({ key, value }) => [key, value]),
    [["system.movement.run.calc", 2], ["system.movement.climb.calc", 2]],
  );
});

test("Body Sphere caps selected allies by Rank and tracks source and target protection", () => {
  const sphere = powers["body-sphere.json"];
  const actor = { system: { attributes: { rank: { value: 4 } } } };
  assert.equal(resolveUtilityTargetLimits(sphere, actor).minimum, 0);
  assert.equal(resolveUtilityTargetLimits(sphere, actor).maximum, 4);
  assert.equal(sphere.system.cost, "15 Focus");
  assert.equal(sphere.system.targeting.targetFilter, "allies");
  assert.equal(sphere.system.plasticity.alliesPerRank, 1);
  assert.equal(
    sphere.system.events.filter((event) => event.outcomes.some((outcome) => outcome.type === "active-effect")).length,
    2,
  );
  assert.equal(sphere.system.events[0].outcomes[0].duration.type, "concentration");
  assert.equal(sphere.system.events[1].outcomes[0].duration.type, "concentration");
  assert.equal(sphere.system.events[0].outcomes.some((outcome) => outcome.type === "manual"), true);
});

test("Bounce Back and Slip Free automate only canonical statuses", () => {
  const bounceBack = powers["bounce-back.json"];
  assert.equal(bounceBack.system.cost, "5 Focus");
  assert.equal(bounceBack.system.events[0].outcomes[0].type, "remove-status");
  assert.equal(bounceBack.system.events[0].outcomes[0].statusId, "prone");

  const slipFree = powers["slip-free.json"];
  assert.equal(slipFree.system.cost, "");
  assert.equal(slipFree.system.events[0].outcomes[0].type, "remove-status");
  assert.equal(slipFree.system.events[0].outcomes[0].statusId, "grappled");
  assert.equal(slipFree.system.events[0].outcomes[1].type, "manual");
});

test("Coiling Crush and Reverse Punch preserve exact targeting and outcomes", () => {
  const crush = powers["coiling-crush.json"];
  assert.equal(crush.system.targeting.rangeScaling, "reach");
  assert.equal(crush.system.targeting.prerequisites[0].type, "status");
  assert.equal(crush.system.targeting.prerequisites[0].value, "grappled");
  assert.equal(validateTargetPrerequisites(crush.system.targeting.prerequisites).valid, true);
  assert.deepEqual(
    [crush.system.damage.requiresFantastic, crush.system.damage.doubleOnFantastic],
    [true, false],
  );
  assert.equal(crush.system.events[0].outcomes[0].duration.type, "concentration");
  assert.equal(crush.system.events[1].outcomes[0].type, "manual");

  const punch = powers["reverse-punch.json"];
  assert.equal(punch.system.attackEdgeMode, "edge");
  assert.equal(punch.system.targeting.rangeScaling, "reach");
  assert.equal(punch.system.damage.doubleOnFantastic, true);
  assert.equal(punch.system.events[0].outcomes[0].statusId, "stunned");
  assert.equal(punch.system.events[0].outcomes[0].duration.value, 1);
});

test("passive Plasticity tiers retain exact modifiers and bounded utility targeting", () => {
  assert.equal(powers["extended-reach-1.json"].system.plasticity.reachMultiplier, 4);
  assert.equal(powers["extended-reach-2.json"].system.plasticity.reachMultiplier, 10);
  assert.equal(powers["flexible-bones-1.json"].system.plasticity.contortionAndEscapeEdge, 1);
  assert.equal(powers["flexible-bones-2.json"].system.plasticity.contortionAndEscapeEdge, 2);
  assert.equal(powers["flexible-bones-2.json"].effects[0]._id.trim(), powers["flexible-bones-2.json"].effects[0]._id);

  const rubberneck = powers["rubberneck.json"];
  assert.equal(rubberneck.system.targeting.rangeScaling, "reach");
  assert.equal(rubberneck.system.targeting.requiresLineOfSight, undefined);
  assert.equal(rubberneck.system.plasticity.tokenMovement, false);

  assert.equal(powers["flexible-fingers.json"].system.plasticity.automaticPhysicalKeyLockPicking, true);
});

test("Plasticity event schemas and semantic effect aliases are valid", async () => {
  for (const [file, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${file}: ${JSON.stringify(validation.issues)}`);
  }

  const manifest = JSON.parse(await readFile(new URL("../assets/effects-manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.fallbacks["plasticity.form"], "martial.stance.defense");
  assert.equal(manifest.fallbacks["plasticity.bounce"], "movement.landing.light");
  assert.equal(manifest.fallbacks["plasticity.crush"], "melee.slam");
  assert.equal(manifest.fallbacks["plasticity.punch"], "melee.punch");
  assert.equal(manifest.fallbacks["plasticity.movement"], "movement.whoosh");
});
