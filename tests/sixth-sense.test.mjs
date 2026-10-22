import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { validatePowerEvents } = await import("../lib/services/power-events.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Sixth Sense/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const files = [
  "cosmic-awareness.json",
  "danger-sense.json",
  "detect-supers.json",
  "intuition.json",
  "microscopic-awareness.json",
  "postcognition-1.json",
  "postcognition-2.json",
  "postcognition-3.json",
  "postcognition-4.json",
  "precognition-1.json",
  "precognition-2.json",
  "precognition-3.json",
  "precognition-4.json",
];
const powers = Object.fromEntries(await Promise.all(
  files.map(async (fileName) => [fileName, await loadPower(fileName)])
));

test("Cosmic Awareness and Detect Supers retain exact sensing boundaries", () => {
  const cosmic = powers["cosmic-awareness.json"];
  const detect = powers["detect-supers.json"];

  assert.equal(cosmic.system.sixthSense.range, "same-universe");
  assert.equal(cosmic.system.sixthSense.requiresKnownSubject, true);
  assert.equal(cosmic.system.events[0].outcomes[0].duration.type, "concentration");
  assert.equal(detect.system.sixthSense.rangeMiles, 5);
  assert.equal(detect.system.sixthSense.singleOriginRangeMiles, 25);
  assert.equal(detect.system.sixthSense.excludesSpecialTraining, true);
  assert.deepEqual(detect.system.sixthSense.reveals, ["count", "rough-distance", "rough-direction"]);
});

test("Danger Sense exposes permanent bonus-round metadata", () => {
  const danger = powers["danger-sense.json"];
  const flag = danger.effects[0].flags["marvel-multiverse"].dangerSense;

  assert.equal(danger.effects[0].transfer, true);
  assert.equal(flag.alwaysActsInBonusRound, true);
  assert.equal(danger.system.sixthSense.independentOfInitiativeFantastic, true);
});

test("Intuition and Microscopic Awareness use exact Focus and safe narrative outcomes", () => {
  const intuition = powers["intuition.json"];
  const microscopic = powers["microscopic-awareness.json"];

  assert.equal(intuition.system.cost, "5 Focus");
  assert.equal(intuition.system.activation.mode, "utility");
  assert.equal(intuition.system.events[0].outcomes[0].type, "manual");
  assert.equal(microscopic.system.cost, "5 Focus");
  assert.equal(microscopic.system.sixthSense.rangePerRank, 1);
  assert.equal(microscopic.system.events[0].outcomes[0].duration.type, "concentration");
});

test("Postcognition tiers preserve exact windows and corrected numbering", () => {
  const expected = [
    { tier: 1, lookbackHours: 6, viewingWindowHours: 6, cost: "5 Focus" },
    { tier: 2, lookbackHours: 24, viewingWindowHours: 24, cost: "10 Focus" },
    { tier: 3, lookbackYears: 1, viewingWindowHours: 24, cost: "20 Focus" },
    { tier: 4, lookbackYears: 100, viewingWindowDays: 7, cost: "20 Focus" },
  ];
  expected.forEach((entry, index) => {
    const power = powers[`postcognition-${index + 1}.json`];
    assert.equal(power.system.numbered, entry.tier);
    assert.equal(power.system.sixthSense.tier, entry.tier);
    assert.equal(power.system.cost, entry.cost);
    for (const [key, value] of Object.entries(entry)) {
      if (["tier", "cost"].includes(key)) continue;
      assert.equal(power.system.sixthSense[key], value);
    }
    assert.equal(power.system.activation.maxTargets, 1);
    assert.equal(power.system.targeting.rangeScaling, "reach");
  });
});

test("Precognition tiers preserve every range and future horizon", () => {
  const expectedHorizons = [
    [{ range: "reach", futureHours: 24 }],
    [
      { range: "reach", futureDays: 7 },
      { rangeMiles: 1, futureHours: 24, requiresKnownSubject: true },
    ],
    [
      { range: "reach", futureMonths: 1 },
      { rangeMiles: 1, futureDays: 7, requiresKnownSubject: true },
      { rangeMiles: 100, futureHours: 24, requiresKnownSubject: true },
    ],
    [
      { range: "reach", futureYears: 1 },
      { rangeMiles: 1, futureMonths: 1, requiresKnownSubject: true },
      { rangeMiles: 100, futureDays: 7, requiresKnownSubject: true },
      { rangeMiles: 1000, futureHours: 24, requiresKnownSubject: true },
    ],
  ];
  expectedHorizons.forEach((horizons, index) => {
    const power = powers[`precognition-${index + 1}.json`];
    assert.equal(power.system.numbered, index + 1);
    assert.equal(power.system.sixthSense.tier, index + 1);
    assert.deepEqual(power.system.sixthSense.horizons, horizons);
    assert.equal(power.system.activation.maxTargets, 1);
  });
  assert.equal(powers["precognition-2.json"].system.prerequisites, "Precognition 1, Rank 3");
});

test("all Sixth Sense events and semantic profiles are valid", () => {
  const profiles = new Set([
    "sixth-sense.cosmic",
    "sixth-sense.detect",
    "sixth-sense.intuition",
    "sixth-sense.microscopic",
    "sixth-sense.past",
    "sixth-sense.future",
  ]);
  for (const [fileName, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${fileName}: ${JSON.stringify(validation.issues)}`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${fileName}: ${profile}`);
    }
  }
});
