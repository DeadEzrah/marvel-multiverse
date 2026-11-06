import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = globalThis.game ?? { settings: { get: () => false } };

const { buildRollContext, getRollContext } = await import("../lib/roll-context.mjs");
const { spendMessageFocus, refundMessageFocus } = await import("../lib/focus-automation.mjs");

const TOKEN_UUID = "Scene.arena.Token.goon";
const TOKEN_ITEM_UUID = `${TOKEN_UUID}.Item.blast`;

test("roll contexts preserve unlinked-token embedded item uuids", () => {
  const context = buildRollContext({
    actor: { uuid: `${TOKEN_UUID}.Actor.goon` },
    token: { uuid: TOKEN_UUID },
    item: { uuid: TOKEN_ITEM_UUID, name: "Energy Blast", system: { ability: "ego" } },
  });

  assert.equal(context.itemUuid, TOKEN_ITEM_UUID);
  assert.equal(context.tokenUuid, TOKEN_UUID);
  assert.equal(context.actorUuid, `${TOKEN_UUID}.Actor.goon`);
});

test("stored roll contexts round-trip through message flags", () => {
  const context = buildRollContext({
    item: { uuid: TOKEN_ITEM_UUID, name: "Energy Blast", system: {} },
    options: { tokenUuid: TOKEN_UUID },
  });
  const message = { flags: { "marvel-multiverse": { rollContext: context } } };

  const stored = getRollContext(message);
  assert.equal(stored.itemUuid, TOKEN_ITEM_UUID);
  assert.equal(stored.tokenUuid, TOKEN_UUID);
});

test("focus spend and refund resolve the unlinked token's synthetic actor", async () => {
  const syntheticActor = {
    uuid: `${TOKEN_UUID}.Actor.goon`,
    documentName: "Actor",
    system: { focus: { value: 10, max: 10 } },
    effects: [],
    async update(changes) {
      this.system.focus.value = changes.system.focus.value;
    },
  };
  const tokenDocument = { uuid: TOKEN_UUID, documentName: "TokenDocument", actor: syntheticActor };
  const message = {
    flags: {
      "marvel-multiverse": {
        rollContext: {
          actorUuid: null,
          tokenUuid: TOKEN_UUID,
          itemUuid: TOKEN_ITEM_UUID,
          focusCost: { type: "fixed", value: 4 },
        },
      },
    },
    getFlag(scope, key) {
      const scoped = this.flags[scope] ?? {};
      if (key === undefined) return scoped;
      return key.split(".").reduce((value, part) => value?.[part], scoped) ?? null;
    },
    async update(payload) {
      this.flags["marvel-multiverse"] = payload.flags["marvel-multiverse"];
      return this;
    },
  };

  const originalGame = globalThis.game;
  const originalHooks = globalThis.Hooks;
  const originalFromUuidSync = globalThis.fromUuidSync;
  globalThis.game = { settings: { get: () => false }, user: { id: "gm", isGM: true } };
  globalThis.Hooks = { callAll: () => {} };
  globalThis.fromUuidSync = (uuid) => (uuid === TOKEN_UUID ? tokenDocument : null);

  try {
    const spend = await spendMessageFocus(message, { quiet: true });
    assert.equal(spend.success, true);
    assert.equal(spend.actorUuid, syntheticActor.uuid);
    assert.equal(syntheticActor.system.focus.value, 6);
    // The transaction remembers the unlinked token so later refunds re-resolve the same copy.
    const transaction = message.getFlag("marvel-multiverse", "focusTransactions")[0];
    assert.equal(transaction.tokenUuid, TOKEN_UUID);
    assert.equal(transaction.itemUuid, TOKEN_ITEM_UUID);

    const refund = await refundMessageFocus(message, { quiet: true });
    assert.equal(refund.success, true);
    assert.equal(syntheticActor.system.focus.value, 10);
  } finally {
    globalThis.game = originalGame;
    globalThis.Hooks = originalHooks;
    globalThis.fromUuidSync = originalFromUuidSync;
  }
});
