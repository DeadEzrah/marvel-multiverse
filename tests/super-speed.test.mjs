import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  buildActionRollRequest,
  resolveActorEffectRollModifiers,
  resolveTargetingConfig,
} = await import("../lib/services/action-roll.mjs");
const { resolveDamageConfig } = await import("../lib/services/damage-resolver.mjs");
const { resolveLatestReactionContext } = await import("../lib/services/reaction-context.mjs");
const { validatePowerEvents } = await import("../lib/services/power-events.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Super-Speed/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const files = [
  "blazing-fast-fists.json",
  "blur.json",
  "catch-bullets.json",
  "lightning-actions.json",
  "molecular-destabilization.json",
  "run-on-water.json",
  "speed-blast.json",
  "speed-run-1.json",
  "speed-run-2.json",
  "speed-swim.json",
];
const powers = Object.fromEntries(await Promise.all(
  files.map(async (fileName) => [fileName, await loadPower(fileName)])
));

test("Speed Run tiers and Speed Swim use exact movement overrides", () => {
  const run1 = powers["speed-run-1.json"].effects[0].changes;
  const run2 = powers["speed-run-2.json"].effects[0].changes;
  const swim = powers["speed-swim.json"].effects[0].changes;

  assert.equal(run1.find((change) => change.key.endsWith(".calc")).value, "rank");
  assert.equal(run1.find((change) => change.key.endsWith(".noncom")).value, 3);
  assert.equal(run2.some((change) => change.key.endsWith(".calc")), false);
  assert.equal(run2.find((change) => change.key.endsWith(".noncom")).value, 50);
  assert.equal(powers["speed-run-2.json"].system.prerequisites, "Speed Run 1, Rank 3");
  assert.equal(swim.find((change) => change.key.endsWith(".calc")).value, "rank");
  assert.equal(swim.find((change) => change.key.endsWith(".noncom")).value, 3);
});

test("Blazing Fast Fists grants Edge only to Melee attacks", () => {
  const effect = powers["blazing-fast-fists.json"].effects[0];
  const actor = { effects: [], items: [{ effects: [effect] }] };

  assert.equal(resolveActorEffectRollModifiers(actor, {
    isAttack: true,
    ability: "mle",
  }).length, 1);
  assert.equal(resolveActorEffectRollModifiers(actor, {
    isAttack: true,
    ability: "agl",
  }).length, 0);
  assert.equal(resolveActorEffectRollModifiers(actor, {
    isAttack: false,
    ability: "mle",
  }).length, 0);
});

test("Blur applies one round of non-stacking attack Trouble", () => {
  const blur = powers["blur.json"];
  const outcome = blur.system.events[0].outcomes[0];
  const modifier = outcome.effect.flags["marvel-multiverse"].defensiveRollModifier;

  assert.equal(blur.system.cost, "5 Focus");
  assert.deepEqual(outcome.duration, { type: "rounds", value: 1 });
  assert.equal(modifier.mode, "trouble");
  assert.equal(modifier.requiresAttack, true);
  assert.equal(modifier.nonStacking, true);
});

test("Catch Bullets binds its TN to the incoming physical projectile result", () => {
  const actor = { uuid: "Actor.defender" };
  const source = powers["catch-bullets.json"];
  const previousFromUuidSync = globalThis.fromUuidSync;
  globalThis.fromUuidSync = () => ({ type: "weapon" });
  const message = {
    id: "attack",
    uuid: "ChatMessage.attack",
    getFlag: (_scope, key) => ({
      actionRoll: {
        request: { target: { actorUuid: actor.uuid } },
        result: { total: 17, isSuccess: true },
      },
      rollContext: {
        actorUuid: "Actor.attacker",
        tokenUuid: "Scene.scene.Token.attacker",
        targetUuids: [actor.uuid],
        attackKind: "ranged",
        itemUuid: "Actor.attacker.Item.weapon",
        element: null,
      },
    })[key] ?? null,
  };

  try {
    const context = resolveLatestReactionContext(actor, source, [message]);
    assert.equal(context.targetNumber, 17);
    assert.equal(context.targetActorUuid, "Actor.attacker");
    globalThis.fromUuidSync = () => ({ type: "power", system: { powerSet: "Ranged Weapons" } });
    assert.equal(resolveLatestReactionContext(actor, source, [message]).targetNumber, 17);
  } finally {
    globalThis.fromUuidSync = previousFromUuidSync;
  }
});

test("reaction target numbers override the attacker's defense", () => {
  const request = buildActionRollRequest({
    actor: {
      system: { abilities: { agl: { value: 4 } } },
      items: [],
      effects: [],
    },
    source: powers["catch-bullets.json"],
    targets: [{
      actor: {
        uuid: "Actor.attacker",
        system: { abilities: { agl: { defense: 10 } } },
      },
    }],
    reactionContext: { targetNumber: 17 },
  });

  assert.equal(request.targetNumber, 17);
  assert.equal(request.targetNumberSource, "reaction");
});

test("Speed Blast is a non-damaging condition attack against one enemy", () => {
  const blast = powers["speed-blast.json"];
  const targeting = resolveTargetingConfig(blast);

  assert.equal(targeting.defense, "agl");
  assert.equal(targeting.range, 10);
  assert.equal(targeting.targetFilter, "enemies");
  assert.equal(resolveDamageConfig(blast).enabled, false);
  assert.equal(blast.system.events[0].outcomes[0].statusId, "stunned");
  assert.equal(blast.system.events[1].recipient, "target");
  assert.equal(blast.system.events[1].outcomes[0].statusId, "prone");
});

test("Molecular Destabilization avoids unsafe automatic object and area damage", () => {
  const power = powers["molecular-destabilization.json"];
  const request = buildActionRollRequest({
    actor: { system: { abilities: { mle: { value: 5 } } }, items: [], effects: [] },
    source: power,
  });

  assert.equal(request.isAttack, false);
  assert.equal(request.dealsDamage, false);
  assert.equal(power.system.cost, "15 Focus");
  assert.equal(power.system.superSpeed.explosionRadius, 2);
  assert.equal(power.system.superSpeed.ignoreHealthDamageReductionOnFantasticSuccess, true);
});

test("Lightning Actions and Run on Water expose permanent rules metadata", () => {
  const lightning = powers["lightning-actions.json"];
  const lightningFlags = lightning.effects[0].flags["marvel-multiverse"].lightningActions;
  const waterFlags = powers["run-on-water.json"].effects[0].flags["marvel-multiverse"].superSpeed;

  assert.equal(lightningFlags.oncePerRound, true);
  assert.equal(lightningFlags.standardForReaction, true);
  assert.equal(lightningFlags.reactionForStandard, true);
  assert.equal(lightningFlags.initiativeMarvelDieFantastic, true);
  assert.equal(waterFlags.runOnWater, true);
  assert.equal(waterFlags.requiresContinuousRunning, true);
});

test("all Super-Speed events and semantic profiles are valid", () => {
  const profiles = new Set([
    "superspeed.blur",
    "superspeed.catch",
    "superspeed.wind",
    "superspeed.wind-impact",
    "superspeed.destabilize",
    "superspeed.destabilize-fantastic",
  ]);
  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${fileName}: ${profile}`);
    }
  }
});
