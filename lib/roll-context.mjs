import { validateCharacterActor, validatePowerItem } from "./validation.mjs";
import { normalizeConditionKey } from "./conditions.mjs";
import { normalizeEffectMetadata } from "./services/effect-profile-manager.mjs";

const ROLL_CONTEXT_VERSION = 1;
const DEFAULT_ABILITY_KEYS = ["mle", "agl", "res", "vig", "ego", "log"];
const DEFAULT_DAMAGE_TYPES = ["health", "focus"];
const DEFAULT_ELEMENT_KEYS = ["air", "cold", "earth", "electricity", "energy", "fire", "force", "hellfire", "ice", "iron", "light", "sound", "water", "toxin", "chemical", "swarm"];
const CIRCUMSTANCE_ALIASES = {
  vision: "vision",
  visual: "vision",
  sight: "vision",
  visibility: "vision",
  "line of sight": "vision",
  "line-of-sight": "vision",
  perception: "vision",
  obscured: "vision",
  darkness: "vision",
  invisible: "vision",
  hearing: "hearing",
  audio: "hearing",
  sound: "hearing",
  "line of hearing": "hearing",
  "line-of-hearing": "hearing",
  stealth: "stealth",
  hidden: "stealth",
  concealment: "stealth",
};
const TEXT_CIRCUMSTANCE_PATTERNS = [
  { pattern: /\bline[\s-]+of[\s-]+sight\b/i, tag: "vision" },
  { pattern: /\bvision\b/i, tag: "vision" },
  { pattern: /\bvisual\b/i, tag: "vision" },
  { pattern: /\bvisibility\b/i, tag: "vision" },
  { pattern: /\bperception\b/i, tag: "vision" },
  { pattern: /\bsight\b/i, tag: "vision" },
  { pattern: /\bobscured\b/i, tag: "vision" },
  { pattern: /\bdarkness\b/i, tag: "vision" },
  { pattern: /\binvisible\b/i, tag: "vision" },
];

function getConfig(options = {}) {
  return options.config ?? globalThis.CONFIG?.MARVEL_MULTIVERSE ?? {};
}

function toUuid(document) {
  if (!document) return null;
  if (typeof document === "string") return document;
  if (typeof document.uuid === "string" && document.uuid.trim()) return document.uuid;
  if (typeof document._id === "string" && document._id.trim()) {
    if (document.documentName) return `${document.documentName}.${document._id}`;
  }
  return null;
}

function normalizeCircumstanceTag(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return CIRCUMSTANCE_ALIASES[normalized] ?? normalized;
}

function addCircumstanceEntries(value, targetSet) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const entry of value) addCircumstanceEntries(entry, targetSet);
    return;
  }
  if (typeof value === "string") {
    for (const chunk of value.split(/[;,|/]/)) {
      const normalized = normalizeCircumstanceTag(chunk);
      if (normalized) targetSet.add(normalized);
    }
    return;
  }
  if (typeof value === "object") {
    for (const key of ["tag", "key", "name", "label", "value", "id"]) {
      addCircumstanceEntries(value[key], targetSet);
    }
  }
}

function inferTextCircumstances(text, targetSet) {
  if (typeof text !== "string" || !text.trim()) return;
  for (const entry of TEXT_CIRCUMSTANCE_PATTERNS) {
    if (entry.pattern.test(text)) targetSet.add(entry.tag);
  }
}

export function deriveConditionCircumstances(source, options = {}) {
  const itemSystem = source?.system ?? source ?? {};
  const tags = new Set();

  addCircumstanceEntries(options?.circumstances, tags);
  addCircumstanceEntries(itemSystem?.circumstances, tags);
  addCircumstanceEntries(itemSystem?.tags, tags);
  addCircumstanceEntries(itemSystem?.suggestedTags, tags);
  addCircumstanceEntries(itemSystem?.keywords, tags);

  const textBlob = [itemSystem?.range, itemSystem?.description, itemSystem?.effect]
    .filter((entry) => typeof entry === "string" && entry.trim())
    .join(" ");
  inferTextCircumstances(textBlob, tags);

  return [...tags];
}

function resolveActorUuid(actor, options = {}) {
  if (options.actorUuid) return options.actorUuid;
  return toUuid(actor?.actor ?? actor);
}

function resolveTokenUuid(token, actor, options = {}) {
  if (options.tokenUuid) return options.tokenUuid;
  if (token) return toUuid(token?.document ?? token);
  if (actor?.token) return toUuid(actor.token.document ?? actor.token);
  return null;
}

function resolveItemUuid(item, options = {}) {
  if (options.itemUuid) return options.itemUuid;
  return toUuid(item?.item ?? item);
}

function normalizeAbilityKey(value, options = {}) {
  const config = getConfig(options);
  const aliases = {
    melee: "mle",
    close: "mle",
    agility: "agl",
    agl: "agl",
    resilience: "res",
    vig: "vig",
    vigilance: "vig",
    ego: "ego",
    logic: "log",
    log: "log",
    mle: "mle",
    res: "res",
    ...Object.fromEntries(
      Object.entries(config.abilities ?? {}).map(([key]) => [key.toLowerCase(), key])
    ),
  };
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return aliases[normalized] ?? (DEFAULT_ABILITY_KEYS.includes(normalized) ? normalized : null);
}

function normalizeAttackTarget(value, options = {}) {
  return normalizeAbilityKey(value, options);
}

function normalizeAttackKind(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (["melee", "close", "closecombat", "close_combat"].includes(normalized)) return "close";
  if (["ranged", "range", "distance", "shoot"].includes(normalized)) return "ranged";
  return normalized;
}

function normalizeAttackEdgeMode(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (["normal", "none"].includes(normalized)) return "normal";
  if (["edge", "withedge", "with-edge"].includes(normalized)) return "edge";
  if (["trouble", "withtrouble", "with-trouble"].includes(normalized)) return "trouble";
  return normalized;
}

function normalizeDamageType(value, options = {}) {
  const config = getConfig(options);
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  const validDamageTypes = new Set([...(config.damageTypes ? Object.keys(config.damageTypes) : []), ...DEFAULT_DAMAGE_TYPES]);
  if (validDamageTypes.has(normalized)) return normalized;
  return null;
}

function normalizeElement(value, options = {}) {
  const config = getConfig(options);
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  const validElements = new Set([
    ...DEFAULT_ELEMENT_KEYS,
    ...(config.elements ? Object.keys(config.elements) : []),
  ]);
  if (validElements.has(normalized)) return normalized;
  return null;
}

function normalizePowerSet(value, options = {}) {
  const config = getConfig(options);
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = raw.toLowerCase();
  if (!config.powersets) return raw;
  const match = Object.entries(config.powersets).find(([key, definition]) => {
    const label = typeof definition === "string" ? definition : definition?.label ?? key;
    return [key, label].some((candidate) => String(candidate).trim().toLowerCase() === normalized);
  });
  return match ? match[0] : raw;
}

function parseFocusCost(costValue) {
  if (costValue === undefined || costValue === null || costValue === "") return null;
  if (typeof costValue === "number" && Number.isFinite(costValue)) {
    return { type: "fixed", value: costValue };
  }
  if (typeof costValue !== "string") return null;
  const normalized = costValue.trim().toLowerCase();
  if (!normalized) return null;
  const plainNumberMatch = normalized.match(/^(?<value>\d+)$/);
  if (plainNumberMatch?.groups?.value) {
    return { type: "fixed", value: Number(plainNumberMatch.groups.value) };
  }
  const fixedPlusOnlyMatch = normalized.match(/^(?<minimum>\d+)\+$/);
  if (fixedPlusOnlyMatch?.groups?.minimum) {
    return { type: "variable", minimum: Number(fixedPlusOnlyMatch.groups.minimum), value: null };
  }
  const variableWordsOnlyMatch = normalized.match(/^(?<minimum>\d+)\s+or\s+more$/);
  if (variableWordsOnlyMatch?.groups?.minimum) {
    return { type: "variable", minimum: Number(variableWordsOnlyMatch.groups.minimum), value: null };
  }
  const fixedMatch = normalized.match(/^(?<value>\d+)\s+focus$/);
  if (fixedMatch?.groups?.value) {
    return { type: "fixed", value: Number(fixedMatch.groups.value) };
  }
  const variableMatch = normalized.match(/^(?<minimum>\d+)\s+or\s+more\s+focus$/);
  if (variableMatch?.groups?.minimum) {
    return { type: "variable", minimum: Number(variableMatch.groups.minimum), value: null };
  }
  const variableReverseMatch = normalized.match(/^(?<minimum>\d+)\s+focus\s+or\s+more$/);
  if (variableReverseMatch?.groups?.minimum) {
    return { type: "variable", minimum: Number(variableReverseMatch.groups.minimum), value: null };
  }
  const plusMatch = normalized.match(/^(?<minimum>\d+)\s*\+\s*focus$/);
  if (plusMatch?.groups?.minimum) {
    return { type: "variable", minimum: Number(plusMatch.groups.minimum), value: null };
  }
  return null;
}

function normalizeConditionLabel(key) {
  if (typeof key !== "string" || !key.trim()) return null;
  const normalized = key.trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeConditionEntries(value) {
  const values = Array.isArray(value) ? value : (typeof value === "string" && value.trim() ? value.split(/[;,]/) : []);
  const entries = [];
  const seen = new Set();
  for (const candidate of values) {
    const raw = typeof candidate === "string"
      ? candidate
      : (candidate?.key ?? candidate?.name ?? candidate?.label ?? "");
    const key = normalizeConditionKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    entries.push({ key, label: normalizeConditionLabel(key) ?? key });
  }
  return entries;
}

function extractConditionMetadata(itemSystem = {}) {
  // Conditions are only ever sourced from structured data, never inferred from power name/description text during normal play.
  const explicitTargetConditions = normalizeConditionEntries(
    itemSystem?.conditions
    ?? itemSystem?.targetConditions
    ?? itemSystem?.conditionsTarget
    ?? null,
  );
  const explicitSourceConditions = normalizeConditionEntries(
    itemSystem?.sourceConditions
    ?? itemSystem?.casterConditions
    ?? itemSystem?.selfConditions
    ?? null,
  );

  return {
    targetConditions: explicitTargetConditions,
    sourceConditions: explicitSourceConditions,
  };
}

function resolveDuration(item) {
  const duration = item?.system?.duration;
  if (typeof duration === "string" && duration.trim()) return duration.trim();
  if (duration && typeof duration === "object") {
    if (typeof duration.value === "string" && duration.value.trim()) return duration.value.trim();
    if (typeof duration.label === "string" && duration.label.trim()) return duration.label.trim();
  }

  const explicitDuration = item?.system?.durationValue ?? item?.system?.durationText ?? null;
  return explicitDuration && String(explicitDuration).trim() ? String(explicitDuration).trim() : null;
}

function getRollResultValue(roll, property) {
  if (!roll) return null;
  if (property === "rollTotal") return typeof roll.total === "number" ? roll.total : null;
  if (property === "marvelDieResult") {
    return roll.dice?.[1]?.result ?? roll.dice?.find((die) => die?.faces === 1 || die?.type === "marvel")?.result ?? null;
  }
  if (property === "isFantastic") return typeof roll.isFantastic === "boolean" ? roll.isFantastic : null;
  if (property === "hasEdge") return typeof roll.hasEdge === "boolean" ? roll.hasEdge : null;
  if (property === "hasTrouble") return typeof roll.hasTrouble === "boolean" ? roll.hasTrouble : null;
  return null;
}

function isValidTarget(target) {
  if (!target) return false;
  if (typeof target === "string") return Boolean(target.trim());
  if (typeof target.uuid === "string" && target.uuid.trim()) return true;
  if (typeof target.document?.uuid === "string" && target.document.uuid.trim()) return true;
  return false;
}

function captureTargets(targets, options = {}) {
  const sourceTargets = Array.isArray(targets) ? targets : Array.isArray(options.targets) ? options.targets : [];
  const seen = new Set();
  const collected = [];
  for (const target of sourceTargets) {
    if (!isValidTarget(target)) continue;
    const uuid = typeof target === "string" ? target : target.document?.uuid ?? target.uuid;
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    collected.push(uuid);
  }
  return collected;
}

function buildValidationWarning(result, path, message) {
  if (!result) return null;
  if (Array.isArray(result.warnings)) {
    return result.warnings.map((warning) => ({ path, message: warning.message ?? message }));
  }
  return null;
}

function resolveItemMetadata(item, options = {}) {
  const config = getConfig(options);
  const itemSystem = item?.system ?? {};
  const warnings = [];
  try {
    const validationResult = item ? validatePowerItem(item, { config }) : null;
    if (validationResult) warnings.push(...(buildValidationWarning(validationResult, "item", "Item validation warning") ?? []));
  } catch {
    warnings.push({ path: "item", message: "Item validation failed; using conservative defaults." });
  }

  const ability = normalizeAbilityKey(itemSystem?.ability, options);
  const attackTarget = normalizeAttackTarget(itemSystem?.attackTarget, options);
  const attackKind = normalizeAttackKind(itemSystem?.attackKind);
  const attackEdgeMode = normalizeAttackEdgeMode(itemSystem?.attackEdgeMode);
  const explicitDamageType = normalizeDamageType(itemSystem?.damageType, options);
  const element = normalizeElement(itemSystem?.element, options);
  const focusCost = parseFocusCost(itemSystem?.cost ?? itemSystem?.focusCost ?? null);
  const duration = resolveDuration(item);
  const requiresConcentration = Boolean(itemSystem?.requiresConcentration || /concentration/i.test(duration ?? ""));
  const powerSet = normalizePowerSet(itemSystem?.powerSet, options);
  const conditionMetadata = extractConditionMetadata(itemSystem);
  const circumstances = deriveConditionCircumstances(itemSystem, options);
  const effectMetadata = normalizeEffectMetadata(item, { warn: false });
  const attackLike = Boolean(itemSystem?.attack || attackTarget || attackKind || Number(itemSystem?.attackMultiplier) > 0 || Number(itemSystem?.attackRange) > 0);
  const damageType = explicitDamageType ?? (attackLike ? "health" : null);

  return {
    ability: ability ?? null,
    attackTarget: attackTarget ?? null,
    attackKind: attackKind ?? null,
    attackEdgeMode: attackEdgeMode ?? null,
    damageType: damageType ?? null,
    element: element ?? null,
    focusCost,
    duration: duration ?? null,
    requiresConcentration,
    powerSet: powerSet ?? null,
    conditions: conditionMetadata.targetConditions,
    sourceConditions: conditionMetadata.sourceConditions,
    circumstances,
    effectProfile: effectMetadata.effectProfile,
    effectProfiles: effectMetadata.effectProfiles,
    warnings,
  };
}

function resolveActorMetadata(actor, options = {}) {
  const config = getConfig(options);
  const warnings = [];
  try {
    const validationResult = actor ? validateCharacterActor(actor, { config }) : null;
    if (validationResult) warnings.push(...(buildValidationWarning(validationResult, "actor", "Actor validation warning") ?? []));
  } catch {
    warnings.push({ path: "actor", message: "Actor validation failed; using conservative defaults." });
  }
  return { warnings };
}

export function buildRollContext({ actor, token, item, roll, rollType = "ability", targets = [], options = {} } = {}) {
  const contextOptions = options ?? {};
  const actorUuid = resolveActorUuid(actor, contextOptions);
  const tokenUuid = resolveTokenUuid(token, actor, contextOptions);
  const itemUuid = resolveItemUuid(item, contextOptions);

  const targetUuids = captureTargets(targets, contextOptions);
  const itemMetadata = resolveItemMetadata(item, { ...contextOptions, config: getConfig(contextOptions) });
  const actorMetadata = resolveActorMetadata(actor, { ...contextOptions, config: getConfig(contextOptions) });
  const warnings = [...(itemMetadata.warnings ?? []), ...(actorMetadata.warnings ?? [])].filter(Boolean);

  const context = {
    version: ROLL_CONTEXT_VERSION,
    rollType,
    userId: contextOptions.userId ?? globalThis.game?.user?.id ?? null,
    timestamp: contextOptions.timestamp ?? Date.now(),
    actorUuid,
    tokenUuid,
    itemUuid,
    targetUuids,
    ability: itemMetadata.ability,
    attackTarget: itemMetadata.attackTarget,
    attackKind: itemMetadata.attackKind,
    attackEdgeMode: itemMetadata.attackEdgeMode,
    damageType: itemMetadata.damageType,
    element: itemMetadata.element,
    dealsDamage: typeof contextOptions.dealsDamage === "boolean"
      ? contextOptions.dealsDamage
      : (itemMetadata.damageType ? true : null),
    focusCost: itemMetadata.focusCost,
    circumstances: itemMetadata.circumstances,
    effectProfile: itemMetadata.effectProfile,
    effectProfiles: itemMetadata.effectProfiles,
    conditions: itemMetadata.conditions,
    sourceConditions: itemMetadata.sourceConditions,
    duration: itemMetadata.duration,
    requiresConcentration: itemMetadata.requiresConcentration,
    rollTotal: getRollResultValue(roll, "rollTotal"),
    marvelDieResult: getRollResultValue(roll, "marvelDieResult"),
    isFantastic: getRollResultValue(roll, "isFantastic"),
    hasEdge: getRollResultValue(roll, "hasEdge"),
    hasTrouble: getRollResultValue(roll, "hasTrouble"),
    source: {
      itemName: item?.name ?? null,
      powerSet: itemMetadata.powerSet,
      costText: item?.system?.cost ?? null,
      rangeText: item?.system?.range ?? null,
    },
    warnings,
  };

  return context;
}

export function getRollContext(message) {
  if (!message) return null;
  const flags = message?.flags?.["marvel-multiverse"] ?? message?.flags?.marvelMultiverse ?? {};
  const context = flags.rollContext ?? null;
  if (!context) return null;
  if (context.version !== ROLL_CONTEXT_VERSION) return null;
  return context;
}

export function hasRollContext(message) {
  return Boolean(getRollContext(message));
}

export function migrateLegacyRollContext(message) {
  if (!message) return null;
  if (!message?.rolls || typeof message.rolls.length !== "number" || message.rolls.length === 0) return null;
  const flavor = message?.flavor ?? message?.content ?? "";
  const abilityMatch = /ability:\s*(?<ability>\w+)/i.exec(flavor);
  const damageTypeMatch = /damagetype:\s*(?<damageType>\w+)/i.exec(flavor);
  const powerMatch = /power:\s*(?<itemName>[^<\n]+)/i.exec(flavor);
  const actorUuid = message?.speaker?.actor ? `Actor.${message.speaker.actor}` : null;
  const tokenUuid = message?.speaker?.token && message?.speaker?.scene ? `Scene.${message.speaker.scene}.Token.${message.speaker.token}` : null;
  const actor = actorUuid && typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(actorUuid) : null;
  const itemName = powerMatch?.groups?.itemName?.trim?.() ?? null;
  const actorItems = Array.isArray(actor?.items?.contents)
    ? actor.items.contents
    : Array.isArray(actor?.items)
      ? actor.items
      : [];
  const item = itemName
    ? actorItems.find((entry) => String(entry?.name ?? "").trim().toLowerCase() === itemName.toLowerCase()) ?? null
    : null;
  const itemSystem = item?.system ?? {};

  const resolvedDamageType = normalizeDamageType(itemSystem?.damageType, {})
    ?? normalizeDamageType(damageTypeMatch?.groups?.damageType, {})
    ?? null;
  const resolvedAttackTarget = normalizeAttackTarget(itemSystem?.attackTarget, {}) ?? null;
  const resolvedAttackKind = normalizeAttackKind(itemSystem?.attackKind) ?? null;
  const resolvedAttackEdgeMode = normalizeAttackEdgeMode(itemSystem?.attackEdgeMode) ?? null;
  const resolvedAbility = normalizeAbilityKey(itemSystem?.ability, {})
    ?? normalizeAbilityKey(abilityMatch?.groups?.ability, {})
    ?? null;
  const resolvedElement = normalizeElement(itemSystem?.element, {}) ?? null;
  const resolvedFocusCost = parseFocusCost(itemSystem?.cost ?? itemSystem?.focusCost ?? null);
  const resolvedDuration = resolveDuration(item);
  const requiresConcentration = Boolean(itemSystem?.requiresConcentration || /concentration/i.test(resolvedDuration ?? ""));
  const resolvedPowerSet = normalizePowerSet(itemSystem?.powerSet, {}) ?? null;
  const isLikelyAttack = Boolean(itemSystem?.attack || resolvedAttackTarget || resolvedAttackKind || resolvedDamageType || Number(itemSystem?.attackMultiplier) > 0);

  const currentTargets = globalThis.game?.user?.targets;
  const targetCollection = Array.isArray(currentTargets)
    ? currentTargets
    : currentTargets && typeof currentTargets === "object"
      ? Array.from(currentTargets)
      : [];
  const targetUuids = targetCollection
    .map((target) => target?.document?.uuid ?? target?.uuid ?? null)
    .filter((uuid) => typeof uuid === "string" && uuid.trim());

  return {
    version: ROLL_CONTEXT_VERSION,
    rollType: isLikelyAttack ? "attack" : "ability",
    userId: message?.user?.id ?? message?.author?.id ?? null,
    timestamp: message?.timestamp ?? Date.now(),
    actorUuid,
    tokenUuid,
    itemUuid: item?.uuid ?? null,
    targetUuids,
    ability: resolvedAbility,
    attackTarget: resolvedAttackTarget,
    attackKind: resolvedAttackKind,
    attackEdgeMode: resolvedAttackEdgeMode,
    damageType: resolvedDamageType,
    element: resolvedElement,
    dealsDamage: resolvedDamageType || Number(itemSystem?.attackMultiplier) > 0 ? true : null,
    focusCost: resolvedFocusCost,
    conditions: [],
    sourceConditions: [],
    duration: resolvedDuration,
    requiresConcentration,
    rollTotal: message?.rolls?.[0]?.total ?? null,
    marvelDieResult: getRollResultValue(message?.rolls?.[0], "marvelDieResult"),
    isFantastic: getRollResultValue(message?.rolls?.[0], "isFantastic"),
    hasEdge: getRollResultValue(message?.rolls?.[0], "hasEdge"),
    hasTrouble: getRollResultValue(message?.rolls?.[0], "hasTrouble"),
    source: {
      itemName: item?.name ?? itemName ?? null,
      powerSet: resolvedPowerSet,
      costText: itemSystem?.cost ?? null,
      rangeText: itemSystem?.range ?? null,
    },
    warnings: [{ path: "message.flavor", message: "Legacy roll context fallback used; structured flags were unavailable." }],
    legacyFallback: true,
  };
}

export function attachRollContext(messageData = {}, context = {}) {
  if (!context || typeof context !== "object") return messageData;
  if (!messageData.flags) messageData.flags = {};
  messageData.flags["marvel-multiverse"] = {
    ...(messageData.flags["marvel-multiverse"] ?? {}),
    rollContext: context,
  };
  return messageData;
}

export function debugRollContext(context, label = "Marvel Multiverse Roll Context") {
  const settings = globalThis.game?.settings;
  const debugEnabled =
    typeof settings?.get === "function"
      ? (() => {
          try {
            return settings.get("marvel-multiverse", "debug") === true;
          } catch {
            return false;
          }
        })()
      : false;

  if (!context || !debugEnabled) return;
  console.groupCollapsed(label);
  console.log(`Actor: ${context.actorUuid ?? "unknown"}`);
  console.log(`Item: ${context.source?.itemName ?? "unknown"}`);
  console.log(`Targets: ${context.targetUuids?.length ?? 0}`);
  console.log(`Ability: ${context.ability ?? "unknown"}`);
  console.log(`Defense: ${context.attackTarget ?? "unknown"}`);
  console.log(`Damage: ${context.damageType ?? "unknown"} / ${context.element ?? "unknown"}`);
  console.groupEnd();
}
