import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { resolveTargetingConfig } = await import("../lib/services/action-roll.mjs");
const { resolveAreaTargetingConfig } = await import("../lib/services/area-targeting.mjs");
const { resolveDamageConfig } = await import("../lib/services/damage-resolver.mjs");
const { resolveUtilityFocusAmount } = await import("../lib/services/utility-activation.mjs");

async function loadPower(fileName) {
  const url = new URL(`../packs/_source/powers/Weather Control/${fileName}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

const powers = Object.fromEntries(await Promise.all([
  "control-fog.json",
  "control-weather-1.json",
  "control-weather-2.json",
  "control-weather-3.json",
  "control-weather-4.json",
  "thunder.json",
  "weather-chill.json",
  "weather-warm.json"
].map(async (fileName) => [fileName, await loadPower(fileName)])));

function weatherMarker(power) {
  return power.system.events[0].outcomes.find((outcome) => outcome.type === "active-effect");
}

test("Weather Control utilities create concentration markers and explicit reminders", () => {
  const utilityPowers = Object.entries(powers).filter(([fileName]) => fileName !== "thunder.json");

  for (const [fileName, power] of utilityPowers) {
    assert.equal(power.system.activation.mode, "utility", fileName);
    assert.equal(power.system.activation.target, "none", fileName);
    assert.match(power.system.effectProfiles.activation, /^weather\./, fileName);
    assert.equal(weatherMarker(power).duration.type, "concentration", fileName);
    assert.ok(
      power.system.events[0].outcomes.some((outcome) => outcome.type === "manual" && outcome.label),
      fileName
    );
  }
});

test("Control Weather tiers preserve their exact environmental progression", async () => {
  const tier1 = powers["control-weather-1.json"];
  const tier2 = powers["control-weather-2.json"];
  const tier3 = powers["control-weather-3.json"];
  const tier4 = powers["control-weather-4.json"];
  const metadata = [tier1, tier2, tier3, tier4]
    .map((power) => weatherMarker(power).effect.flags["marvel-multiverse"].weatherControl);

  assert.deepEqual(
    metadata.map(({ rangeMultiplier, speedMultiplier }) => [rangeMultiplier, speedMultiplier]),
    [[0.5, 1], [0.5, 0.5], [0.5, 0.5], [0.25, 0.25]]
  );
  assert.equal(metadata[2].elementalBlastElectricityAsReactionWhenAttacked, true);
  assert.equal(metadata[3].flightAllowed, false);
  assert.deepEqual(
    await Promise.all([tier1, tier2, tier3, tier4].map((power) => (
      resolveUtilityFocusAmount(power, { system: { focus: { value: 50 } } })
    ))),
    [
      { success: true, amount: 0 },
      { success: true, amount: 10 },
      { success: true, amount: 15 },
      { success: true, amount: 20 }
    ]
  );
});

test("Fog and temperature powers retain their exact environmental limits", () => {
  const fog = weatherMarker(powers["control-fog.json"]).effect.flags["marvel-multiverse"].weatherControl;
  const chill = weatherMarker(powers["weather-chill.json"]).effect.flags["marvel-multiverse"].weatherControl;
  const warm = weatherMarker(powers["weather-warm.json"]).effect.flags["marvel-multiverse"].weatherControl;

  assert.deepEqual(fog, {
    kind: "fog",
    radiusSpacesPerRank: 50,
    lineOfSightLimitSpaces: 10,
    canDispel: true
  });
  assert.equal(chill.radiusMiles, 1);
  assert.equal(chill.minimumTemperatureF, 0);
  assert.equal(warm.radiusMiles, 1);
  assert.equal(warm.maximumTemperatureF, 100);
});

test("Thunder is a non-damaging ten-space all-character condition attack", () => {
  const thunder = powers["thunder.json"];
  const targeting = resolveTargetingConfig(thunder);
  const area = resolveAreaTargetingConfig(thunder);

  assert.equal(targeting.count, 999);
  assert.equal(targeting.defense, "res");
  assert.equal(area.distance, 10);
  assert.equal(area.targetFilter, "all");
  assert.equal(area.includeSelf, true);
  assert.equal(resolveDamageConfig(thunder).enabled, false);
  assert.equal(thunder.system.effectProfiles.attack, "weather.thunder");
  assert.equal(thunder.system.events[0].outcomes[0].statusId, "deafened");
  assert.deepEqual(
    thunder.system.events[1].outcomes[0].duration,
    { type: "rounds", value: 1 }
  );
});
