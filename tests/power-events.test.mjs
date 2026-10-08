import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = {
  settings: {
    get: () => false
  }
};

const { previewPowerOutcomes } = await import("../lib/services/power-events.mjs");

function createMessage({ targets }) {
  const flags = {
    rollContext: {
      actorUuid: "Actor.source",
      itemUuid: "Item.power"
    },
    attackResolution: {
      targets
    },
    damageContext: {
      targets: []
    }
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
