import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRollMessageOptions } from "../lib/roll-message-options.mjs";

test("maps legacy rollMode input to Foundry 14 messageMode", () => {
  const options = normalizeRollMessageOptions({
    rollMode: "gmroll",
    create: false,
  });

  assert.deepEqual(options, {
    messageMode: "gm",
    create: false,
  });
});

test("preserves explicit messageMode and leaves caller options unchanged", () => {
  const original = {
    messageMode: "blind",
    rollMode: "publicroll",
    itemId: "power-1",
  };

  const options = normalizeRollMessageOptions(original, "selfroll");

  assert.deepEqual(options, {
    messageMode: "blind",
    itemId: "power-1",
  });
  assert.equal(original.rollMode, "publicroll");
});

test("uses the roll default when no message mode is requested", () => {
  assert.deepEqual(
    normalizeRollMessageOptions({ actor: "actor-1" }, "selfroll"),
    { actor: "actor-1", messageMode: "self" },
  );
});

test("lets Foundry resolve the current default for legacy roll mode", () => {
  assert.deepEqual(
    normalizeRollMessageOptions({ create: true }, "roll"),
    { create: true },
  );
});
