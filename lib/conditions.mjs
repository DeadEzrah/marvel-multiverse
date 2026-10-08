import { updateChatMessageFlags } from "./chat-message-state.mjs";
import { hasActorMutationPermission, resolveActorForMutation } from "./services/mutation-preflight.mjs";

const CONDITION_VERSION = 1;
const CONDITION_MARKER_FLAG = "conditionMarker";
const CONDITION_I18N_ROOT = "MARVEL_MULTIVERSE";

const DEFAULT_CONDITION_ALIASES = {
  restrained: ["restrained", "restrain", "tied up", "tied-up", "bound"],
  grappled: ["grappled", "grapple", "grabbed", "held"],
  prone: ["prone"],
  stunned: ["stunned", "stun"],
  blinded: ["blinded", "blind"],
  poisoned: ["poisoned", "poison"],
  paralyzed: ["paralyzed", "paralyze", "paralysis"],
  frightened: ["frightened", "fright"],
};

// One dedicated icon per official condition so tokens/HUD show a distinct status at a glance.
const CONDITION_ICONS = {
  restrained: "systems/marvel-multiverse/icons/statuses/restrained.svg",
  grappled: "systems/marvel-multiverse/icons/statuses/grappled.svg",
  prone: "systems/marvel-multiverse/icons/statuses/prone.svg",
  stunned: "systems/marvel-multiverse/icons/statuses/stunned.svg",
  blinded: "systems/marvel-multiverse/icons/statuses/blinded.svg",
  poisoned: "systems/marvel-multiverse/icons/statuses/poisoned.svg",
  paralyzed: "systems/marvel-multiverse/icons/statuses/paralyzed.svg",
  frightened: "systems/marvel-multiverse/icons/statuses/frightened.svg",
};

// Visual-only Token HUD markers - these icons exist as assets but aren't confirmed official
// MMRPG conditions with their own roll modifiers, so they carry no automation (no aliases, no
// getConditionRollModifiers entries), unlike CONDITION_ICONS above.
const COSMETIC_STATUS_ICONS = {
  bleeding: "systems/marvel-multiverse/icons/statuses/bleeding.svg",
  deafened: "systems/marvel-multiverse/icons/statuses/deafened.svg",
  encumbered: "systems/marvel-multiverse/icons/statuses/encumbered.svg",
  exhaustion: "systems/marvel-multiverse/icons/statuses/exhaustion.svg",
  flying: "systems/marvel-multiverse/icons/statuses/flying.svg",
  incapacitated: "systems/marvel-multiverse/icons/statuses/incapacitated.svg",
  invisible: "systems/marvel-multiverse/icons/statuses/invisible.svg",
  "mentally-concealed": "systems/marvel-multiverse/icons/statuses/invisible.svg",
  petrified: "systems/marvel-multiverse/icons/statuses/petrified.svg",
  silenced: "systems/marvel-multiverse/icons/statuses/silenced.svg",
  surprised: "systems/marvel-multiverse/icons/statuses/surprised.svg",
  unconscious: "systems/marvel-multiverse/icons/statuses/unconscious.svg",
};

const DEFAULT_EXTRACTION_ALIASES = {
  grappled: ["tied up", "tied-up"],
};

const TROUBLE_ALL_ACTIONS = new Set(["stunned", "paralyzed", "frightened"]);
const TROUBLE_ATTACK_ACTIONS = new Set(["blinded", "prone"]);
const TROUBLE_PHYSICAL_ACTIONS = new Set(["restrained", "grappled", "poisoned"]);
const VISION_DEPENDENT_ABILITIES = new Set(["vig"]);
const VISION_CIRCUMSTANCE_TAGS = new Set(["vision", "visual", "sight", "line-of-sight"]);

function normalizeAbilityKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  const aliases = {
    melee: "mle",
    mel: "mle",
    mle: "mle",
    agility: "agl",
    agl: "agl",
    resilience: "res",
    res: "res",
    vigilance: "vig",
    vig: "vig",
    ego: "ego",
    logic: "log",
    log: "log",
  };
  return aliases[normalized] ?? null;
}

function getActorEffects(actor) {
  const effects = actor?.allApplicableEffects?.() ?? actor?.effects?.contents ?? actor?.effects ?? [];
  if (Array.isArray(effects)) return effects;
  return [...effects];
}

function getEffectStatuses(effect) {
  if (!effect) return [];
  if (Array.isArray(effect.statuses)) return effect.statuses;
  if (effect.statuses && typeof effect.statuses === "object") return Array.from(effect.statuses);
  return [];
}

export function getConditionIcon(key) {
  return CONDITION_ICONS[key] ?? "icons/svg/statuses/condition.svg";
}

// CONFIG.statusEffects entries for the system's official conditions, for Token HUD registration.
export function getSystemStatusEffects() {
  return Object.keys(DEFAULT_CONDITION_ALIASES).map((key) => ({
    id: key,
    name: `${CONDITION_I18N_ROOT}.Conditions.${key}`,
    img: getConditionIcon(key),
  }));
}

// CONFIG.statusEffects entries for the visual-only markers above - manual Token HUD toggles
// with no attached roll automation.
export function getCosmeticStatusEffects() {
  return Object.keys(COSMETIC_STATUS_ICONS).map((key) => ({
    id: key,
    name: `${CONDITION_I18N_ROOT}.CosmeticStatuses.${key}`,
    img: COSMETIC_STATUS_ICONS[key],
  }));
}

export function getActorConditionKeys(actor) {
  if (!actor || typeof actor !== "object") return [];
  const statuses = new Set();
  for (const effect of getActorEffects(actor)) {
    for (const status of getEffectStatuses(effect)) {
      const normalized = normalizeConditionKey(status);
      if (normalized) statuses.add(normalized);
    }
    const marker = effect?.flags?.["marvel-multiverse"]?.conditionKey
      ?? effect?.flags?.marvelMultiverse?.conditionKey
      ?? null;
    const normalizedMarker = normalizeConditionKey(marker);
    if (normalizedMarker) statuses.add(normalizedMarker);
  }
  return [...statuses];
}

export function getConditionRollModifiers(actor, options = {}) {
  const rollType = options?.rollType === "attack" ? "attack" : "ability";
  const ability = normalizeAbilityKey(options?.ability ?? options?.item?.system?.ability ?? null);
  const isAttack = rollType === "attack";
  const isPhysicalAction = isAttack || ["mle", "agl", "res"].includes(ability);
  const circumstanceTags = Array.isArray(options?.circumstances)
    ? options.circumstances
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
    : [];
  const isVisionDependent = isAttack
    || VISION_DEPENDENT_ABILITIES.has(ability)
    || circumstanceTags.some((tag) => VISION_CIRCUMSTANCE_TAGS.has(tag));

  const activeConditions = getActorConditionKeys(actor);
  const reasons = [];
  let trouble = false;

  for (const condition of activeConditions) {
    if (TROUBLE_ALL_ACTIONS.has(condition)) {
      trouble = true;
      reasons.push(condition);
      continue;
    }

    if (condition === "blinded" && isVisionDependent) {
      trouble = true;
      reasons.push(condition);
      continue;
    }

    if (TROUBLE_ATTACK_ACTIONS.has(condition) && isAttack) {
      trouble = true;
      reasons.push(condition);
      continue;
    }

    if (TROUBLE_PHYSICAL_ACTIONS.has(condition) && isPhysicalAction) {
      trouble = true;
      reasons.push(condition);
      continue;
    }
  }

  return {
    edge: false,
    trouble,
    reasons: [...new Set(reasons)],
    conditions: activeConditions,
  };
}

function createIssue(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAliasToken(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function toAliasArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function getLocalizedConditionAliasesConfig() {
  const translations = globalThis.game?.i18n?.translations?.[CONDITION_I18N_ROOT]?.ConditionAliases;
  const fallback = globalThis.game?.i18n?._fallback?.[CONDITION_I18N_ROOT]?.ConditionAliases;
  const source = translations && typeof translations === "object" ? translations : fallback;
  return source && typeof source === "object" ? source : null;
}

function buildConditionAliasMap() {
  const aliasMap = new Map();

  for (const [canonicalKey, aliases] of Object.entries(DEFAULT_CONDITION_ALIASES)) {
    const canonical = normalizeAliasToken(canonicalKey);
    if (!canonical) continue;
    aliasMap.set(canonical, canonical);
    for (const alias of aliases) {
      const normalizedAlias = normalizeAliasToken(alias);
      if (!normalizedAlias) continue;
      aliasMap.set(normalizedAlias, canonical);
    }
  }

  const localizedAliases = getLocalizedConditionAliasesConfig();
  if (!localizedAliases) return aliasMap;

  for (const [canonicalKey, aliases] of Object.entries(localizedAliases)) {
    const canonical = normalizeAliasToken(canonicalKey);
    if (!canonical) continue;
    aliasMap.set(canonical, canonical);
    for (const alias of toAliasArray(aliases)) {
      const normalizedAlias = normalizeAliasToken(alias);
      if (!normalizedAlias) continue;
      aliasMap.set(normalizedAlias, canonical);
    }
  }

  return aliasMap;
}

function getLocalizedConditionLabel(key) {
  const localized = globalThis.game?.i18n?.localize?.(`${CONDITION_I18N_ROOT}.Conditions.${key}`);
  if (typeof localized === "string" && localized.trim() && localized !== `${CONDITION_I18N_ROOT}.Conditions.${key}`) {
    return localized;
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function normalizeConditionList(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeConditionEntry(entry))
      .filter(Boolean);
  }
  return [];
}

function normalizeConditionEntry(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const key = normalizeConditionKey(entry);
    return key ? { key, label: getLocalizedConditionLabel(key) } : null;
  }
  if (typeof entry === "object") {
    const key = normalizeConditionKey(entry?.key ?? entry?.name ?? entry?.label ?? "");
    if (!key) return null;
    return {
      key,
      label: typeof entry?.label === "string" && entry.label.trim() ? entry.label.trim() : getLocalizedConditionLabel(key),
    };
  }
  return null;
}

export function normalizeConditionKey(value) {
  const normalized = normalizeAliasToken(value);
  if (!normalized) return null;
  const aliasMap = buildConditionAliasMap();
  return aliasMap.get(normalized) ?? normalized;
}

export function extractConditionsFromText(text) {
  if (typeof text !== "string") return [];
  const matches = [];
  const aliasMap = buildConditionAliasMap();
  const groupedAliases = new Map();
  for (const [alias, canonical] of aliasMap.entries()) {
    const entries = groupedAliases.get(canonical) ?? [];
    entries.push(alias);
    groupedAliases.set(canonical, entries);
  }

  for (const [canonical, aliases] of Object.entries(DEFAULT_EXTRACTION_ALIASES)) {
    const entries = groupedAliases.get(canonical) ?? [];
    for (const alias of aliases) {
      const normalizedAlias = normalizeAliasToken(alias);
      if (!normalizedAlias) continue;
      if (!entries.includes(normalizedAlias)) entries.push(normalizedAlias);
    }
    groupedAliases.set(canonical, entries);
  }

  for (const [key, aliases] of groupedAliases.entries()) {
    const found = aliases.some((alias) => {
      const regex = new RegExp(`\\b${escapeRegExp(alias).replace(/\\s+/g, "\\s+")}\\b`, "i");
      return regex.test(text);
    });
    if (found) {
      matches.push({ key, label: getLocalizedConditionLabel(key) });
    }
  }
  return matches.filter((entry, index, array) => array.findIndex((candidate) => candidate.key === entry.key) === index);
}

export function getMessageConditions(message) {
  const flagConditions = message?.getFlag?.("marvel-multiverse", "conditions");
  if (Array.isArray(flagConditions) && flagConditions.length) {
    return normalizeConditionList(flagConditions);
  }

  const rollContext = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext") ?? null
    : null;
  const rollConditions = Array.isArray(rollContext?.conditions) ? rollContext.conditions : [];
  if (rollConditions.length) {
    return normalizeConditionList(rollConditions);
  }

  // Conditions are only ever sourced from structured flags/rollContext, never inferred from
  // rendered chat text during normal play. extractConditionsFromText() remains available for
  // explicit, opt-in legacy-message recovery only.
  return [];
}

export function getEligibleConditionTargetUuids(message, options = {}) {
  const rollContext = options?.rollContext
    ?? (typeof message?.getFlag === "function" ? message.getFlag("marvel-multiverse", "rollContext") : null)
    ?? null;
  const fallbackTargets = Array.isArray(options?.targetUuids)
    ? options.targetUuids.filter((entry) => typeof entry === "string" && entry.trim())
    : Array.isArray(rollContext?.targetUuids)
      ? rollContext.targetUuids.filter((entry) => typeof entry === "string" && entry.trim())
      : [];

  // Non-attack checks apply target conditions to the caller-provided/fallback targets.
  if (rollContext?.rollType !== "attack") {
    return [...new Set(fallbackTargets)];
  }

  const attackResolution = options?.attackResolution
    ?? (typeof message?.getFlag === "function" ? message.getFlag("marvel-multiverse", "attackResolution") : null)
    ?? null;
  const resolvedTargets = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];

  // If no per-target outcomes exist yet (legacy or unresolved state), fall back to stored targets.
  if (!resolvedTargets.length) {
    return [...new Set(fallbackTargets)];
  }

  // Once outcomes exist, target conditions are strict hit-only; all-miss returns [] by design.
  const hitTargets = resolvedTargets
    .filter((target) => target?.outcome === "hit" || target?.outcome === "fantastic-hit")
    .map((target) => target?.uuid)
    .filter((uuid) => typeof uuid === "string" && uuid.trim());
  return [...new Set(hitTargets)];
}

function getMessageConditionApplications(message) {
  const existing = message?.getFlag?.("marvel-multiverse", "conditionApplications") ?? [];
  return Array.isArray(existing) ? existing : [];
}

async function writeConditionApplications(message, applications) {
  if (!message?.update) return applications;
  await updateChatMessageFlags(message, { "marvel-multiverse": { conditionApplications: applications } });
  return applications;
}

function getActorRecord(targetDocument) {
  if (!targetDocument) return null;
  return targetDocument.actor ?? targetDocument ?? null;
}

function getTargetActorUuid(targetDocument, fallbackUuid) {
  if (targetDocument?.uuid) return targetDocument.uuid;
  if (typeof targetDocument?.actor?.uuid === "string") return targetDocument.actor.uuid;
  return fallbackUuid ?? null;
}

function isTokenDocument(targetDocument) {
  const name = targetDocument?.documentName;
  return name === "Token" || name === "TokenDocument";
}

function getTokenSightEnabled(targetDocument) {
  const byPath = globalThis.foundry?.utils?.getProperty?.(targetDocument, "sight.enabled");
  if (typeof byPath === "boolean") return byPath;
  if (typeof targetDocument?.sight?.enabled === "boolean") return targetDocument.sight.enabled;
  const legacy = globalThis.foundry?.utils?.getProperty?.(targetDocument, "vision.enabled");
  if (typeof legacy === "boolean") return legacy;
  return null;
}

function hasNonvisualTokenSight(targetDocument) {
  const byPath = globalThis.foundry?.utils?.getProperty?.(targetDocument, "sight.visionMode");
  const visionMode = byPath ?? targetDocument?.sight?.visionMode ?? null;
  return visionMode === "tremorsense";
}

async function updateTokenSightEnabled(targetDocument, enabled) {
  if (!isTokenDocument(targetDocument) || typeof targetDocument?.update !== "function") return false;
  try {
    await targetDocument.update({ "sight.enabled": enabled });
    return true;
  } catch (error) {
    try {
      await targetDocument.update({ sight: { enabled } });
      return true;
    } catch {
      return false;
    }
  }
}

export function getConditionApplications(message) {
  return getMessageConditionApplications(message);
}

export async function applyActorStatus(options = {}) {
  const conditionKey = normalizeConditionKey(options.status);
  if (!conditionKey) {
    return {
      success: false,
      reason: "invalid-status",
      issues: [createIssue("warning", "STATUS_INVALID", "A valid status is required.")],
    };
  }

  const mode = typeof options.mode === "string" ? options.mode.trim().toLowerCase() : "apply";
  if (!["apply", "remove", "toggle"].includes(mode)) {
    return {
      success: false,
      reason: "invalid-mode",
      status: conditionKey,
      issues: [createIssue("warning", "STATUS_MODE_INVALID", "Status mode must be apply, remove, or toggle.")],
    };
  }

  const actor = resolveActorForMutation({
    actor: options.actor,
    actorUuid: options.actorUuid,
    tokenUuid: options.tokenUuid,
  });
  if (!actor) {
    return {
      success: false,
      reason: "actor-missing",
      status: conditionKey,
      issues: [createIssue("warning", "STATUS_ACTOR_MISSING", "No actor was available for status application.")],
    };
  }
  if (!hasActorMutationPermission(actor)) {
    return {
      success: false,
      reason: "permission-denied",
      actorUuid: actor.uuid ?? null,
      status: conditionKey,
      issues: [createIssue("warning", "STATUS_PERMISSION_DENIED", "You do not have permission to change this actor's statuses.")],
    };
  }

  const effects = Array.isArray(actor.effects?.contents)
    ? actor.effects.contents
    : Array.isArray(actor.effects)
      ? actor.effects
      : [];
  const matchingEffects = effects.filter((effect) => {
    const statuses = getEffectStatuses(effect);
    const flags = effect?.flags?.["marvel-multiverse"] ?? effect?.flags?.marvelMultiverse ?? {};
    return statuses.includes(conditionKey) || flags.conditionKey === conditionKey;
  });
  const shouldRemove = mode === "remove" || (mode === "toggle" && matchingEffects.length > 0);

  if (shouldRemove) {
    const effectIds = matchingEffects.map((effect) => effect.id ?? effect._id).filter(Boolean);
    if (effectIds.length && typeof actor.deleteEmbeddedDocuments === "function") {
      await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
    }
    return {
      success: true,
      actorUuid: actor.uuid ?? null,
      status: conditionKey,
      mode: "remove",
      createdEffectIds: [],
      removedEffectIds: effectIds,
      skipped: effectIds.length === 0,
      issues: [],
    };
  }

  if (matchingEffects.length) {
    return {
      success: true,
      actorUuid: actor.uuid ?? null,
      status: conditionKey,
      mode: "apply",
      createdEffectIds: [],
      removedEffectIds: [],
      skipped: true,
      reason: "already-applied",
      issues: [],
    };
  }
  if (typeof actor.createEmbeddedDocuments !== "function") {
    return {
      success: false,
      reason: "actor-unsupported",
      actorUuid: actor.uuid ?? null,
      status: conditionKey,
      issues: [createIssue("warning", "STATUS_UPDATE_UNAVAILABLE", "The actor does not support embedded status effects.")],
    };
  }

  const label = getLocalizedConditionLabel(conditionKey);
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `Condition: ${label}`,
    img: getConditionIcon(conditionKey),
    statuses: [conditionKey],
    flags: {
      "marvel-multiverse": {
        [CONDITION_MARKER_FLAG]: true,
        conditionKey,
        conditionLabel: label,
        source: options.source ?? "system-api",
      },
    },
  }]);
  const createdEffectIds = (created ?? []).map((effect) => effect.id ?? effect._id).filter(Boolean);
  return {
    success: true,
    actorUuid: actor.uuid ?? null,
    status: conditionKey,
    mode: "apply",
    createdEffectIds,
    removedEffectIds: [],
    skipped: false,
    issues: [],
  };
}

export async function applyMessageConditions(message, options = {}) {
  const conditions = normalizeConditionList(options.conditions ?? getMessageConditions(message));
  if (!conditions.length) {
    return { success: false, issues: [createIssue("warning", "CONDITIONS_MISSING", "No conditions were found to apply.", {})] };
  }

  const targetUuids = Array.isArray(options.targetUuids)
    ? options.targetUuids
    : Array.isArray(message?.getFlag?.("marvel-multiverse", "rollContext")?.targetUuids)
      ? message.getFlag("marvel-multiverse", "rollContext").targetUuids
      : [];

  if (!targetUuids.length) {
    return { success: false, issues: [createIssue("warning", "CONDITIONS_TARGETS_MISSING", "No targets were available for condition application.", {})] };
  }

  const applications = getMessageConditionApplications(message);
  const issues = [];
  const transaction = {
    id: `condition-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    version: CONDITION_VERSION,
    appliedAt: Date.now(),
    sourceMessageUuid: message?.uuid ?? message?.id ?? null,
    conditions: conditions.map((entry) => ({ ...entry })),
    targets: [],
    undone: false,
  };

  const fromUuidSync = globalThis.fromUuidSync ?? null;
  for (const targetUuid of targetUuids) {
    const targetDocument = typeof fromUuidSync === "function" ? fromUuidSync(targetUuid) : null;
    const actorRecord = getActorRecord(targetDocument);
    if (!actorRecord) continue;
    if (!hasActorMutationPermission(actorRecord)) {
      issues.push(createIssue("warning", "CONDITIONS_PERMISSION_DENIED", "You do not have permission to apply conditions to one or more targets.", { targetUuid }));
      continue;
    }
    const effectIds = [];
    let tokenSightMutation = null;
    for (const condition of conditions) {
      if (typeof actorRecord?.createEmbeddedDocuments !== "function") continue;
      const existingEffects = Array.isArray(actorRecord.effects?.contents)
        ? actorRecord.effects.contents
        : Array.isArray(actorRecord.effects)
          ? actorRecord.effects
          : [];
      const alreadyApplied = existingEffects.some((effect) => {
        const effectFlags = effect?.flags?.["marvel-multiverse"] ?? effect?.flags?.marvelMultiverse ?? {};
        return effectFlags[CONDITION_MARKER_FLAG] && effectFlags.conditionKey === condition.key;
      });
      if (alreadyApplied) continue;
      const createdEffects = await actorRecord.createEmbeddedDocuments("ActiveEffect", [{
        name: `Condition: ${condition.label}`,
        img: getConditionIcon(condition.key),
        statuses: [condition.key],
        flags: {
          "marvel-multiverse": {
            [CONDITION_MARKER_FLAG]: true,
            conditionKey: condition.key,
            conditionLabel: condition.label,
            sourceMessageUuid: message?.uuid ?? message?.id ?? null,
          },
        },
      }]);
      const createdEffect = createdEffects?.[0] ?? null;
      if (createdEffect?.id ?? createdEffect?._id) {
        effectIds.push(createdEffect.id ?? createdEffect._id);
      }
      if (condition.key === "blinded" && tokenSightMutation === null && isTokenDocument(targetDocument)) {
        const previousSightEnabled = getTokenSightEnabled(targetDocument);
        const didDisableSight = hasNonvisualTokenSight(targetDocument)
          ? false
          : await updateTokenSightEnabled(targetDocument, false);
        tokenSightMutation = {
          applied: didDisableSight,
          previousSightEnabled,
        };
      }
    }
    transaction.targets.push({
      targetUuid,
      actorUuid: getTargetActorUuid(targetDocument, targetUuid),
      effectIds,
      conditions: conditions.map((entry) => ({ ...entry })),
      tokenSightMutation,
    });
  }

  applications.push(transaction);
  const appliedTargetCount = (transaction.targets ?? []).length;
  const success = appliedTargetCount > 0 || (!issues.length && targetUuids.length > 0);
  if (success) {
    await writeConditionApplications(message, applications);
  }
  return { success, transaction: success ? transaction : null, appliedConditions: conditions, issues };
}

export async function undoMessageConditions(message, options = {}) {
  const applications = getMessageConditionApplications(message);
  const transaction = [...applications].reverse().find((entry) => !entry?.undone);
  if (!transaction) {
    return { success: false, issues: [createIssue("warning", "CONDITIONS_NOT_FOUND", "No applied conditions were found to undo.", {})] };
  }

  const fromUuidSync = globalThis.fromUuidSync ?? null;
  const issues = [];
  let undoCount = 0;
  for (const target of transaction.targets ?? []) {
    const targetDocument = typeof fromUuidSync === "function" ? fromUuidSync(target.targetUuid) : null;
    const actorRecord = getActorRecord(targetDocument);
    if (!actorRecord || typeof actorRecord?.deleteEmbeddedDocuments !== "function") continue;
    if (!hasActorMutationPermission(actorRecord)) {
      issues.push(createIssue("warning", "CONDITIONS_PERMISSION_DENIED", "You do not have permission to undo conditions for one or more targets.", { targetUuid: target.targetUuid }));
      continue;
    }
    const effectIds = Array.isArray(target.effectIds) ? target.effectIds.filter(Boolean) : [];
    if (!effectIds.length) continue;
    await actorRecord.deleteEmbeddedDocuments("ActiveEffect", effectIds);
    undoCount += 1;

    const sightMutation = target?.tokenSightMutation ?? null;
    if (sightMutation?.applied && typeof sightMutation?.previousSightEnabled === "boolean") {
      await updateTokenSightEnabled(targetDocument, sightMutation.previousSightEnabled);
    }
  }

  if (!undoCount && issues.length) {
    return { success: false, issues };
  }

  transaction.undone = true;
  transaction.undoneAt = Date.now();
  await writeConditionApplications(message, applications);
  return { success: true, transaction, issues };
}
