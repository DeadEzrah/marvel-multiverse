import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  activateSlowMotionShootDodge,
  handleSlowMotionTokenMovement,
  sweepSlowMotionNextTurn
} = await import("../lib/services/slow-motion-shoot-dodge.mjs");
const { resolveTargetingConfig } = await import("../lib/services/action-roll.mjs");
const { resolveDamage, resolveDamageConfig } = await import("../lib/services/damage-resolver.mjs");
const { parseFocusCost } = await import("../lib/focus-automation.mjs");

const power = JSON.parse(await readFile(
  new URL("../packs/_source/powers/Ranged%20Weapons/slow-motion-shoot-dodge.json", import.meta.url),
  "utf8"
));

function createActor() {
  return {
    id: "actor",
    uuid: "Actor.actor",
    effects: [],
    async createEmbeddedDocuments(_type, documents) {
      const effect = { ...documents[0], id: "slow-motion-effect" };
      this.effects.push(effect);
      return [effect];
    },
    async deleteEmbeddedDocuments(_type, ids) {
      this.effects = this.effects.filter((effect) => !ids.includes(effect.id));
    }
  };
}

const item = {
  name: "Slow-Motion Shoot-Dodge",
  img: "power.svg",
  flags: {
    "marvel-multiverse": {
      automation: "slow-motion-shoot-dodge"
    }
  }
};

test("Slow-Motion Shoot-Dodge targets one or two enemies for half or full damage", () => {
  const attacker = {
    system: {
      abilities: {
        agl: {
          value: 4,
          damageMultiplier: 2
        }
      }
    }
  };
  const target = { system: { healthDamageReduction: 0 } };
  const damage = (isFantastic) => resolveDamage({
    attacker,
    target,
    source: power,
    rollContext: { ability: "agl" },
    rollResult: { isSuccess: true, isFantastic, marvelDie: 3 },
    config: resolveDamageConfig(power)
  }).finalDamage;
  const targeting = resolveTargetingConfig(power);

  assert.equal(targeting.count, 2);
  assert.equal(targeting.minCount, 1);
  assert.equal(targeting.targetFilter, "enemies");
  assert.equal(damage(false), 5);
  assert.equal(damage(true), 10);
  assert.equal(parseFocusCost(power.system.cost).value, 10);
  assert.equal(power.system.effectProfiles.movement, "movement.whoosh");
  assert.equal(power.system.effectProfiles.attack, "weapon.projectile.gunshot");
});

test("Slow-Motion Shoot-Dodge creates Agility-defense Trouble", async () => {
  const actor = createActor();
  const message = {
    uuid: "ChatMessage.slow-motion",
    flags: {},
    getFlag: () => null,
    async update(changes) {
      this.flags = changes.flags;
    }
  };
  const combat = {
    id: "combat",
    combatants: [{ id: "combatant", actor }]
  };

  const result = await activateSlowMotionShootDodge(message, item, { actor, combat, force: true });
  const modifier = result.effect.flags["marvel-multiverse"].defensiveRollModifier;
  const state = result.effect.flags["marvel-multiverse"]["slow-motion-shoot-dodge"];

  assert.equal(result.success, true);
  assert.equal(modifier.mode, "trouble");
  assert.deepEqual(modifier.defenses, ["agl"]);
  assert.equal(state.combatId, "combat");
  assert.equal(state.combatantId, "combatant");
});

test("movement removes Slow-Motion Shoot-Dodge and applies prone", async () => {
  const actor = createActor();
  await activateSlowMotionShootDodge(null, item, { actor, force: true });
  const statuses = [];

  const result = await handleSlowMotionTokenMovement(
    { actor },
    { x: 100 },
    {
      force: true,
      applyStatus: async (request) => {
        statuses.push(request.status);
        return { success: true };
      }
    }
  );

  assert.equal(result.success, true);
  assert.equal(actor.effects.length, 0);
  assert.deepEqual(statuses, ["prone"]);
});

test("the source's next turn removes Slow-Motion Shoot-Dodge and applies prone", async () => {
  const actor = createActor();
  const combat = {
    id: "combat",
    combatants: [{ id: "combatant", actor }]
  };
  await activateSlowMotionShootDodge(null, item, { actor, combat, force: true });
  const statuses = [];

  const wrongTurn = await sweepSlowMotionNextTurn(combat, "other", {
    actors: [actor],
    force: true,
    applyStatus: async () => ({ success: true })
  });
  const nextTurn = await sweepSlowMotionNextTurn(combat, "combatant", {
    actors: [actor],
    force: true,
    applyStatus: async (request) => {
      statuses.push(request.status);
      return { success: true };
    }
  });

  assert.equal(wrongTurn.expiredCount, 0);
  assert.equal(nextTurn.expiredCount, 1);
  assert.deepEqual(statuses, ["prone"]);
});
