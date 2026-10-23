import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { validatePowerEvents } = await import("../lib/services/power-events.mjs");

const directory = new URL("../packs/_source/powers/Telepathy/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Telepathy contains the complete 27-power family", () => {
  assert.equal(files.length, 27);
});

test("Astral Form applies exact concentration movement and corrected rules", () => {
  const power = powers["astral-form.json"];
  const movement = power.system.events[0].outcomes[0];
  assert.equal(power.system.cost, "5 Focus");
  assert.equal(power.system.telepathy.flightCalculation, "rank-times-run-speed");
  assert.equal(power.system.telepathy.transparentAtRank, 4);
  assert.equal(movement.effect.changes[1].value, "rank-runspeed");
  assert.equal(movement.effect.changes[2].value, 10);
  assert.equal(movement.duration.type, "concentration");
  assert.match(power.system.effect, /Run Speed/);
});

test("Mental Shelter derives Focus DR from Uncanny and owns concentration", () => {
  const power = powers["mental-shelter.json"];
  const outcome = power.system.events[0].outcomes[0];
  assert.equal(power.system.activation.target, "required");
  assert.equal(power.system.activation.rangePerRank, 5);
  assert.deepEqual(outcome.sourcePowerTier, {
    powerSet: "Basic",
    namePrefix: "Uncanny ",
  });
  assert.equal(outcome.effect.changes[0].key, "system.focusDamageReduction");
  assert.equal(outcome.effect.changes[0].value, "@sourcePowerTier");
  assert.equal(outcome.duration.type, "concentration");
});

test("mental attacks preserve Focus damage and Fantastic stun", () => {
  for (const file of ["mental-punch.json", "telepathic-blast.json"]) {
    const power = powers[file];
    assert.equal(power.system.automationPreset, "attack.single-focus");
    assert.equal(power.system.events[0].outcomes[0].statusId, "stunned");
    assert.equal(power.system.events[0].outcomes[0].duration.value, 1);
  }
});

test("command powers preserve links, zero-Focus gates, and future Edge", () => {
  assert.equal(powers["command.json"].system.events[2].outcomes[0].type, "future-roll-modifier");
  for (const file of ["orders.json", "domination.json", "telepathic-possession.json"]) {
    const prerequisites = powers[file].system.targeting.prerequisites;
    assert.equal(prerequisites.some((entry) => entry.type === "resource" && entry.value === 0), true);
    assert.equal(prerequisites.some((entry) => entry.type === "source-link"), true);
  }
});

test("network and group powers expose exact Rank-scaled target caps", () => {
  assert.equal(powers["telepathic-network.json"].system.activation.maxTargetsPerRank, 5);
  assert.equal(powers["cloak-group.json"].system.activation.maxTargetsPerRank, 1);
  assert.equal(powers["grand-fool.json"].system.activation.maxTargetsPerRank, 1);
  assert.equal(powers["grand-mirage.json"].system.activation.maxTargetsPerRank, 5);
});

test("all Telepathy events and semantic profiles are valid", () => {
  const profiles = new Set([
    "telepathy.astral",
    "telepathy.shelter",
    "telepathy.animal",
    "telepathy.link",
    "telepathy.mirage",
    "telepathy.command",
    "telepathy.memory",
    "telepathy.sense",
    "telepathy.machine",
    "telepathy.mental-impact",
    "power.psychic.blast",
  ]);
  for (const [file, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${file}: ${JSON.stringify(validation.issues)}`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${file}: ${profile}`);
    }
    assert.equal(Object.keys(power.system.effectProfiles ?? {}).length > 0, true, `${file}: missing profile`);
  }
});
