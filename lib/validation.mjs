import { EFFECT_PROFILE_PHASES } from "./services/effect-profile-manager.mjs";
import { automationPresetIds } from "./services/automation-presets.mjs";

const DEFAULT_ABILITY_KEYS = ["mle", "agl", "res", "vig", "ego", "log"];
const DEFAULT_MOVEMENT_KEYS = [
  "run",
  "climb",
  "swim",
  "jump",
  "flight",
  "glide",
  "swingline",
  "levitation",
];
const ABILITY_FIELDS = [
  "value",
  "defense",
  "noncom",
  "edge",
  "damageMultiplier",
  "label",
];
const MOVEMENT_FIELDS = ["label", "value", "noncom", "active", "rankMode"];
const CONDITION_TERMS = [
  "paralyzed",
  "restrained",
  "grappled",
  "stunned",
  "prone",
  "blinded",
  "poisoned",
  "frightened",
];

function createValidationResult(actorName = "", actorId = "") {
  return {
    valid: true,
    errors: [],
    warnings: [],
    info: [],
    summary: {
      actorName,
      actorId,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
    },
  };
}

function addIssue(result, severity, code, message, details = {}) {
  const issue = {
    severity,
    code,
    message,
    documentType: details.documentType ?? "",
    documentId: details.documentId ?? "",
    documentName: details.documentName ?? "",
    path: details.path ?? "",
    value: details.value,
    ...(details.suggestedValue !== undefined
      ? { suggestedValue: details.suggestedValue }
      : {}),
  };

  if (severity === "error") result.errors.push(issue);
  else if (severity === "warning") result.warnings.push(issue);
  else result.info.push(issue);

  result.valid = severity !== "error" ? result.valid : false;
  result.summary.errorCount = result.errors.length;
  result.summary.warningCount = result.warnings.length;
  result.summary.infoCount = result.info.length;

  return issue;
}

function mergeValidationResult(target, source) {
  if (!source) return target;
  target.valid = target.valid && source.valid;
  target.errors.push(...source.errors);
  target.warnings.push(...source.warnings);
  target.info.push(...source.info);
  target.summary.errorCount = target.errors.length;
  target.summary.warningCount = target.warnings.length;
  target.summary.infoCount = target.info.length;
  return target;
}

function getDocumentName(document) {
  if (!document || typeof document !== "object") return "";
  if (typeof document.name === "string" && document.name.trim()) return document.name;
  if (typeof document.label === "string" && document.label.trim()) return document.label;
  return "";
}

function getDocumentId(document) {
  if (!document || typeof document !== "object") return "";
  return document._id || document.id || document.documentId || "";
}

function collectionToArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.contents)) return value.contents;
  if (value && typeof value[Symbol.iterator] === "function") return [...value];
  return null;
}

function getSystemData(document) {
  if (!document || typeof document !== "object") return null;
  if (document.system && typeof document.system === "object") return document.system;
  if (document.data && typeof document.data.system === "object") return document.data.system;
  return null;
}

function getValue(target, path) {
  if (!target || typeof target !== "object") return undefined;
  return path.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), target);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value) {
  return typeof value === "string";
}

function isBoolean(value) {
  return typeof value === "boolean";
}

function normalizePowerSetName(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getPowerSetOptions(config = {}) {
  const powersets = config?.powersets ?? {};
  const options = [];
  for (const [key, definition] of Object.entries(powersets)) {
    const label = typeof definition === "string" ? definition : definition?.label ?? key;
    options.push({ key, label });
  }
  return options;
}

function inferSuggestedPowerSet(value) {
  const match = String(value ?? "").trim().match(/^(.*?)(?:\s*\([^)]*\))?$/);
  return match?.[1]?.trim() || "";
}

function validatePowerSetValue(value, config, result, path) {
  if (!isString(value)) {
    addIssue(result, "error", "INVALID_POWER_SET", "Power set must be a string.", {
      path,
      value,
    });
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    addIssue(result, "error", "INVALID_POWER_SET", "Power set is empty.", { path, value });
    return false;
  }

  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    addIssue(result, "error", "INVALID_POWER_SET", "Power set is empty.", { path, value });
    return false;
  }

  const knownOptions = getPowerSetOptions(config);
  const knownValues = new Set(
    knownOptions.flatMap(({ key, label }) => [normalizePowerSetName(key), normalizePowerSetName(label)])
  );

  let valid = true;
  for (const part of parts) {
    const normalized = normalizePowerSetName(part);
    if (!knownValues.has(normalized)) {
      valid = false;
      const suggestedValue = inferSuggestedPowerSet(part);
      addIssue(result, "error", "INVALID_POWER_SET", `Unknown power set: ${part}`, {
        path,
        value: part,
        ...(suggestedValue ? { suggestedValue } : {}),
      });
    }
  }

  return valid;
}

function validateAbilityValue(value, result, path, { allowEmpty = true } = {}) {
  if (value === undefined || value === null) {
    addIssue(result, "error", "INVALID_ABILITY", `Missing ability value at ${path}.`, { path, value });
    return false;
  }

  if (!isString(value)) {
    addIssue(result, "error", "INVALID_ABILITY", `Ability identifier must be a string at ${path}.`, {
      path,
      value,
    });
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    if (allowEmpty) return true;
    addIssue(result, "error", "INVALID_ABILITY", `Ability identifier cannot be empty at ${path}.`, {
      path,
      value,
    });
    return false;
  }

  if (!DEFAULT_ABILITY_KEYS.includes(trimmed)) {
    addIssue(result, "error", "INVALID_ABILITY", `Invalid ability identifier: ${trimmed}`, {
      path,
      value: trimmed,
    });
    return false;
  }

  return true;
}

function validateRequiredObject(result, value, path, { documentType = "", documentId = "", documentName = "" } = {}) {
  if (!isPlainObject(value)) {
    addIssue(result, "error", "MISSING_REQUIRED_OBJECT", `Missing required object: ${path}`, {
      documentType,
      documentId,
      documentName,
      path,
      value,
    });
    return false;
  }
  return true;
}

function validateFocusCostMetadata(result, item, options = {}) {
  const metadata = item?.flags?.["marvel-multiverse"]?.automation?.focusCost ?? item?.system?.focusCost ?? null;
  if (!metadata) return;
  if (typeof metadata === "object" && !Array.isArray(metadata)) {
    if (metadata.type === "fixed") {
      if (typeof metadata.value !== "number" || !Number.isFinite(metadata.value) || metadata.value < 0) {
        addIssue(result, "error", "FOCUS_COST_VALUE_INVALID", "Structured fixed Focus cost must be a non-negative number.", { path: "flags.marvel-multiverse.automation.focusCost.value", value: metadata.value });
      }
      return;
    }
    if (metadata.type === "variable") {
      if (typeof metadata.minimum !== "number" || !Number.isFinite(metadata.minimum) || metadata.minimum < 0) {
        addIssue(result, "error", "FOCUS_COST_MINIMUM_INVALID", "Structured variable Focus cost minimum must be a non-negative number.", { path: "flags.marvel-multiverse.automation.focusCost.minimum", value: metadata.minimum });
      }
      if (metadata.maximum !== null && metadata.maximum !== undefined && (typeof metadata.maximum !== "number" || !Number.isFinite(metadata.maximum) || metadata.maximum < 0)) {
        addIssue(result, "error", "FOCUS_COST_MAXIMUM_INVALID", "Structured variable Focus cost maximum must be a non-negative number.", { path: "flags.marvel-multiverse.automation.focusCost.maximum", value: metadata.maximum });
      }
      if (typeof metadata.minimum === "number" && typeof metadata.maximum === "number" && metadata.minimum > metadata.maximum) {
        addIssue(result, "error", "FOCUS_COST_RANGE_INVALID", "Structured variable Focus cost minimum cannot exceed the maximum.", { path: "flags.marvel-multiverse.automation.focusCost", value: metadata });
      }
      return;
    }
    if (metadata.type === "choice") {
      if (!Array.isArray(metadata.options) || metadata.options.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || entry < 0)) {
        addIssue(result, "error", "FOCUS_COST_OPTIONS_INVALID", "Structured choice Focus cost options must be non-negative numbers.", { path: "flags.marvel-multiverse.automation.focusCost.options", value: metadata.options });
      }
      return;
    }
    addIssue(result, "error", "FOCUS_COST_TYPE_INVALID", "Structured Focus cost uses an unsupported type.", { path: "flags.marvel-multiverse.automation.focusCost.type", value: metadata.type });
  }
}

export function validateCharacterActor(actor, options = {}) {
  const result = createValidationResult(actor?.name ?? "", actor?._id || actor?.id || "");
  const config = options.config ?? globalThis.CONFIG?.MARVEL_MULTIVERSE ?? {};

  if (!actor || typeof actor !== "object") {
    addIssue(result, "error", "INVALID_ACTOR", "Actor must be an object.", {
      documentType: "Actor",
      path: "actor",
      value: actor,
    });
    return result;
  }

  if (!["character", "npc"].includes(actor.type)) {
    addIssue(result, "error", "INVALID_ACTOR_TYPE", `Actor type must be character or npc, found ${actor.type}.`, {
      documentType: "Actor",
      documentId: getDocumentId(actor),
      documentName: getDocumentName(actor),
      path: "type",
      value: actor.type,
    });
    return result;
  }

  const system = getSystemData(actor);
  if (!validateRequiredObject(result, system, "system", {
    documentType: "Actor",
    documentId: getDocumentId(actor),
    documentName: getDocumentName(actor),
  })) {
    return result;
  }

  const requiredPaths = [
    "attributes.init",
    "attributes.rank",
    "health",
    "focus",
    "karma",
    "movement",
    "powers",
  ];
  for (const path of requiredPaths) {
    if (getValue(system, path) === undefined) {
      addIssue(result, "error", "MISSING_REQUIRED_FIELD", `Missing actor field: system.${path}`, {
        documentType: "Actor",
        documentId: getDocumentId(actor),
        documentName: getDocumentName(actor),
        path: `system.${path}`,
        value: undefined,
      });
    }
  }

  if (actor.items === undefined && actor.data?.items === undefined) {
    addIssue(result, "error", "MISSING_REQUIRED_FIELD", "Missing embedded items collection.", {
      documentType: "Actor",
      documentId: getDocumentId(actor),
      documentName: getDocumentName(actor),
      path: "items",
      value: undefined,
    });
  }

  if (actor.prototypeToken === undefined && actor.data?.prototypeToken === undefined) {
    addIssue(result, "error", "MISSING_REQUIRED_FIELD", "Missing prototypeToken.", {
      documentType: "Actor",
      documentId: getDocumentId(actor),
      documentName: getDocumentName(actor),
      path: "prototypeToken",
      value: undefined,
    });
  }

  const abilities = system.abilities;
  if (!validateRequiredObject(result, abilities, "system.abilities", {
    documentType: "Actor",
    documentId: getDocumentId(actor),
    documentName: getDocumentName(actor),
  })) {
    return result;
  }

  for (const ability of DEFAULT_ABILITY_KEYS) {
    const abilityData = abilities[ability];
    if (!validateRequiredObject(result, abilityData, `system.abilities.${ability}`, {
      documentType: "Actor",
      documentId: getDocumentId(actor),
      documentName: getDocumentName(actor),
    })) {
      continue;
    }

    for (const field of ABILITY_FIELDS) {
      if (abilityData[field] === undefined) {
        if (field === "label") {
          addIssue(result, "info", "MISSING_OPTIONAL_LABEL", `Missing optional ability label for ${ability}.`, {
            documentType: "Actor",
            documentId: getDocumentId(actor),
            documentName: getDocumentName(actor),
            path: `system.abilities.${ability}.${field}`,
            value: undefined,
          });
        } else {
          addIssue(result, "error", "MISSING_REQUIRED_FIELD", `Missing ability field: system.abilities.${ability}.${field}`, {
            documentType: "Actor",
            documentId: getDocumentId(actor),
            documentName: getDocumentName(actor),
            path: `system.abilities.${ability}.${field}`,
            value: undefined,
          });
        }
      } else if (field === "edge") {
        if (!isBoolean(abilityData[field])) {
          addIssue(result, "error", "INVALID_FIELD_TYPE", `Ability field must be boolean: system.abilities.${ability}.${field}`, {
            documentType: "Actor",
            documentId: getDocumentId(actor),
            documentName: getDocumentName(actor),
            path: `system.abilities.${ability}.${field}`,
            value: abilityData[field],
          });
        }
      } else if (["value", "defense", "noncom", "damageMultiplier"].includes(field)) {
        if (!isNumber(abilityData[field])) {
          addIssue(result, "error", "INVALID_FIELD_TYPE", `Ability field must be a number: system.abilities.${ability}.${field}`, {
            documentType: "Actor",
            documentId: getDocumentId(actor),
            documentName: getDocumentName(actor),
            path: `system.abilities.${ability}.${field}`,
            value: abilityData[field],
          });
        }
      } else if (field === "label") {
        if (!isString(abilityData[field])) {
          addIssue(result, "error", "INVALID_FIELD_TYPE", `Ability label must be a string: system.abilities.${ability}.${field}`, {
            documentType: "Actor",
            documentId: getDocumentId(actor),
            documentName: getDocumentName(actor),
            path: `system.abilities.${ability}.${field}`,
            value: abilityData[field],
          });
        }
      }
    }
  }

  const movementData = system.movement;
  if (!validateRequiredObject(result, movementData, "system.movement", {
    documentType: "Actor",
    documentId: getDocumentId(actor),
    documentName: getDocumentName(actor),
  })) {
    return result;
  }

  for (const movement of DEFAULT_MOVEMENT_KEYS) {
    const movementBlock = movementData[movement];
    if (!validateRequiredObject(result, movementBlock, `system.movement.${movement}`, {
      documentType: "Actor",
      documentId: getDocumentId(actor),
      documentName: getDocumentName(actor),
    })) {
      continue;
    }

    for (const field of MOVEMENT_FIELDS) {
      if (movementBlock[field] === undefined) {
        addIssue(result, "error", "MISSING_REQUIRED_FIELD", `Missing movement field: system.movement.${movement}.${field}`, {
          documentType: "Actor",
          documentId: getDocumentId(actor),
          documentName: getDocumentName(actor),
          path: `system.movement.${movement}.${field}`,
          value: undefined,
        });
      } else if (field === "active") {
        if (!isBoolean(movementBlock[field])) {
          addIssue(result, "error", "INVALID_FIELD_TYPE", `Movement field must be a boolean: system.movement.${movement}.${field}`, {
            documentType: "Actor",
            documentId: getDocumentId(actor),
            documentName: getDocumentName(actor),
            path: `system.movement.${movement}.${field}`,
            value: movementBlock[field],
          });
        }
      } else if (["value", "noncom"].includes(field)) {
        if (!isNumber(movementBlock[field])) {
          addIssue(result, "error", "INVALID_FIELD_TYPE", `Movement field must be a number: system.movement.${movement}.${field}`, {
            documentType: "Actor",
            documentId: getDocumentId(actor),
            documentName: getDocumentName(actor),
            path: `system.movement.${movement}.${field}`,
            value: movementBlock[field],
          });
        }
      } else if (field === "label" || field === "rankMode" || field === "calc") {
        if (!isString(movementBlock[field])) {
          addIssue(result, "error", "INVALID_FIELD_TYPE", `Movement field must be a string: system.movement.${movement}.${field}`, {
            documentType: "Actor",
            documentId: getDocumentId(actor),
            documentName: getDocumentName(actor),
            path: `system.movement.${movement}.${field}`,
            value: movementBlock[field],
          });
        }
      }
    }
  }

  if (!isPlainObject(system.powers)) {
    addIssue(result, "error", "MISSING_REQUIRED_OBJECT", "Missing required object: system.powers", {
      documentType: "Actor",
      documentId: getDocumentId(actor),
      documentName: getDocumentName(actor),
      path: "system.powers",
      value: system.powers,
    });
  }

  const embeddedItems = Array.isArray(actor.items) ? actor.items : Array.isArray(actor.data?.items) ? actor.data.items : [];
  if (embeddedItems.length === 0 && actor.items !== undefined) {
    addIssue(result, "info", "EMPTY_EMBEDDED_ITEMS", "Actor has no embedded items.", {
      documentType: "Actor",
      documentId: getDocumentId(actor),
      documentName: getDocumentName(actor),
      path: "items",
      value: embeddedItems,
    });
  }

  const seenIds = new Map();
  for (const item of embeddedItems) {
    const itemId = getDocumentId(item);
    if (itemId && seenIds.has(itemId)) {
      addIssue(result, "error", "DUPLICATE_EMBEDDED_ITEM_ID", `Duplicate embedded item ID: ${itemId}`, {
        documentType: "Item",
        documentId: itemId,
        documentName: getDocumentName(item),
        path: "_id",
        value: itemId,
      });
    } else if (itemId) {
      seenIds.set(itemId, item);
    }

    mergeValidationResult(result, validateEmbeddedItem(item, { config, actor }));
  }

  return result;
}

export function validateEmbeddedItem(item, options = {}) {
  const result = createValidationResult(getDocumentName(item), getDocumentId(item));
  const config = options.config ?? globalThis.CONFIG?.MARVEL_MULTIVERSE ?? {};
  const actor = options.actor;

  if (!item || typeof item !== "object") {
    addIssue(result, "error", "INVALID_ITEM", "Embedded item must be an object.", {
      documentType: "Item",
      path: "item",
      value: item,
    });
    return result;
  }

  const type = item.type ?? item?.data?.type;
  if (!type) {
    addIssue(result, "error", "MISSING_ITEM_TYPE", "Embedded item is missing a type.", {
      documentType: "Item",
      documentId: getDocumentId(item),
      documentName: getDocumentName(item),
      path: "type",
      value: type,
    });
    return result;
  }

  const system = getSystemData(item);
  if (!validateRequiredObject(result, system, "system", {
    documentType: "Item",
    documentId: getDocumentId(item),
    documentName: getDocumentName(item),
  })) {
    return result;
  }

  const supportedTypes = ["item", "weapon", "power", "trait", "tag", "occupation", "origin", "gear"];
  if (!supportedTypes.includes(type)) {
    addIssue(result, "error", "UNSUPPORTED_ITEM_TYPE", `Unsupported embedded item type: ${type}`, {
      documentType: "Item",
      documentId: getDocumentId(item),
      documentName: getDocumentName(item),
      path: "type",
      value: type,
    });
    return result;
  }

  if (type === "power") {
    mergeValidationResult(result, validatePowerItem(item, { config, actor }));
  } else {
    if (item.effects !== undefined && collectionToArray(item.effects) === null) {
      addIssue(result, "warning", "MALFORMED_EFFECTS_COLLECTION", "Embedded item effects must be an array when present.", {
        documentType: "Item",
        documentId: getDocumentId(item),
        documentName: getDocumentName(item),
        path: "effects",
        value: item.effects,
      });
    }

    if (item.effects === undefined) {
      addIssue(result, "warning", "MISSING_EFFECTS_COLLECTION", "Embedded item has no effects collection.", {
        documentType: "Item",
        documentId: getDocumentId(item),
        documentName: getDocumentName(item),
        path: "effects",
        value: undefined,
      });
    }
  }

  return result;
}

export function validatePowerItem(item, options = {}) {
  const result = createValidationResult(getDocumentName(item), getDocumentId(item));
  const config = options.config ?? globalThis.CONFIG?.MARVEL_MULTIVERSE ?? {};
  const actor = options.actor;

  if (!item || typeof item !== "object") {
    addIssue(result, "error", "INVALID_ITEM", "Power item must be an object.", {
      documentType: "Item",
      path: "item",
      value: item,
    });
    return result;
  }

  if (item.type !== "power") {
    addIssue(result, "error", "INVALID_ITEM_TYPE", "Power validator expected an item of type power.", {
      documentType: "Item",
      documentId: getDocumentId(item),
      documentName: getDocumentName(item),
      path: "type",
      value: item.type,
    });
    return result;
  }

  const system = getSystemData(item);
  if (!validateRequiredObject(result, system, "system", {
    documentType: "Item",
    documentId: getDocumentId(item),
    documentName: getDocumentName(item),
  })) {
    return result;
  }

  if (system.automationPreset !== undefined && system.automationPreset !== "") {
    if (typeof system.automationPreset !== "string" || !automationPresetIds.includes(system.automationPreset.trim())) {
      addIssue(result, "error", "INVALID_AUTOMATION_PRESET", `Unknown automation preset: ${system.automationPreset}`, {
        documentType: "Item",
        documentId: getDocumentId(item),
        documentName: getDocumentName(item),
        path: "system.automationPreset",
        value: system.automationPreset,
      });
    }
  }

  if (system.effectProfile !== undefined && typeof system.effectProfile !== "string") {
    addIssue(result, "error", "INVALID_EFFECT_PROFILE", "Power effectProfile must be a string when present.", {
      documentType: "Item",
      documentId: getDocumentId(item),
      documentName: getDocumentName(item),
      path: "system.effectProfile",
      value: system.effectProfile,
    });
  }
  if (system.effectProfiles !== undefined) {
    if (!system.effectProfiles || typeof system.effectProfiles !== "object" || Array.isArray(system.effectProfiles)) {
      addIssue(result, "error", "INVALID_EFFECT_PROFILES", "Power effectProfiles must be an object when present.", {
        documentType: "Item",
        documentId: getDocumentId(item),
        documentName: getDocumentName(item),
        path: "system.effectProfiles",
        value: system.effectProfiles,
      });
    } else {
      const supportedPhases = new Set(EFFECT_PROFILE_PHASES);
      for (const [phase, profileId] of Object.entries(system.effectProfiles)) {
        if (!supportedPhases.has(phase)) {
          addIssue(result, "warning", "UNKNOWN_EFFECT_PHASE", `Unknown effect profile phase: ${phase}.`, {
            documentType: "Item",
            documentId: getDocumentId(item),
            documentName: getDocumentName(item),
            path: `system.effectProfiles.${phase}`,
            value: profileId,
          });
        }
        if (typeof profileId !== "string" || !profileId.trim()) {
          addIssue(result, "error", "INVALID_PHASE_EFFECT_PROFILE", `Effect profile for phase ${phase} must be a non-empty string.`, {
            documentType: "Item",
            documentId: getDocumentId(item),
            documentName: getDocumentName(item),
            path: `system.effectProfiles.${phase}`,
            value: profileId,
          });
        }
      }
    }
  }

  const powerFields = [
    { key: "powerSet", severity: "error" },
    { key: "ability", severity: "error" },
    { key: "attack", severity: "error" },
    { key: "attackTarget", severity: "warning" },
    { key: "attackKind", severity: "warning" },
    { key: "attackEdgeMode", severity: "warning" },
    { key: "attackRange", severity: "warning" },
    { key: "attackMultiplier", severity: "warning" },
    { key: "damageType", severity: "warning" },
    { key: "element", severity: "warning" },
    { key: "isElemental", severity: "error" },
    { key: "prerequisites", severity: "warning" },
    { key: "action", severity: "warning" },
    { key: "trigger", severity: "warning" },
    { key: "duration", severity: "warning" },
    { key: "range", severity: "warning" },
    { key: "cost", severity: "warning" },
    { key: "effect", severity: "warning" },
    { key: "numbered", severity: "error" },
  ];

  validateFocusCostMetadata(result, item, { config });

  for (const field of powerFields) {
    const path = `system.${field.key}`;
    if (!(field.key in system)) {
      addIssue(result, field.severity, "MISSING_REQUIRED_FIELD", `Missing power field: ${path}`, {
        documentType: "Item",
        documentId: getDocumentId(item),
        documentName: getDocumentName(item),
        path,
        value: undefined,
      });
      continue;
    }

    const value = system[field.key];
    if (field.key === "powerSet") {
      validatePowerSetValue(value, config, result, path);
      continue;
    }

    if (field.key === "ability") {
      validateAbilityValue(value, result, path, { allowEmpty: true });
      continue;
    }

    if (field.key === "attack") {
      if (!isBoolean(value)) {
        addIssue(result, "error", "INVALID_FIELD_TYPE", `Power field must be boolean: ${path}`, {
          documentType: "Item",
          documentId: getDocumentId(item),
          documentName: getDocumentName(item),
          path,
          value,
        });
      }
      continue;
    }

    if (field.key === "attackTarget") {
      if (value !== undefined && value !== null && value !== "") {
        const normalized = String(value).trim();
        if (!DEFAULT_ABILITY_KEYS.includes(normalized)) {
          addIssue(result, "error", "INVALID_ATTACK_TARGET", `Invalid attack target: ${normalized}`, {
            documentType: "Item",
            documentId: getDocumentId(item),
            documentName: getDocumentName(item),
            path,
            value,
          });
        }
      }
      continue;
    }

    if (field.key === "attackKind") {
      if (value !== undefined && value !== null && value !== "" && !["ranged", "close"].includes(String(value))) {
        addIssue(result, "error", "INVALID_ATTACK_KIND", `Invalid attack kind: ${value}`, {
          documentType: "Item",
          documentId: getDocumentId(item),
          documentName: getDocumentName(item),
          path,
          value,
        });
      }
      continue;
    }

    if (field.key === "attackEdgeMode") {
      if (value !== undefined && value !== null && value !== "" && !["edge", "normal", "trouble"].includes(String(value))) {
        addIssue(result, "error", "INVALID_ATTACK_EDGE_MODE", `Invalid attack edge mode: ${value}`, {
          documentType: "Item",
          documentId: getDocumentId(item),
          documentName: getDocumentName(item),
          path,
          value,
        });
      }
      continue;
    }

    if (field.key === "damageType") {
      if (value !== undefined && value !== null && value !== "" && !["health", "focus"].includes(String(value))) {
        addIssue(result, "error", "INVALID_DAMAGE_TYPE", `Invalid damage type: ${value}`, {
          documentType: "Item",
          documentId: getDocumentId(item),
          documentName: getDocumentName(item),
          path,
          value,
        });
      }
      continue;
    }

    if (field.key === "element") {
      const elements = config?.elements ?? {};
      if (value !== undefined && value !== null && value !== "" && !(String(value) in elements)) {
        addIssue(result, "error", "INVALID_ELEMENT", `Invalid element: ${value}`, {
          documentType: "Item",
          documentId: getDocumentId(item),
          documentName: getDocumentName(item),
          path,
          value,
        });
      }
      continue;
    }

    if (field.key === "isElemental") {
      if (!isBoolean(value)) {
        addIssue(result, "error", "INVALID_FIELD_TYPE", `Power field must be boolean: ${path}`, {
          documentType: "Item",
          documentId: getDocumentId(item),
          documentName: getDocumentName(item),
          path,
          value,
        });
      }
      continue;
    }

    if (field.key === "numbered") {
      if (!isNumber(value)) {
        addIssue(result, "error", "INVALID_FIELD_TYPE", `Power field must be a number: ${path}`, {
          documentType: "Item",
          documentId: getDocumentId(item),
          documentName: getDocumentName(item),
          path,
          value,
        });
      }
      continue;
    }

    if (field.key === "effects") {
      if (value !== undefined && value !== null && !Array.isArray(value)) {
        addIssue(result, "error", "INVALID_FIELD_TYPE", `Power effects must be an array when present: ${path}`, {
          documentType: "Item",
          documentId: getDocumentId(item),
          documentName: getDocumentName(item),
          path,
          value,
        });
      }
      continue;
    }

    if (["attackRange", "attackMultiplier"].includes(field.key)) {
      if (!isNumber(value)) {
        addIssue(result, "error", "INVALID_FIELD_TYPE", `Power field must be a number: ${path}`, {
          documentType: "Item",
          documentId: getDocumentId(item),
          documentName: getDocumentName(item),
          path,
          value,
        });
      }
      continue;
    }

    if (!isString(value)) {
      addIssue(result, "error", "INVALID_FIELD_TYPE", `Power field must be a string: ${path}`, {
        documentType: "Item",
        documentId: getDocumentId(item),
        documentName: getDocumentName(item),
        path,
        value,
      });
    }
  }

  const itemEffects = collectionToArray(item.effects);
  if (item.effects !== undefined && itemEffects === null) {
    addIssue(result, "error", "INVALID_EFFECTS_COLLECTION", "Power item effects collection must be an array.", {
      documentType: "Item",
      documentId: getDocumentId(item),
      documentName: getDocumentName(item),
      path: "effects",
      value: item.effects,
    });
  }

  if (itemEffects) {
    for (const effect of itemEffects) {
      mergeValidationResult(result, validateActiveEffect(effect, { actor, documentType: "Item" }));
    }
  }

  return result;
}

export function validateActiveEffect(effect, context = {}) {
  const result = createValidationResult(context.documentName ?? "", context.documentId ?? "");

  if (!effect || typeof effect !== "object") {
    addIssue(result, "error", "INVALID_EFFECT", "Active effect must be an object.", {
      documentType: context.documentType ?? "ActiveEffect",
      documentId: context.documentId ?? "",
      documentName: context.documentName ?? "",
      path: "effect",
      value: effect,
    });
    return result;
  }

  const changes = effect.changes;
  if (changes === undefined) {
    addIssue(result, "warning", "MISSING_EFFECT_CHANGES", "Active effect has no changes array.", {
      documentType: context.documentType ?? "ActiveEffect",
      documentId: context.documentId ?? "",
      documentName: context.documentName ?? "",
      path: "changes",
      value: changes,
    });
    return result;
  }

  if (!Array.isArray(changes)) {
    addIssue(result, "error", "INVALID_EFFECT_CHANGES", "Active effect changes must be an array.", {
      documentType: context.documentType ?? "ActiveEffect",
      documentId: context.documentId ?? "",
      documentName: context.documentName ?? "",
      path: "changes",
      value: changes,
    });
    return result;
  }

  const supportedPaths = [
    "system.abilities.mle.value",
    "system.abilities.mle.defense",
    "system.abilities.mle.noncom",
    "system.abilities.mle.edge",
    "system.abilities.mle.damageMultiplier",
    "system.abilities.agl.value",
    "system.abilities.agl.defense",
    "system.abilities.agl.noncom",
    "system.abilities.agl.edge",
    "system.abilities.agl.damageMultiplier",
    "system.abilities.res.value",
    "system.abilities.res.defense",
    "system.abilities.res.noncom",
    "system.abilities.res.edge",
    "system.abilities.res.damageMultiplier",
    "system.abilities.vig.value",
    "system.abilities.vig.defense",
    "system.abilities.vig.noncom",
    "system.abilities.vig.edge",
    "system.abilities.vig.damageMultiplier",
    "system.abilities.ego.value",
    "system.abilities.ego.defense",
    "system.abilities.ego.noncom",
    "system.abilities.ego.edge",
    "system.abilities.ego.damageMultiplier",
    "system.abilities.log.value",
    "system.abilities.log.defense",
    "system.abilities.log.noncom",
    "system.abilities.log.edge",
    "system.abilities.log.damageMultiplier",
    "system.attributes.rank.value",
    "system.attributes.init.value",
    "system.attributes.init.edge",
    "system.attributes.init.trouble",
    "system.health.value",
    "system.health.max",
    "system.healthDamageReduction",
    "system.focus.value",
    "system.focus.max",
    "system.focusDamageReduction",
    "system.karma.value",
    "system.karma.max",
    "system.reach",
    "system.size",
    "system.defaultElement",
  ];

  for (const movement of DEFAULT_MOVEMENT_KEYS) {
    supportedPaths.push(`system.movement.${movement}.value`);
    supportedPaths.push(`system.movement.${movement}.noncom`);
    supportedPaths.push(`system.movement.${movement}.active`);
    supportedPaths.push(`system.movement.${movement}.rankMode`);
    supportedPaths.push(`system.movement.${movement}.calc`);
  }

  const supportedSet = new Set(supportedPaths);

  for (const change of changes) {
    if (!isPlainObject(change)) {
      addIssue(result, "error", "INVALID_EFFECT_CHANGE", "Effect change entries must be objects.", {
        documentType: context.documentType ?? "ActiveEffect",
        documentId: context.documentId ?? "",
        documentName: context.documentName ?? "",
        path: "changes[]",
        value: change,
      });
      continue;
    }

    const key = change.key;
    if (!isString(key) || !key.trim()) {
      addIssue(result, "error", "INVALID_EFFECT_CHANGE_KEY", "Effect change is missing a key.", {
        documentType: context.documentType ?? "ActiveEffect",
        documentId: context.documentId ?? "",
        documentName: context.documentName ?? "",
        path: "changes[].key",
        value: key,
      });
      continue;
    }

    if (!supportedSet.has(key)) {
      addIssue(result, "error", "UNSUPPORTED_EFFECT_PATH", `Unsupported Active Effect path: ${key}`, {
        documentType: context.documentType ?? "ActiveEffect",
        documentId: context.documentId ?? "",
        documentName: context.documentName ?? "",
        path: "changes[].key",
        value: key,
      });
    }
  }

  if (effect.transfer === true) {
    const textSource = [effect.label, effect.description, effect.name, ...(changes.map((change) => change.value))]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const containsCondition = CONDITION_TERMS.some((term) => textSource.includes(term));
    if (containsCondition) {
      addIssue(result, "warning", "UNSAFE_TRANSFERRED_EFFECT", "Transferred effect appears to apply a target condition to the owner.", {
        documentType: context.documentType ?? "ActiveEffect",
        documentId: context.documentId ?? "",
        documentName: context.documentName ?? "",
        path: "transfer",
        value: true,
      });
    }
  }

  return result;
}

export function resolvePowerSetCategory(value, availableCategories = {}, options = {}) {
  const config = options.config ?? globalThis.CONFIG?.MARVEL_MULTIVERSE ?? {};
  const fallbackCategoryKey = options.fallbackCategoryKey ?? "basic";
  const validSets = [];
  const invalidSets = [];

  const normalizedCategories = new Map();
  for (const [key, list] of Object.entries(availableCategories)) {
    if (Array.isArray(list)) normalizedCategories.set(normalizePowerSetName(key), key);
  }

  const knownNames = new Set();
  for (const [key, definition] of Object.entries(config?.powersets ?? {})) {
    const label = typeof definition === "string" ? definition : definition?.label ?? key;
    knownNames.add(normalizePowerSetName(key));
    knownNames.add(normalizePowerSetName(label));
  }

  const rawParts =
    typeof value === "string"
      ? value.split(",").map((part) => part.trim())
      : [];

  const parts = rawParts.filter(Boolean);
  if (parts.length === 0) {
    return {
      categoryKey: fallbackCategoryKey,
      validSets,
      invalidSets: [String(value ?? "")],
      usedFallback: true,
    };
  }

  for (const part of parts) {
    const normalized = normalizePowerSetName(part);
    const candidateKey = normalizedCategories.get(normalized) ?? config?.reverseSetList?.[part]?.trim() ?? "";
    const isKnown = knownNames.has(normalized) || Boolean(candidateKey);
    if (isKnown) {
      const resolvedKey = candidateKey || normalizedCategories.get(normalized) || part;
      validSets.push(part);
      if (!validSets.includes(part)) validSets.push(part);
      return {
        categoryKey: resolvedKey,
        validSets: [part],
        invalidSets,
        usedFallback: false,
      };
    }
    invalidSets.push(part);
  }

  return {
    categoryKey: fallbackCategoryKey,
    validSets,
    invalidSets,
    usedFallback: true,
  };
}

export function validateDocument(document, options = {}) {
  if (!document || typeof document !== "object") {
    return createValidationResult();
  }

  if (document.type === "character" || document.documentName === "Actor") {
    return validateCharacterActor(document, options);
  }

  if (document.type === "power") {
    return validatePowerItem(document, options);
  }

  if (document.documentName === "Item") return validateEmbeddedItem(document, options);

  if (document.type === "ActiveEffect" || document.documentName === "ActiveEffect") {
    return validateActiveEffect(document, options);
  }

  return validateEmbeddedItem(document, options);
}

export function logValidationResult(result, title = "Marvel Multiverse Validation") {
  if (!result) return;
  const summary = `${result.summary.errorCount} error${result.summary.errorCount === 1 ? "" : "s"}, ${result.summary.warningCount} warning${result.summary.warningCount === 1 ? "" : "s"}`;
  console.groupCollapsed(`${title}: ${result.summary.actorName || "Validation"}`);
  console.log(summary);
  if (result.errors.length) {
    console.groupCollapsed("Errors");
    for (const issue of result.errors) console.error(issue);
    console.groupEnd();
  }
  if (result.warnings.length) {
    console.groupCollapsed("Warnings");
    for (const issue of result.warnings) console.warn(issue);
    console.groupEnd();
  }
  if (result.info.length) {
    console.groupCollapsed("Info");
    for (const issue of result.info) console.info(issue);
    console.groupEnd();
  }
  console.groupEnd();
}

export const validationHelpers = {
  DEFAULT_ABILITY_KEYS,
  DEFAULT_MOVEMENT_KEYS,
  ABILITY_FIELDS,
  MOVEMENT_FIELDS,
};
