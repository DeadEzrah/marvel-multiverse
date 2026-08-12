/**
 * Universal Action Roll Dialog service.
 *
 * Provides a single, reusable entry point (`requestRoll`) for turning any rollable click
 * (ability check, skill, power, weapon attack, etc.) into: a pre-roll configuration dialog,
 * a normalized roll request, an executed Marvel Multiverse dice roll (reusing the existing
 * `CONFIG.Dice.MarvelMultiverseRoll` engine and Edge/Trouble mechanics), a normalized outcome,
 * and a ChatMessage.
 *
 * Foundry token targeting is a first-class part of this workflow: `resolveTargetingConfig()`
 * centralizes whether an action requires a target/how many/which defense it opposes (either from
 * an explicit `item.system.targeting` object, or inferred from the existing attack-like fields
 * so no Item data migration is required), and `getDefenseValue()` is the single place that maps a
 * Marvel ability defense type to an actor's actual defense score - nothing else in this module
 * reaches into `target.system.foo.bar` directly.
 *
 * Scope note: this module spends configured Focus costs and resolves automatic Health/Focus
 * damage for damaging actions once the roll succeeds (via `lib/services/damage-resolver.mjs`).
 * `roll.toMessage()` is still used under the hood so the existing rollContext / attack-resolution /
 * damage-context automation pipeline keeps working unchanged for attack rolls.
 */
import { resolveCheckOutcome } from "../check-resolution.mjs";
import { updateChatMessageFlags } from "../chat-message-state.mjs";
import { parseFocusCost, spendActorFocus } from "../focus-automation.mjs";
import { resolveDamageConfig, resolveDamage, applyResolvedDamage } from "./damage-resolver.mjs";
import { requestAutoApplyActionDamage, requestAutoApplyDamage } from "./socket-relay.mjs";
import { createEffectProfileSession, getOutcomeEffectPhases, normalizeEffectMetadata } from "./effect-profile-manager.mjs";
import { placePowerArea, resolveAreaTargetingConfig } from "./area-targeting.mjs";

const ABILITY_KEYS = ["mle", "agl", "res", "vig", "ego", "log"];

const ABILITY_ALIASES = {
  mle: "mle",
  melee: "mle",
  close: "mle",
  agl: "agl",
  agility: "agl",
  res: "res",
  resilience: "res",
  vig: "vig",
  vigilance: "vig",
  ego: "ego",
  log: "log",
  logic: "log",
};

const ABILITY_LABEL_FALLBACKS = {
  mle: "Melee",
  agl: "Agility",
  res: "Resilience",
  vig: "Vigilance",
  ego: "Ego",
  log: "Logic",
};

function localize(key, fallback) {
  const i18n = globalThis.game?.i18n;
  if (typeof i18n?.localize === "function") {
    const value = i18n.localize(key);
    if (value && value !== key) return value;
  }
  return fallback;
}

function localizeFormat(key, data, fallbackTemplate) {
  const i18n = globalThis.game?.i18n;
  if (typeof i18n?.has === "function" ? i18n.has(key) : i18n?.localize?.(key) !== key) {
    if (typeof i18n?.format === "function") return i18n.format(key, data);
  }
  return Object.entries(data ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    fallbackTemplate,
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function parseIntSafe(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number.parseInt(String(raw), 10);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Normalizes an ability key OR a human-readable ability label (both forms exist across the
 * templates in this codebase) down to one of the six canonical ability keys.
 */
function normalizeAbilityKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ABILITY_ALIASES[normalized] ?? (ABILITY_KEYS.includes(normalized) ? normalized : null);
}

function resolveAbilityLabel(key) {
  const configKey = globalThis.CONFIG?.MARVEL_MULTIVERSE?.abilities?.[key];
  if (configKey) {
    const localized = localize(configKey, null);
    if (localized) return localized;
  }
  return ABILITY_LABEL_FALLBACKS[key] ?? key ?? "";
}

function getAbilityValue(actor, abilityKey) {
  const value = actor?.system?.abilities?.[abilityKey]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getActionSourceData(source) {
  return source?.system ?? source ?? {};
}

/**
 * The single centralized Marvel defense-value lookup. `defenseType` accepts either a raw ability
 * key ("agl") or a human-readable defense name ("Agility defense"/"Agility") - both are normalized
 * the same way `normalizeAbilityKey` already handles ability input elsewhere in this module.
 * Nothing else in this codebase should reach into `target.system.abilities[...].defense` directly;
 * this is the one place that mapping happens, so it stays correct if the defense formula ever
 * changes (defense is currently `ability value + 10`, computed once in lib/documents.mjs).
 */
export function getDefenseValue(actor, defenseType) {
  const key = normalizeAbilityKey(defenseType);
  if (!key) return null;
  return getAbilityDefense(actor, key);
}

function getAbilityDefense(actor, abilityKey) {
  const value = actor?.system?.abilities?.[abilityKey]?.defense;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Retrieves the tokens the current Foundry user has targeted (`game.user.targets`), deduped by
 * token/actor uuid. `rawTargets` lets call sites pass an already-known target list (e.g. a stored
 * roll context) instead of reading live user targeting.
 */
function resolveUserTargets(rawTargets) {
  const collection = rawTargets ?? globalThis.game?.user?.targets;
  const list = Array.isArray(collection)
    ? collection
    : collection && typeof collection === "object"
      ? Array.from(collection)
      : [];
  const seen = new Set();
  const deduped = [];
  for (const entry of list) {
    const uuid = entry?.document?.uuid ?? entry?.uuid ?? null;
    if (uuid && seen.has(uuid)) continue;
    if (uuid) seen.add(uuid);
    deduped.push(entry);
  }
  return deduped;
}

function resolveTargetActor(target) {
  return target?.actor ?? target?.document?.actor ?? null;
}

function resolveTargetName(target) {
  const actor = resolveTargetActor(target);
  return actor?.name ?? target?.document?.name ?? target?.name ?? null;
}

function resolveTargetTokenUuid(target) {
  if (target?.document?.uuid) return target.document.uuid;
  if (target?.documentName === "Token" && target?.uuid) return target.uuid;
  return null;
}

/**
 * Resolves the raw targeted tokens/placeables into a normalized candidate list, distinguishing
 * targets with a resolvable Actor from targets that are tokens without an Actor (deleted/unlinked
 * actor) - the latter are never silently treated as valid, per the "token without actor" error
 * handling requirement.
 */
function resolveTargetCandidates(rawTargets) {
  const targets = resolveUserTargets(rawTargets);
  const candidates = targets.map((raw) => {
    const actor = resolveTargetActor(raw);
    return {
      raw,
      actor,
      hasActor: Boolean(actor),
      tokenUuid: resolveTargetTokenUuid(raw),
      actorUuid: actor?.uuid ?? null,
      name: resolveTargetName(raw),
    };
  });
  return {
    all: candidates,
    valid: candidates.filter((candidate) => candidate.hasActor),
    invalidCount: candidates.filter((candidate) => !candidate.hasActor).length,
  };
}

function inferIsAttack(item, options) {
  if (typeof options?.isAttack === "boolean") return options.isAttack;
  const itemSystem = getActionSourceData(item);
  const hasAttackTarget = typeof itemSystem.attackTarget === "string" && itemSystem.attackTarget.trim().length > 0;
  const hasAttackKind = typeof itemSystem.attackKind === "string" && itemSystem.attackKind.trim().length > 0;
  const hasDamageType = typeof itemSystem.damageType === "string" && itemSystem.damageType.trim().length > 0;
  return Boolean(itemSystem.attack || hasAttackTarget || hasAttackKind || hasDamageType);
}

/**
 * Declarative targeting requirements for an action, e.g. `{ required: true, count: 1,
 * defense: "agility" }`. An Item may opt in to an explicit `system.targeting` object to describe
 * this itself; otherwise (the common case, requiring zero data migration) it's derived from the
 * existing attack-like fields already on the item (`attack`/`attackTarget`/`attackKind`/
 * `damageType`) - a non-attack ability/skill check never requires or auto-fills a target.
 */
export function resolveTargetingConfig(item, options = {}) {
  const itemSystem = getActionSourceData(item);
  const explicit = itemSystem.targeting;
  if (explicit && typeof explicit === "object") {
    const count = Number(explicit.count);
    const isAttack = inferIsAttack(item, options);
    const area = resolveAreaTargetingConfig(item);
    return {
      required: explicit.required === undefined ? isAttack : Boolean(explicit.required),
      count: Number.isFinite(count) && count > 0 ? count : area ? 999 : 1,
      defense: normalizeAbilityKey(explicit.defense ?? options.attackTarget ?? itemSystem.attackTarget) ?? null,
      area,
    };
  }

  const isAttack = inferIsAttack(item, options);
  const defenseRaw = options.attackTarget ?? itemSystem.attackTarget ?? null;
  const defense = normalizeAbilityKey(defenseRaw);
  if (defenseRaw && !defense) {
    console.warn(`Marvel Multiverse | Action roll: unrecognized defense type "${defenseRaw}" on "${item?.name ?? "unknown item"}" - Target Number will need to be entered manually.`);
  }

  return { required: isAttack, count: 1, defense, area: null };
}

function computeEdgeModeValue(edge, trouble) {
  const EDGE_MODE = globalThis.CONFIG?.Dice?.MarvelMultiverseRoll?.EDGE_MODE ?? { NORMAL: 0, EDGE: 1, TROUBLE: -1 };
  const net = (Number(edge) || 0) - (Number(trouble) || 0);
  if (net > 0) return EDGE_MODE.EDGE;
  if (net < 0) return EDGE_MODE.TROUBLE;
  return EDGE_MODE.NORMAL;
}

function resolveDefaultActionName(ability, item) {
  if (item?.name) return item.name;
  return `${resolveAbilityLabel(ability)} ${localize("MARVEL_MULTIVERSE.ActionRoll.CheckSuffix", "Check")}`;
}

/**
 * Builds a normalized roll request from raw call-site options. This is the shape passed to the
 * dialog, then re-derived from the dialog's own field values once the user confirms.
 */
export function buildActionRollRequest(options = {}) {
  const actor = options.actor ?? null;
  const item = options.source ?? options.item ?? null;
  const itemSystem = getActionSourceData(item);
  const ability = normalizeAbilityKey(options.ability ?? itemSystem.ability) ?? "mle";
  const isAttack = inferIsAttack(item, options);
  const targeting = resolveTargetingConfig(item, options);
  const effectMetadata = normalizeEffectMetadata({
    effectProfile: options.effectProfile ?? itemSystem.effectProfile,
    effectProfiles: options.effectProfiles ?? itemSystem.effectProfiles,
  });

  const targetCandidates = resolveTargetCandidates(options.targets);
  const allTargets = targetCandidates.all.map((candidate) => candidate.raw);
  const validTargets = targetCandidates.valid;
  const primaryCandidate = validTargets[0] ?? null;
  // "Do not silently pick an arbitrary token": more valid targets than `targeting.count`
  // supports only ever surfaces as a warning here - `requestRoll` is what turns this into a
  // hard block. Comparing against `targeting.count` (not a hardcoded 1) means multi-target
  // support can be layered on later just by raising an item's declared count.
  const validTargetCount = validTargets.length;
  const multipleTargetsWarning = validTargetCount > targeting.count;
  const targetHasNoActor = targetCandidates.all.length > 0 && validTargets.length === 0;

  const targetWarnings = [];
  const targets = validTargets.map((candidate) => {
    const defenseValue = targeting.defense ? getDefenseValue(candidate.actor, targeting.defense) : null;
    if (targeting.defense && defenseValue === null) targetWarnings.push("defense-unavailable");
    return {
      tokenUuid: candidate.tokenUuid,
      actorUuid: candidate.actorUuid,
      actor: candidate.actor,
      name: candidate.name,
      defenseType: targeting.defense,
      defenseLabel: targeting.defense ? resolveAbilityLabel(targeting.defense) : null,
      defenseValue,
    };
  });
  const target = targets[0] ?? null;
  let targetNumber = null;
  if (target) {
    if (targeting.defense && target.defenseValue === null) {
      console.warn(`Marvel Multiverse | Action roll: could not resolve a "${targeting.defense}" defense value for ${primaryCandidate.name ?? "the target"} - enter a Target Number manually.`);
    }
    targetNumber = target.defenseValue;
  }
  if (targetNumber === null && options.targetNumber !== undefined && Number.isFinite(Number(options.targetNumber))) {
    targetNumber = Number(options.targetNumber);
  }
  if (targetHasNoActor) targetWarnings.push("target-has-no-actor");

  const baseModifier = options.baseModifier !== undefined && Number.isFinite(Number(options.baseModifier))
    ? Number(options.baseModifier)
    : getAbilityValue(actor, ability);
  const situationalModifier = Number.isFinite(Number(options.situationalModifier)) ? Number(options.situationalModifier) : 0;

  const edgeModeInfo = globalThis.CONFIG?.Dice?.MarvelMultiverseRoll?.determineEdgeMode?.({
    event: options.event,
    trouble: Boolean(options.trouble),
    fastForward: options.fastForward,
  }) ?? { edgeMode: 0 };
  const defaultEdge = Number.isFinite(Number(options.edgeCount)) ? Number(options.edgeCount) : (edgeModeInfo.edgeMode > 0 ? 1 : 0);
  const defaultTrouble = Number.isFinite(Number(options.troubleCount)) ? Number(options.troubleCount) : (edgeModeInfo.edgeMode < 0 ? 1 : 0);

  return {
    actor,
    token: options.token ?? actor?.token ?? null,
    source: item,
    actionName: options.actionName ?? resolveDefaultActionName(ability, item),
    actionType: options.actionType ?? item?.type ?? "ability",
    sourceType: options.sourceType ?? item?.type ?? options.actionType ?? "ability",
    ability,
    abilityLabel: resolveAbilityLabel(ability),
    baseModifier,
    situationalModifier,
    totalModifier: baseModifier + situationalModifier,
    targeting,
    target,
    targets,
    allTargets,
    validTargetCount,
    multipleTargetsWarning,
    targetHasNoActor,
    targetWarnings,
    targetNumber,
    autoPopulatedTargetNumber: targetNumber !== null,
    edge: Math.max(0, defaultEdge),
    trouble: Math.max(0, defaultTrouble),
    focusAmount: Number.isFinite(Number(options.focusAmount)) ? Number(options.focusAmount) : null,
    edgeModeValue: computeEdgeModeValue(defaultEdge, defaultTrouble),
    isAttack,
    dealsDamage: Boolean(options.dealsDamage ?? isAttack),
    effectProfile: effectMetadata.effectProfile,
    effectProfiles: effectMetadata.effectProfiles,
  };
}

export function validateActionResourcePreflight(request) {
  const sourceData = getActionSourceData(request?.source);
  const cost = parseFocusCost(sourceData.cost ?? sourceData.focusCost ?? null);
  if (!cost?.valid) return { success: true, reason: "cost-not-configured", requiredFocus: 0 };

  const requiredFocus = cost.type === "fixed"
    ? cost.value
    : cost.type === "variable"
      ? Number(request?.focusAmount ?? cost.minimum)
      : 0;
  if (cost.type === "variable" && (!Number.isInteger(requiredFocus) || requiredFocus < cost.minimum || (cost.maximum !== null && requiredFocus > cost.maximum))) {
    return { success: false, reason: "invalid-focus-amount", requiredFocus, availableFocus: request?.actor?.system?.focus?.value ?? null };
  }
  if (!Number.isFinite(requiredFocus) || requiredFocus <= 0) return { success: true, reason: null, requiredFocus: 0 };
  const availableFocus = request?.actor?.system?.focus?.value;
  if (!Number.isFinite(availableFocus)) {
    return { success: false, reason: "focus-unavailable", requiredFocus, availableFocus: null };
  }
  if (availableFocus < requiredFocus) {
    return { success: false, reason: "insufficient-focus", requiredFocus, availableFocus };
  }
  return { success: true, reason: null, requiredFocus, availableFocus };
}

function resolveEffectToken(value) {
  return value?.object ?? value?.document?.object ?? value?.document ?? value ?? null;
}

function resolveSourceEffectToken(request) {
  const supplied = resolveEffectToken(request.token ?? request.actor?.token);
  if (supplied) return supplied;
  const activeTokens = request.actor?.getActiveTokens?.(false, true);
  if (Array.isArray(activeTokens) && activeTokens.length) return resolveEffectToken(activeTokens[0]);
  return null;
}

async function playActionOutcomeEffects(session, request, result, damageResult = null) {
  const phases = getOutcomeEffectPhases({
    isAttack: request.isAttack,
    isSuccess: result.isSuccess,
    isFantastic: result.isFantastic,
  });
  for (const phase of phases) {
    await session.playPhase(phase, { rollResult: result, damageResult });
  }
  await session.playPhase("landing", { rollResult: result, damageResult });
}

function buildActionRollDialogContent(request) {
  const abilityOptions = ABILITY_KEYS.map((key) => {
    const value = getAbilityValue(request.actor, key);
    const label = resolveAbilityLabel(key);
    return `<option value="${key}" data-value="${value}" ${key === request.ability ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");

  const isMultiTarget = Array.isArray(request.targets) && request.targets.length > 1;
  const targetLine = isMultiTarget
    ? `<div class="mm-action-roll-targets"><strong>${localize("MARVEL_MULTIVERSE.ActionRoll.Targets", "Targets")}:</strong><ul>${request.targets.map((target) => `<li>${escapeHtml(target.name)}${target.defenseValue !== null ? ` - ${escapeHtml(target.defenseLabel)} ${target.defenseValue}` : ""}</li>`).join("")}</ul></div>`
    : request.target?.name
      ? `<p class="mm-action-roll-target-name"><strong>${localize("MARVEL_MULTIVERSE.ActionRoll.Target", "Target")}:</strong> ${escapeHtml(request.target.name)}</p>`
    : `<p class="mm-action-roll-target-name">${localize("MARVEL_MULTIVERSE.ActionRoll.NoTarget", "No target selected")}</p>`;

  const defenseLine = !isMultiTarget && request.target?.defenseLabel && request.target.defenseValue !== null
    ? `<p class="mm-action-roll-target-defense">${localize("MARVEL_MULTIVERSE.ActionRoll.Defense", "Defense")}: ${escapeHtml(request.target.defenseLabel)} ${request.target.defenseValue}</p>`
    : "";

  const multipleWarning = request.multipleTargetsWarning
    ? `<p class="notification info">${localize("MARVEL_MULTIVERSE.ActionRoll.MultipleTargetsWarning", "Each selected target will be resolved against its own defense.")}</p>`
    : "";

  const defenseUnavailableWarning = request.targetWarnings?.includes("defense-unavailable")
    ? `<p class="notification warning">${localize("MARVEL_MULTIVERSE.ActionRoll.DefenseUnavailable", "Defense value unavailable - enter a Target Number manually.")}</p>`
    : "";

  const targetNumberHint = request.autoPopulatedTargetNumber
    ? `<p class="mm-action-roll-target-number-hint">${localize("MARVEL_MULTIVERSE.ActionRoll.TargetNumberAuto", "Auto-filled from the target's defense - still editable.")}</p>`
    : "";
  const targetNumberInputClass = request.autoPopulatedTargetNumber ? "mm-target-number-auto" : "";
  const targetNumberControl = isMultiTarget
    ? `<p class="mm-action-roll-target-number-hint">${localize("MARVEL_MULTIVERSE.ActionRoll.MultiTargetDefenseHint", "Each target uses its own defense as the Target Number.")}</p>`
    : `<div class="form-group">
        <label for="action-roll-target-number">${localize("MARVEL_MULTIVERSE.ActionRoll.TargetNumber", "Target Number")}</label>
        <input id="action-roll-target-number" name="targetNumber" type="number" step="1" class="${targetNumberInputClass}" value="${request.targetNumber ?? ""}" placeholder="${localize("MARVEL_MULTIVERSE.ActionRoll.TargetNumberPlaceholder", "Optional")}" />
        ${targetNumberHint}
      </div>`;
  const sourceData = getActionSourceData(request.source);
  const focusCost = parseFocusCost(sourceData.cost ?? sourceData.focusCost ?? null);
  const focusControl = focusCost?.valid
    ? focusCost.type === "variable"
      ? `<div class="form-group">
        <label for="action-roll-focus-amount">${localize("MARVEL_MULTIVERSE.ActionRoll.FocusCost", "Focus Cost")}</label>
        <input id="action-roll-focus-amount" name="focusAmount" type="number" min="${focusCost.minimum}" ${focusCost.maximum !== null ? `max="${focusCost.maximum}"` : ""} step="1" value="${request.focusAmount ?? focusCost.minimum}" />
      </div>`
      : `<p class="mm-action-roll-focus-cost"><strong>${localize("MARVEL_MULTIVERSE.ActionRoll.FocusCost", "Focus Cost")}:</strong> ${focusCost.value}</p>`
    : "";

  return `
    <div class="mm-action-roll-dialog">
      <header class="mm-action-roll-header">
        <h2>${escapeHtml(request.actionName)}</h2>
      </header>
      <div class="form-group">
        <label for="action-roll-ability">${localize("MARVEL_MULTIVERSE.ActionRoll.Ability", "Ability")}</label>
        <select id="action-roll-ability" name="ability">${abilityOptions}</select>
      </div>
      <div class="form-group">
        <label for="action-roll-base-modifier">${localize("MARVEL_MULTIVERSE.ActionRoll.CheckModifier", "Check Modifier")}</label>
        <input id="action-roll-base-modifier" name="baseModifier" type="number" step="1" value="${request.baseModifier}" />
      </div>
      <div class="form-group">
        <label for="action-roll-situational-modifier">${localize("MARVEL_MULTIVERSE.ActionRoll.SituationalModifier", "Situational Modifier")}</label>
        <input id="action-roll-situational-modifier" name="situationalModifier" type="number" step="1" value="${request.situationalModifier}" />
      </div>
      ${focusControl}
      ${targetLine}
      ${defenseLine}
      ${multipleWarning}
      ${defenseUnavailableWarning}
      ${targetNumberControl}
      <div class="form-group">
        <label for="action-roll-edge">${localize("MARVEL_MULTIVERSE.ActionRoll.Edge", "Edge")}</label>
        <input id="action-roll-edge" name="edge" type="number" min="0" step="1" value="${request.edge}" />
      </div>
      <div class="form-group">
        <label for="action-roll-trouble">${localize("MARVEL_MULTIVERSE.ActionRoll.Trouble", "Trouble")}</label>
        <input id="action-roll-trouble" name="trouble" type="number" min="0" step="1" value="${request.trouble}" />
      </div>
    </div>`;
}

/**
 * Reads the submitted dialog form fields back into an updated normalized request. `formRoot`
 * can be a bare HTMLElement (DialogV2) or a jQuery-like wrapper (classic Dialog) - both expose
 * `.querySelector`, the latter via index 0.
 */
function parseActionRollForm(formRoot, request) {
  const root = formRoot?.querySelector ? formRoot : formRoot?.[0] ?? formRoot;
  const readValue = (name) => root?.querySelector?.(`[name="${name}"]`)?.value;

  const ability = normalizeAbilityKey(readValue("ability")) ?? request.ability;
  const baseModifier = parseIntSafe(readValue("baseModifier"), request.baseModifier);
  const situationalModifier = parseIntSafe(readValue("situationalModifier"), 0);
  const targetNumberRaw = readValue("targetNumber");
  const targetNumber = targetNumberRaw === undefined || targetNumberRaw === null || targetNumberRaw === ""
    ? null
    : parseIntSafe(targetNumberRaw, null);
  const edge = Math.max(0, parseIntSafe(readValue("edge"), 0));
  const trouble = Math.max(0, parseIntSafe(readValue("trouble"), 0));
  const focusAmountRaw = readValue("focusAmount");
  const focusAmount = focusAmountRaw === undefined || focusAmountRaw === null || focusAmountRaw === ""
    ? request.focusAmount
    : parseIntSafe(focusAmountRaw, request.focusAmount);

  return {
    ...request,
    ability,
    abilityLabel: resolveAbilityLabel(ability),
    baseModifier,
    situationalModifier,
    totalModifier: baseModifier + situationalModifier,
    targetNumber,
    edge,
    trouble,
    focusAmount,
    edgeModeValue: computeEdgeModeValue(edge, trouble),
  };
}

function getDialogClass() {
  return globalThis.foundry?.applications?.api?.DialogV2 ?? globalThis.Dialog ?? null;
}

function positionActionRollDialog(dialog, request) {
  const sheetElement = request.actor?.sheet?.element?.[0] ?? request.actor?.sheet?.element;
  const sheetBounds = sheetElement?.getBoundingClientRect?.();
  if (!sheetBounds || typeof dialog?.setPosition !== "function") return;

  const width = 320;
  const gap = 10;
  const viewportWidth = globalThis.innerWidth ?? 1920;
  const viewportHeight = globalThis.innerHeight ?? 1080;
  const fitsRight = sheetBounds.right + gap + width <= viewportWidth - 8;
  const left = fitsRight
    ? sheetBounds.right + gap
    : Math.max(8, sheetBounds.left - width - gap);
  const top = Math.max(8, Math.min(sheetBounds.top, viewportHeight - 420));

  dialog.setPosition({ left, top, width });
}

/**
 * Prompts the universal Action Roll dialog. Follows the same DialogV2-preferred / classic-Dialog
 * fallback dual-path pattern already established by `promptGuidedResolution` and `promptDialog`.
 * Resolves to `{ confirmed: false }` on cancel, or `{ confirmed: true, request }` on Roll.
 */
export async function promptActionRollDialog(request) {
  const DialogClass = getDialogClass();
  if (!DialogClass) {
    // No Dialog API available (e.g. headless/test environment) - proceed with current defaults,
    // matching this codebase's established "bypass when unavailable" convention.
    return { confirmed: true, request };
  }

  const title = localize("MARVEL_MULTIVERSE.ActionRoll.DialogTitle", "Configure Roll");
  const content = buildActionRollDialogContent(request);
  const cancelLabel = localize("MARVEL_MULTIVERSE.ActionRoll.Cancel", "Cancel");
  const rollLabel = localize("MARVEL_MULTIVERSE.ActionRoll.RollButton", "Roll");

  if (typeof DialogClass.wait === "function") {
    const result = await DialogClass.wait({
      window: { title },
      position: { width: 320 },
      content,
      rejectClose: false,
      render: (_event, dialog) => positionActionRollDialog(dialog, request),
      buttons: [
        { action: "cancel", label: cancelLabel, callback: () => ({ confirmed: false }) },
        {
          action: "roll",
          label: rollLabel,
          default: true,
          callback: (_event, button) => ({ confirmed: true, request: parseActionRollForm(button?.form, request) }),
        },
      ],
    });
    return result ?? { confirmed: false };
  }

  return new Promise((resolve) => {
    const dialog = new DialogClass({
      title,
      content,
      buttons: {
        cancel: { label: cancelLabel, callback: () => resolve({ confirmed: false }) },
        roll: {
          label: rollLabel,
          callback: (html) => resolve({ confirmed: true, request: parseActionRollForm(html, request) }),
        },
      },
      default: "roll",
      close: () => resolve({ confirmed: false }),
    });
    dialog.render(true);
  });
}

function buildActionRollFormula(request) {
  const base = "{1d6,1dm,1d6}";
  const modifier = Number(request.totalModifier) || 0;
  if (modifier === 0) return base;
  return modifier > 0 ? `${base} + ${modifier}` : `${base} - ${Math.abs(modifier)}`;
}

/**
 * Builds and evaluates the roll for a confirmed request, then determines its normalized outcome
 * by reusing the same `resolveCheckOutcome` logic already used for Narrator-adjudicated checks.
 * The M face contributes 6 to the total; meeting the Target Number is a Fantastic Success and
 * missing it is a Fantastic Failure. Without a Target Number, the check remains unresolved.
 */
export async function resolveActionRoll(request) {
  const RollClass = globalThis.CONFIG?.Dice?.MarvelMultiverseRoll;
  if (typeof RollClass !== "function") {
    throw new Error("Marvel Multiverse | Action roll: CONFIG.Dice.MarvelMultiverseRoll is unavailable.");
  }

  const formula = buildActionRollFormula(request);
  const rollData = request.actor?.getRollData?.() ?? {};
  const edgeModeValue = request.edgeModeValue ?? computeEdgeModeValue(request.edge, request.trouble);
  const roll = new RollClass(formula, rollData, {
    edgeMode: edgeModeValue,
    edgeCount: request.edge,
    troubleCount: request.trouble,
    actionType: request.actionType,
    cardPresentation: request.actionType === "initiative" ? "compact" : null,
  });
  if (!roll._evaluated) await roll.evaluate({});

  const total = typeof roll.total === "number" ? roll.total : null;
  const isFantastic = Boolean(roll.isFantastic);
  const marvelDie = roll.dice?.[1]?.result ?? null;
  let outcome = resolveCheckOutcome({ rollTotal: total, isFantastic, difficulty: request.targetNumber });
  const targetResults = Array.isArray(request.targets) && request.targets.length > 1
    ? request.targets.map((target) => {
      const defenseValue = Number(target?.defenseValue);
      const evaluable = Number.isFinite(total) && Number.isFinite(defenseValue);
      const isSuccess = evaluable && total >= defenseValue;
      return {
        tokenUuid: target?.tokenUuid ?? null,
        actorUuid: target?.actorUuid ?? null,
        name: target?.name ?? null,
        defenseType: target?.defenseType ?? null,
        defenseValue: evaluable ? defenseValue : null,
        outcome: !evaluable ? "unresolved" : isSuccess ? (isFantastic ? "fantastic-success" : "success") : "failure",
        isSuccess,
        isFantastic: isSuccess && isFantastic,
      };
    })
    : [];
  if (targetResults.length) {
    const anySuccess = targetResults.some((target) => target.isSuccess);
    const allResolved = targetResults.every((target) => target.outcome !== "unresolved");
    outcome = anySuccess
      ? (isFantastic ? "fantastic-success" : "success")
      : allResolved ? "failure" : "unresolved";
  }

  const result = {
    dice: Array.isArray(roll.dice) ? roll.dice : [],
    marvelDie,
    modifier: request.totalModifier,
    total,
    targetNumber: request.targetNumber ?? null,
    edge: request.edge,
    trouble: request.trouble,
    outcome,
    isSuccess: outcome === "success" || outcome === "fantastic-success",
    isFantastic,
    targetResults,
  };

  return { roll, result };
}

function resolveOutcomeLabel(outcome) {
  const labels = {
    success: ["MARVEL_MULTIVERSE.CheckOutcome.Success", "Success"],
    failure: ["MARVEL_MULTIVERSE.CheckOutcome.Failure", "Failure"],
    "fantastic-success": ["MARVEL_MULTIVERSE.CheckOutcome.FantasticSuccess", "Fantastic Success"],
    "fantastic-failure": ["MARVEL_MULTIVERSE.CheckOutcome.FantasticFailure", "Fantastic Failure"],
    unresolved: ["MARVEL_MULTIVERSE.AttackOutcome.Unresolved", "Unresolved"],
  };
  const [key, fallback] = labels[outcome] ?? labels.unresolved;
  return localize(key, fallback);
}

function resolveOutcomeTone(outcome) {
  if (outcome === "fantastic-success") return "fantastic";
  if (outcome === "success") return "success";
  if (outcome === "failure" || outcome === "fantastic-failure") return "failure";
  return "pending";
}

function formatSigned(value) {
  const number = Number(value) || 0;
  return number >= 0 ? `+${number}` : `${number}`;
}

function resolveResourceLabel(damageType) {
  return damageType === "focus"
    ? localize("MARVEL_MULTIVERSE.ActionRoll.FocusLabel", "Focus")
    : localize("MARVEL_MULTIVERSE.ActionRoll.HealthLabel", "Health");
}

/**
 * Builds the Damage/Health (or Focus) portion of the chat flavor, if any:
 * - Non-damaging actions (`damageResolution` disabled/absent) render nothing.
 * - A miss/failure on a damaging action renders a plain "No damage." line - never a damage number,
 *   per the "Do not display misleading damage values when the attack failed" requirement.
 * - A hit that was applied immediately renders "Damage: N" plus "{target}\nHealth: before → after".
 * - A hit that could not be applied yet (e.g. pending a GM relay) still reports the damage total
 *   but flags it as not yet applied, rather than silently reporting a Health change that hasn't
 *   happened.
 */
function buildDamageFlavor(request, result, damageResolution, applyResult) {
  if (!damageResolution?.enabled) return "";
  if (damageResolution.multiTarget) {
    const entries = damageResolution.targets.map((target) => {
      const outcome = resolveOutcomeLabel(target.outcome);
      const damage = target.damage?.hit
        ? ` - ${localize("MARVEL_MULTIVERSE.ActionRoll.Damage", "Damage")}: ${target.damage.finalDamage}`
        : "";
      return `<li><strong>${escapeHtml(target.name)}</strong>: ${outcome}${damage}</li>`;
    }).join("");
    return `<div class="action-roll-multi-damage"><ul>${entries}</ul></div>`;
  }
  if (!result.isSuccess) {
    return `<p class="action-roll-no-damage">${localize("MARVEL_MULTIVERSE.ActionRoll.NoDamage", "No damage.")}</p>`;
  }
  if (!damageResolution.hit) return "";

  const resourceLabel = resolveResourceLabel(damageResolution.damageType);
  const damageLine = `<p class="action-roll-damage">${localize("MARVEL_MULTIVERSE.ActionRoll.Damage", "Damage")}: ${damageResolution.finalDamage}</p>`;

  if (applyResult?.success) {
    const targetName = request.target?.name ?? "";
    return `${damageLine}
      <p class="action-roll-resource-change"><strong>${escapeHtml(targetName)}</strong><br />${resourceLabel}: ${applyResult.previousValue} &rarr; ${applyResult.newValue}</p>`;
  }

  const pendingMessage = applyResult?.reason === "permission-denied"
    ? localize("MARVEL_MULTIVERSE.ActionRoll.DamagePendingGM", "Awaiting GM to apply this damage.")
    : localize("MARVEL_MULTIVERSE.ActionRoll.DamageNotApplied", "Damage could not be applied automatically.");
  return `${damageLine}
    <p class="notification warning action-roll-damage-pending">${pendingMessage}</p>`;
}

/**
 * Builds the compact chat-message flavor block for the resolved action roll (action name,
 * ability check line, target line, roll/target-number line, outcome banner, damage/health lines,
 * and a diagnostics line breaking down base/situational modifiers and Edge/Trouble). Reuses the
 * existing `.difficulty-banner` tone-colored classes for the outcome banner. `damageResolution`/
 * `applyResult` are optional - omitted entirely for non-damaging actions.
 */
export function buildActionRollFlavor(request, result, damageResolution = null, applyResult = null) {
  const tone = resolveOutcomeTone(result.outcome);
  const outcomeLabel = resolveOutcomeLabel(result.outcome);
  const abilityLine = `${request.abilityLabel ?? request.ability} ${localize("MARVEL_MULTIVERSE.ActionRoll.CheckSuffix", "Check")}`;
  const targetLine = result.targetResults?.length
    ? `<p class="action-roll-target">${localize("MARVEL_MULTIVERSE.ActionRoll.Targets", "Targets")}: ${result.targetResults.length}</p>`
    : request.target?.name
    ? `<p class="action-roll-target">${localize("MARVEL_MULTIVERSE.ActionRoll.Target", "Target")}: ${escapeHtml(request.target.name)}</p>`
    : "";
  const defenseLine = !result.targetResults?.length && request.target?.defenseLabel && request.target.defenseValue !== null
    ? `<p class="action-roll-defense">${localize("MARVEL_MULTIVERSE.ActionRoll.Defense", "Defense")}: ${escapeHtml(request.target.defenseLabel)} ${request.target.defenseValue}</p>`
    : "";
  const numbersLine = result.targetResults?.length
    ? `<p class="action-roll-numbers">${localize("MARVEL_MULTIVERSE.ActionRoll.Roll", "Roll")}: ${result.total}</p>`
    : result.targetNumber !== null && result.targetNumber !== undefined
    ? `<p class="action-roll-numbers">${localize("MARVEL_MULTIVERSE.ActionRoll.Roll", "Roll")}: ${result.total} / ${localize("MARVEL_MULTIVERSE.ActionRoll.TargetNumber", "Target Number")}: ${result.targetNumber}</p>`
    : `<p class="action-roll-numbers">${localize("MARVEL_MULTIVERSE.ActionRoll.Roll", "Roll")}: ${result.total}</p>`;
  const damageSection = buildDamageFlavor(request, result, damageResolution, applyResult);

  return `
    <div class="marvel-multiverse action-roll-card">
      <h3 class="action-roll-title">${escapeHtml(request.actionName)}</h3>
      <p class="action-roll-subtitle">${escapeHtml(abilityLine)}</p>
      ${targetLine}
      ${defenseLine}
      ${numbersLine}
      <div class="difficulty-banner is-${tone}">
        <span class="difficulty-banner__text">${outcomeLabel}</span>
      </div>
      ${damageSection}
      <p class="action-roll-diagnostics">${localize("MARVEL_MULTIVERSE.ActionRoll.BaseModifier", "Base Modifier")}: ${formatSigned(request.baseModifier)}
        &middot; ${localize("MARVEL_MULTIVERSE.ActionRoll.SituationalModifier", "Situational Modifier")}: ${formatSigned(request.situationalModifier)}
        &middot; ${localize("MARVEL_MULTIVERSE.ActionRoll.Edge", "Edge")}: ${request.edge}
        &middot; ${localize("MARVEL_MULTIVERSE.ActionRoll.Trouble", "Trouble")}: ${request.trouble}</p>
    </div>`;
}

/**
 * Summarizes a resolved request into the normalized Roll Context shape stored on the chat
 * message's `actionRoll` flag - extends the existing flat fields (kept for backward
 * compatibility) with a nested `target` object (`tokenUuid`/`actorUuid`/`name`/`defenseType`/
 * `defenseValue`) matching the Universal Action Roll Dialog's roll-context schema. The target
 * Actor document itself is never stored here - only its uuid - per the "no long-term mutable
 * roller state" design requirement.
 */
function summarizeRequest(request) {
  return {
    actionName: request.actionName,
    actionType: request.actionType,
    sourceType: request.sourceType,
    ability: request.ability,
    baseModifier: request.baseModifier,
    situationalModifier: request.situationalModifier,
    totalModifier: request.totalModifier,
    targeting: request.targeting ?? null,
    target: request.target
      ? {
        tokenUuid: request.target.tokenUuid ?? null,
        actorUuid: request.target.actorUuid ?? null,
        name: request.target.name ?? null,
        defenseType: request.target.defenseType ?? null,
        defenseValue: request.target.defenseValue ?? null,
      }
      : null,
    targets: Array.isArray(request.targets)
      ? request.targets.map((target) => ({
        tokenUuid: target?.tokenUuid ?? null,
        actorUuid: target?.actorUuid ?? null,
        name: target?.name ?? null,
        defenseType: target?.defenseType ?? null,
        defenseValue: target?.defenseValue ?? null,
      }))
      : [],
    targetUuid: request.target?.tokenUuid ?? null,
    targetName: request.target?.name ?? null,
    targetNumber: request.targetNumber ?? null,
    edge: request.edge,
    trouble: request.trouble,
    effectProfile: request.effectProfile ?? null,
    effectProfiles: request.effectProfiles ?? {},
  };
}

/**
 * The universal Action Roll entry point. Prompts the configuration dialog, executes the roll,
 * determines the normalized outcome, resolves and applies automatic Health/Focus damage for a
 * successful damaging action (see `lib/services/damage-resolver.mjs` - never re-derives hit/miss),
 * and posts a ChatMessage (via the existing `roll.toMessage()` pipeline, so rollContext/attack-
 * resolution/damage-context automation keeps working unchanged for attack-type actions, running
 * independently in parallel). Conditions remain part of the separate resolution workflow.
 */
export async function requestRoll(options = {}) {
  try {
    const actor = options.actor ?? null;
    if (!actor) {
      console.warn("Marvel Multiverse | Action roll: no actor supplied, aborting.");
      globalThis.ui?.notifications?.warn?.(
        localize("MARVEL_MULTIVERSE.ActionRoll.ActorMissing", "Select or own an actor before rolling.")
      );
      return { cancelled: true, error: "actor-missing", request: null, roll: null, result: null, message: null };
    }

    let resolvedOptions = options;
    const areaPlacement = await placePowerArea(options.source ?? options.item, {
      sourceToken: resolveSourceEffectToken({ token: options.token, actor }),
    });
    if (areaPlacement.configured) {
      if (areaPlacement.cancelled) {
        return { cancelled: true, error: areaPlacement.error ?? "area-placement-cancelled", request: null, roll: null, result: null, message: null };
      }
      resolvedOptions = { ...options, targets: areaPlacement.targets };
    }

    const request = buildActionRollRequest(resolvedOptions);

    // Target validation is a first-class part of this workflow (not left to individual call
    // sites): a required target that's missing, or more targets than the action supports, blocks
    // the roll entirely with a friendly, actionable message - the dialog never opens.
    if (request.targeting.required && !request.target) {
      const reason = request.targetHasNoActor ? "target-has-no-actor" : "target-required";
      const message = request.targetHasNoActor
        ? localize("MARVEL_MULTIVERSE.ActionRoll.TargetHasNoActor", "The selected target has no character data and cannot be used.")
        : localizeFormat(
          "MARVEL_MULTIVERSE.ActionRoll.TargetRequiredFor",
          { action: request.actionName },
          "{action} requires a target. Target a token and try again.",
        );
      console.warn(`Marvel Multiverse | Action roll: "${request.actionName}" requires a target but none is available (${reason}).`);
      globalThis.ui?.notifications?.warn?.(message);
      return { cancelled: true, error: reason, request, roll: null, result: null, message: null };
    }

    const promptResult = await promptActionRollDialog(request);
    if (!promptResult?.confirmed) {
      return { cancelled: true, request, roll: null, result: null, message: null };
    }
    const finalRequest = promptResult.request ?? request;

    const resourcePreflight = validateActionResourcePreflight(finalRequest);
    if (!resourcePreflight.success) {
      console.warn(`Marvel Multiverse | Action roll: resource preflight failed for "${finalRequest.actionName}" (${resourcePreflight.reason}).`);
      globalThis.ui?.notifications?.warn?.(
        resourcePreflight.reason === "insufficient-focus"
          ? `Not enough Focus for ${finalRequest.actionName}.`
          : `Focus could not be validated for ${finalRequest.actionName}.`
      );
      return { cancelled: true, error: resourcePreflight.reason, request: finalRequest, roll: null, result: null, message: null };
    }

    let focusSpend = null;
    if (resourcePreflight.requiredFocus > 0) {
      focusSpend = await spendActorFocus(finalRequest.actor, resourcePreflight.requiredFocus);
      if (!focusSpend.success) {
        globalThis.ui?.notifications?.warn?.(focusSpend.issues?.[0]?.message ?? `Focus could not be spent for ${finalRequest.actionName}.`);
        return { cancelled: true, error: "focus-spend-failed", request: finalRequest, roll: null, result: null, message: null };
      }
    }

    const sourceToken = resolveSourceEffectToken(finalRequest);
    const effectTargets = finalRequest.allTargets.map(resolveEffectToken).filter(Boolean);
    const effectSession = createEffectProfileSession({
      effectProfile: finalRequest.effectProfile,
      effectProfiles: finalRequest.effectProfiles,
    }, {
      actor: finalRequest.actor,
      source: finalRequest.source,
      sourceToken,
      targets: effectTargets,
      rollContext: finalRequest,
    }, {
      library: options.effectLibrary,
      enabled: options.effectsEnabled,
    });

    await effectSession.playPhase("activation");
    if (finalRequest.sourceType === "power") await effectSession.playPhase("cast");
    await effectSession.playPhase("movement");
    if (finalRequest.isAttack) await effectSession.playPhase("attack");

    let roll;
    let result;
    try {
      ({ roll, result } = await resolveActionRoll(finalRequest));
    } catch (error) {
      if (focusSpend?.success && typeof finalRequest.actor?.update === "function") {
        await finalRequest.actor.update({ system: { focus: { value: focusSpend.previousValue } } });
      }
      console.error("Marvel Multiverse | Action roll: roll evaluation failed.", error);
      globalThis.ui?.notifications?.error?.(
        localize("MARVEL_MULTIVERSE.ActionRoll.RollFailed", "The roll could not be completed.")
      );
      return { cancelled: true, error: "roll-failed", request: finalRequest, roll: null, result: null, message: null };
    }

    // Initiative and similar Foundry workflows own message creation and document updates. They
    // still use this service for the mandatory configuration dialog and evaluated roll.
    if (options.postMessage === false) {
      return { cancelled: false, request: finalRequest, roll, result, message: null };
    }

    // Damage resolution: pure calculation only, trusting `result.isSuccess` as-is (see
    // resolveDamage's own docs for why it never re-derives hit/miss). Non-damaging actions get
    // `damageResolution.enabled === false` and are never touched further below.
    const damageConfig = resolveDamageConfig(finalRequest.source, finalRequest);
    const targetActor = finalRequest.target?.actor ?? null;
    const isMultiTarget = result.targetResults.length > 1;
    const damageResolution = isMultiTarget
      ? {
        version: 1,
        enabled: damageConfig.enabled,
        multiTarget: true,
        hit: result.targetResults.some((target) => target.isSuccess),
        targets: result.targetResults.map((targetResult, index) => ({
          ...targetResult,
          damage: resolveDamage({
            attacker: finalRequest.actor,
            target: finalRequest.targets[index]?.actor ?? null,
            source: finalRequest.source,
            rollContext: finalRequest,
            rollResult: { ...result, isSuccess: targetResult.isSuccess },
            config: damageConfig,
          }),
        })),
      }
      : resolveDamage({
        attacker: finalRequest.actor,
        target: targetActor,
        source: finalRequest.source,
        rollContext: finalRequest,
        rollResult: result,
        config: damageConfig,
      });

    await playActionOutcomeEffects(effectSession, finalRequest, result, damageResolution);

    // The user has already confirmed by pressing Roll - apply immediately on a hit rather than
    // requiring a second confirmation dialog. If the current user lacks permission to mutate the
    // target Actor, this reports `permission-denied` here and a GM-relay attempt is made below
    // once the message (and its audit flag) exists.
    let applyResult = null;
    if (!isMultiTarget && damageResolution.hit) {
      applyResult = await applyResolvedDamage(targetActor, damageResolution, { user: globalThis.game?.user });
    } else if (damageResolution.enabled && result.isSuccess && damageResolution.reason && damageResolution.reason !== "no-hit") {
      // A hit that couldn't be turned into a damage number (missing target, unrecognized ability,
      // missing Marvel die, etc.) - surfaced for diagnosis, but never allowed to silently corrupt
      // Actor Health: no update is attempted and the chat card simply omits the damage lines.
      console.warn(`Marvel Multiverse | Action roll: damage could not be resolved for "${finalRequest.actionName}" (${damageResolution.reason}).`, damageResolution.issues);
    }

    const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor: finalRequest.actor }) ?? {};
    const rollMode = globalThis.game?.settings?.get?.("core", "rollMode") ?? "publicroll";
    const flavor = buildActionRollFlavor(finalRequest, result, damageResolution, applyResult);

    const message = await roll.toMessage(
      { speaker, flavor, title: finalRequest.actionName },
      {
        rollMode,
        itemId: finalRequest.source?._id ?? finalRequest.source?.id,
        actor: finalRequest.actor,
        token: finalRequest.token,
        item: finalRequest.source,
        rollType: finalRequest.isAttack ? "attack" : "ability",
        targets: finalRequest.allTargets,
        userId: globalThis.game?.user?.id,
        dealsDamage: finalRequest.dealsDamage,
      },
    );

    if (message) {
      await updateChatMessageFlags(message, {
        "marvel-multiverse": {
          actionRoll: { version: 1, request: summarizeRequest(finalRequest), result },
          actionFocus: focusSpend?.success
            ? {
              version: 1,
              actorUuid: finalRequest.actor?.uuid ?? null,
              amount: resourcePreflight.requiredFocus,
              previousValue: focusSpend.previousValue,
              newValue: focusSpend.newValue,
            }
            : null,
          effectsPlayed: effectSession.getPlayedMetadata(),
          // Audit trail for the damage resolution/application step - kept independent of the
          // actionRoll flag so a future undo/reapply tool can key off it directly. Stores uuids
          // (never live document references) plus the full damage breakdown and the Health/Focus
          // value observed immediately before and after the update, per the "preserve roll audit
          // data" requirement. Undo itself is intentionally not implemented yet.
          actionDamage: damageResolution.enabled && !isMultiTarget
            ? {
              version: 1,
              attackerUuid: finalRequest.actor?.uuid ?? null,
              targetUuid: targetActor?.uuid ?? null,
              sourceUuid: finalRequest.source?.uuid ?? null,
              damage: damageResolution,
              apply: applyResult,
            }
            : null,
        },
      });

      // If the roll dealt damage but the current user couldn't apply it directly (they don't own
      // the target Actor), relay the already-resolved damage to a GM client via the existing
      // socketlib pattern instead of leaving it unapplied or attempting an insecure client-side
      // write. `applyActionRollDamageRpc` re-reads the same audit flag we just stored, so nothing
      // is recalculated - only the Health/Focus update itself runs on the GM's client.
      if (damageResolution.hit && applyResult?.success !== true && applyResult?.reason === "permission-denied") {
        const relayResult = await requestAutoApplyActionDamage(message.id);
        if (!relayResult?.success) {
          console.warn(`Marvel Multiverse | Action roll: automatic damage application is pending a GM (${relayResult?.reason ?? "unknown"}).`);
        }
      }

      if (isMultiTarget && damageResolution.enabled && damageResolution.hit) {
        applyResult = await requestAutoApplyDamage(message.id);
        if (!applyResult?.success && applyResult?.reason !== "already-applied") {
          console.warn(`Marvel Multiverse | Action roll: multi-target damage application is pending a GM (${applyResult?.reason ?? "unknown"}).`);
        }
      }
    }

    return { cancelled: false, request: finalRequest, roll, result, message, damage: damageResolution, damageApply: applyResult };
  } catch (error) {
    console.error("Marvel Multiverse | Action roll: unexpected failure.", error);
    globalThis.ui?.notifications?.error?.(
      localize("MARVEL_MULTIVERSE.ActionRoll.UnexpectedError", "Something went wrong configuring this roll.")
    );
    return { cancelled: true, error: "unexpected", request: null, roll: null, result: null, message: null };
  }
}
