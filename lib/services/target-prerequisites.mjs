function collectionToArray(collection) {
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (collection && typeof collection[Symbol.iterator] === "function") return [...collection];
  return [];
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getActorResource(actor, resource) {
  const value = actor?.system?.[resource]?.value;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function compareNumber(actual, operator, expected) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  if (operator === "eq") return actual === expected;
  if (operator === "lte") return actual <= expected;
  if (operator === "gte") return actual >= expected;
  return false;
}

function actorHasStatus(actor, value) {
  const expected = normalize(value);
  const effectMatch = collectionToArray(actor?.effects).filter((effect) => !effect?.disabled && !effect?.isSuppressed).some((effect) => {
    const statuses = effect?.statuses;
    const entries = typeof statuses?.values === "function" ? [...statuses.values()] : collectionToArray(statuses);
    return entries.some((status) => normalize(status) === expected);
  });
  if (effectMatch) return true;
  const statuses = actor?.statuses ?? actor?.system?.statuses;
  const entries = typeof statuses?.values === "function" ? [...statuses.values()] : collectionToArray(statuses);
  return entries.some((status) => normalize(status) === expected);
}

function actorHasTag(actor, value) {
  const expected = normalize(value);
  return collectionToArray(actor?.items).some((item) => item?.type === "tag"
    && [item.id, item.name, item.system?.slug].some((candidate) => normalize(candidate) === expected));
}

function actorHasEffect(actor, value) {
  const expected = normalize(value);
  return collectionToArray(actor?.effects).filter((effect) => !effect?.disabled && !effect?.isSuppressed).some((effect) => [effect.id, effect.name, effect.origin]
    .some((candidate) => normalize(candidate) === expected));
}

function sourceHasLink(sourceActor, targetActor, prerequisite) {
  const systemFlags = sourceActor?.flags?.["marvel-multiverse"] ?? sourceActor?.flags?.marvelMultiverse ?? {};
  const concentration = systemFlags.concentration ?? {};
  if (!concentration.active || !collectionToArray(concentration.targetUuids).includes(targetActor?.uuid)) return false;
  const expectedItemUuid = normalize(prerequisite.itemUuid);
  const expectedItemName = normalize(prerequisite.itemName);
  if (expectedItemUuid && normalize(concentration.itemUuid) !== expectedItemUuid) return false;
  if (expectedItemName && normalize(concentration.itemName) !== expectedItemName) return false;
  return Boolean(expectedItemUuid || expectedItemName);
}

function prerequisiteMatches(prerequisite, sourceActor, targetActor) {
  switch (prerequisite?.type) {
    case "resource":
      return compareNumber(
        getActorResource(targetActor, prerequisite.resource),
        prerequisite.operator,
        Number(prerequisite.value),
      );
    case "source-link":
      return sourceHasLink(sourceActor, targetActor, prerequisite);
    case "status":
      return actorHasStatus(targetActor, prerequisite.value) === (prerequisite.present !== false);
    case "tag":
      return actorHasTag(targetActor, prerequisite.value) === (prerequisite.present !== false);
    case "active-effect":
      return actorHasEffect(targetActor, prerequisite.value) === (prerequisite.present !== false);
    default:
      return false;
  }
}

export function validateTargetPrerequisites(prerequisites) {
  if (prerequisites === undefined) return { valid: true, issues: [] };
  if (!Array.isArray(prerequisites)) {
    return { valid: false, issues: [{ path: "", message: "Target prerequisites must be an array." }] };
  }
  const issues = [];
  prerequisites.forEach((prerequisite, index) => {
    const path = `[${index}]`;
    if (!prerequisite || typeof prerequisite !== "object" || Array.isArray(prerequisite)) {
      issues.push({ path, message: "Each target prerequisite must be an object." });
      return;
    }
    if (prerequisite.type === "resource") {
      if (!["focus", "health"].includes(prerequisite.resource)) issues.push({ path: `${path}.resource`, message: "Resource prerequisites support focus or health." });
      if (!["eq", "lte", "gte"].includes(prerequisite.operator)) issues.push({ path: `${path}.operator`, message: "Resource prerequisite operator must be eq, lte, or gte." });
      if (!Number.isFinite(Number(prerequisite.value))) issues.push({ path: `${path}.value`, message: "Resource prerequisite value must be numeric." });
    } else if (prerequisite.type === "source-link") {
      if (!normalize(prerequisite.itemUuid) && !normalize(prerequisite.itemName)) issues.push({ path, message: "Source-link prerequisites require itemUuid or itemName." });
    } else if (["status", "tag", "active-effect"].includes(prerequisite.type)) {
      if (!normalize(prerequisite.value)) issues.push({ path: `${path}.value`, message: `${prerequisite.type} prerequisites require a value.` });
      if (prerequisite.present !== undefined && typeof prerequisite.present !== "boolean") issues.push({ path: `${path}.present`, message: "Prerequisite present must be boolean when provided." });
    } else {
      issues.push({ path: `${path}.type`, message: `Unknown target prerequisite type: ${prerequisite.type ?? "missing"}.` });
    }
    if (prerequisite.message !== undefined && typeof prerequisite.message !== "string") issues.push({ path: `${path}.message`, message: "Prerequisite message must be a string when provided." });
  });
  return { valid: issues.length === 0, issues };
}

export function evaluateTargetPrerequisites(sourceActor, targets, prerequisites) {
  if (!Array.isArray(prerequisites) || !prerequisites.length) return { success: true, failures: [] };
  const failures = [];
  for (const target of targets ?? []) {
    const actor = target?.actor ?? target;
    for (const prerequisite of prerequisites) {
      if (prerequisiteMatches(prerequisite, sourceActor, actor)) continue;
      failures.push({
        targetActorUuid: actor?.uuid ?? null,
        targetName: actor?.name ?? target?.name ?? "Target",
        prerequisite,
        message: prerequisite.message ?? `${actor?.name ?? target?.name ?? "Target"} does not meet the requirements for this action.`,
      });
    }
  }
  return { success: failures.length === 0, failures };
}