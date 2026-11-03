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
const hookCalls = [];
globalThis.Hooks = {
  callAll(...args) {
    hookCalls.push(args);
  },
};

const {
  applyActorDamage,
  recordActionDamageApplication,
  restoreActorResource,
} = await import("../lib/damage-application.mjs");
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

test("restores actor resources through the public mutation boundary", async () => {
  const actor = createActor();
  actor.system.health.max = 30;
  actor.system.focus.max = 20;
  actor.system.health.value = 4;
  actor.system.focus.value = 3;

  const health = await restoreActorResource({ actor, kind: "health" });
  const focus = await restoreActorResource({ actor, kind: "focus", amount: 5 });

  assert.equal(health.success, true);
  assert.equal(health.previousValue, 4);
  assert.equal(health.newValue, 30);
  assert.equal(health.restoredAmount, 26);
  assert.equal(focus.success, true);
  assert.equal(focus.newValue, 8);
  assert.equal(actor.system.health.value, 30);
  assert.equal(actor.system.focus.value, 8);
});

test("rejects invalid resource restoration without mutating the actor", async () => {
  const actor = createActor();
  actor.system.health.max = 30;

  const invalidKind = await restoreActorResource({ actor, kind: "karma" });
  const invalidAmount = await restoreActorResource({ actor, kind: "health", amount: -1 });

  assert.equal(invalidKind.success, false);
  assert.equal(invalidKind.reason, "invalid-resource-kind");
  assert.equal(invalidAmount.success, false);
  assert.equal(invalidAmount.reason, "invalid-restore-amount");
  assert.equal(actor.system.health.value, 30);
});

test("Elemental Protection absorbs its threshold and allows only excess damage through", async () => {
  const protectedActor = createActor();
  protectedActor.effects.contents.push({
    id: "elemental-protection",
    disabled: false,
    flags: { "marvel-multiverse": { elementalControl: { protectionThreshold: 20 } } },
  });

  const absorbed = await applyActorDamage({ actor: protectedActor, kind: "health", amount: 25 });
  assert.equal(absorbed.elementalProtection.absorbedDamage, 20);
  assert.equal(absorbed.appliedDamage, 0);
  assert.equal(protectedActor.system.health.value, 30);
  assert.equal(protectedActor.effects.contents.length, 1);

  const breached = await applyActorDamage({ actor: protectedActor, kind: "health", amount: 31 });
  assert.equal(breached.elementalProtection.destroyed, true);
  assert.equal(breached.appliedDamage, 6);
  assert.equal(protectedActor.system.health.value, 24);
  assert.equal(protectedActor.effects.contents.length, 0);
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

test("recording universal action damage emits the canonical damage-applied hook", async () => {
  hookCalls.length = 0;
  const scopeFlags = {
    rollContext: {
      targetUuids: ["Scene.test.Token.target"],
    },
    actionDamage: {
      targetUuid: "Actor.target",
      damage: {
        damageType: "health",
        finalDamage: 8,
      },
      apply: {
        success: true,
        actorUuid: "Actor.target",
        previousValue: 30,
        newValue: 22,
        appliedDamage: 8,
      },
    },
  };
  const message = {
    flags: { "marvel-multiverse": scopeFlags },
    getFlag(scope, key) {
      if (scope !== "marvel-multiverse") return null;
      return key ? this.flags[scope]?.[key] : this.flags[scope];
    },
    async update(data) {
      this.flags["marvel-multiverse"] = data.flags["marvel-multiverse"];
    },
  };

  const transaction = await recordActionDamageApplication(message);

  assert.equal(transaction.source, "action-roll");
  assert.equal(transaction.targets[0].targetUuid, "Scene.test.Token.target");
  assert.equal(transaction.targets[0].actorUuid, "Actor.target");
  assert.equal(hookCalls.length, 1);
  assert.equal(hookCalls[0][0], "marvel-multiverse.damageApplied");
  assert.equal(hookCalls[0][1], message);
  assert.equal(hookCalls[0][2], transaction);
  assert.equal(hookCalls[0][3].success, true);
});
