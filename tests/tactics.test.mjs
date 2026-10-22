import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { resolveUtilityTargetLimits } = await import("../lib/services/utility-activation.mjs");
const {
  grantFutureRollModifier,
  resolveFutureRollModifiers,
} = await import("../lib/services/future-roll-modifiers.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Tactics/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const files = [
  "advance.json",
  "battle-plan.json",
  "change-of-plans.json",
  "combat-support.json",
  "focus-fire.json",
  "hit-the-dirt.json",
  "keep-moving.json",
  "on-your-feet.json",
  "operations-center.json",
  "rally-on-me.json",
  "scatter.json",
];
const powers = Object.fromEntries(await Promise.all(
  files.map(async (fileName) => [fileName, await loadPower(fileName)])
));

function actorWithAbilities() {
  return {
    system: {
      attributes: { rank: { value: 4 } },
      abilities: {
        ego: { value: 3, defense: 13 },
        vig: { value: 5, defense: 15 },
      },
    },
  };
}

test("Tactics utility caps use the exact Rank, ability, or defense value", () => {
  const actor = actorWithAbilities();

  assert.equal(resolveUtilityTargetLimits(powers["advance.json"], actor).maximum, 13);
  assert.equal(resolveUtilityTargetLimits(powers["battle-plan.json"], actor).maximum, 5);
  assert.equal(resolveUtilityTargetLimits(powers["operations-center.json"], actor).maximum, 15);
  assert.equal(resolveUtilityTargetLimits(powers["rally-on-me.json"], actor).maximum, 5);
  assert.equal(resolveUtilityTargetLimits(powers["scatter.json"], actor).maximum, 4);
});

test("Battle Plan and Operations Center grant universal non-stacking Edge", () => {
  for (const fileName of ["battle-plan.json", "operations-center.json"]) {
    const outcome = powers[fileName].system.events[0].outcomes[0];
    const modifier = outcome.effect.flags["marvel-multiverse"].actionRollModifier;

    assert.equal(modifier.mode, "edge");
    assert.equal(modifier.selection, "automatic");
    assert.equal(modifier.nonStacking, true);
  }
  assert.deepEqual(
    powers["battle-plan.json"].system.events[0].outcomes[0].duration,
    { type: "start-of-source-turn" },
  );
  assert.deepEqual(
    powers["operations-center.json"].system.events[0].outcomes[0].duration,
    { type: "concentration" },
  );
});

test("Change of Plans grants a source-independent one-use Edge", async () => {
  const created = [];
  const actor = {
    uuid: "Actor.ally",
    effects: created,
    async createEmbeddedDocuments(_type, documents) {
      const effects = documents.map((document, index) => ({ ...document, id: `effect-${index}` }));
      created.push(...effects);
      return effects;
    },
  };
  const outcome = powers["change-of-plans.json"].system.events[0].outcomes[0];
  const result = await grantFutureRollModifier(actor, outcome, {
    sourceItem: { uuid: "Item.change-of-plans", name: "Change of Plans" },
    targetActorUuid: actor.uuid,
  });

  assert.equal(result.success, true);
  assert.equal(created[0].flags["marvel-multiverse"].futureRollModifier.sourceItemUuid, null);
  assert.equal(created[0].flags["marvel-multiverse"].futureRollModifier.targetActorUuid, null);
  assert.equal(resolveFutureRollModifiers(actor, {
    source: { uuid: "Item.unrelated-check" },
    targets: [],
  }).length, 1);
});

test("condition-response powers mutate only the selected allies", () => {
  const keepMoving = powers["keep-moving.json"].system.events[0].outcomes;
  assert.deepEqual(
    keepMoving.map((outcome) => [outcome.type, outcome.statusId]),
    [["remove-status", "demoralized"], ["remove-status", "stunned"]],
  );
  assert.equal(powers["on-your-feet.json"].system.events[0].outcomes[0].statusId, "prone");
  assert.equal(powers["hit-the-dirt.json"].system.events[0].outcomes[0].statusId, "prone");
  assert.equal(powers["scatter.json"].system.events[0].outcomes[0].statusId, "prone");
});

test("unsupported Tactics rules remain explicit structured boundaries", () => {
  assert.equal(powers["combat-support.json"].system.tactics.oncePerBattle, true);
  assert.equal(powers["combat-support.json"].system.tactics.nextCheckMarvelDie, 1);
  assert.equal(powers["focus-fire.json"].system.tactics.edgeAgainstSelectedEnemy, true);
  assert.deepEqual(
    powers["focus-fire.json"].system.events[0].outcomes[0].duration,
    { type: "concentration" },
  );
  assert.equal(powers["rally-on-me.json"].system.tactics.focusRecoveryPerSourceRank, 5);
  assert.equal(powers["advance.json"].system.tactics.movementAction, "free");
  assert.equal(powers["operations-center.json"].system.tactics.breakConcentrationOnMovementAction, true);
});

test("all Tactics costs, events, and semantic profiles are valid", () => {
  const profiles = new Set([
    "tactics.command",
    "tactics.advance",
    "tactics.support",
    "tactics.focus-fire",
    "tactics.evade",
    "tactics.recover",
    "tactics.operations",
    "tactics.rally",
  ]);
  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    assert.equal(/\bfocus\b/.test(power.system.cost), false, `${fileName}: normalize Focus capitalization`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${fileName}: ${profile}`);
    }
  }
});
