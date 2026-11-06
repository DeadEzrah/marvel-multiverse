import test from "node:test";
import assert from "node:assert/strict";

const {
  findTargetRangeViolation,
  measureTokenRangeSpaces,
} = await import("../lib/services/action-roll.mjs");

function createToken(x, y, width = 1, height = 1) {
  return { document: { x, y, width, height } };
}

const flatGridCanvas = { grid: { size: 100 } };

test("large tokens measure from their nearest occupied cells, not their centers", () => {
  const brute = createToken(0, 0, 2, 2);
  const bystander = createToken(300, 0);

  // Nearest cells: source (150, 50) to target (350, 50) = 200 px = 2 spaces.
  // A naive center-to-center measurement would report 2.5 spaces.
  assert.equal(measureTokenRangeSpaces(brute, bystander, flatGridCanvas), 2);
  assert.equal(measureTokenRangeSpaces(bystander, brute, flatGridCanvas), 2);
});

test("two large tokens measure between their closest cell pair", () => {
  const colossus = createToken(0, 0, 2, 2);
  const sentinel = createToken(400, 0, 3, 3);

  // Source cell (150, 50) to target cell (450, 50) = 300 px = 3 spaces.
  assert.equal(measureTokenRangeSpaces(colossus, sentinel, flatGridCanvas), 3);
});

test("grid measurePath distances are normalized by the scene cell distance", () => {
  const canvas = {
    grid: {
      size: 100,
      measurePath: (points) => {
        const [from, to] = points;
        return { distance: (Math.hypot(to.x - from.x, to.y - from.y) / 100) * 5 };
      },
    },
    scene: { grid: { distance: 5 } },
  };

  const source = createToken(0, 0, 2, 2);
  const target = createToken(300, 0);
  assert.equal(measureTokenRangeSpaces(source, target, canvas), 2);
});

test("fractional token sizes fall back to center-to-center measurement", () => {
  const sprite = createToken(0, 0, 0.5, 0.5);
  const target = createToken(300, 0);

  // Centers: (25, 25) and (350, 50) -> hypot = 325.96... px = ~3.26 spaces.
  const distance = measureTokenRangeSpaces(sprite, target, flatGridCanvas);
  assert.ok(Math.abs(distance - Math.hypot(325, 25) / 100) < 0.0001);
});

test("an unusable grid yields null instead of a guessed distance", () => {
  assert.equal(measureTokenRangeSpaces(createToken(0, 0), createToken(100, 0), { grid: {} }), null);
  assert.equal(measureTokenRangeSpaces({ document: {} }, createToken(100, 0), flatGridCanvas), null);
});

test("range preflight accepts a large token whose nearest cell is in range", () => {
  const brute = createToken(0, 0, 2, 2);
  const bystander = createToken(300, 0);
  const request = { token: brute, targeting: { range: 2 }, allTargets: [bystander] };

  assert.equal(findTargetRangeViolation(request, flatGridCanvas), null);
});

test("range preflight rejects a target beyond the nearest-cell distance", () => {
  const brute = createToken(0, 0, 2, 2);
  const bystander = createToken(300, 0);
  const request = { token: brute, targeting: { range: 1 }, allTargets: [bystander] };

  const violation = findTargetRangeViolation(request, flatGridCanvas);
  assert.equal(violation.type, "maximum");
  assert.equal(violation.distance, 2);
  assert.equal(violation.maximum, 1);
});

test("minimum-range preflight uses the same nearest-cell measurement", () => {
  const artillery = createToken(0, 0, 2, 2);
  const tooClose = createToken(300, 0);
  const request = { token: artillery, targeting: { range: 10, minimumRange: 3 }, allTargets: [tooClose] };

  const violation = findTargetRangeViolation(request, flatGridCanvas);
  assert.equal(violation.type, "minimum");
  assert.equal(violation.distance, 2);
  assert.equal(violation.minimum, 3);
});
