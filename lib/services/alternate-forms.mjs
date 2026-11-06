export const ALTERNATE_FORM_MODES = Object.freeze({
  cosmetic: "Cosmetic Change",
  "power-down": "Power Down",
  "power-swap": "Power Swap",
});

const ABILITIES = Object.freeze(["mle", "agl", "res", "vig", "ego", "log"]);
const MOVEMENT_TYPES = Object.freeze(["run", "climb", "swim", "jump", "flight", "glide", "swingline", "levitation"]);
const FLAG_SCOPE = "marvel-multiverse";
const FLAG_KEY = "alternateForm";

function readPath(source, path) {
  return path.split(".").reduce((value, part) => value?.[part], source);
}

function addStringOverride(updates, path, value) {
  const normalized = String(value ?? "").trim();
  if (normalized) updates[path] = normalized;
}

function addNumberOverride(updates, path, value) {
  if (value === "" || value === null || value === undefined) return;
  const number = Number(value);
  if (Number.isFinite(number)) updates[path] = number;
}

export function normalizeAlternateFormMode(value) {
  const mode = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(ALTERNATE_FORM_MODES, mode) ? mode : "cosmetic";
}

export function buildAlternateFormUpdates(form) {
  const system = form?.system ?? form ?? {};
  const mode = normalizeAlternateFormMode(system.mode);
  const updates = {};

  addStringOverride(updates, "name", system.appearance?.name);
  addStringOverride(updates, "img", system.appearance?.img);

  if (mode === "cosmetic") return updates;

  addStringOverride(updates, "system.size", system.overrides?.size);
  addNumberOverride(updates, "system.reach", system.overrides?.reach);
  addNumberOverride(updates, "system.health.max", system.overrides?.healthMaximum);
  addNumberOverride(updates, "system.focus.max", system.overrides?.focusMaximum);
  addNumberOverride(updates, "system.healthDamageReduction", system.overrides?.healthDamageReduction);
  addNumberOverride(updates, "system.focusDamageReduction", system.overrides?.focusDamageReduction);

  for (const ability of ABILITIES) {
    addNumberOverride(updates, `system.abilities.${ability}.value`, system.overrides?.abilities?.[ability]);
  }
  for (const movement of MOVEMENT_TYPES) {
    addNumberOverride(updates, `system.movement.${movement}.value`, system.overrides?.movement?.[movement]);
  }

  return updates;
}

export function snapshotAlternateFormUpdates(actor, updates) {
  return Object.fromEntries(
    Object.keys(updates).map((path) => [path, readPath(actor, path)])
  );
}

function getEmbeddedForm(actor, itemId) {
  return actor?.items?.get?.(itemId)
    ?? Array.from(actor?.items ?? []).find((item) => item?.id === itemId || item?._id === itemId);
}

function assertCanChangeForm(actor) {
  if (!actor) throw new Error("An actor is required to change alternate forms.");
  if (!actor.isOwner && !globalThis.game?.user?.isGM) {
    throw new Error(`You do not have permission to change ${actor.name ?? "this actor"}'s form.`);
  }
  if (typeof actor.update !== "function") {
    throw new Error("The actor cannot be updated.");
  }
}

export async function deactivateAlternateForm(actor) {
  assertCanChangeForm(actor);
  const state = actor.getFlag?.(FLAG_SCOPE, FLAG_KEY)
    ?? actor.flags?.[FLAG_SCOPE]?.[FLAG_KEY];
  if (!state?.snapshot || typeof state.snapshot !== "object") {
    return { changed: false, itemId: null };
  }

  const activeItem = getEmbeddedForm(actor, state.itemId);
  await actor.update({
    ...state.snapshot,
    [`flags.${FLAG_SCOPE}.-=${FLAG_KEY}`]: null,
  });
  if (activeItem?.update) await activeItem.update({ "system.active": false });

  return { changed: true, itemId: state.itemId };
}

export async function activateAlternateForm(actor, form) {
  assertCanChangeForm(actor);
  if (!form || form.parent !== actor || form.type !== "alternateForm") {
    throw new Error("Alternate forms must be embedded on the actor that activates them.");
  }

  const currentState = actor.getFlag?.(FLAG_SCOPE, FLAG_KEY)
    ?? actor.flags?.[FLAG_SCOPE]?.[FLAG_KEY];
  if (currentState?.itemId === form.id) {
    return { changed: false, itemId: form.id, updates: {} };
  }
  if (currentState) await deactivateAlternateForm(actor);

  const updates = buildAlternateFormUpdates(form);
  const snapshot = snapshotAlternateFormUpdates(actor, updates);
  const state = {
    version: 1,
    itemId: form.id,
    mode: normalizeAlternateFormMode(form.system?.mode),
    snapshot,
  };

  await actor.update({
    ...updates,
    [`flags.${FLAG_SCOPE}.${FLAG_KEY}`]: state,
  });
  await form.update?.({ "system.active": true });

  return { changed: true, itemId: form.id, updates };
}
