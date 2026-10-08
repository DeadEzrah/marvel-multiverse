import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = {
  user: {
    id: "gm",
    isGM: true,
  },
  i18n: {
    localize: (key) => key,
  },
};
globalThis.foundry = {
  utils: {
    getProperty(object, path) {
      return path.split(".").reduce((value, key) => value?.[key], object);
    },
  },
};

const { applyActorDamage } = await import("../lib/damage-application.mjs");
const { applyActorStatus } = await import("../lib/conditions.mjs");

function createActor() {
  const actor = {
    documentName: "Actor",
    uuid: "Actor.test",
    system: {
      health: { value: 30 },
      healthDamageReduction: 5,
      focus: { value: 20 },
      focusDamageReduction: 2,
    },
    effects: { contents: [] },
    async update(data) {
      if (data.system?.health) this.system.health.value = data.system.health.value;
      if (data.system?.focus) this.system.focus.value = data.system.focus.value;
    },
    async createEmbeddedDocuments(_type, entries) {
      const created = entries.map((entry, index) => ({ ...entry, id: `effect-${index}` }));
      this.effects.contents.push(...created);
      return created;
    },
    async deleteEmbeddedDocuments(_type, ids) {
      this.effects.contents = this.effects.contents.filter((effect) => !ids.includes(effect.id));
    },
  };
  return actor;
}

test("applies direct health and focus damage through canonical reduction rules", async () => {
  const actor = createActor();

  const health = await applyActorDamage({ actor, kind: "health", amount: 12 });
  const focus = await applyActorDamage({ actor, kind: "focus", amount: 6 });

  assert.equal(health.success, true);
  assert.equal(health.damageReduction, 5);
  assert.equal(health.appliedDamage, 7);
  assert.equal(actor.system.health.value, 23);
  assert.equal(focus.damageReduction, 2);
  assert.equal(focus.appliedDamage, 4);
  assert.equal(actor.system.focus.value, 16);
});

test("rejects invalid direct damage without mutating the actor", async () => {
  const actor = createActor();

  const result = await applyActorDamage({ actor, kind: "health", amount: -1 });

  assert.equal(result.success, false);
  assert.equal(result.reason, "invalid-damage-amount");
  assert.equal(actor.system.health.value, 30);
});

test("applies, deduplicates, toggles, and removes direct statuses", async () => {
  const actor = createActor();

  const applied = await applyActorStatus({ actor, status: "stun" });
  const duplicate = await applyActorStatus({ actor, status: "stunned" });
  const removed = await applyActorStatus({ actor, status: "stunned", mode: "toggle" });

  assert.equal(applied.success, true);
  assert.equal(applied.status, "stunned");
  assert.deepEqual(applied.createdEffectIds, ["effect-0"]);
  assert.equal(duplicate.skipped, true);
  assert.deepEqual(removed.removedEffectIds, ["effect-0"]);
  assert.equal(actor.effects.contents.length, 0);
});
