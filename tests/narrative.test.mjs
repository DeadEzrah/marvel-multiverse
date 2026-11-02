import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { resolveUtilityTargetLimits } = await import("../lib/services/utility-activation.mjs");

const directory = new URL("../packs/_source/powers/Narrative/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Narrative contains three structured powers with valid events", () => {
  assert.equal(files.length, 3);
  for (const [file, power] of Object.entries(powers)) {
    assert.equal(typeof power.system.narrative, "object", `${file}: family metadata`);
    assert.equal(validatePowerEvents(power.system.events).valid, true, `${file}: event schema`);
  }
});

test("Corrupting Touch requires a damaging melee hit and preserves subjective mutations", () => {
  const power = powers["corrupting-touch.json"];
  const system = power.system;
  const event = system.events[0];

  assert.equal(system.attack, true);
  assert.equal(system.ability, "mle");
  assert.equal(system.attackTarget, "agl");
  assert.equal(system.attackKind, "melee");
  assert.equal(system.targeting.range, 1);
  assert.equal(system.damage.enabled, true);
  assert.equal(event.trigger, "health-damage-applied");
  assert.deepEqual(event.requirements, [{ type: "minimum-damage", value: 1 }]);
  assert.equal(event.outcomes[0].duration.type, "permanent");
  assert.equal(event.outcomes[1].type, "manual");
  assert.equal(system.narrative.heroicBecomesVillainous, true);
  assert.equal(system.narrative.heroicKarmaRemoved, true);
  assert.equal(system.narrative.tagAndKarmaMutationManual, true);
  assert.equal(system.narrative.escapeCheck.heroicSelfHarmDoubleEdge, true);
});

test("DNA Manipulation supports self or one optional target without guessing mutations", () => {
  const power = powers["dna-manipulation.json"];
  const system = power.system;
  const limits = resolveUtilityTargetLimits(power, {});

  assert.equal(system.activation.target, "optional");
  assert.deepEqual([limits.minimum, limits.maximum], [0, 1]);
  assert.deepEqual(system.narrative.targets, ["self", "other"]);
  assert.equal(system.narrative.capabilities.length, 6);
  assert.equal(system.narrative.createdBodyRequiresCopyPsyche, true);
  assert.equal(system.events[0].outcomes[0].type, "manual");
  assert.match(system.effect, /upon command, both/);
});

test("Magic Masks has a valid document ID and a single replaceable wearer marker", () => {
  const power = powers["magic-masks.json"];
  const system = power.system;
  const outcomes = system.events[0].outcomes;

  assert.match(power._id, /^[A-Za-z0-9]{16}$/);
  assert.equal(power._key, `!items!${power._id}`);
  assert.equal(system.description, "The character carries magic masks that transform their wearer.");
  assert.equal(system.action, "Standard");
  assert.equal(system.activation.target, "none");
  assert.equal(system.narrative.oneMaskAtATime, true);
  assert.equal(system.narrative.knownMasks.length, 16);
  assert.equal(system.narrative.grantedPowersIgnorePrerequisites, true);
  assert.equal(system.narrative.otherWearersManual, true);
  assert.equal(outcomes[0].stacking, "replace");
  assert.equal(outcomes[0].duration.type, "manual");
  assert.equal(outcomes[1].type, "manual");
});

test("Narrative semantic aliases resolve to registered effects", async () => {
  const manifest = JSON.parse(await readFile(new URL("../assets/effects-manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.fallbacks["narrative.corruption"], "telepathy.command");
  assert.equal(manifest.fallbacks["narrative.transformation"], "resize.other");
  assert.equal(manifest.fallbacks["narrative.mask"], "power.magic.cast");
});
