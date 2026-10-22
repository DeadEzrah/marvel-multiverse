import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  buildActionRollRequest,
  resolveTargetingConfig,
} = await import("../lib/services/action-roll.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { validateTargetPrerequisites } = await import("../lib/services/target-prerequisites.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Teleportation/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const files = [
  "blink-barrage.json",
  "blink-defense.json",
  "blink.json",
  "swap-items.json",
  "swap-places.json",
  "swap-status.json",
  "teleport-1.json",
  "teleport-2.json",
  "teleport-blind.json",
  "teleport-object.json",
  "teleport-other.json",
  "teleport-together.json",
  "teleportal.json",
  "telespot.json",
];
const powers = Object.fromEntries(await Promise.all(
  files.map(async (fileName) => [fileName, await loadPower(fileName)])
));

function rankedActor(rank = 4) {
  return {
    uuid: "Actor.teleporter",
    system: {
      attributes: { rank: { value: rank } },
      abilities: {
        ego: { value: 5 },
        agl: { value: 4 },
      },
      reach: 1,
    },
    items: [],
    effects: [],
  };
}

test("Teleport tiers declare exact combat and out-of-combat ranges", () => {
  const teleport1 = powers["teleport-1.json"].system.teleportation;
  const teleport2 = powers["teleport-2.json"].system.teleportation;
  const blind = powers["teleport-blind.json"].system.teleportation;

  assert.deepEqual(
    [teleport1.combatRangePerRank, teleport1.outOfCombatRangePerRank],
    [10, 100]
  );
  assert.deepEqual(
    [teleport2.combatRangePerRank, teleport2.outOfCombatRangePerRank],
    [10, 1000]
  );
  assert.equal(blind.requiresSeenOrKnownDestination, false);
  assert.equal(blind.solidDestinationDisruption, true);
  assert.equal(powers["teleport-blind.json"].system.cost, "15 Focus");
});

test("Blink Barrage applies one round of non-stacking attack Trouble", () => {
  const barrage = powers["blink-barrage.json"];
  const outcome = barrage.system.events[0].outcomes.find((candidate) => candidate.type === "active-effect");
  const modifier = outcome.effect.flags["marvel-multiverse"].defensiveRollModifier;

  assert.equal(barrage.system.cost, "5 Focus");
  assert.deepEqual(outcome.duration, { type: "rounds", value: 1 });
  assert.equal(modifier.mode, "trouble");
  assert.equal(modifier.count, 1);
  assert.equal(modifier.requiresAttack, true);
  assert.equal(modifier.nonStacking, true);
});

test("Swap Places and Swap Items use Ego versus Vigilance at two spaces per Rank", () => {
  for (const fileName of ["swap-places.json", "swap-items.json"]) {
    const power = powers[fileName];
    power.parent = rankedActor(4);
    const request = buildActionRollRequest({
      actor: power.parent,
      source: power,
      targets: [{ actor: { system: { abilities: { vig: { defense: 15 } } } } }],
    });
    const targeting = resolveTargetingConfig(power);

    assert.equal(request.ability, "ego", fileName);
    assert.equal(request.targeting.defense, "vig", fileName);
    assert.equal(request.dealsDamage, false, fileName);
    assert.equal(targeting.range, 8, fileName);
    assert.equal(targeting.requiresLineOfSight, true, fileName);
    assert.equal(power.system.teleportation.willingTargetSkipsCheck, true, fileName);
    assert.equal(power.system.teleportation.returnsOnConcentrationEnd, true, fileName);
    assert.equal(
      power.system.events.some((event) =>
        event.outcomes.some((outcome) => outcome.duration?.type === "concentration")),
      true,
      fileName
    );
  }
});

test("Teleport Other requires a grabbed target and never deals automatic damage", () => {
  const power = powers["teleport-other.json"];
  const prerequisites = power.system.targeting.prerequisites;
  const request = buildActionRollRequest({
    actor: rankedActor(),
    source: power,
    targets: [{ actor: { system: { abilities: { vig: { defense: 14 } } } } }],
  });

  assert.equal(validateTargetPrerequisites(prerequisites).valid, true);
  assert.equal(prerequisites[0].value, "grappled");
  assert.equal(request.ability, "ego");
  assert.equal(request.targeting.defense, "vig");
  assert.equal(request.dealsDamage, false);
  assert.equal(power.system.cost, "15 Focus");
});

test("Teleport Together and Telespot enforce their rank-scaled reach contracts", () => {
  const together = powers["teleport-together.json"];
  together.parent = rankedActor(3);
  const togetherTargeting = resolveTargetingConfig(together);
  assert.equal(togetherTargeting.range, 1);
  assert.equal(together.system.activation.maxTargets, 1);
  assert.equal(together.system.teleportation.unwillingTargetMustBeGrabbed, true);

  const telespot = powers["telespot.json"];
  telespot.parent = rankedActor(3);
  const telespotTargeting = resolveTargetingConfig(telespot);
  assert.equal(telespotTargeting.range, 30);
  assert.equal(telespot.system.teleportation.reactionFantasticDamageMultiplier, 2);
  assert.equal(telespot.system.teleportation.reactionFailurePreservesOriginalHit, true);
});

test("Teleportal creates a concentration marker for a bidirectional portal", () => {
  const portal = powers["teleportal.json"];
  const outcome = portal.system.events[0].outcomes.find((candidate) => candidate.type === "active-effect");

  assert.equal(portal.system.cost, "15 Focus");
  assert.equal(portal.system.teleportation.bidirectional, true);
  assert.equal(portal.system.teleportation.outOfCombatRangePerRank, 1000);
  assert.equal(outcome.duration.type, "concentration");
  assert.equal(outcome.effect.flags["marvel-multiverse"].teleportation.kind, "portal");
});

test("Swap Status uses the repaired rank-scaled concentration contract", () => {
  const swapStatus = powers["swap-status.json"];
  swapStatus.parent = rankedActor(4);
  const targeting = resolveTargetingConfig(swapStatus);
  const markers = swapStatus.system.events.flatMap((event) =>
    event.outcomes.filter((outcome) => outcome.type === "active-effect"));

  assert.equal(swapStatus.system.cost, "5 Focus");
  assert.equal(swapStatus.system.duration, "Concentration");
  assert.equal(targeting.range, 8);
  assert.equal(targeting.requiresLineOfSight, true);
  assert.equal(swapStatus.system.teleportation.selective, true);
  assert.deepEqual(swapStatus.system.teleportation.swappable, [
    "lost-health",
    "lost-focus",
    "conditions",
    "occupation",
    "traits",
    "tags",
  ]);
  assert.equal(swapStatus.system.teleportation.returnUsesCurrentAlteredState, true);
  assert.equal(markers.length, 2);
  assert.equal(markers.every((outcome) => outcome.duration.type === "concentration"), true);
});

test("all Teleportation powers have valid events and semantic profiles", () => {
  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    assert.equal(Boolean(power.system.activation || power.system.automationPreset), true, fileName);
    for (const profileId of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profileId, "movement.teleport", `${fileName}: ${profileId}`);
    }
  }
});
