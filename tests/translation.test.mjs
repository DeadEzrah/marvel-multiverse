import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  buildActionRollRequest,
  resolveItemSelectableRollModifiers,
} = await import("../lib/services/action-roll.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const {
  evaluateTargetPrerequisites,
  validateTargetPrerequisites,
} = await import("../lib/services/target-prerequisites.mjs");

async function loadPower(family, fileName) {
  const url = new URL(`../packs/_source/powers/${family}/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const translationFiles = [
  "detect-lie.json",
  "indecipherable.json",
  "understand-body-language.json",
  "understand-code.json",
  "understand-sign-language.json",
  "understand-spoken-language.json",
  "understand-unusual-commuication.json",
  "understand-written-language.json",
];

const powers = Object.fromEntries(await Promise.all(
  translationFiles.map(async (fileName) => [fileName, await loadPower("Translation", fileName)])
));
const mindReading = await loadPower("Telepathy", "mind-reading.json");
const mindInterrogation = await loadPower("Telepathy", "mind-interrogation.json");

test("six Translation comprehension powers use Logic TN 13 and optional related-language Edge", () => {
  const comprehensionFiles = translationFiles.filter((fileName) => fileName.startsWith("understand-"));

  for (const fileName of comprehensionFiles) {
    const power = powers[fileName];
    const request = buildActionRollRequest({
      actor: { system: { abilities: { log: { value: 4 } } }, items: [], effects: [] },
      source: power,
    });
    const modifiers = resolveItemSelectableRollModifiers(power);

    assert.equal(request.ability, "log", fileName);
    assert.equal(request.targetNumber, 13, fileName);
    assert.equal(request.dealsDamage, false, fileName);
    assert.equal(request.edge, 0, fileName);
    assert.equal(modifiers.length, 1, fileName);
    assert.equal(modifiers[0].mode, "edge", fileName);
    assert.equal(modifiers[0].selection, "optional", fileName);
    assert.equal(modifiers[0].selected, false, fileName);
    assert.equal(power.system.translation.permanentOnFantastic, true, fileName);
  }
});

test("Understand Written Language has its own corrected identity", () => {
  const written = powers["understand-written-language.json"];

  assert.equal(written._id, "0vQFCyPuXbDXZB3w");
  assert.equal(written.name, "Understand Written Language");
  assert.equal(written.system.translation.kind, "written-language");
});

test("Detect Lie is a non-damaging Ego attack with exact Focus cost and outcomes", () => {
  const detectLie = powers["detect-lie.json"];
  const targetActor = {
    uuid: "Actor.communicator",
    name: "Communicator",
    system: { abilities: { ego: { defense: 15 } } },
  };
  const request = buildActionRollRequest({
    actor: { system: { abilities: { ego: { value: 5 } } }, items: [], effects: [] },
    source: detectLie,
    targets: [{ actor: targetActor }],
  });

  assert.equal(request.ability, "ego");
  assert.equal(request.targeting.defense, "ego");
  assert.equal(request.targetNumber, 15);
  assert.equal(request.dealsDamage, false);
  assert.equal(detectLie.system.cost, "5 Focus");
  assert.deepEqual(detectLie.system.events.map((event) => event.trigger), [
    "target-hit",
    "target-fantastic-hit",
  ]);
});

test("Indecipherable blocks language-dependent telepathy through a transferred effect flag", () => {
  const indecipherable = powers["indecipherable.json"].effects[0];
  const target = {
    uuid: "Actor.indecipherable",
    name: "Indecipherable Target",
    effects: [],
    items: [{ effects: [indecipherable] }],
  };

  assert.equal(indecipherable.transfer, true);
  assert.equal(indecipherable.flags["marvel-multiverse"].telepathicLanguageImmunity, true);
  for (const power of [mindReading, mindInterrogation]) {
    const prerequisites = power.system.targeting.prerequisites;
    assert.equal(validateTargetPrerequisites(prerequisites).valid, true, power.name);
    const result = evaluateTargetPrerequisites({}, [{ actor: target }], prerequisites);
    assert.equal(result.success, false, power.name);
    assert.match(result.failures[0].message, /Indecipherable/, power.name);
  }
});

test("all Translation events and semantic profiles are valid", () => {
  const profileIds = new Set(["translation.comprehend", "translation.detect-lie"]);

  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    for (const profileId of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profileIds.has(profileId), true, `${fileName}: ${profileId}`);
    }
  }
});
