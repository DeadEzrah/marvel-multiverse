import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const { validatePowerEvents } = await import("../lib/services/power-events.mjs");
const { resolveUtilityTargetLimits } = await import("../lib/services/utility-activation.mjs");
const { placePowerArea, resolveAreaTargetingConfig } = await import("../lib/services/area-targeting.mjs");
const {
  endConcentration,
  evaluateConcentrationAreaBoundary,
  handleConcentrationAreaBoundaryChange,
  startConcentration,
} = await import("../lib/concentration.mjs");

const directory = new URL("../packs/_source/powers/Illusion/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && file !== "_folder.json");
const powers = Object.fromEntries(await Promise.all(files.map(async (file) => [
  file,
  JSON.parse(await readFile(new URL(file, directory), "utf8")),
])));

test("Illusion contains the complete 14-power family", () => {
  assert.equal(files.length, 14);
});

test("Dazzle, Deafen, and Flare preserve exact damage and conditions", () => {
  for (const file of ["dazzle.json", "deafen.json"]) {
    const power = powers[file];
    assert.equal(power.system.ability, "ego");
    assert.equal(power.system.targeting.defense, "vig");
    assert.equal(power.system.targeting.range, 20);
    assert.equal(power.system.damage.requiresFantastic, true);
    assert.equal(power.system.damage.doubleOnFantastic, false);
    assert.equal(power.system.events[0].outcomes[0].duration.value, 1);
  }

  const flare = powers["flare.json"];
  assert.equal(flare.system.targeting.area.distance, 5);
  assert.equal(flare.system.damage.scale, 1);
  assert.equal(flare.system.damage.requiresFantastic, true);
  assert.equal(flare.system.damage.doubleOnFantastic, false);
  assert.equal(flare.system.events[0].outcomes[0].statusId, "blinded");
});

test("invisibility powers own exact targets and concentration status", () => {
  const self = powers["invisiblity.json"];
  assert.equal(self.system.activation.target, "none");
  assert.equal(self.system.activation.concentrationStatus, "invisible");
  assert.equal(self.system.activation.concentrationStatusIncludesSource, true);

  const extended = powers["extend-invisibility.json"];
  assert.equal(extended.name, "Extend Invisibility");
  assert.equal(extended.system.activation.maxTargets, 1);
  assert.equal(extended.system.activation.range, 10);

  const group = powers["group-invisiblity.json"];
  const actor = {
    system: {
      attributes: { rank: { value: 4 } },
      abilities: { ego: { defense: 14 } },
    },
  };
  assert.equal(resolveUtilityTargetLimits(group, actor).maximum, 14);
  assert.equal(group.system.targeting.includeSelf, true);
});

test("illusion tiers preserve sensory, size, range, and movement progression", () => {
  const staticIllusion = powers["static-illusion.json"].system.illusion;
  const animated = powers["animated-illusion.json"].system.illusion;
  const grand = powers["grand-illusion.json"].system.illusion;

  assert.deepEqual(
    [staticIllusion.maximumSizeSteps, animated.maximumSizeSteps, grand.maximumSizeSteps],
    [3, 4, 5],
  );
  assert.deepEqual([staticIllusion.mobile, animated.mobile, grand.mobile], [false, true, true]);
  assert.deepEqual(staticIllusion.senses, ["visual"]);
  assert.deepEqual(animated.senses, ["visual"]);
  assert.deepEqual(grand.senses, ["visual", "auditory"]);
  assert.equal(grand.range, 50);
});

test("area and illumination powers preserve exact concentration boundaries", () => {
  const illumination = powers["illumination.json"];
  assert.equal(illumination.system.illusion.range, 50);
  assert.equal(illumination.system.illusion.maintainsOutsideRange, true);

  for (const file of ["darkness.json", "silence-area.json"]) {
    const power = powers[file];
    assert.equal(power.system.illusion.placementRange, 50);
    assert.equal(power.system.illusion.widthPerRank, 5);
    assert.equal(power.system.illusion.maintenanceRange, 50);
    assert.equal(power.system.events[0].outcomes[0].duration.type, "concentration");
  }
});

test("maintained Illusion zones use anchor Regions without inferring sensory geometry", () => {
  for (const file of [
    "darkness.json",
    "silence-area.json",
    "static-illusion.json",
    "animated-illusion.json",
    "grand-illusion.json",
  ]) {
    const power = powers[file];
    const area = resolveAreaTargetingConfig(power);
    assert.equal(area.shape, "anchor", file);
    assert.equal(area.representation, "anchor", file);
    assert.equal(area.placementRange, 50, file);
    assert.equal(area.persistent, true, file);
    assert.equal(area.duration, "Concentration", file);
    assert.equal(area.maintenanceRange, 50, file);
  }

  for (const file of ["darkness.json", "silence-area.json"]) {
    const area = resolveAreaTargetingConfig(powers[file]);
    assert.equal(area.requiresLineOfSight, false, file);
    assert.equal(area.maintenanceRequiresLineOfSight, false, file);
  }
  for (const file of ["static-illusion.json", "animated-illusion.json", "grand-illusion.json"]) {
    const area = resolveAreaTargetingConfig(powers[file]);
    assert.equal(area.requiresLineOfSight, true, file);
    assert.equal(area.maintenanceRequiresLineOfSight, true, file);
  }
});

test("maintained Illusion zone placement requires a source token for its 50-space limit", async () => {
  const result = await placePowerArea(powers["darkness.json"], {
    canvas: { ready: true, grid: { size: 100 }, scene: { grid: { distance: 1 } } },
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.error, "source-token-unavailable");
});

test("maintained Illusion zones break only objective range and line-of-sight boundaries", () => {
  const state = {
    active: true,
    areaMaintenance: { range: 50, requiresLineOfSight: true },
  };
  const sourceToken = { x: 0, y: 0, width: 1, height: 1 };
  const canvas = {
    grid: {
      size: 100,
      measurePath: ([from, to]) => ({ distance: Math.hypot(to.x - from.x, to.y - from.y) / 100 }),
    },
    scene: { grid: { distance: 1 } },
  };

  const maintained = evaluateConcentrationAreaBoundary(state, {
    sourceToken,
    region: { shapes: [{ x: 5050, y: 50 }] },
    canvas,
    testLineOfSight: () => true,
  });
  assert.equal(maintained.maintained, true);

  const outOfRange = evaluateConcentrationAreaBoundary(state, {
    sourceToken,
    region: { shapes: [{ x: 5151, y: 50 }] },
    canvas,
    testLineOfSight: () => true,
  });
  assert.equal(outOfRange.maintained, false);
  assert.equal(outOfRange.reason, "area-maintenance-range");

  const blocked = evaluateConcentrationAreaBoundary(state, {
    sourceToken,
    region: { shapes: [{ x: 5000, y: 50 }] },
    canvas,
    testLineOfSight: () => false,
  });
  assert.equal(blocked.maintained, false);
  assert.equal(blocked.reason, "area-maintenance-line-of-sight");

  assert.equal(evaluateConcentrationAreaBoundary({
    ...state,
    areaMaintenance: { range: 50, requiresLineOfSight: false },
  }, {
    sourceToken,
    region: { shapes: [{ x: 5000, y: 50 }] },
    canvas,
    testLineOfSight: () => false,
  }).maintained, true);
});

test("linked and unlinked source tokens end maintained concentration through the same hook", async () => {
  const previous = {
    game: globalThis.game,
    canvas: globalThis.canvas,
    Hooks: globalThis.Hooks,
    ui: globalThis.ui,
  };
  globalThis.Hooks = { callAll() {} };
  globalThis.ui = { notifications: { warn() {} } };
  globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } } };
  try {
    for (const linked of [true, false]) {
      const tokenUuid = `Scene.test.Token.${linked ? "linked" : "unlinked"}`;
      const regionUuid = `Scene.test.Region.${linked ? "linked" : "unlinked"}`;
      const actor = {
        id: linked ? "linked" : "synthetic",
        uuid: linked ? "Actor.linked" : `${tokenUuid}.Actor.synthetic`,
        name: linked ? "Linked" : "Unlinked",
        flags: {
          "marvel-multiverse": {
            concentration: {
              active: true,
              itemName: "Static Illusion",
              regionUuids: [regionUuid],
              areaMaintenance: {
                range: 50,
                requiresLineOfSight: false,
                sourceTokenUuid: tokenUuid,
                regionUuid,
              },
            },
          },
        },
        async update(payload) {
          this.flags["marvel-multiverse"].concentration = payload.flags["marvel-multiverse"].concentration;
        },
      };
      const sourceToken = { uuid: tokenUuid, actor, x: 0, y: 0, width: 1, height: 1 };
      const region = { uuid: regionUuid, shapes: [{ x: 6000, y: 50 }], async delete() {} };
      globalThis.canvas = {
        grid: { size: 100, measurePath: () => ({ distance: 6000 }) },
        scene: { grid: { distance: 1 }, regions: [region] },
        tokens: { placeables: [sourceToken] },
      };
      const result = await handleConcentrationAreaBoundaryChange(sourceToken);
      assert.equal(result.maintained, false, linked ? "linked" : "unlinked");
      assert.equal(actor.flags["marvel-multiverse"].concentration.active, null);
      assert.equal(actor.flags["marvel-multiverse"].concentration.endedReason, "area-maintenance-range");
    }
  } finally {
    globalThis.game = previous.game;
    globalThis.canvas = previous.canvas;
    globalThis.Hooks = previous.Hooks;
    globalThis.ui = previous.ui;
  }
});

test("maintained zone replacement and end remove Regions and undo concentration outcomes", async () => {
  const previous = {
    fromUuid: globalThis.fromUuid,
    fromUuidSync: globalThis.fromUuidSync,
    Hooks: globalThis.Hooks,
  };
  const deletedRegions = [];
  const deletedEffects = [];
  const regions = new Map(["one", "two"].map((id) => [
    `Scene.test.Region.${id}`,
    { async delete() { deletedRegions.push(id); } },
  ]));
  const target = {
    uuid: "Actor.target",
    documentName: "Actor",
    effects: new Set(["illusion-effect"]),
    async deleteEmbeddedDocuments(_type, ids) { deletedEffects.push(...ids); },
  };
  const transactions = [{
    id: "tx-one",
    targetActorUuid: target.uuid,
    createdEffectIds: ["illusion-effect"],
    duration: { type: "concentration" },
    undone: false,
  }];
  const message = {
    uuid: "ChatMessage.illusion",
    getFlag: (_scope, key) => key === "resolution" ? { eventTransactions: transactions } : null,
    async update(payload) {
      const updated = payload.flags?.["marvel-multiverse"]?.resolution?.eventTransactions;
      if (updated) transactions.splice(0, transactions.length, ...updated);
    },
  };
  let markerId = 0;
  const actor = {
    uuid: "Actor.source",
    flags: {},
    async update(payload) {
      this.flags["marvel-multiverse"] = {
        ...(this.flags["marvel-multiverse"] ?? {}),
        ...payload.flags["marvel-multiverse"],
      };
    },
    async createEmbeddedDocuments() {
      markerId += 1;
      return [{ id: `marker-${markerId}` }];
    },
    async deleteEmbeddedDocuments() {},
  };
  globalThis.Hooks = { callAll() {} };
  globalThis.fromUuid = async (uuid) => regions.get(uuid) ?? null;
  globalThis.fromUuidSync = (uuid) => uuid === message.uuid ? message : uuid === target.uuid ? target : null;
  try {
    await startConcentration(actor, {
      itemName: "Static Illusion",
      message,
      statusTransactionIds: ["tx-one"],
      regionUuids: ["Scene.test.Region.one"],
    });
    await startConcentration(actor, {
      itemName: "Grand Illusion",
      regionUuids: ["Scene.test.Region.two"],
    });
    assert.deepEqual(deletedRegions, ["one"]);
    assert.deepEqual(deletedEffects, ["illusion-effect"]);
    assert.equal(transactions[0].undone, true);
    assert.equal(transactions[0].undoneReason, "replaced");

    await endConcentration(actor, { reason: "test-end" });
    assert.deepEqual(deletedRegions, ["one", "two"]);
    assert.equal(actor.flags["marvel-multiverse"].concentration.active, null);
    assert.equal(actor.flags["marvel-multiverse"].concentration.endedReason, "test-end");
  } finally {
    globalThis.fromUuid = previous.fromUuid;
    globalThis.fromUuidSync = previous.fromUuidSync;
    globalThis.Hooks = previous.Hooks;
  }
});

test("Mirror Images and Silence Self preserve safe manual boundaries", () => {
  const mirror = powers["mirror-images.json"];
  assert.equal(mirror.name, "Mirror Images");
  assert.equal(mirror.system.illusion.duplicatesPerRank, 1);
  assert.equal(mirror.system.illusion.initialPlacementRange, 2);
  assert.equal(mirror.system.illusion.maximumDistance, 10);

  const silence = powers["silence-self.json"];
  const modifier = silence.system.events[0].outcomes[0].effect.flags["marvel-multiverse"].actionRollModifier;
  assert.equal(modifier.mode, "edge");
  assert.equal(modifier.ability, "agl");
  assert.equal(modifier.selection, "optional");
  assert.equal(modifier.nonStacking, true);
});

test("maintained Illusion records keep sensory and adjudication boundaries explicit", () => {
  const reminders = Object.fromEntries([
    "darkness.json",
    "silence-area.json",
    "static-illusion.json",
    "animated-illusion.json",
    "grand-illusion.json",
  ].map((file) => [
    file,
    powers[file].system.events[0].outcomes.find((outcome) => outcome.type === "manual")?.label ?? "",
  ]));
  assert.match(reminders["darkness.json"], /cannot see|lights work/i);
  assert.match(reminders["silence-area.json"], /can be heard/i);
  assert.match(reminders["static-illusion.json"], /static visual-only/i);
  assert.match(reminders["animated-illusion.json"], /moving visual-only/i);
  assert.match(reminders["grand-illusion.json"], /moving sight-and-sound/i);
});

test("all Illusion events and semantic profiles are valid", () => {
  const profiles = new Set([
    "illusion.hologram",
    "illusion.grand",
    "illusion.invisibility",
    "illusion.mirror",
    "illusion.light",
    "illusion.darkness",
    "illusion.silence",
    "illusion.dazzle",
    "illusion.deafen",
    "power.light.flare",
  ]);

  for (const [file, power] of Object.entries(powers)) {
    const validation = validatePowerEvents(power.system.events);
    assert.equal(validation.valid, true, `${file}: ${JSON.stringify(validation.issues)}`);
    assert.equal(Object.keys(power.system.effectProfiles ?? {}).length > 0, true, `${file}: missing profile`);
    for (const profile of Object.values(power.system.effectProfiles ?? {})) {
      assert.equal(profiles.has(profile), true, `${file}: ${profile}`);
    }
  }
});
