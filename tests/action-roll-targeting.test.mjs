import test from "node:test";
import assert from "node:assert/strict";

const {
  applyPostAttackDefensivePowers,
  buildActionRollRequest,
  expireTargetDefensiveRollModifiers,
  resolveDefensiveTargetResults,
  resolveTargetDefensiveRollModifiers,
  resolveTargetingConfig
} = await import("../lib/services/action-roll.mjs");

test("Untouchable Position applies after an attack without stacking", async () => {
  const created = [];
  const actor = {
    id: "defender",
    uuid: "Actor.defender",
    items: [{ flags: { "marvel-multiverse": { passiveAutomation: "untouchable-position" } } }],
    effects: [],
    async createEmbeddedDocuments(_type, documents) {
      const effect = { ...documents[0], id: "untouchable-effect" };
      this.effects.push(effect);
      created.push(effect);
      return [effect];
    },
  };
  const combat = {
    id: "combat",
    combatants: [{ id: "defender-combatant", actor }],
  };
  const targets = [{ actor }];

  const first = await applyPostAttackDefensivePowers(targets, { combat });
  const second = await applyPostAttackDefensivePowers(targets, { combat });
  const modifiers = resolveTargetDefensiveRollModifiers(targets, { attackKind: "close" });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(second.applied[0].skipped, true);
  assert.equal(created.length, 1);
  assert.equal(modifiers.length, 1);
  assert.equal(modifiers[0].count, 1);
});

test("explicit targeting supports a minimum below the target cap", () => {
  const item = {
    name: "Fast Strikes",
    system: {
      attack: true,
      ability: "mle",
      attackTarget: "mle",
      targeting: {
        required: true,
        count: 2,
        minCount: 1
      }
    }
  };

  const targeting = resolveTargetingConfig(item);

  assert.equal(targeting.count, 2);
  assert.equal(targeting.minCount, 1);
});

test("minimum targets are capped at the declared maximum", () => {
  const item = {
    system: {
      attack: true,
      targeting: {
        required: true,
        count: 2,
        minCount: 3
      }
    }
  };

  const targeting = resolveTargetingConfig(item);

  assert.equal(targeting.count, 2);
  assert.equal(targeting.minCount, 2);
});

test("Kill Zone requires line of sight to an enemy", () => {
  const targeting = resolveTargetingConfig({
    system: {
      targeting: {
        required: true,
        count: 1,
        defense: "agl",
        requiresLineOfSight: true,
        targetFilter: "enemies"
      }
    }
  });

  assert.equal(targeting.requiresLineOfSight, true);
  assert.equal(targeting.targetFilter, "enemies");
});

test("roll requests flag too few selected targets", () => {
  const request = buildActionRollRequest({
    actor: {
      system: {
        abilities: {
          mle: { value: 0 }
        }
      }
    },
    source: {
      name: "Flying Double Kick",
      system: {
        attack: true,
        ability: "mle",
        attackTarget: "mle",
        targeting: {
          required: true,
          count: 2,
          minCount: 2
        }
      }
    },
    targets: []
  });

  assert.equal(request.validTargetCount, 0);
  assert.equal(request.insufficientTargetsWarning, true);
});

test("Defense Stance adds Trouble only to close attacks", () => {
  const targetActor = {
    uuid: "Actor.defender",
    effects: [{
      id: "defense-stance",
      flags: {
        "marvel-multiverse": {
          defensiveRollModifier: {
            mode: "trouble",
            count: 1,
            attackKinds: ["close"],
            endConcentrationOnSuccessfulAttack: true
          }
        }
      }
    }]
  };
  const targets = [{ actor: targetActor, actorUuid: targetActor.uuid }];

  const close = resolveTargetDefensiveRollModifiers(targets, { attackKind: "close" });
  const ranged = resolveTargetDefensiveRollModifiers(targets, { attackKind: "ranged" });

  assert.equal(close.length, 1);
  assert.equal(close[0].mode, "trouble");
  assert.equal(close[0].count, 1);
  assert.equal(ranged.length, 0);
});

test("Unflappable Poise stacks with Defense Stance for double Trouble", () => {
  const targetActor = {
    uuid: "Actor.defender",
    effects: [
      {
        id: "defense-stance",
        flags: {
          "marvel-multiverse": {
            defensiveRollModifier: {
              mode: "trouble",
              count: 1,
              attackKinds: ["close"],
              endConcentrationOnSuccessfulAttack: true
            }
          }
        }
      }
    ],
    items: [{
      effects: [
      {
        id: "unflappable-poise",
        transfer: true,
        flags: {
          "marvel-multiverse": {
            defensiveRollModifier: {
              mode: "trouble",
              count: 1,
              attackKinds: ["close"]
            }
          }
        }
      }
      ]
    }]
  };

  const modifiers = resolveTargetDefensiveRollModifiers(
    [{ actor: targetActor, actorUuid: targetActor.uuid }],
    { attackKind: "close" }
  );

  assert.equal(modifiers.length, 2);
  assert.equal(modifiers.reduce((total, modifier) => total + modifier.count, 0), 2);
});

test("Defense Stance expires after a successful close attack but not a miss", async () => {
  const actor = { uuid: "Actor.defender" };
  const modifier = {
    targetIndex: 0,
    targetActor: actor,
    targetActorUuid: actor.uuid,
    endConcentrationOnSuccessfulAttack: true
  };
  const ended = [];
  const endConcentration = async (target, options) => ended.push({ target, options });

  const missed = await expireTargetDefensiveRollModifiers([modifier], [{ isSuccess: false }], { endConcentration });
  const hit = await expireTargetDefensiveRollModifiers([modifier], [{ isSuccess: true }], { endConcentration });

  assert.equal(missed.success, true);
  assert.deepEqual(missed.expiredActorUuids, []);
  assert.equal(hit.success, true);
  assert.deepEqual(hit.expiredActorUuids, [actor.uuid]);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].target, actor);
  assert.equal(ended[0].options.reason, "successful-close-attack");
});

test("Defense Stance uses the overall result for legacy single-target attacks", () => {
  const result = { isSuccess: true, targetResults: [] };

  assert.equal(resolveDefensiveTargetResults(result, 1)[0], result);
  assert.equal(resolveDefensiveTargetResults(result, 2)[1].isSuccess, false);
});
