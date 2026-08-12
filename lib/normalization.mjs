import { validateCharacterActor, validatePowerItem, validateActiveEffect, validateEmbeddedItem, logValidationResult } from "./validation.mjs";

const NORMALIZATION_CONFIDENCE = { high: 3, medium: 2, low: 1, none: 0 };
const BOOLEAN_TRUE = new Set([true, "true", "1", "yes", "on"]);
const BOOLEAN_FALSE = new Set([false, "false", "0", "no", "off"]);

function cloneValue(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function getConfig(options = {}) {
  return options.config ?? globalThis.CONFIG?.MARVEL_MULTIVERSE ?? {};
}

function normalizePowerSetName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getCanonicalValueMap(config = {}) {
  const powersets = config?.powersets ?? {};
  const map = new Map();
  for (const [key, definition] of Object.entries(powersets)) {
    const label = typeof definition === "string" ? definition : definition?.label ?? key;
    map.set(normalizePowerSetName(key), key);
    map.set(normalizePowerSetName(label), key);
  }
  return map;
}

function getAbilityMap(config = {}) {
  const abilities = config?.abilities ?? {};
  const map = new Map();
  const aliases = {
    agility: "agl",
    melee: "mle",
    resilience: "res",
    vigilance: "vig",
    ego: "ego",
    logic: "log",
  };
  for (const [key, value] of Object.entries(abilities)) {
    const label = typeof value === "string" ? value : value?.label ?? key;
    map.set(normalizePowerSetName(key), key);
    map.set(normalizePowerSetName(label), key);
  }
  for (const [alias, key] of Object.entries(aliases)) {
    map.set(normalizePowerSetName(alias), key);
  }
  return map;
}

function getElementMap(config = {}) {
  const elements = config?.elements ?? {};
  const map = new Map();
  for (const [key] of Object.entries(elements)) {
    map.set(normalizePowerSetName(key), key);
  }
  return map;
}

function normalizeStringValue(value) {
  return typeof value === "string" ? value.trim() : value;
}

function createChange(path, originalValue, normalizedValue, confidence, reason, extra = {}) {
  return {
    path,
    originalValue,
    normalizedValue,
    confidence,
    reason,
    ...extra,
  };
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (BOOLEAN_TRUE.has(trimmed)) return true;
    if (BOOLEAN_FALSE.has(trimmed)) return false;
  }
  return undefined;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  }
  return undefined;
}

function normalizePowerSet(value, options = {}) {
  const config = getConfig(options);
  const canonicalMap = getCanonicalValueMap(config);
  const originalValue = value;

  if (value === undefined || value === null) {
    return {
      changed: false,
      originalValue,
      normalizedValue: undefined,
      confidence: "none",
      reason: "Missing power-set value.",
      relatedChanges: {},
    };
  }

  if (typeof value !== "string") {
    return {
      changed: false,
      originalValue,
      normalizedValue: value,
      confidence: "none",
      reason: "Unsupported power-set field type.",
      relatedChanges: {},
    };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {
      changed: false,
      originalValue,
      normalizedValue: value,
      confidence: "none",
      reason: "Empty power-set value.",
      relatedChanges: {},
    };
  }

  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return {
      changed: false,
      originalValue,
      normalizedValue: value,
      confidence: "none",
      reason: "Empty power-set value.",
      relatedChanges: {},
    };
  }

  const normalizedParts = [];
  const invalidParts = [];
  for (const part of parts) {
    const basePart = part.replace(/\s*\([^)]*\)\s*$/, "").trim();
    const normalizedPart = normalizePowerSetName(basePart);
    const canonicalKey = canonicalMap.get(normalizedPart);
    if (canonicalKey) {
      const canonicalLabel = config.powersets?.[canonicalKey]?.label ?? canonicalKey;
      const normalizedLabel = canonicalLabel;
      normalizedParts.push(normalizedLabel);
    } else {
      invalidParts.push(part);
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const part of normalizedParts) {
    if (!seen.has(normalizePowerSetName(part))) {
      deduped.push(part);
      seen.add(normalizePowerSetName(part));
    }
  }

  if (deduped.length === 0) {
    return {
      changed: false,
      originalValue,
      normalizedValue: value,
      confidence: "none",
      reason: "No configured power-set values matched the supplied input.",
      relatedChanges: {},
      invalidParts,
    };
  }

  const normalizedValue = deduped.join(", ");
  const changed = normalizedValue !== trimmed;
  const relatedChanges = {};
  const descriptorMatch = /\s*\(([^)]+)\)\s*$/.exec(trimmed);
  if (descriptorMatch && deduped.length === 1) {
    const descriptor = descriptorMatch[1].trim().toLowerCase();
    const elementMap = getElementMap(config);
    const elementKey = elementMap.get(normalizePowerSetName(descriptor)) || elementMap.get(normalizePowerSetName(descriptor.replace(/s$/, "")));
    if (elementKey) {
      relatedChanges.element = elementKey;
      relatedChanges.isElemental = true;
    }
  }

  return {
    changed,
    originalValue,
    normalizedValue,
    confidence: changed ? "high" : "none",
    reason: changed ? "Normalized power-set labels to the configured system values." : "Power-set value already matched the configured label.",
    relatedChanges,
    invalidParts,
  };
}

function normalizeAbility(value, options = {}) {
  const config = getConfig(options);
  const abilityMap = getAbilityMap(config);
  const originalValue = value;

  if (value === undefined || value === null) {
    return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Missing ability value." };
  }

  if (typeof value !== "string") {
    return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Unsupported ability field type." };
  }

  const trimmed = value.trim();
  if (!trimmed) return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Empty ability value." };

  const normalizedKey = abilityMap.get(normalizePowerSetName(trimmed));
  if (normalizedKey) {
    return {
      changed: normalizedKey !== normalizePowerSetName(trimmed),
      originalValue,
      normalizedValue: normalizedKey,
      confidence: "high",
      reason: "Normalized an ability label or alias to the system’s internal key.",
    };
  }

  return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Ability value was not recognized." };
}

function normalizeElement(value, options = {}) {
  const config = getConfig(options);
  const map = getElementMap(config);
  const originalValue = value;

  if (value === undefined || value === null) {
    return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Missing element value." };
  }

  if (typeof value !== "string") {
    return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Unsupported element field type." };
  }

  const trimmed = value.trim();
  if (!trimmed) return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Empty element value." };

  const aliases = {
    electric: "electricity",
    electricity: "electricity",
    lightning: "electricity",
    flame: "fire",
    fire: "fire",
    cold: "ice",
    wind: "air",
    sonic: "sound",
    poison: "toxin",
    chemicals: "chemical",
    chemical: "chemical",
    energy: "energy",
  };
  const normalizedKey = map.get(normalizePowerSetName(trimmed)) || aliases[normalizePowerSetName(trimmed)];
  if (normalizedKey) {
    return { changed: normalizedKey !== originalValue, originalValue, normalizedValue: normalizedKey, confidence: "high", reason: "Normalized an element alias to the configured system key." };
  }
  return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Element value was not recognized." };
}

function normalizeDamageType(value, options = {}) {
  const config = getConfig(options);
  const damageTypes = config?.damageTypes ?? { health: { label: "Health" }, focus: { label: "Focus" } };
  const originalValue = value;

  if (value === undefined || value === null) {
    return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Missing damage type value." };
  }

  const typeName = typeof value === "string" ? value.trim().toLowerCase() : String(value).toLowerCase();
  if (!typeName) return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Empty damage type value." };

  if (typeName === "health" || typeName === "hp" || typeName === "physical") {
    return { changed: typeName !== "health", originalValue, normalizedValue: "health", confidence: "high", reason: "Normalized a damage-type alias to the system’s internal health value." };
  }
  if (typeName === "focus" || typeName === "mental" || typeName === "psychic") {
    return { changed: typeName !== "focus", originalValue, normalizedValue: "focus", confidence: "high", reason: "Normalized a damage-type alias to the system’s internal focus value." };
  }
  if (typeof value === "string" && Object.keys(damageTypes).includes(value.trim().toLowerCase())) {
    return { changed: false, originalValue, normalizedValue: value.trim().toLowerCase(), confidence: "high", reason: "Damage type already matched the configured value." };
  }
  return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Damage type was not recognized." };
}

function normalizeAttackKind(value, options = {}) {
  const originalValue = value;
  const attackKindMap = {
    melee: "close",
    close: "close",
    closecombat: "close",
    close_combat: "close",
    ranged: "ranged",
    range: "ranged",
    distance: "ranged",
  };
  if (value === undefined || value === null) return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Missing attack-kind value." };
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : String(value).toLowerCase();
  if (attackKindMap[normalized] !== undefined) {
    return { changed: attackKindMap[normalized] !== normalized, originalValue, normalizedValue: attackKindMap[normalized], confidence: "high", reason: "Normalized an attack-kind alias to the configured system value." };
  }
  return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Attack kind was not recognized." };
}

function normalizeEdgeMode(value) {
  const originalValue = value;
  const edgeMap = {
    normal: "normal",
    none: "normal",
    edge: "edge",
    withedge: "edge",
    trouble: "trouble",
    withtrouble: "trouble",
  };
  if (value === undefined || value === null) return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Missing edge-mode value." };
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : String(value).toLowerCase();
  if (edgeMap[normalized] !== undefined) {
    return { changed: edgeMap[normalized] !== normalized, originalValue, normalizedValue: edgeMap[normalized], confidence: "high", reason: "Normalized an edge-mode alias to the configured system value." };
  }
  return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Edge mode was not recognized." };
}

function normalizeBoolean(value) {
  const originalValue = value;
  const normalizedValue = toBoolean(value);
  if (normalizedValue === undefined) {
    return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Boolean value was not recognized." };
  }
  return { changed: normalizedValue !== value, originalValue, normalizedValue, confidence: "high", reason: "Normalized a boolean string to a boolean value." };
}

function normalizeNumeric(value) {
  const originalValue = value;
  const normalizedValue = toNumber(value);
  if (normalizedValue === undefined) {
    return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Numeric value was not recognized." };
  }
  return { changed: normalizedValue !== value, originalValue, normalizedValue, confidence: "high", reason: "Normalized a numeric string to a number." };
}

function normalizeEffectPath(value, options = {}) {
  const config = getConfig(options);
  const abilityMap = getAbilityMap(config);
  const originalValue = value;
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Missing Active Effect path." };
  }

  const directAliases = {
    agility: "system.abilities.agl",
    melee: "system.abilities.mle",
    resilience: "system.abilities.res",
    vigilance: "system.abilities.vig",
    ego: "system.abilities.ego",
    logic: "system.abilities.log",
    healthdamagereduction: "system.healthDamageReduction",
    focusdamagereduction: "system.focusDamageReduction",
  };
  const direct = directAliases[normalized];
  if (direct) return { changed: true, originalValue, normalizedValue: direct, confidence: "high", reason: "Normalized a short Active Effect path to a supported system path." };

  if (normalized.startsWith("system.abilities.agility")) return { changed: true, originalValue, normalizedValue: normalized.replace("system.abilities.agility", "system.abilities.agl"), confidence: "high", reason: "Normalized an ability path to the internal ability key." };
  if (normalized.startsWith("abilities.agility")) return { changed: true, originalValue, normalizedValue: normalized.replace("abilities.agility", "system.abilities.agl"), confidence: "high", reason: "Normalized an ability path to the internal ability key." };
  if (normalized.startsWith("system.abilities.melee")) return { changed: true, originalValue, normalizedValue: normalized.replace("system.abilities.melee", "system.abilities.mle"), confidence: "high", reason: "Normalized an ability path to the internal ability key." };
  if (normalized.startsWith("abilities.melee")) return { changed: true, originalValue, normalizedValue: normalized.replace("abilities.melee", "system.abilities.mle"), confidence: "high", reason: "Normalized an ability path to the internal ability key." };
  if (normalized === "agility") return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "A specific field path is required for this Active Effect key." };
  return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Active Effect path was not recognized." };
}

function normalizeMovement(value) {
  const originalValue = value;
  const movementMap = {
    fly: "flight",
    flying: "flight",
    run: "run",
    runspeed: "run",
    runspeed: "run",
    climb: "climb",
    climbing: "climb",
    swim: "swim",
    swimming: "swim",
    swing: "swingline",
    swingline: "swingline",
    levitate: "levitation",
    levitation: "levitation",
  };
  if (value === undefined || value === null) return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Missing movement value." };
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : String(value).toLowerCase();
  if (movementMap[normalized] !== undefined) return { changed: movementMap[normalized] !== normalized, originalValue, normalizedValue: movementMap[normalized], confidence: "high", reason: "Normalized a movement type alias to the configured system value." };
  return { changed: false, originalValue, normalizedValue: value, confidence: "none", reason: "Movement value was not recognized." };
}

function normalizeDocumentValue(path, value, options = {}) {
  if (path === "system.powerSet") return normalizePowerSet(value, options);
  if (path === "system.ability") return normalizeAbility(value, options);
  if (path === "system.attackTarget") return normalizeAbility(value, options);
  if (path === "system.attackKind") return normalizeAttackKind(value, options);
  if (path === "system.attackEdgeMode") return normalizeEdgeMode(value);
  if (path === "system.damageType") return normalizeDamageType(value, options);
  if (path === "system.element") return normalizeElement(value, options);
  if (path === "system.attack") return normalizeBoolean(value);
  if (path === "system.isElemental") return normalizeBoolean(value);
  if (path === "system.numbered") return normalizeNumeric(value);
  if (path === "system.attackRange") return normalizeNumeric(value);
  if (path === "system.attackMultiplier") return normalizeNumeric(value);
  if (path === "system.abilities.*.value") return normalizeNumeric(value);
  if (path === "system.abilities.*.damageMultiplier") return normalizeNumeric(value);
  if (path === "system.movement.*.active") return normalizeBoolean(value);
  if (path === "system.movement.*.value") return normalizeNumeric(value);
  if (path === "system.movement.*.noncom") return normalizeNumeric(value);
  return { changed: false, originalValue: value, normalizedValue: value, confidence: "none", reason: "No normalization rule matched this path." };
}

function buildChangeRecord(path, result, extra = {}) {
  return createChange(path, result.originalValue, result.normalizedValue, result.confidence, result.reason, extra);
}

export function normalizePowerData(powerData, options = {}) {
  const config = getConfig(options);
  const normalizedData = cloneValue(powerData ?? {});
  const changes = [];
  const warnings = [];
  const unresolved = [];

  const system = normalizedData.system ?? {};
  const powerSetResult = normalizePowerSet(system.powerSet, { ...options, config });
  if (powerSetResult.changed || powerSetResult.confidence !== "none") {
    changes.push(buildChangeRecord("system.powerSet", powerSetResult, { relatedChanges: powerSetResult.relatedChanges }));
    system.powerSet = powerSetResult.normalizedValue;
    if (powerSetResult.relatedChanges.element) {
      changes.push(buildChangeRecord("system.element", { originalValue: system.element, normalizedValue: powerSetResult.relatedChanges.element }, { confidence: "high", reason: "Derived from the removed power-set descriptor." }));
      system.element = powerSetResult.relatedChanges.element;
    }
    if (powerSetResult.relatedChanges.isElemental !== undefined) {
      changes.push(buildChangeRecord("system.isElemental", { originalValue: system.isElemental, normalizedValue: powerSetResult.relatedChanges.isElemental }, { confidence: "high", reason: "Derived from the removed power-set descriptor." }));
      system.isElemental = powerSetResult.relatedChanges.isElemental;
    }
  } else if (powerSetResult.confidence === "none" && powerSetResult.originalValue !== undefined) {
    unresolved.push({ path: "system.powerSet", value: powerSetResult.originalValue, reason: powerSetResult.reason });
  }

  if (typeof system.ability !== "undefined") {
    const abilityResult = normalizeAbility(system.ability, { ...options, config });
    if (abilityResult.changed) {
      changes.push(buildChangeRecord("system.ability", abilityResult));
      system.ability = abilityResult.normalizedValue;
    }
  }

  if (typeof system.attackTarget !== "undefined") {
    const result = normalizeAbility(system.attackTarget, { ...options, config });
    if (result.changed) {
      changes.push(buildChangeRecord("system.attackTarget", result));
      system.attackTarget = result.normalizedValue;
    }
  }

  if (typeof system.attackKind !== "undefined") {
    const result = normalizeAttackKind(system.attackKind, { ...options, config });
    if (result.changed) {
      changes.push(buildChangeRecord("system.attackKind", result));
      system.attackKind = result.normalizedValue;
    }
  }

  if (typeof system.attackEdgeMode !== "undefined") {
    const result = normalizeEdgeMode(system.attackEdgeMode);
    if (result.changed) {
      changes.push(buildChangeRecord("system.attackEdgeMode", result));
      system.attackEdgeMode = result.normalizedValue;
    }
  }

  if (typeof system.damageType !== "undefined") {
    const result = normalizeDamageType(system.damageType, { ...options, config });
    if (result.changed) {
      changes.push(buildChangeRecord("system.damageType", result));
      system.damageType = result.normalizedValue;
    }
  }

  if (typeof system.element !== "undefined") {
    const result = normalizeElement(system.element, { ...options, config });
    if (result.changed) {
      changes.push(buildChangeRecord("system.element", result));
      system.element = result.normalizedValue;
    }
  }

  if (typeof system.attack !== "undefined") {
    const result = normalizeBoolean(system.attack);
    if (result.changed) {
      changes.push(buildChangeRecord("system.attack", result));
      system.attack = result.normalizedValue;
    }
  }

  if (typeof system.isElemental !== "undefined") {
    const result = normalizeBoolean(system.isElemental);
    if (result.changed) {
      changes.push(buildChangeRecord("system.isElemental", result));
      system.isElemental = result.normalizedValue;
    }
  }

  if (typeof system.numbered !== "undefined") {
    const result = normalizeNumeric(system.numbered);
    if (result.changed) {
      changes.push(buildChangeRecord("system.numbered", result));
      system.numbered = result.normalizedValue;
    }
  }

  if (typeof system.attackRange !== "undefined") {
    const result = normalizeNumeric(system.attackRange);
    if (result.changed) {
      changes.push(buildChangeRecord("system.attackRange", result));
      system.attackRange = result.normalizedValue;
    }
  }

  if (typeof system.attackMultiplier !== "undefined") {
    const result = normalizeNumeric(system.attackMultiplier);
    if (result.changed) {
      changes.push(buildChangeRecord("system.attackMultiplier", result));
      system.attackMultiplier = result.normalizedValue;
    }
  }

  const focusCost = system.cost ?? system.focusCost ?? null;
  const parsedFocusCost = typeof focusCost === "string" && focusCost.trim()
    ? (() => {
        const normalized = focusCost.trim().toLowerCase();
        if (/[0-9]/.test(normalized)) {
          const fixedMatch = normalized.match(/^(?<value>\d+)\s+focus$/);
          if (fixedMatch?.groups?.value) {
            return { type: "fixed", value: Number(fixedMatch.groups.value) };
          }
          const variableMatch = normalized.match(/^(?<minimum>\d+)\s+or\s+more\s+focus$/);
          if (variableMatch?.groups?.minimum) {
            return { type: "variable", minimum: Number(variableMatch.groups.minimum), maximum: null };
          }
        }
        return null;
      })()
    : null;
  if (parsedFocusCost) {
    const flags = normalizedData.flags?.["marvel-multiverse"] ?? normalizedData.flags?.marvelMultiverse ?? {};
    const automation = flags.automation ?? {};
    if (!automation.focusCost) {
      flags.automation = { ...automation, focusCost: parsedFocusCost };
      normalizedData.flags = { ...normalizedData.flags, "marvel-multiverse": flags };
      changes.push(buildChangeRecord("flags.marvel-multiverse.automation.focusCost", { originalValue: undefined, normalizedValue: parsedFocusCost }, { confidence: "medium", reason: "Derived a structured Focus cost from legacy cost text." }));
    }
  }

  const normalizedPowerData = { ...normalizedData, system };
  return { changed: changes.length > 0, normalizedData: normalizedPowerData, changes, warnings, unresolved };
}

export function normalizeCharacterData(actorData, options = {}) {
  const config = getConfig(options);
  const normalizedData = cloneValue(actorData ?? {});
  const changes = [];
  const warnings = [];
  const unresolved = [];

  const system = normalizedData.system ?? {};
  if (system.abilities && typeof system.abilities === "object") {
    for (const [abilityKey, abilityData] of Object.entries(system.abilities)) {
      if (!abilityData || typeof abilityData !== "object") continue;
      if (typeof abilityData.value !== "undefined") {
        const result = normalizeNumeric(abilityData.value);
        if (result.changed) {
          changes.push(buildChangeRecord(`system.abilities.${abilityKey}.value`, result));
          abilityData.value = result.normalizedValue;
        }
      }
      if (typeof abilityData.damageMultiplier !== "undefined") {
        const result = normalizeNumeric(abilityData.damageMultiplier);
        if (result.changed) {
          changes.push(buildChangeRecord(`system.abilities.${abilityKey}.damageMultiplier`, result));
          abilityData.damageMultiplier = result.normalizedValue;
        }
      }
    }
  }

  if (system.movement && typeof system.movement === "object") {
    for (const [movementKey, movementData] of Object.entries(system.movement)) {
      if (!movementData || typeof movementData !== "object") continue;
      if (typeof movementData.active !== "undefined") {
        const result = normalizeBoolean(movementData.active);
        if (result.changed) {
          changes.push(buildChangeRecord(`system.movement.${movementKey}.active`, result));
          movementData.active = result.normalizedValue;
        }
      }
      if (typeof movementData.value !== "undefined") {
        const result = normalizeNumeric(movementData.value);
        if (result.changed) {
          changes.push(buildChangeRecord(`system.movement.${movementKey}.value`, result));
          movementData.value = result.normalizedValue;
        }
      }
      if (typeof movementData.noncom !== "undefined") {
        const result = normalizeNumeric(movementData.noncom);
        if (result.changed) {
          changes.push(buildChangeRecord(`system.movement.${movementKey}.noncom`, result));
          movementData.noncom = result.normalizedValue;
        }
      }
    }
  }

  if (typeof system.defaultElement !== "undefined") {
    const result = normalizeElement(system.defaultElement, { ...options, config });
    if (result.changed) {
      changes.push(buildChangeRecord("system.defaultElement", result));
      system.defaultElement = result.normalizedValue;
    }
  }

  if (Array.isArray(normalizedData.items)) {
    normalizedData.items = normalizedData.items.map((item) => {
      if (!item || typeof item !== "object") return item;
      if (item.type === "power") {
        const result = normalizePowerData(item, { ...options, config });
        if (result.changed) {
          changes.push(...result.changes.map((change) => ({ ...change, documentName: item.name || item._id || "" })));
          return result.normalizedData;
        }
      }
      return item;
    });
  }

  return { changed: changes.length > 0, normalizedData, changes, warnings, unresolved };
}

export async function applyNormalization(document, options = {}) {
  const minimumConfidence = options.minimumConfidence ?? "high";
  const confirm = options.confirm ?? false;
  const dryRun = options.dryRun ?? false;
  const previewOnly = options.previewOnly ?? false;
  const confidenceRank = NORMALIZATION_CONFIDENCE[minimumConfidence] ?? NORMALIZATION_CONFIDENCE.high;

  const payload = document?.toObject?.() ?? cloneValue(document);
  const preview = document?.type === "character"
    ? normalizeCharacterData(payload, options)
    : document?.type === "power"
      ? normalizePowerData(payload, options)
      : normalizePowerData(payload, options);

  const changes = preview.changes.filter((change) => (NORMALIZATION_CONFIDENCE[change.confidence] ?? 0) >= confidenceRank);
  const skipped = preview.changes.filter((change) => (NORMALIZATION_CONFIDENCE[change.confidence] ?? 0) < confidenceRank);
  const result = {
    applied: [],
    skipped,
    preview,
    summary: {
      appliedCount: 0,
      skippedCount: skipped.length,
      changed: preview.changed,
    },
  };

  if (previewOnly || dryRun || !confirm) {
    return result;
  }

  if (!document?.update) {
    result.summary.appliedCount = 0;
    return result;
  }

  const updateData = {};
  for (const change of changes) {
    const path = change.path;
    if (!path || path.startsWith("documentName")) continue;
    const value = change.normalizedValue;
    if (path.startsWith("system.")) {
      updateData[path] = value;
    }
  }

  if (Object.keys(updateData).length) {
    await document.update(updateData);
    result.applied = changes;
    result.summary.appliedCount = changes.length;
  }

  return result;
}

export function previewNormalization(document, options = {}) {
  const payload = document?.toObject?.() ?? cloneValue(document);
  const preview = document?.type === "character"
    ? normalizeCharacterData(payload, options)
    : document?.type === "power"
      ? normalizePowerData(payload, options)
      : normalizePowerData(payload, options);

  const result = {
    preview,
    before: {},
    after: {},
  };

  const validatorOptions = { ...options, config: getConfig(options) };
  if (document?.type === "character") {
    result.before = validateCharacterActor(payload, validatorOptions);
    result.after = validateCharacterActor(preview.normalizedData, validatorOptions);
  } else if (document?.type === "power") {
    result.before = validatePowerItem(payload, validatorOptions);
    result.after = validatePowerItem(preview.normalizedData, validatorOptions);
  } else {
    result.before = validateEmbeddedItem(payload, validatorOptions);
    result.after = validateEmbeddedItem(preview.normalizedData, validatorOptions);
  }

  return result;
}

export function normalizeActorData(actorData, options = {}) {
  return normalizeCharacterData(actorData, options);
}

export function normalizeItemData(itemData, options = {}) {
  if (itemData?.type === "power") return normalizePowerData(itemData, options);
  return { changed: false, normalizedData: cloneValue(itemData ?? {}), changes: [], warnings: [], unresolved: [] };
}

export function logNormalizationPreview(result, title = "Marvel Multiverse Normalization Preview") {
  if (!result) return;
  const summary = `${result.preview?.changes?.length ?? 0} change${(result.preview?.changes?.length ?? 0) === 1 ? "" : "s"}`;
  console.groupCollapsed(`${title}: ${result.preview?.normalizedData?.name || "Document"}`);
  console.log(summary);
  if (result.preview?.changes?.length) {
    console.groupCollapsed("Changes");
    for (const change of result.preview.changes) console.log(change);
    console.groupEnd();
  }
  if (result.preview?.unresolved?.length) {
    console.groupCollapsed("Unresolved");
    for (const issue of result.preview.unresolved) console.warn(issue);
    console.groupEnd();
  }
  console.groupEnd();
}
