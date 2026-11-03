import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  handlePersistentAreaEntry,
  handlePersistentAreaTurnStart,
  matchesPersistentAreaTrigger,
  requestPersistentAreaCheck,
} = await import("../lib/services/persistent-area-triggers.mjs");
const {
  placePowerArea,
  resolveAreaTargetingConfig,
  validateConnectedSpaceShapes,
} = await import("../lib/services/area-targeting.mjs");
const { rollEscapeCheck } = await import("../lib/escape-automation.mjs");
const { undoMessageConditions } = await import("../lib/conditions.mjs");
const { resolveUtilityTargetLimits } = await import("../lib/services/utility-activation.mjs");

const webtrapping = JSON.parse(await readFile(
  new URL("../packs/_source/powers/Spider-Powers/webtrapping.json", import.meta.url),
  "utf8",
));

function createActor() {
  let nextId = 0;
  const actor = {
    uuid: "Actor.web-target",
    isOwner: true,
    system: { abilities: { agl: { value: 4 }, mle: { value: 5 } } },
    effects: { contents: [] },
    async createEmbeddedDocuments(_type, data) {
      const created = data.map((entry) => ({ ...entry, id: `effect-${nextId++}` }));
      this.effects.contents.push(...created);
      return created;
    },
    async deleteEmbeddedDocuments(_type, ids) {
      this.effects.contents = this.effects.contents.filter((effect) => !ids.includes(effect.id));
    },
  };
  return actor;
}

function createMessage(id = "area-check") {
  const scope = {};
  return {
    id,
    uuid: `ChatMessage.${id}`,
    getFlag(namespace, key) {
      if (namespace !== "marvel-multiverse") return null;
      return key ? scope[key] ?? null : scope;
    },
    async update(payload) {
      Object.assign(scope, payload?.flags?.["marvel-multiverse"] ?? {});
    },
  };
}

function createRegion(trigger = resolveAreaTargetingConfig(webtrapping).trigger) {
  return {
    id: "web-region",
    uuid: "Scene.test.Region.web-region",
    name: "Webtrapping Area",
    flags: {
      "marvel-multiverse": {
        powerArea: { persistent: true, trigger },
      },
    },
    testPoint: ({ x }) => x >= 100,
  };
}

function createToken(actor, x = 100) {
  return {
    actor,
    document: {
      uuid: "Scene.test.Token.target",
      x,
      y: 0,
      width: 1,
      height: 1,
      elevation: 0,
      actor,
    },
  };
}

test("Webtrapping declares explicit connected placement and a typed area trigger", () => {
  const area = resolveAreaTargetingConfig(webtrapping);
  assert.equal(area.shape, "connected-spaces");
  assert.equal(area.maximumSpaces, 5);
  assert.equal(area.persistent, true);
  assert.deepEqual(resolveUtilityTargetLimits(webtrapping, {}).minimum, 0);
  assert.deepEqual(resolveUtilityTargetLimits(webtrapping, {}).maximum, 0);
  assert.deepEqual(area.trigger, {
    version: 1,
    events: ["enter", "start-turn"],
    check: { ability: "agl", targetNumber: 20 },
    failure: {
      statusId: "paralyzed",
      escape: { ability: "mle", targetNumber: 20, timing: "action" },
    },
  });
});

test("persistent trigger matching distinguishes entry and start-turn membership", () => {
  const trigger = resolveAreaTargetingConfig(webtrapping).trigger;
  assert.equal(matchesPersistentAreaTrigger(trigger, "enter", { wasInside: false, isInside: true }), true);
  assert.equal(matchesPersistentAreaTrigger(trigger, "enter", { wasInside: true, isInside: true }), false);
  assert.equal(matchesPersistentAreaTrigger(trigger, "enter", { wasInside: false, isInside: false }), false);
  assert.equal(matchesPersistentAreaTrigger(trigger, "start-turn", { isInside: true }), true);
  assert.equal(matchesPersistentAreaTrigger(trigger, "start-turn", { isInside: false }), false);
});

test("entry and start-turn handlers request only matching checks", async () => {
  const actor = createActor();
  const token = createToken(actor);
  const region = createRegion();
  const scene = { regions: [region] };
  const requestedEvents = [];
  const requestRoll = async (request) => {
    requestedEvents.push(request.actionName);
    return { cancelled: false, result: { isSuccess: true }, message: createMessage(`check-${requestedEvents.length}`) };
  };

  const entry = await handlePersistentAreaEntry(
    token,
    new Map([[region.uuid, false]]),
    { scene, gridSize: 100, ignoreAuthority: true, requestRoll },
  );
  const repeatedEntry = await handlePersistentAreaEntry(
    token,
    new Map([[region.uuid, true]]),
    { scene, gridSize: 100, ignoreAuthority: true, requestRoll },
  );
  const startTurn = await handlePersistentAreaTurnStart(
    { combatant: { token: token.document } },
    { combatant: { token: token.document }, scene, gridSize: 100, ignoreAuthority: true, requestRoll },
  );

  assert.equal(entry.length, 1);
  assert.equal(repeatedEntry.length, 0);
  assert.equal(startTurn.length, 1);
  assert.equal(requestedEvents.length, 2);
});

test("successful checks do not apply paralyzed", async () => {
  const actor = createActor();
  const token = createToken(actor);
  const message = createMessage("success");
  const result = await requestPersistentAreaCheck(createRegion(), token, "enter", {
    requestRoll: async () => ({ cancelled: false, result: { isSuccess: true }, message }),
    wasInside: false,
    isInside: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.statusApplied, false);
  assert.equal(actor.effects.contents.length, 0);
  assert.equal(message.getFlag("marvel-multiverse", "statusTransactions"), null);
});

test("failed checks apply one paralyzed status with escape metadata and support escape", async () => {
  const previousFromUuidSync = globalThis.fromUuidSync;
  const previousHooks = globalThis.Hooks;
  const previousGame = globalThis.game;
  const actor = createActor();
  const token = createToken(actor);
  const messages = [createMessage("failure-one"), createMessage("failure-two")];
  globalThis.fromUuidSync = (uuid) => uuid === token.document.uuid || uuid === actor.uuid ? token.document : null;
  globalThis.Hooks = { callAll() {} };
  globalThis.game = { user: { id: "gm", isGM: true } };
  try {
    const fail = () => async () => ({
      cancelled: false,
      result: { isSuccess: false },
      message: messages.shift(),
    });
    const first = await requestPersistentAreaCheck(createRegion(), token, "enter", {
      requestRoll: fail(),
      wasInside: false,
      isInside: true,
    });
    const firstMessage = first.message;
    const second = await requestPersistentAreaCheck(createRegion(), token, "start-turn", {
      requestRoll: fail(),
      isInside: true,
    });

    assert.equal(first.statusApplied, true);
    assert.equal(second.statusSkipped, true);
    assert.equal(actor.effects.contents.length, 1);
    const transaction = firstMessage.getFlag("marvel-multiverse", "statusTransactions")[0];
    assert.deepEqual(transaction.escape, {
      type: "fixed",
      ability: "mle",
      tn: 20,
      edgeMode: "normal",
      removesStatuses: ["paralyzed"],
      timing: "action",
    });
    assert.deepEqual(transaction.targets[0].statuses[0].effectIds, ["effect-0"]);

    const escaped = await rollEscapeCheck(firstMessage, {
      statusTransactionId: transaction.id,
      targetUuid: token.document.uuid,
      rollResult: { total: 20 },
    });
    assert.equal(escaped.escapeSucceeded, true);
    assert.deepEqual(escaped.removedStatuses, ["paralyzed"]);
    assert.equal(actor.effects.contents.length, 0);
  } finally {
    globalThis.fromUuidSync = previousFromUuidSync;
    globalThis.Hooks = previousHooks;
    globalThis.game = previousGame;
  }
});

test("failed-check condition application can be undone from its check message", async () => {
  const previousFromUuidSync = globalThis.fromUuidSync;
  const previousGame = globalThis.game;
  const actor = createActor();
  const token = createToken(actor);
  const message = createMessage("undo");
  globalThis.fromUuidSync = () => token.document;
  globalThis.game = { user: { id: "gm", isGM: true } };
  try {
    await requestPersistentAreaCheck(createRegion(), token, "enter", {
      requestRoll: async () => ({ cancelled: false, result: { isSuccess: false }, message }),
      wasInside: false,
      isInside: true,
    });
    const undo = await undoMessageConditions(message);
    assert.equal(undo.success, true);
    assert.equal(actor.effects.contents.length, 0);
  } finally {
    globalThis.fromUuidSync = previousFromUuidSync;
    globalThis.game = previousGame;
  }
});

test("connected-space placement preserves each explicit selected cell", async () => {
  const shapes = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
  ];
  assert.equal(validateConnectedSpaceShapes(shapes, 100, 5), true);
  assert.equal(validateConnectedSpaceShapes([shapes[0], { x: 300, y: 100 }], 100, 5), false);

  const placements = shapes.map((shape) => ({
    document: {
      shapes: [{ type: "rectangle", width: 100, height: 100, ...shape }],
      toObject() {
        return {
          name: "Webtrapping Area",
          shapes: this.shapes.map((entry) => ({ ...entry })),
          flags: { "marvel-multiverse": { powerArea: {} } },
        };
      },
    },
  }));
  placements.push(null);
  const canvas = {
    ready: true,
    grid: { size: 100 },
    regions: { async placeRegion() { return placements.shift(); } },
  };
  const placement = await placePowerArea(webtrapping, { canvas });
  assert.equal(placement.cancelled, false);
  assert.deepEqual(
    placement.region.document.toObject().shapes.map(({ x, y }) => ({ x, y })),
    shapes,
  );
});
