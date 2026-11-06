export const HEADQUARTERS_SCALES = Object.freeze({
  room: "Room",
  site: "Site",
  complex: "Complex",
  regional: "Regional",
  mobile: "Mobile",
  extradimensional: "Extradimensional",
});

export const HEADQUARTERS_OWNER_TYPES = Object.freeze({
  individual: "Individual",
  team: "Team",
  organization: "Organization",
  shared: "Shared",
});

export function normalizeHeadquartersScale(value) {
  const scale = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(HEADQUARTERS_SCALES, scale) ? scale : "site";
}

export function normalizeHeadquartersOwnerType(value) {
  const ownerType = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(HEADQUARTERS_OWNER_TYPES, ownerType) ? ownerType : "team";
}

export function getHeadquartersActorUuids(headquarters = {}) {
  return [...new Set((headquarters.actorUuids ?? []).filter((uuid) => typeof uuid === "string" && uuid.trim()))];
}

export function clampHeadquartersResources(resources = {}) {
  const max = Math.max(0, Math.trunc(Number(resources.max) || 0));
  const value = Math.min(max, Math.max(0, Math.trunc(Number(resources.value) || 0)));
  return { value, max };
}

function assertEditableHeadquarters(item) {
  if (item?.type !== "headquarters") throw new Error("The selected Item is not a Headquarters.");
  if (!item.isOwner && !globalThis.game?.user?.isGM) throw new Error("You do not have permission to update this Headquarters.");
  if (typeof item.update !== "function") throw new Error("The Headquarters cannot be updated.");
}

export async function adjustHeadquartersResources(item, amount) {
  assertEditableHeadquarters(item);
  const resources = clampHeadquartersResources(item.system?.resources);
  const value = Math.min(resources.max, Math.max(0, resources.value + Math.trunc(Number(amount) || 0)));
  await item.update({ "system.resources.value": value });
  return value;
}

export async function addHeadquartersEntry(item, collection, entry = {}) {
  assertEditableHeadquarters(item);
  if (!["facilities", "upgrades"].includes(collection)) throw new Error("Unsupported Headquarters collection.");
  const entries = (item.system?.[collection] ?? []).map((feature) => ({
    name: feature.name,
    description: feature.description,
    active: feature.active,
  }));
  entries.push({
    name: String(entry.name ?? "").trim(),
    description: String(entry.description ?? "").trim(),
    active: entry.active !== false,
  });
  await item.update({ [`system.${collection}`]: entries });
  return entries;
}

export async function removeHeadquartersEntry(item, collection, index) {
  assertEditableHeadquarters(item);
  if (!["facilities", "upgrades"].includes(collection)) throw new Error("Unsupported Headquarters collection.");
  const entries = (item.system?.[collection] ?? []).map((feature) => ({
    name: feature.name,
    description: feature.description,
    active: feature.active,
  }));
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return entries;
  entries.splice(index, 1);
  await item.update({ [`system.${collection}`]: entries });
  return entries;
}

export async function linkHeadquartersActor(item, actorUuid) {
  assertEditableHeadquarters(item);
  const uuid = String(actorUuid ?? "").trim();
  if (!uuid) throw new Error("An Actor UUID is required.");
  const actorUuids = getHeadquartersActorUuids(item.system);
  if (!actorUuids.includes(uuid)) actorUuids.push(uuid);
  await item.update({ "system.actorUuids": actorUuids });
  return actorUuids;
}

export async function unlinkHeadquartersActor(item, actorUuid) {
  assertEditableHeadquarters(item);
  const actorUuids = getHeadquartersActorUuids(item.system).filter((uuid) => uuid !== actorUuid);
  await item.update({ "system.actorUuids": actorUuids });
  return actorUuids;
}

export async function openHeadquartersLink(uuid, { fromUuid = globalThis.fromUuid } = {}) {
  const targetUuid = String(uuid ?? "").trim();
  if (!targetUuid || typeof fromUuid !== "function") return null;
  const document = await fromUuid(targetUuid);
  document?.sheet?.render?.(true);
  return document ?? null;
}
