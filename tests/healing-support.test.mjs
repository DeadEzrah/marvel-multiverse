import test from "node:test";
import assert from "node:assert/strict";

const {
  getHealingSupportRestriction,
  handleHealingSupportEffectDeleted,
  handleHealingSupportResourceUpdate,
  isHealingSupportFocusSpendBlocked,
} = await import("../lib/services/healing-support.mjs");

function supportEffect(overrides = {}) {
  return {
    id: "support",
    name: "Let's Go",
    flags: {
      "marvel-multiverse": {
        healingSupport: {
          kind: "lets-go",
          resource: "health",
          endWhenAbove: 0,
          statusOnEnd: "unconscious",
          movementOnly: true,
          sourceActorUuid: "Actor.healer",
          ...overrides,
        },
      },
    },
  };
}

test("Let's Go blocks non-movement action rolls while active", () => {
  const restriction = getHealingSupportRestriction({
    effects: [supportEffect()],
  });

  assert.equal(restriction.kind, "lets-go");
  assert.equal(restriction.effectName, "Let's Go");
});

test("Never Surrender blocks Focus spending while active", () => {
  const effect = supportEffect({
    kind: "never-surrender",
    movementOnly: false,
    preventFocusSpend: true,
  });

  assert.equal(isHealingSupportFocusSpendBlocked({ effects: [effect] }), true);
});

test("restoring the guarded resource ends the source concentration", async () => {
  const originalGame = globalThis.game;
  const originalFromUuidSync = globalThis.fromUuidSync;
  const healer = { uuid: "Actor.healer" };
  const ended = [];
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } },
    marvelMultiverse: {
      async endConcentration(actor, options) {
        ended.push({ actor, options });
        return { success: true };
      },
    },
  };
  globalThis.fromUuidSync = (uuid) => uuid === healer.uuid ? healer : null;

  try {
    const result = await handleHealingSupportResourceUpdate({
      system: { health: { value: 1 } },
      effects: [supportEffect()],
    });

    assert.equal(result.ended, 1);
    assert.equal(ended[0].actor, healer);
    assert.equal(ended[0].options.reason, "health-restored");
  } finally {
    globalThis.game = originalGame;
    globalThis.fromUuidSync = originalFromUuidSync;
  }
});

test("simultaneous resource updates end maintained support only once", async () => {
  const originalGame = globalThis.game;
  const originalFromUuidSync = globalThis.fromUuidSync;
  const healer = { uuid: "Actor.healer" };
  let releaseEnd;
  let signalStarted;
  const started = new Promise((resolve) => {
    signalStarted = resolve;
  });
  const release = new Promise((resolve) => {
    releaseEnd = resolve;
  });
  let endCalls = 0;
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } },
    marvelMultiverse: {
      async endConcentration() {
        endCalls += 1;
        signalStarted();
        await release;
        return { success: true };
      },
    },
  };
  globalThis.fromUuidSync = (uuid) => uuid === healer.uuid ? healer : null;
  const actor = {
    system: { health: { value: 1 } },
    effects: [supportEffect()],
  };

  try {
    const first = handleHealingSupportResourceUpdate(actor);
    await started;
    const second = handleHealingSupportResourceUpdate(actor);
    releaseEnd();
    const results = await Promise.all([first, second]);

    assert.equal(endCalls, 1);
    assert.deepEqual(results.map((result) => result.ended), [1, 0]);
  } finally {
    globalThis.game = originalGame;
    globalThis.fromUuidSync = originalFromUuidSync;
  }
});

test("ending support at zero reapplies its guarded condition", async () => {
  const originalGame = globalThis.game;
  const actor = {
    uuid: "Actor.patient",
    system: { health: { value: 0 } },
    effects: { contents: [] },
    async createEmbeddedDocuments(_type, entries) {
      const created = entries.map((entry) => ({ ...entry, id: "unconscious" }));
      this.effects.contents.push(...created);
      return created;
    },
  };
  const effect = supportEffect();
  effect.parent = actor;
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } },
  };

  try {
    const result = await handleHealingSupportEffectDeleted(effect);

    assert.equal(result.applied, true);
    assert.equal(actor.effects.contents[0].statuses[0], "unconscious");
  } finally {
    globalThis.game = originalGame;
  }
});

test("ending support after recovery does not reapply the condition", async () => {
  const originalGame = globalThis.game;
  const actor = {
    system: { health: { value: 1 } },
    effects: { contents: [] },
  };
  const effect = supportEffect();
  effect.parent = actor;
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } },
  };

  try {
    const result = await handleHealingSupportEffectDeleted(effect);

    assert.equal(result.applied, false);
  } finally {
    globalThis.game = originalGame;
  }
});
