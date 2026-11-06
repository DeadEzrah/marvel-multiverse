import test from "node:test";
import assert from "node:assert/strict";
import {
  getRankLabel,
  normalizeRankMode,
  resolveActorRankScale,
  resolveRankScale,
} from "../lib/rank.mjs";

test("standard rank preserves legacy numeric scaling", () => {
  assert.equal(normalizeRankMode(undefined), "standard");
  assert.equal(resolveRankScale({ value: 4 }), 4);
  assert.equal(getRankLabel({ value: 4 }), "4");
});

test("Rank X has an explicit label and author-controlled numeric scale", () => {
  const rank = { mode: "x", value: 6, scale: 12 };
  assert.equal(normalizeRankMode("X"), "x");
  assert.equal(getRankLabel(rank), "X");
  assert.equal(resolveRankScale(rank), 12);
});

test("Rank X falls back to the legacy rank value when no scale is configured", () => {
  assert.equal(resolveRankScale({ mode: "x", value: 6, scale: 0 }), 6);
  assert.equal(
    resolveActorRankScale({ system: { attributes: { rank: { mode: "x", value: 6, scale: 10 } } } }),
    10,
  );
});
