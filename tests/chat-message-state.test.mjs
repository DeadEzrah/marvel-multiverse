import test from "node:test";
import assert from "node:assert/strict";

const { updateChatMessageFlags } = await import("../lib/chat-message-state.mjs");

test("concurrent updates preserve sibling resolution fields", async () => {
  const message = {
    flags: { "marvel-multiverse": {} },
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async update(payload) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      this.flags = structuredClone(payload.flags);
      return this;
    }
  };

  await Promise.all([
    updateChatMessageFlags(message, {
      "marvel-multiverse": {
        resolution: {
          evaluatedEvents: [{ eventId: "fantastic-reminder" }]
        }
      }
    }),
    updateChatMessageFlags(message, {
      "marvel-multiverse": {
        resolution: {
          damageTransactions: [{ id: "damage-transaction" }]
        }
      }
    })
  ]);

  assert.deepEqual(
    message.flags["marvel-multiverse"].resolution.evaluatedEvents,
    [{ eventId: "fantastic-reminder" }]
  );
  assert.deepEqual(
    message.flags["marvel-multiverse"].resolution.damageTransactions,
    [{ id: "damage-transaction" }]
  );
});
