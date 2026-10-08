import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = {
  settings: {
    get: () => false
  }
};

const { previewPowerOutcomes } = await import("../lib/services/power-events.mjs");

function createMessage({ targets, damageContext = { targets: [] } }) {
  const flags = {
    rollContext: {
      actorUuid: "Actor.source",
      itemUuid: "Item.power"
    },
    attackResolution: {
      targets
    },
    damageContext
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
  const createDamageMessage = ({ outcome, finalDamage }) => createMessage({
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
    }
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
  const headshotDamage = previewPowerOutcomes(
    createDamageMessage({ outcome: "hit", finalDamage: 1 }),
    { item: anyDamageItem, triggers: ["health-damage-applied"] }
  );

  assert.equal(fantasticDamage.targets.length, 1);
  assert.equal(zeroDamage.targets.length, 0);
  assert.equal(ordinaryDamage.targets.length, 0);
  assert.equal(headshotDamage.targets.length, 1);
});
