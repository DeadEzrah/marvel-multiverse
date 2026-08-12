function createIssue(code, severity, message, details = {}) {
  return { code, severity, message, ...details };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasPath(obj, path) {
  if (!obj || typeof obj !== "object") return false;
  const parts = path.split(".");
  let cursor = obj;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object" || !(part in cursor)) {
      return false;
    }
    cursor = cursor[part];
  }
  return true;
}

export function inspectActor(actor) {
  const issues = [];
  const derivedValues = {};
  if (!actor) {
    return {
      valid: false,
      rulesVersion: "UNVERIFIED",
      issues: [createIssue("ACTOR_MISSING", "error", "Actor was not provided.")],
      derivedValues,
      sourceReferences: [],
    };
  }

  const system = actor.system ?? {};
  const abilities = system.abilities ?? {};
  const abilityKeys = ["mle", "agl", "res", "vig", "ego", "log"];

  for (const key of abilityKeys) {
    const value = abilities?.[key]?.value;
    const defense = abilities?.[key]?.defense;
    if (!isFiniteNumber(value)) {
      issues.push(createIssue("ABILITY_VALUE_INVALID", "warning", `Ability ${key} value is not finite.`, { ability: key, value }));
    }
    if (!isFiniteNumber(defense)) {
      issues.push(createIssue("ABILITY_DEFENSE_INVALID", "warning", `Ability ${key} defense is not finite.`, { ability: key, defense }));
    }
  }

  const healthValue = system?.health?.value;
  const healthMax = system?.health?.max;
  const focusValue = system?.focus?.value;
  const focusMax = system?.focus?.max;

  if (!isFiniteNumber(healthValue)) issues.push(createIssue("HEALTH_VALUE_INVALID", "error", "Health value is not finite."));
  if (!isFiniteNumber(healthMax)) issues.push(createIssue("HEALTH_MAX_INVALID", "error", "Health max is not finite."));
  if (!isFiniteNumber(focusValue)) issues.push(createIssue("FOCUS_VALUE_INVALID", "error", "Focus value is not finite."));
  if (!isFiniteNumber(focusMax)) issues.push(createIssue("FOCUS_MAX_INVALID", "error", "Focus max is not finite."));

  derivedValues.healthPercent = isFiniteNumber(healthValue) && isFiniteNumber(healthMax) && healthMax > 0
    ? Math.max(0, Math.min(1, healthValue / healthMax))
    : null;
  derivedValues.focusPercent = isFiniteNumber(focusValue) && isFiniteNumber(focusMax) && focusMax > 0
    ? Math.max(0, Math.min(1, focusValue / focusMax))
    : null;

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    rulesVersion: "UNVERIFIED",
    issues,
    derivedValues,
    sourceReferences: [
      {
        source: "system-data-model",
        topic: "actor-schema",
      },
    ],
  };
}

export function inspectItem(item) {
  const issues = [];
  const derivedValues = {};
  if (!item) {
    return {
      valid: false,
      rulesVersion: "UNVERIFIED",
      issues: [createIssue("ITEM_MISSING", "error", "Item was not provided.")],
      derivedValues,
      sourceReferences: [],
    };
  }

  const system = item.system ?? {};
  const ability = system.ability;
  if (ability && !["mle", "agl", "res", "vig", "ego", "log"].includes(String(ability).toLowerCase())) {
    issues.push(createIssue("ITEM_ABILITY_UNRECOGNIZED", "warning", "Item ability key is not recognized.", { ability }));
  }

  const attack = Boolean(system.attack);
  const attackTarget = system.attackTarget;
  if (attack && attackTarget && !["mle", "agl", "res", "vig", "ego", "log"].includes(String(attackTarget).toLowerCase())) {
    issues.push(createIssue("ITEM_ATTACK_TARGET_UNRECOGNIZED", "warning", "Attack target defense key is not recognized.", { attackTarget }));
  }

  derivedValues.attack = attack;
  derivedValues.powerSet = system.powerSet ?? null;

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    rulesVersion: "UNVERIFIED",
    issues,
    derivedValues,
    sourceReferences: [
      {
        source: "system-data-model",
        topic: "item-schema",
      },
    ],
  };
}

export function inspectMessage(message) {
  const issues = [];
  const derivedValues = {};
  if (!message) {
    return {
      valid: false,
      rulesVersion: "UNVERIFIED",
      issues: [createIssue("MESSAGE_MISSING", "error", "Message was not provided.")],
      derivedValues,
      sourceReferences: [],
    };
  }

  const scope = message?.flags?.["marvel-multiverse"] ?? {};
  const rollContext = scope.rollContext ?? null;
  const targetUuids = Array.isArray(rollContext?.targetUuids) ? rollContext.targetUuids : [];

  if (rollContext && !Array.isArray(targetUuids)) {
    issues.push(createIssue("ROLL_TARGETS_INVALID", "warning", "Stored target UUIDs should be an array."));
  }

  const flagChecks = [
    "rollContext",
    "attackResolution",
    "damageContext",
    "focusTransactions",
    "conditionApplications",
    "statusTransactions",
  ];

  for (const key of flagChecks) {
    if (!hasPath(scope, key)) continue;
    const value = scope[key];
    if (value && typeof value === "object" && (typeof value.update === "function" || typeof value.delete === "function")) {
      issues.push(createIssue("FLAG_CONTAINS_DOCUMENT", "error", `Flag ${key} appears to contain a live document object.`, { key }));
    }
  }

  derivedValues.hasRollContext = Boolean(rollContext);
  derivedValues.targetCount = targetUuids.length;

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    rulesVersion: "UNVERIFIED",
    issues,
    derivedValues,
    sourceReferences: [
      {
        source: "chat-flags",
        topic: "structured-chat-data",
      },
    ],
  };
}

export async function inspectCompendiums() {
  const issues = [];
  const derivedValues = { packs: [] };
  const packs = globalThis.game?.packs;
  if (!packs || typeof packs[Symbol.iterator] !== "function") {
    return {
      valid: false,
      rulesVersion: "UNVERIFIED",
      issues: [createIssue("PACKS_UNAVAILABLE", "warning", "Compendium packs are not available in this runtime.")],
      derivedValues,
      sourceReferences: [],
    };
  }

  for (const pack of packs) {
    const metadata = {
      collection: pack?.collection ?? null,
      documentName: pack?.documentName ?? null,
      type: pack?.metadata?.type ?? null,
      packageType: pack?.metadata?.packageType ?? null,
    };
    derivedValues.packs.push(metadata);
    if (!metadata.collection) {
      issues.push(createIssue("PACK_COLLECTION_MISSING", "warning", "Compendium pack is missing collection id.", { metadata }));
    }
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    rulesVersion: "UNVERIFIED",
    issues,
    derivedValues,
    sourceReferences: [
      {
        source: "foundry-compendium-api",
        topic: "pack-metadata",
      },
    ],
  };
}
