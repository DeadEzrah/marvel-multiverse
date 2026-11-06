import test from "node:test";
import assert from "node:assert/strict";

globalThis.game = globalThis.game ?? { settings: { get: () => false } };

const {
  getFocusTransactions,
  refundMessageFocus,
  spendMessageFocus,
} = await import("../lib/focus-automation.mjs");

function createActor(uuid, focusValue, focusMax = 30) {
  return {
    uuid,
    documentName: "Actor",
    system: { focus: { value: focusValue, max: focusMax } },
    effects: [],
    async update(changes) {
      // The real document API accepts both flat ("system.focus.value") and nested payloads.
      const flat = changes["system.focus.value"];
      this.system.focus.value = flat !== undefined ? flat : changes.system.focus.value;
    },
  };
}

function createMessage(scopeFlags) {
  return {
    flags: { "marvel-multiverse": structuredClone(scopeFlags) },
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
}

function withEnvironment(documents, run) {
  const originalGame = globalThis.game;
  const originalHooks = globalThis.Hooks;
  const originalFromUuidSync = globalThis.fromUuidSync;
  globalThis.game = { settings: { get: () => false }, user: { id: "gm", isGM: true } };
  globalThis.Hooks = { callAll: () => {} };
  globalThis.fromUuidSync = (uuid) => documents[uuid] ?? null;
  return Promise.resolve(run()).finally(() => {
    globalThis.game = originalGame;
    globalThis.Hooks = originalHooks;
    globalThis.fromUuidSync = originalFromUuidSync;
  });
}

test("a fixed-cost spend records one transaction and reduces Focus once", async () => {
  const hero = createActor("Actor.hero", 20);
  const message = createMessage({
    rollContext: { actorUuid: hero.uuid, itemUuid: "Item.power", focusCost: { type: "fixed", value: 5 } },
  });

  await withEnvironment({ [hero.uuid]: hero }, async () => {
    const result = await spendMessageFocus(message, { quiet: true });

    assert.equal(result.success, true);
    assert.equal(result.previousValue, 20);
    assert.equal(result.newValue, 15);
    assert.equal(hero.system.focus.value, 15);

    const transactions = getFocusTransactions(message);
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].type, "spend");
    assert.equal(transactions[0].appliedAmount, 5);
    assert.equal(transactions[0].refunded, false);
    assert.equal(transactions[0].itemUuid, "Item.power");
  });
});

test("refund restores the exact previous value and a second refund is rejected", async () => {
  const hero = createActor("Actor.hero", 20);
  const message = createMessage({
    rollContext: { actorUuid: hero.uuid, focusCost: { type: "fixed", value: 8 } },
  });

  await withEnvironment({ [hero.uuid]: hero }, async () => {
    await spendMessageFocus(message, { quiet: true });
    assert.equal(hero.system.focus.value, 12);

    const refund = await refundMessageFocus(message, { quiet: true });
    assert.equal(refund.success, true);
    assert.equal(hero.system.focus.value, 20);
    assert.equal(getFocusTransactions(message)[0].refunded, true);

    const duplicate = await refundMessageFocus(message, { quiet: true });
    assert.equal(duplicate.success, false);
    assert.equal(duplicate.issues[0].code, "NO_REFUNDABLE_TRANSACTION");
    assert.equal(hero.system.focus.value, 20);
  });
});

test("insufficient Focus blocks the spend without recording a transaction", async () => {
  const hero = createActor("Actor.hero", 3);
  const message = createMessage({
    rollContext: { actorUuid: hero.uuid, focusCost: { type: "fixed", value: 10 } },
  });

  await withEnvironment({ [hero.uuid]: hero }, async () => {
    const result = await spendMessageFocus(message, { quiet: true });

    assert.equal(result.success, false);
    assert.equal(result.issues[0].code, "INSUFFICIENT_FOCUS");
    assert.equal(hero.system.focus.value, 3);
    assert.equal(getFocusTransactions(message).length, 0);
  });
});

test("variable costs reject amounts below the declared minimum", async () => {
  const hero = createActor("Actor.hero", 20);
  const message = createMessage({
    rollContext: { actorUuid: hero.uuid, focusCost: { type: "variable", minimum: 5, maximum: 15 } },
  });

  await withEnvironment({ [hero.uuid]: hero }, async () => {
    const below = await spendMessageFocus(message, { amount: 3, quiet: true });
    assert.equal(below.success, false);
    assert.equal(below.issues[0].code, "FOCUS_COST_BELOW_MINIMUM");

    const above = await spendMessageFocus(message, { amount: 16, quiet: true });
    assert.equal(above.success, false);
    assert.equal(above.issues[0].code, "FOCUS_COST_ABOVE_MAXIMUM");

    const valid = await spendMessageFocus(message, { amount: 10, quiet: true });
    assert.equal(valid.success, true);
    assert.equal(hero.system.focus.value, 10);
  });
});

test("a modern actionFocus spend refunds once and never restores twice", async () => {
  const hero = createActor("Actor.hero", 15);
  const message = createMessage({
    rollContext: { actorUuid: hero.uuid },
    actionFocus: { version: 1, actorUuid: "Actor.hero", amount: 5, previousValue: 20, newValue: 15 },
  });

  await withEnvironment({ [hero.uuid]: hero }, async () => {
    const refund = await refundMessageFocus(message, { quiet: true });
    assert.equal(refund.success, true);
    assert.equal(hero.system.focus.value, 20);
    assert.equal(message.getFlag("marvel-multiverse", "actionFocus").refunded, true);

    const duplicate = await refundMessageFocus(message, { quiet: true });
    assert.equal(duplicate.success, false);
    assert.equal(duplicate.issues[0].code, "NO_REFUNDABLE_TRANSACTION");
    assert.equal(hero.system.focus.value, 20);
  });
});

test("a Focus change after the spend requires an explicit add-back choice", async () => {
  const hero = createActor("Actor.hero", 11);
  const message = createMessage({
    rollContext: { actorUuid: hero.uuid },
    actionFocus: { version: 1, actorUuid: "Actor.hero", amount: 5, previousValue: 20, newValue: 15 },
  });

  await withEnvironment({ [hero.uuid]: hero }, async () => {
    const conflicted = await refundMessageFocus(message, { quiet: true });
    assert.equal(conflicted.success, false);
    assert.equal(conflicted.issues[0].code, "FOCUS_CONFLICT");
    assert.equal(hero.system.focus.value, 11);

    const forced = await refundMessageFocus(message, { quiet: true, force: true });
    assert.equal(forced.success, true);
    assert.equal(hero.system.focus.value, 20);
    assert.equal(message.getFlag("marvel-multiverse", "actionFocus").refunded, true);
  });
});
