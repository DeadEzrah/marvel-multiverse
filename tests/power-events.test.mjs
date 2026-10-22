import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = {
  settings: {
    get: () => false
  }
};

const {
  previewPowerOutcomes,
  sweepActorTurnDefensiveEffects,
  sweepExpiredPowerEffects,
  undoPowerOutcomes,
  validatePowerEvents
} = await import("../lib/services/power-events.mjs");

test("Untouchable Position expires at the start of the defender's next turn", async () => {
  const deleted = [];
  const effect = {
    id: "untouchable-effect",
    flags: {
      "marvel-multiverse": {
        untouchablePosition: {
          active: true,
          combatId: "combat",
          combatantId: "defender-combatant"
        }
      }
    }
  };
  const actor = {
    effects: [effect],
    async deleteEmbeddedDocuments(_type, ids) {
      deleted.push(...ids);
    }
  };
  const previousGame = globalThis.game;
  globalThis.game = {
    ...previousGame,
    actors: [actor],
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } }
  };

  try {
    const wrongTurn = await sweepActorTurnDefensiveEffects(
      { id: "combat" },
      { boundary: "start", combatantId: "other-combatant" }
    );
    const nextTurn = await sweepActorTurnDefensiveEffects(
      { id: "combat" },
      { boundary: "start", combatantId: "defender-combatant" }
    );

    assert.equal(wrongTurn.sweptCount, 0);
    assert.equal(nextTurn.sweptCount, 1);
    assert.deepEqual(deleted, ["untouchable-effect"]);
  } finally {
    globalThis.game = previousGame;
  }
});

function createMessage({ targets, damageContext = { targets: [] }, damageApplications = [] }) {
  const flags = {
    rollContext: {
      actorUuid: "Actor.source",
      itemUuid: "Item.power"
    },
    attackResolution: {
      targets
    },
    damageContext,
    damageApplications
  };

  return {
    getFlag: (_scope, key) => flags[key] ?? null
  };
}

test("source outcomes appear once regardless of target count", () => {
  const item = {
    system: {
      events: [{
        id: "source-prone",
        trigger: "target-fantastic-hit",
        recipient: "source",
        outcomes: [{
          id: "apply-source-prone",
          type: "status",
          statusId: "prone"
        }]
      }]
    }
  };
  const message = createMessage({
    targets: [
      { uuid: "Actor.target-1", actorUuid: "Actor.target-1", name: "Target 1", outcome: "fantastic-hit" },
      { uuid: "Actor.target-2", actorUuid: "Actor.target-2", name: "Target 2", outcome: "fantastic-hit" }
    ]
  });

  const preview = previewPowerOutcomes(message, {
    item,
    triggers: ["target-fantastic-hit"],
    sourceName: "Source"
  });

  assert.equal(preview.targets.length, 1);
  assert.equal(preview.targets[0].targetUuid, null);
  assert.equal(preview.targets[0].name, "Source");
  assert.equal(preview.targets[0].outcomes.length, 1);
});

test("target utility outcomes resolve actors from roll-context target UUIDs", () => {
  const originalFromUuidSync = globalThis.fromUuidSync;
  globalThis.fromUuidSync = (uuid) => uuid === "Actor.target"
    ? { uuid, name: "Reaction Target", documentName: "Actor" }
    : null;
  const item = {
    system: {
      events: [{
        id: "utility-target-damage",
        trigger: "action-declared",
        recipient: "target",
        outcomes: [{
          id: "damage-target",
          type: "damage",
          amount: 5
        }]
      }]
    }
  };
  const message = {
    getFlag: (_scope, key) => key === "rollContext"
      ? { actorUuid: "Actor.source", itemUuid: "Item.power", targetUuids: ["Actor.target"] }
      : null
  };

  try {
    const preview = previewPowerOutcomes(message, {
      item,
      triggers: ["action-declared"]
    });

    assert.equal(preview.targets.length, 1);
    assert.equal(preview.targets[0].targetUuid, "Actor.target");
    assert.equal(preview.targets[0].name, "Reaction Target");
  } finally {
    globalThis.fromUuidSync = originalFromUuidSync;
  }
});

test("self-and-target outcomes include source and the hit target", () => {
  const item = {
    system: {
      events: [{
        id: "both-prone",
        trigger: "target-hit",
        recipient: "self-and-target",
        outcomes: [{
          id: "apply-both-prone",
          type: "status",
          statusId: "prone"
        }]
      }]
    }
  };
  const message = createMessage({
    targets: [
      { uuid: "Actor.target", actorUuid: "Actor.target", name: "Target", outcome: "hit" }
    ]
  });

  const preview = previewPowerOutcomes(message, {
    item,
    triggers: ["target-hit"],
    sourceName: "Source"
  });

  assert.deepEqual(
    preview.targets.map((entry) => entry.targetUuid),
    [null, "Actor.target"]
  );
  assert.equal(preview.targets[0].outcomes[0].recipientRole, "self-and-target");
  assert.equal(preview.targets[1].outcomes[0].recipientRole, "self-and-target");
});

test("after-roll source reminders appear after a hit or miss", () => {
  const item = {
    system: {
      events: [{
        id: "regain-reaction",
        trigger: "after-roll",
        recipient: "source",
        outcomes: [{
          id: "regain-reaction-reminder",
          type: "manual",
          label: "Regain the reaction spent on this attack."
        }]
      }]
    }
  };
  const message = createMessage({
    targets: [{
      uuid: "Actor.target",
      actorUuid: "Actor.target",
      name: "Target",
      outcome: "miss"
    }]
  });

  const preview = previewPowerOutcomes(message, {
    item,
    triggers: ["after-roll"],
    sourceName: "Source"
  });

  assert.equal(preview.targets.length, 1);
  assert.equal(preview.targets[0].targetUuid, null);
  assert.equal(preview.targets[0].outcomes[0].outcome.label, "Regain the reaction spent on this attack.");
});

test("damage-gated conditions require positive matching damage and any declared hit requirement", () => {
  const fantasticDamageItem = {
    system: {
      events: [{
        id: "fantastic-health-stun",
        trigger: "health-damage-applied",
        recipient: "target",
        requirements: [{
          type: "target-fantastic-hit"
        }],
        outcomes: [{
          id: "apply-stunned",
          type: "status",
          statusId: "stunned"
        }]
      }]
    }
  };
  const anyDamageItem = {
    system: {
      events: [{
        id: "health-stun",
        trigger: "health-damage-applied",
        recipient: "target",
        outcomes: [{
          id: "apply-stunned",
          type: "status",
          statusId: "stunned"
        }]
      }]
    }
  };
  const createDamageMessage = ({ outcome, finalDamage, previousValue = 10, newValue = previousValue - finalDamage }) => createMessage({
    targets: [{
      uuid: "Token.target",
      actor: { uuid: "Actor.target", name: "Target" },
      outcome
    }],
    damageContext: {
      damageType: "health",
      targets: [{
        targetUuid: "Token.target",
        finalDamage
      }]
    },
    damageApplications: [{
      undone: false,
      targets: [{
        targetUuid: "Token.target",
        actorUuid: "Actor.target",
        appliedDamage: finalDamage,
        previousValue,
        newValue
      }]
    }]
  });

  const fantasticDamage = previewPowerOutcomes(
    createDamageMessage({ outcome: "fantastic-hit", finalDamage: 1 }),
    { item: fantasticDamageItem, triggers: ["health-damage-applied"] }
  );
  const zeroDamage = previewPowerOutcomes(
    createDamageMessage({ outcome: "fantastic-hit", finalDamage: 0 }),
    { item: fantasticDamageItem, triggers: ["health-damage-applied"] }
  );
  const ordinaryDamage = previewPowerOutcomes(
    createDamageMessage({ outcome: "hit", finalDamage: 1 }),
    { item: fantasticDamageItem, triggers: ["health-damage-applied"] }
  );
  const noResourceLoss = previewPowerOutcomes(
    createDamageMessage({ outcome: "fantastic-hit", finalDamage: 1, previousValue: 0, newValue: 0 }),
    { item: fantasticDamageItem, triggers: ["health-damage-applied"] }
  );
  const headshotDamage = previewPowerOutcomes(
    createDamageMessage({ outcome: "hit", finalDamage: 1 }),
    { item: anyDamageItem, triggers: ["health-damage-applied"] }
  );

  assert.equal(fantasticDamage.targets.length, 1);
  assert.equal(zeroDamage.targets.length, 0);
  assert.equal(ordinaryDamage.targets.length, 0);
  assert.equal(noResourceLoss.targets.length, 0);
  assert.equal(headshotDamage.targets.length, 1);
});

test("resource changes accept actor-data formulas", () => {
  const validation = validatePowerEvents([{
    id: "regain-focus",
    trigger: "action-declared",
    recipient: "source",
    outcomes: [{
      id: "restore-focus",
      type: "resource-change",
      resource: "focus",
      formula: "@vig.value"
    }]
  }]);

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
});

test("undo without a transaction id reverses every applied target outcome", async () => {
  const transactions = [
    {
      id: "target-a",
      targetActorUuid: "Actor.target-a",
      createdEffectIds: ["effect-a"],
      undone: false
    },
    {
      id: "target-b",
      targetActorUuid: "Actor.target-b",
      createdEffectIds: ["effect-b"],
      undone: false
    }
  ];
  const deleted = [];
  const actors = new Map([
    ["Actor.target-a", {
      documentName: "Actor",
      deleteEmbeddedDocuments: async (_type, ids) => deleted.push(...ids)
    }],
    ["Actor.target-b", {
      documentName: "Actor",
      deleteEmbeddedDocuments: async (_type, ids) => deleted.push(...ids)
    }]
  ]);
  const originalFromUuidSync = globalThis.fromUuidSync;
  globalThis.fromUuidSync = (uuid) => actors.get(uuid) ?? null;
  const message = {
    getFlag: (_scope, key) => key === "resolution" ? { eventTransactions: transactions } : null,
    update: async () => {}
  };

  try {
    const result = await undoPowerOutcomes(message);

    assert.equal(result.success, true);
    assert.equal(result.transactions.length, 2);
    assert.deepEqual(deleted.sort(), ["effect-a", "effect-b"]);
    assert.equal(transactions.every((entry) => entry.undone), true);
  } finally {
    globalThis.fromUuidSync = originalFromUuidSync;
  }
});

test("concurrent duration sweeps delete an expired effect only once", async () => {
  const transaction = {
    id: "timed-status",
    targetActorUuid: "Actor.target",
    createdEffectIds: ["effect-a"],
    duration: { type: "rounds", value: 1 },
    expiration: { combatId: "combat", round: 1 },
    undone: false
  };
  const deleted = [];
  const actor = {
    documentName: "Actor",
    effects: new Map([["effect-a", { id: "effect-a" }]]),
    deleteEmbeddedDocuments: async (_type, ids) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      deleted.push(...ids);
      for (const id of ids) actor.effects.delete(id);
    }
  };
  const message = {
    getFlag: (_scope, key) => key === "resolution" ? { eventTransactions: [transaction] } : null,
    update: async () => {}
  };
  const originalGame = globalThis.game;
  const originalFromUuidSync = globalThis.fromUuidSync;
  globalThis.game = {
    ...originalGame,
    messages: [message],
    actors: [],
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } }
  };
  globalThis.fromUuidSync = (uuid) => uuid === "Actor.target" ? actor : null;

  try {
    const results = await Promise.all([
      sweepExpiredPowerEffects({ id: "combat", round: 2 }),
      sweepExpiredPowerEffects({ id: "combat", round: 2 }, { boundary: "start", combatantId: "target" })
    ]);

    assert.deepEqual(deleted, ["effect-a"]);
    assert.equal(transaction.undone, true);
    assert.equal(results[0].sweptCount + results[1].sweptCount, 1);
  } finally {
    globalThis.game = originalGame;
    globalThis.fromUuidSync = originalFromUuidSync;
  }
});

test("duration sweeps close stale transactions whose effects are already gone", async () => {
  const transaction = {
    id: "stale-status",
    targetActorUuid: "Actor.target",
    createdEffectIds: ["missing-effect"],
    duration: { type: "rounds", value: 1 },
    expiration: { combatId: "combat", round: 1 },
    undone: false
  };
  let deleteCalls = 0;
  const actor = {
    documentName: "Actor",
    effects: new Map(),
    deleteEmbeddedDocuments: async () => {
      deleteCalls += 1;
    }
  };
  const message = {
    getFlag: (_scope, key) => key === "resolution" ? { eventTransactions: [transaction] } : null,
    update: async () => {}
  };
  const originalGame = globalThis.game;
  const originalFromUuidSync = globalThis.fromUuidSync;
  globalThis.game = {
    ...originalGame,
    messages: [message],
    actors: [],
    user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } }
  };
  globalThis.fromUuidSync = (uuid) => uuid === "Actor.target" ? actor : null;

  try {
    const result = await sweepExpiredPowerEffects({ id: "combat", round: 2 });

    assert.equal(result.sweptCount, 1);
    assert.equal(deleteCalls, 0);
    assert.equal(transaction.undone, true);
  } finally {
    globalThis.game = originalGame;
    globalThis.fromUuidSync = originalFromUuidSync;
  }
});
