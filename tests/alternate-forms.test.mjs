import test from "node:test";
import assert from "node:assert/strict";
import {
  activateAlternateForm,
  buildAlternateFormUpdates,
  deactivateAlternateForm,
  normalizeAlternateFormMode,
} from "../lib/services/alternate-forms.mjs";

function mockActor() {
  const actor = {
    id: "actor-1",
    name: "Primary",
    img: "primary.webp",
    isOwner: true,
    flags: { "marvel-multiverse": {} },
    system: {
      size: "average",
      reach: 1,
      health: { max: 60 },
      focus: { max: 60 },
      healthDamageReduction: 0,
      focusDamageReduction: 0,
      abilities: { mle: { value: 3 }, agl: { value: 2 }, res: { value: 1 }, vig: { value: 0 }, ego: { value: 0 }, log: { value: 0 } },
      movement: { run: { value: 5 }, climb: { value: 3 }, swim: { value: 3 }, jump: { value: 3 }, flight: { value: 0 }, glide: { value: 0 }, swingline: { value: 0 }, levitation: { value: 0 } },
    },
    items: new Map(),
    getFlag(scope, key) {
      return this.flags[scope]?.[key];
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        if (path === "flags.marvel-multiverse.-=alternateForm") {
          delete this.flags["marvel-multiverse"].alternateForm;
          continue;
        }
        const parts = path.split(".");
        let target = this;
        for (const part of parts.slice(0, -1)) target = target[part] ??= {};
        target[parts.at(-1)] = value;
      }
    },
  };
  return actor;
}

function mockForm(actor, overrides = {}) {
  const form = {
    id: "form-1",
    type: "alternateForm",
    parent: actor,
    system: {
      mode: "power-swap",
      active: false,
      appearance: { name: "Alternate", img: "alternate.webp" },
      overrides: {
        size: "big",
        reach: "2",
        healthMaximum: "90",
        focusMaximum: "",
        healthDamageReduction: "1",
        focusDamageReduction: "",
        abilities: { mle: "5" },
        movement: { run: "8" },
      },
      ...overrides,
    },
    async update(changes) {
      if (Object.hasOwn(changes, "system.active")) this.system.active = changes["system.active"];
    },
  };
  actor.items.set(form.id, form);
  return form;
}

test("alternate-form modes normalize and cosmetic forms ignore mechanical overrides", () => {
  assert.equal(normalizeAlternateFormMode("POWER-DOWN"), "power-down");
  assert.equal(normalizeAlternateFormMode("unknown"), "cosmetic");
  assert.deepEqual(
    buildAlternateFormUpdates({
      mode: "cosmetic",
      appearance: { name: "Alias", img: "alias.webp" },
      overrides: { healthMaximum: "999" },
    }),
    { name: "Alias", img: "alias.webp" },
  );
});

test("power forms apply only explicit whitelisted overrides", () => {
  const actor = mockActor();
  const form = mockForm(actor);
  assert.deepEqual(buildAlternateFormUpdates(form), {
    name: "Alternate",
    img: "alternate.webp",
    "system.size": "big",
    "system.reach": 2,
    "system.health.max": 90,
    "system.healthDamageReduction": 1,
    "system.abilities.mle.value": 5,
    "system.movement.run.value": 8,
  });
});

test("alternate-form activation snapshots and exactly restores changed fields", async () => {
  const actor = mockActor();
  const form = mockForm(actor);

  const activated = await activateAlternateForm(actor, form);
  assert.equal(activated.changed, true);
  assert.equal(actor.name, "Alternate");
  assert.equal(actor.system.health.max, 90);
  assert.equal(actor.system.focus.max, 60);
  assert.equal(form.system.active, true);
  assert.equal(actor.flags["marvel-multiverse"].alternateForm.itemId, form.id);

  const deactivated = await deactivateAlternateForm(actor);
  assert.equal(deactivated.changed, true);
  assert.equal(actor.name, "Primary");
  assert.equal(actor.img, "primary.webp");
  assert.equal(actor.system.health.max, 60);
  assert.equal(actor.system.abilities.mle.value, 3);
  assert.equal(form.system.active, false);
  assert.equal(actor.flags["marvel-multiverse"].alternateForm, undefined);
});
