import test from "node:test";
import assert from "node:assert/strict";

const { auditEffectProfileDocuments } = await import("../lib/services/effect-profile-manager.mjs");
const { EffectLibrary } = await import("../lib/services/effect-library.mjs");

const library = new EffectLibrary({
  effects: [
    { id: "melee.punch", animations: [], sounds: [] },
    { id: "power.energy.blast", animations: [], sounds: [] },
  ],
  fallbacks: { "melee.haymaker": "melee.punch" },
});

test("audit passes documents whose profiles resolve directly or through fallbacks", () => {
  const report = auditEffectProfileDocuments([
    { document: { name: "Punch", uuid: "Item.punch", system: { effectProfile: "melee.punch" } } },
    { document: { name: "Haymaker", uuid: "Item.haymaker", system: { effectProfile: "melee.haymaker" } } },
    { document: { name: "Blast", uuid: "Item.blast", system: { effectProfiles: { hit: "power.energy.blast.red" } } } },
  ], library, { warn: false });

  assert.equal(report.unknown.length, 0);
  assert.equal(report.scanned, 3);
  assert.equal(report.references, 3);
});

test("audit reports unknown default and phase profiles with document context", () => {
  const report = auditEffectProfileDocuments([
    {
      document: { name: "Mystery", uuid: "Item.mystery", system: { effectProfile: "unknown.profile" } },
      owner: "Professor X",
    },
    { document: { name: "Punch", uuid: "Item.punch", system: { effectProfiles: { hit: "also.unknown" } } } },
  ], library, { warn: false });

  assert.equal(report.unknown.length, 2);
  assert.deepEqual(report.unknown[0], {
    profileId: "unknown.profile",
    phase: null,
    name: "Mystery",
    uuid: "Item.mystery",
    owner: "Professor X",
  });
  assert.equal(report.unknown[1].profileId, "also.unknown");
  assert.equal(report.unknown[1].phase, "hit");
});

test("audit skips documents without any profile declarations", () => {
  const report = auditEffectProfileDocuments([
    { document: { name: "Plain", uuid: "Item.plain", system: {} } },
    null,
  ], library, { warn: false });

  assert.equal(report.unknown.length, 0);
  assert.equal(report.references, 0);
});
