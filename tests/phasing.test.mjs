import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { resolveTargetingConfig } = await import("../lib/services/action-roll.mjs");
const { resolveDamageConfig } = await import("../lib/services/damage-resolver.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const {
  evaluatePhasingInteraction,
  getActorPhasingState,
} = await import("../lib/services/phasing-interaction.mjs");
const { synchronizeActorPhasingVisual } = await import("../lib/services/phasing-visual.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Phasing/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const files = [
  "disrupt-electronics.json",
  "disrupt-nerves.json",
  "disrupt-person.json",
  "partial-phase.json",
  "phase-object.json",
  "phase-other.json",
  "phase-self.json",
  "phase-walk.json",
  "quick-phase.json",
];
const powers = Object.fromEntries(await Promise.all(
  files.map(async (fileName) => [fileName, await loadPower(fileName)])
));

function actor(name, phased = false) {
  return {
    uuid: `Actor.${name}`,
    name,
    effects: phased ? [{
      flags: {
        "marvel-multiverse": {
          phasing: { state: "intangible", scope: "self" },
        },
      },
    }] : [],
    items: [],
  };
}

test("phase-state blocks physical interaction across the boundary in both directions", () => {
  const physicalAttack = { system: { attack: true, ability: "mle" } };
  const mentalAttack = { system: { attack: true, ability: "ego" } };
  const solid = actor("solid");
  const phased = actor("phased", true);

  assert.equal(getActorPhasingState(phased).state, "intangible");
  assert.equal(evaluatePhasingInteraction(solid, [{ actor: phased }], physicalAttack).success, false);
  assert.equal(evaluatePhasingInteraction(phased, [{ actor: solid }], physicalAttack).success, false);
  assert.equal(evaluatePhasingInteraction(phased, [{ actor: solid }], mentalAttack).success, true);
  assert.equal(evaluatePhasingInteraction(phased, [{ actor: phased }], physicalAttack).success, true);
});

test("Phasing disruption attacks cross the phase boundary and use exact rules", () => {
  const nerves = powers["disrupt-nerves.json"];
  const person = powers["disrupt-person.json"];

  assert.equal(resolveTargetingConfig(nerves).defense, "res");
  assert.equal(resolveDamageConfig(nerves).enabled, false);
  assert.equal(resolveTargetingConfig(person).defense, "mle");
  assert.equal(resolveDamageConfig(person).ignoreDamageReduction, true);
  assert.equal(resolveDamageConfig(person).doubleOnFantastic, true);
  assert.equal(person.system.cost, "10 Focus");
  assert.equal(nerves.system.cost, "5 Focus");
  assert.equal(
    evaluatePhasingInteraction(actor("phased", true), [{ actor: actor("solid") }], person).success,
    true
  );
});

test("Phase Self, Quick Phase, Phase Other, and Phase Walk create concentration phase state", () => {
  for (const fileName of ["phase-self.json", "quick-phase.json", "phase-other.json", "phase-walk.json"]) {
    const power = powers[fileName];
    const outcome = power.system.events[0].outcomes
      .find((candidate) => candidate.type === "active-effect");
    assert.equal(outcome.duration.type, "concentration", fileName);
    assert.equal(outcome.effect.flags["marvel-multiverse"].phasing.state, "intangible", fileName);
  }
  const movement = powers["phase-walk.json"].system.events[0].outcomes[0].effect.changes;
  assert.equal(movement.find((change) => change.key === "system.movement.flight.active").value, true);
  assert.equal(movement.find((change) => change.key === "system.movement.flight.calc").value, "runspeed");
});

test("all Phasing powers have valid events and semantic profiles", () => {
  const profileIds = new Set([
    "phasing.shift",
    "phasing.other",
    "phasing.object",
    "phasing.walk",
    "phasing.disrupt",
    "phasing.impact",
  ]);
  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    assert.equal(Boolean(power.system.activation || power.system.attack), true, fileName);
    for (const profileId of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profileIds.has(profileId), true, `${fileName}: ${profileId}`);
    }
  }
});

test("maintained phasing applies and safely restores a translucent tinted token state", async () => {
  const updates = [];
  const token = {
    alpha: 0.9,
    texture: { tint: "#ffffff" },
    flags: {},
    async update(changes) {
      updates.push(changes);
      if (changes["flags.marvel-multiverse.phasingVisual"]) {
        this.flags["marvel-multiverse"] = {
          phasingVisual: changes["flags.marvel-multiverse.phasingVisual"],
        };
      }
    },
  };
  const phasedActor = actor("visual", true);

  const applied = await synchronizeActorPhasingVisual(phasedActor, { tokens: [token], force: true });
  assert.equal(applied.phased, true);
  assert.equal(updates[0].alpha, 0.62);
  assert.equal(updates[0]["texture.tint"], "#8fdfff");
  assert.deepEqual(updates[0]["flags.marvel-multiverse.phasingVisual"], {
    previousAlpha: 0.9,
    previousTint: "#ffffff",
  });

  phasedActor.effects = [];
  const restored = await synchronizeActorPhasingVisual(phasedActor, { tokens: [token], force: true });
  assert.equal(restored.phased, false);
  assert.equal(updates[1].alpha, 0.9);
  assert.equal(updates[1]["texture.tint"], "#ffffff");
  assert.equal(updates[1]["flags.marvel-multiverse.-=phasingVisual"], null);
});
