import { updateChatMessageFlags } from "../chat-message-state.mjs";
import { getRollContext } from "../roll-context.mjs";
import { getAttackResolution } from "../attack-resolution.mjs";
import { getDamageContext } from "../damage-calculation.mjs";
import { getDamageApplications } from "../damage-application.mjs";
import { getFocusTransactions } from "../focus-automation.mjs";
import { resolveFocusScaling } from "../focus-scaling.mjs";
import { validateActiveEffect } from "../validation.mjs";
import { normalizeConditionKey } from "../conditions.mjs";
import { canMutateMessage } from "./mutation-preflight.mjs";

const POWER_EVENTS_VERSION = 1;
const MAX_EVENT_DEPTH = 10;

// Triggers that can be reliably emitted from the current workflow.
const ACTIVE_TRIGGERS = new Set([
  "action-declared",
  "before-roll",
  "after-roll",
  "source-success",
  "source-failure",
  "source-fantastic-success",
  "target-hit",
  "target-miss",
  "target-fantastic-hit",
  "damage-calculated",
  "damage-applied",
  "focus-damage-applied",
  "health-damage-applied",
  "source-effect-applied",
  "target-effect-applied",
  "escape-succeeded",
  "escape-failed",
  "concentration-started",
  "concentration-ended",
  // Schema-valid and matchable, but only ever actually emitted when the GM turns on the
  // "enableTurnBasedTriggers" world setting (see sweepTurnBoundaryTriggers below) - unlike the
  // rest of this set, "whose turn triggers whom" across arbitrary stored messages isn't an
  // officially confirmed procedure, so it stays opt-in.
  "start-of-source-turn",
  "end-of-source-turn",
  "start-of-target-turn",
  "end-of-target-turn",
]);

// Triggers that are recognized, schema-valid names, but not yet wired to a reliable emission point.
const RESERVED_TRIGGERS = new Set([
  "target-check-success",
  "target-check-failure",
  "target-check-fantastic-success",
  "opposed-check-won",
  "opposed-check-lost",
  "effect-removed",
]);

const TRIGGER_ALIASES = Object.freeze({
  onHit: "target-hit",
  onMiss: "target-miss",
  onFantastic: "target-fantastic-hit",
  onSuccess: "source-success",
  onFailure: "source-failure",
  onSaveSuccess: "target-check-success",
  onSaveFailure: "target-check-failure",
});

const RECIPIENT_TYPES = new Set([
  "source",
  "target",
  "all-hit-targets",
  "all-failed-targets",
  "all-fantastic-targets",
  "selected-target",
  "self-and-target",
]);

const OUTCOME_TYPES = new Set([
  "status",
  "active-effect",
  "damage",
  "healing",
  "resource-change",
  "forced-movement",
  "resize",
  "play-effect",
  "follow-up-check",
  "escape-check",
  "concentration",
  "remove-status",
  "remove-effect",
  "chat-note",
  "manual",
]);

// Outcome types this engine can safely execute today, with no config gate. "manual" is
// intentionally excluded: it must always surface as a distinct "Manual Special Event" needing
// GM attention, never silently marked as successfully applied.
const AUTOMATED_OUTCOME_TYPES = new Set([
  "status",
  "active-effect",
  "remove-status",
  "remove-effect",
  "chat-note",
  "concentration",
]);

// Outcome types with no confirmed official ruling backing them (unlike the ones above, which are
// direct data/status mutations already covered elsewhere in the rules). Only automated when the
// GM explicitly opts in via the "enableExperimentalPowerOutcomes" world setting.
const EXPERIMENTAL_OUTCOME_TYPES = new Set([
  "damage",
  "healing",
  "resource-change",
  "forced-movement",
  "resize",
]);

// Purely cosmetic outcome types (no rules impact at all) gated behind their own setting since
// they depend on an optional third-party module (Sequencer, used to play JB2A-style animations).
const EFFECT_PLAYBACK_OUTCOME_TYPES = new Set(["play-effect"]);

function isOutcomeTypeAutomated(type) {
  if (AUTOMATED_OUTCOME_TYPES.has(type)) return true;
  if (EXPERIMENTAL_OUTCOME_TYPES.has(type)) {
    return Boolean(globalThis.game?.settings?.get?.("marvel-multiverse", "enableExperimentalPowerOutcomes"));
  }
  if (EFFECT_PLAYBACK_OUTCOME_TYPES.has(type)) {
    return Boolean(globalThis.game?.settings?.get?.("marvel-multiverse", "enableSequencerEffects"));
  }
  return false;
}

const STATUS_MODES = new Set(["apply", "remove", "toggle"]);
const STACKING_MODES = new Set(["none", "refresh-duration", "stack-value", "replace", "allow-duplicate"]);

const DURATION_TYPES = new Set([
  "manual",
  "permanent",
  "end-of-source-turn",
  "end-of-source-next-turn",
  "end-of-target-turn",
  "end-of-target-next-turn",
  "start-of-source-turn",
  "start-of-target-turn",
  "rounds",
  "concentration",
  "until-escape",
  "until-check-success",
  "while-source-active",
  "power-specific",
]);

const REQUIREMENT_TYPES = new Set([
  "target-hit",
  "target-fantastic-hit",
  "source-fantastic-success",
  "damage-type",
  "damage-dealt",
  "minimum-damage",
  "target-has-status",
  "target-lacks-status",
  "source-has-status",
  "source-lacks-status",
  "focus-damage-applied",
  "health-damage-applied",
  "concentration-active",
  "power-option-selected",
]);

const ABILITY_KEYS = new Set(["mle", "agl", "res", "vig", "ego", "log"]);

function createIssue(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getMessageRollContext(message) {
  const context = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext")
    : null;
  return context ?? getRollContext(message) ?? null;
}

function resolveActorFromUuid(uuid) {
  if (typeof uuid !== "string" || !uuid.trim()) return null;
  if (typeof globalThis.fromUuidSync !== "function") return null;
  const resolved = globalThis.fromUuidSync(uuid);
  if (!resolved) return null;
  if (resolved.documentName === "Actor") return resolved;
  if (resolved.documentName === "Token") return resolved.actor ?? null;
  return null;
}

/* ------------------------------------------ */
/* Trigger normalization                       */
/* ------------------------------------------ */

export function normalizeTrigger(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (ACTIVE_TRIGGERS.has(trimmed) || RESERVED_TRIGGERS.has(trimmed)) return trimmed;
  const aliased = TRIGGER_ALIASES[trimmed];
  return aliased ?? null;
}

/* ------------------------------------------ */
/* Event schema validation                     */
/* ------------------------------------------ */

export function getPowerEvents(item) {
  const events = item?.system?.events ?? item?.events ?? [];
  return Array.isArray(events) ? events : [];
}

function validateDuration(duration, path, issues) {
  if (duration === undefined || duration === null) return;
  if (!isPlainObject(duration) || typeof duration.type !== "string") {
    issues.push(createIssue("error", "EVENT_DURATION_INVALID", "Duration must be an object with a valid type.", { path, value: duration }));
    return;
  }
  if (!DURATION_TYPES.has(duration.type)) {
    issues.push(createIssue("error", "EVENT_DURATION_INVALID", `Unsupported duration type: ${duration.type}`, { path, value: duration.type }));
  }
  if (duration.type === "rounds" && (typeof duration.value !== "number" || !Number.isFinite(duration.value) || duration.value <= 0)) {
    issues.push(createIssue("error", "EVENT_DURATION_INVALID", "Rounds duration requires a positive numeric value.", { path, value: duration.value }));
  }
}

function validateOutcome(outcome, path, issues, seenOutcomeIds) {
  if (!isPlainObject(outcome)) {
    issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", "Outcome must be an object.", { path, value: outcome }));
    return;
  }
  if (!OUTCOME_TYPES.has(outcome.type)) {
    issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", `Unsupported outcome type: ${outcome.type}`, { path, value: outcome.type }));
    return;
  }
  if (outcome.id) {
    if (seenOutcomeIds.has(outcome.id)) {
      issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", `Duplicate outcome id: ${outcome.id}`, { path, value: outcome.id }));
    }
    seenOutcomeIds.add(outcome.id);
  }

  if (outcome.stacking !== undefined && !STACKING_MODES.has(outcome.stacking)) {
    issues.push(createIssue("error", "EVENT_STACKING_INVALID", `Unsupported stacking mode: ${outcome.stacking}`, { path: `${path}.stacking`, value: outcome.stacking }));
  }

  if (outcome.type === "status") {
    if (typeof outcome.statusId !== "string" || !outcome.statusId.trim()) {
      issues.push(createIssue("error", "EVENT_STATUS_INVALID", "Status outcome requires a statusId.", { path: `${path}.statusId`, value: outcome.statusId }));
    }
    const mode = outcome.mode ?? "apply";
    if (!STATUS_MODES.has(mode)) {
      issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", `Unsupported status mode: ${mode}`, { path: `${path}.mode`, value: mode }));
    }
    if (mode === "toggle") {
      issues.push(createIssue("warning", "EVENT_STATUS_TOGGLE_DISCOURAGED", "Avoid 'toggle' for automated status outcomes; prefer 'apply' or 'remove'.", { path: `${path}.mode`, value: mode }));
    }
    validateDuration(outcome.duration, `${path}.duration`, issues);
  }

  if (outcome.type === "remove-status" && (typeof outcome.statusId !== "string" || !outcome.statusId.trim())) {
    issues.push(createIssue("error", "EVENT_STATUS_INVALID", "remove-status outcome requires a statusId.", { path: `${path}.statusId`, value: outcome.statusId }));
  }

  if (outcome.type === "active-effect") {
    const effect = outcome.effect;
    if (!isPlainObject(effect)) {
      issues.push(createIssue("error", "EVENT_EFFECT_PATH_INVALID", "active-effect outcome requires an effect object.", { path: `${path}.effect`, value: effect }));
    } else {
      const effectValidation = validateActiveEffect(effect, { documentType: "PowerEvent" });
      for (const error of effectValidation.errors) {
        issues.push(createIssue("error", "EVENT_EFFECT_PATH_INVALID", error.message, { path: `${path}.effect`, value: error.value }));
      }
      for (const warning of effectValidation.warnings) {
        issues.push(createIssue("warning", "EVENT_EFFECT_PATH_INVALID", warning.message, { path: `${path}.effect`, value: warning.value }));
      }
      if (effect.transfer === true) {
        issues.push(createIssue("error", "EVENT_RECIPIENT_MISMATCH", "Power event Active Effects must never use transfer:true (would leak target effects onto the source).", { path: `${path}.effect.transfer`, value: true }));
      }
    }
    validateDuration(outcome.duration, `${path}.duration`, issues);
  }

  if (outcome.type === "follow-up-check") {
    if (typeof outcome.ability === "string" && !ABILITY_KEYS.has(outcome.ability) && outcome.roller !== "opposed") {
      issues.push(createIssue("error", "EVENT_REQUIREMENT_INVALID", `Unknown ability key: ${outcome.ability}`, { path: `${path}.ability`, value: outcome.ability }));
    }
  }

  if ((outcome.type === "damage" || outcome.type === "healing") && typeof outcome.amount !== "number" && typeof outcome.formula !== "string") {
    issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", `${outcome.type} outcome requires a numeric amount or a formula string.`, { path: `${path}`, value: outcome }));
  }

  if (outcome.type === "resource-change") {
    if (!["health", "focus", "karma"].includes(outcome.resource)) {
      issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", "resource-change outcome requires resource: health, focus, or karma.", { path: `${path}.resource`, value: outcome.resource }));
    }
    if (typeof outcome.delta !== "number") {
      issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", "resource-change outcome requires a numeric delta.", { path: `${path}.delta`, value: outcome.delta }));
    }
  }

  if (outcome.type === "forced-movement") {
    const hasRelative = typeof outcome.dx === "number" || typeof outcome.dy === "number";
    const hasAbsolute = typeof outcome.toX === "number" || typeof outcome.toY === "number";
    if (!hasRelative && !hasAbsolute) {
      issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", "forced-movement outcome requires dx/dy (grid squares) or toX/toY (absolute pixels).", { path, value: outcome }));
    }
  }

  if (outcome.type === "resize" && (typeof outcome.scale !== "number" || !Number.isFinite(outcome.scale) || outcome.scale <= 0)) {
    issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", "resize outcome requires a positive numeric scale.", { path: `${path}.scale`, value: outcome.scale }));
  }

  if (outcome.type === "play-effect" && (typeof outcome.sequencerFile !== "string" || !outcome.sequencerFile.trim())) {
    issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", "play-effect outcome requires a sequencerFile path (e.g. a JB2A asset path).", { path: `${path}.sequencerFile`, value: outcome.sequencerFile }));
  }

  if (outcome.type === "manual" && (typeof outcome.label !== "string" || !outcome.label.trim())) {
    issues.push(createIssue("warning", "EVENT_OUTCOME_INVALID", "Manual outcomes should include a label describing what to resolve.", { path: `${path}.label`, value: outcome.label }));
  }
}

function validateRequirement(requirement, path, issues) {
  if (!isPlainObject(requirement) || !REQUIREMENT_TYPES.has(requirement.type)) {
    issues.push(createIssue("error", "EVENT_REQUIREMENT_INVALID", `Unsupported requirement type: ${requirement?.type}`, { path, value: requirement?.type }));
    return;
  }
  if (requirement.type === "damage-type" && requirement.value !== "health" && requirement.value !== "focus") {
    issues.push(createIssue("error", "EVENT_REQUIREMENT_INVALID", `Unsupported damage type: ${requirement.value}`, { path: `${path}.value`, value: requirement.value }));
  }
}

export function validatePowerEvents(events, options = {}) {
  const issues = [];
  const list = Array.isArray(events) ? events : [];
  const seenEventIds = new Set();
  const seenOutcomeIds = new Set();

  list.forEach((event, index) => {
    const path = `events[${index}]`;
    if (!isPlainObject(event)) {
      issues.push(createIssue("error", "EVENT_TRIGGER_INVALID", "Event must be an object.", { path, value: event }));
      return;
    }
    if (typeof event.id !== "string" || !event.id.trim()) {
      issues.push(createIssue("error", "EVENT_TRIGGER_INVALID", "Event is missing a unique id.", { path: `${path}.id`, value: event.id }));
    } else if (seenEventIds.has(event.id)) {
      issues.push(createIssue("error", "EVENT_TRIGGER_INVALID", `Duplicate event id: ${event.id}`, { path: `${path}.id`, value: event.id }));
    } else {
      seenEventIds.add(event.id);
    }

    const normalizedTrigger = normalizeTrigger(event.trigger);
    if (!normalizedTrigger) {
      issues.push(createIssue("error", "EVENT_TRIGGER_INVALID", `Unsupported or ambiguous trigger: ${event.trigger}`, { path: `${path}.trigger`, value: event.trigger }));
    } else if (RESERVED_TRIGGERS.has(normalizedTrigger)) {
      issues.push(createIssue("info", "EVENT_TRIGGER_NOT_YET_EMITTED", `Trigger "${normalizedTrigger}" is recognized but not yet emitted automatically; this event will remain inactive.`, { path: `${path}.trigger`, value: normalizedTrigger }));
    }

    const recipient = event.recipient ?? "target";
    if (!RECIPIENT_TYPES.has(recipient)) {
      issues.push(createIssue("error", "EVENT_RECIPIENT_INVALID", `Unsupported recipient: ${recipient}`, { path: `${path}.recipient`, value: recipient }));
    }

    for (const [reqIndex, requirement] of (event.requirements ?? []).entries()) {
      validateRequirement(requirement, `${path}.requirements[${reqIndex}]`, issues);
    }

    if (!Array.isArray(event.outcomes) || !event.outcomes.length) {
      issues.push(createIssue("warning", "EVENT_OUTCOME_INVALID", "Event has no outcomes defined.", { path: `${path}.outcomes`, value: event.outcomes }));
    } else {
      event.outcomes.forEach((outcome, outcomeIndex) => {
        validateOutcome(outcome, `${path}.outcomes[${outcomeIndex}]`, issues, seenOutcomeIds);
      });
    }
  });

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

/* ------------------------------------------ */
/* Event evaluation context                    */
/* ------------------------------------------ */

function buildTargetEventContext({ rollContext, attackResolution, damageContext, targetEntry, item }) {
  const damageEntry = Array.isArray(damageContext?.targets)
    ? damageContext.targets.find((entry) => entry?.targetUuid === targetEntry?.uuid)
    : null;

  return {
    version: POWER_EVENTS_VERSION,
    source: {
      actorUuid: rollContext?.actorUuid ?? null,
      tokenUuid: rollContext?.tokenUuid ?? null,
      itemUuid: rollContext?.itemUuid ?? item?.uuid ?? null,
    },
    roll: {
      total: rollContext?.rollTotal ?? null,
      marvelDieResult: rollContext?.marvelDieResult ?? null,
      isFantasticRoll: Boolean(rollContext?.isFantastic),
    },
    target: {
      tokenUuid: targetEntry?.uuid ?? null,
      actorUuid: targetEntry?.actor?.uuid ?? null,
      outcome: targetEntry?.outcome ?? "unresolved",
      hit: targetEntry?.outcome === "hit" || targetEntry?.outcome === "fantastic-hit",
    },
    damage: {
      type: damageContext?.damageType ?? null,
      raw: damageContext?.rawDamage ?? null,
      reduction: damageEntry?.damageReduction ?? damageContext?.damageReduction ?? null,
      final: damageEntry?.finalDamage ?? damageContext?.finalDamage ?? null,
      applied: false,
    },
    selectedOptions: {},
    concentration: {
      required: Boolean(rollContext?.requiresConcentration),
      active: false,
    },
  };
}

function evaluateRequirement(requirement, context, options = {}) {
  const type = requirement?.type;
  switch (type) {
    case "target-hit":
      return context.target.hit;
    case "target-fantastic-hit":
      return context.target.outcome === "fantastic-hit";
    case "source-fantastic-success":
      return Boolean(context.roll.isFantasticRoll && context.target.hit);
    case "damage-type":
      return context.damage.type === requirement.value;
    case "damage-dealt":
      return typeof context.damage.final === "number" && context.damage.final > 0;
    case "minimum-damage":
      return typeof context.damage.final === "number" && context.damage.final >= Number(requirement.value ?? 1);
    case "focus-damage-applied":
      return context.damage.type === "focus" && typeof context.damage.final === "number" && context.damage.final > 0;
    case "health-damage-applied":
      return context.damage.type === "health" && typeof context.damage.final === "number" && context.damage.final > 0;
    case "target-has-status": {
      const actor = resolveActorFromUuid(context.target.actorUuid);
      return actorHasStatus(actor, requirement.value);
    }
    case "target-lacks-status": {
      const actor = resolveActorFromUuid(context.target.actorUuid);
      return !actorHasStatus(actor, requirement.value);
    }
    case "source-has-status": {
      const actor = resolveActorFromUuid(context.source.actorUuid);
      return actorHasStatus(actor, requirement.value);
    }
    case "source-lacks-status": {
      const actor = resolveActorFromUuid(context.source.actorUuid);
      return !actorHasStatus(actor, requirement.value);
    }
    case "concentration-active":
      return Boolean(context.concentration.active);
    case "power-option-selected":
      return context.selectedOptions?.[requirement.optionId] === requirement.value;
    default:
      return false;
  }
}

function actorHasStatus(actor, statusValue) {
  if (!actor) return false;
  const normalized = normalizeConditionKey(statusValue);
  const effects = Array.isArray(actor?.effects?.contents) ? actor.effects.contents : Array.isArray(actor?.effects) ? actor.effects : null;
  if (effects) {
    return effects.some((effect) => {
      const effectStatuses = effect?.statuses;
      if (typeof effectStatuses?.has === "function") return effectStatuses.has(normalized) || effectStatuses.has(statusValue);
      return Array.isArray(effectStatuses) && (effectStatuses.includes(normalized) || effectStatuses.includes(statusValue));
    });
  }
  const statuses = actor?.statuses ?? actor?.system?.statuses ?? null;
  if (statuses && typeof statuses.has === "function") return statuses.has(normalized) || statuses.has(statusValue);
  return false;
}

/* ------------------------------------------ */
/* Trigger matching                            */
/* ------------------------------------------ */

function triggerMatchesTarget(trigger, context) {
  switch (trigger) {
    case "target-hit":
      return context.target.hit;
    case "target-miss":
      return context.target.outcome === "miss";
    case "target-fantastic-hit":
      return context.target.outcome === "fantastic-hit";
    case "source-success":
      return context.target.hit;
    case "source-failure":
      return context.target.outcome === "miss";
    case "source-fantastic-success":
      return Boolean(context.roll.isFantasticRoll && context.target.hit);
    case "damage-calculated":
      return typeof context.damage.final === "number";
    case "damage-applied":
      return typeof context.damage.final === "number" && context.damage.final > 0;
    case "focus-damage-applied":
      return context.damage.type === "focus" && typeof context.damage.final === "number" && context.damage.final > 0;
    case "health-damage-applied":
      return context.damage.type === "health" && typeof context.damage.final === "number" && context.damage.final > 0;
    case "action-declared":
    case "before-roll":
    case "after-roll":
    case "source-effect-applied":
    case "target-effect-applied":
    case "escape-succeeded":
    case "escape-failed":
    case "concentration-started":
    case "concentration-ended":
    case "start-of-source-turn":
    case "end-of-source-turn":
    case "start-of-target-turn":
    case "end-of-target-turn":
      return true;
    default:
      return false;
  }
}

function resolveRecipientTargets(recipient, { attackResolutionTargets, currentTargetEntry }) {
  const hitTargets = attackResolutionTargets.filter((entry) => entry?.outcome === "hit" || entry?.outcome === "fantastic-hit");
  const failedTargets = attackResolutionTargets.filter((entry) => entry?.outcome === "miss");
  const fantasticTargets = attackResolutionTargets.filter((entry) => entry?.outcome === "fantastic-hit");

  switch (recipient) {
    case "source":
      return { role: "source" };
    case "target":
      return currentTargetEntry ? { role: "target", entries: [currentTargetEntry] } : { role: "target", entries: [] };
    case "all-hit-targets":
      return { role: "target", entries: hitTargets };
    case "all-failed-targets":
      return { role: "target", entries: failedTargets };
    case "all-fantastic-targets":
      return { role: "target", entries: fantasticTargets };
    case "selected-target":
      return currentTargetEntry ? { role: "target", entries: [currentTargetEntry] } : { role: "target", entries: [] };
    case "self-and-target":
      return { role: "self-and-target", entries: currentTargetEntry ? [currentTargetEntry] : [] };
    default:
      return { role: "unknown", entries: [] };
  }
}

/* ------------------------------------------ */
/* Evaluator                                   */
/* ------------------------------------------ */

export function evaluatePowerEvents(message, options = {}) {
  const trigger = normalizeTrigger(options.trigger);
  const issues = [];
  const matchedEvents = [];
  const outcomes = [];

  if (!trigger) {
    issues.push(createIssue("warning", "EVENT_TRIGGER_INVALID", `Unknown trigger requested: ${options.trigger}`, {}));
    return { trigger: options.trigger ?? null, matchedEvents, outcomes, issues };
  }
  if (RESERVED_TRIGGERS.has(trigger)) {
    issues.push(createIssue("info", "EVENT_TRIGGER_NOT_YET_EMITTED", `Trigger "${trigger}" is not yet emitted automatically.`, {}));
    return { trigger, matchedEvents, outcomes, issues };
  }

  const item = options.item ?? null;
  const events = getPowerEvents(item);
  if (!events.length) {
    return { trigger, matchedEvents, outcomes, issues };
  }

  const schemaValidation = validatePowerEvents(events);
  issues.push(...schemaValidation.issues);

  const rollContext = getMessageRollContext(message);
  const attackResolution = getAttackResolution(message);
  const damageContext = getDamageContext(message);
  const attackResolutionTargets = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];

  const targetsToEvaluate = options.targetUuid
    ? attackResolutionTargets.filter((entry) => entry?.uuid === options.targetUuid)
    : attackResolutionTargets;

  const contextsByTarget = targetsToEvaluate.length
    ? targetsToEvaluate.map((entry) => ({ entry, context: buildTargetEventContext({ rollContext, attackResolution, damageContext, targetEntry: entry, item }) }))
    : [{ entry: null, context: buildTargetEventContext({ rollContext, attackResolution, damageContext, targetEntry: null, item }) }];

  for (const event of events) {
    const normalizedTrigger = normalizeTrigger(event.trigger);
    if (normalizedTrigger !== trigger) continue;
    if (RESERVED_TRIGGERS.has(normalizedTrigger)) continue;

    const recipient = event.recipient ?? "target";
    if (!RECIPIENT_TYPES.has(recipient)) continue;

    for (const { entry, context } of contextsByTarget) {
      if (!triggerMatchesTarget(normalizedTrigger, context)) continue;

      const requirementResults = (event.requirements ?? []).map((requirement) => evaluateRequirement(requirement, context));
      const requirementsMet = requirementResults.every(Boolean);
      if (!requirementsMet) continue;

      const recipientResolution = resolveRecipientTargets(recipient, { attackResolutionTargets, currentTargetEntry: entry });

      matchedEvents.push({
        eventId: event.id,
        trigger: normalizedTrigger,
        targetUuid: entry?.uuid ?? null,
        matched: true,
        outcomes: event.outcomes ?? [],
      });

      for (const outcome of event.outcomes ?? []) {
        if (!OUTCOME_TYPES.has(outcome.type)) {
          issues.push(createIssue("error", "EVENT_OUTCOME_INVALID", `Unsupported outcome type: ${outcome.type}`, { eventId: event.id }));
          continue;
        }
        const automated = isOutcomeTypeAutomated(outcome.type);
        outcomes.push({
          eventId: event.id,
          trigger: normalizedTrigger,
          recipient,
          recipientRole: recipientResolution.role,
          recipientEntries: recipientResolution.entries ?? [],
          outcome,
          automated,
          ruleReference: event.ruleReference ?? null,
        });
        if (!automated) {
          issues.push(createIssue("info", "EVENT_OUTCOME_DEFERRED", `Outcome type "${outcome.type}" is not yet automated and requires manual resolution.`, { eventId: event.id }));
        }
      }
    }
  }

  return { trigger, matchedEvents, outcomes, issues };
}

/* ------------------------------------------ */
/* Preview                                     */
/* ------------------------------------------ */

export function previewPowerOutcomes(message, options = {}) {
  const triggers = Array.isArray(options.triggers) && options.triggers.length
    ? options.triggers
    : [...ACTIVE_TRIGGERS];

  const perTarget = new Map();
  const issues = [];

  for (const trigger of triggers) {
    const result = evaluatePowerEvents(message, { ...options, trigger });
    issues.push(...result.issues);
    for (const outcomeEntry of result.outcomes) {
      const entries = outcomeEntry.recipientEntries.length ? outcomeEntry.recipientEntries : [{ uuid: null, name: options.sourceName ?? "Source" }];
      for (const target of entries) {
        const key = target?.uuid ?? "source";
        if (!perTarget.has(key)) {
          perTarget.set(key, { targetUuid: target?.uuid ?? null, name: target?.actor?.name ?? target?.name ?? "Target", outcomes: [] });
        }
        perTarget.get(key).outcomes.push(outcomeEntry);
      }
    }
  }

  return {
    targets: [...perTarget.values()],
    issues,
  };
}

function getStoredEvaluatedEvents(message) {
  const existing = message?.getFlag?.("marvel-multiverse", "resolution")?.evaluatedEvents;
  return Array.isArray(existing) ? [...existing] : [];
}

function resolveItemForMessage(message, item) {
  if (item) return item;
  const rollContext = getMessageRollContext(message);
  const itemUuid = rollContext?.itemUuid ?? null;
  if (!itemUuid || typeof globalThis.fromUuidSync !== "function") return null;
  return globalThis.fromUuidSync(itemUuid) ?? null;
}

// Evaluates (never mutates) power events for the given triggers and stores the resulting preview
// on the message so the GM/player can review it before choosing to apply anything.
export async function autoEvaluatePowerEvents(message, options = {}) {
  const item = resolveItemForMessage(message, options.item);
  if (!getPowerEvents(item).length) return { matchedEvents: [], issues: [] };

  const triggers = Array.isArray(options.triggers) ? options.triggers : [];
  const existing = getStoredEvaluatedEvents(message);
  const seen = new Set(existing.map((entry) => `${entry.eventId}:${entry.trigger}:${entry.targetUuid}`));
  const merged = [...existing];
  const issues = [];

  for (const trigger of triggers) {
    const result = evaluatePowerEvents(message, { ...options, item, trigger });
    issues.push(...result.issues);
    for (const matched of result.matchedEvents) {
      const key = `${matched.eventId}:${matched.trigger}:${matched.targetUuid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(matched);
    }
  }

  if (merged.length !== existing.length) {
    await updateChatMessageFlags(message, { "marvel-multiverse": { resolution: { evaluatedEvents: merged } } });
  }

  return { matchedEvents: merged, issues };
}

/* ------------------------------------------ */
/* Apply / Undo                                */
/* ------------------------------------------ */

function getTransactionId() {
  return `power-event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getEventTransactions(message) {
  const existing = message?.getFlag?.("marvel-multiverse", "resolution")?.eventTransactions;
  return Array.isArray(existing) ? [...existing] : [];
}

async function writeEventTransactions(message, transactions) {
  await updateChatMessageFlags(message, { "marvel-multiverse": { resolution: { eventTransactions: transactions } } });
  return transactions;
}

function canApplyOutcomes(message, rollContext) {
  return canMutateMessage({
    message,
    rollContext,
    actorUuid: rollContext?.actorUuid ?? null,
    allowMessageOwner: true,
  }).allowed;
}

function alreadyHasStatus(actor, statusId) {
  return actorHasStatus(actor, statusId);
}

async function applyStatusOutcome(actor, outcome) {
  const statusId = normalizeConditionKey(outcome.statusId) ?? outcome.statusId;
  const mode = outcome.mode ?? "apply";
  const stacking = outcome.stacking ?? "none";

  if (mode === "remove" || outcome.type === "remove-status") {
    const effects = Array.isArray(actor?.effects?.contents) ? actor.effects.contents : Array.isArray(actor?.effects) ? actor.effects : [];
    const matches = effects.filter((effect) => (effect?.statuses ?? []).includes(statusId) || effect?.flags?.["marvel-multiverse"]?.powerEventStatusId === statusId);
    const ids = matches.map((effect) => effect.id ?? effect._id).filter(Boolean);
    if (ids.length && typeof actor?.deleteEmbeddedDocuments === "function") {
      await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
    return { success: true, createdEffectIds: [], removedEffectIds: ids };
  }

  if (stacking === "none" && alreadyHasStatus(actor, statusId)) {
    return { success: true, createdEffectIds: [], removedEffectIds: [], skipped: true, reason: "already-applied" };
  }

  if (typeof actor?.createEmbeddedDocuments !== "function") {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "actor-unsupported" };
  }

  const created = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `Condition: ${statusId}`,
    img: "icons/svg/statuses/condition.svg",
    statuses: [statusId],
    flags: {
      "marvel-multiverse": {
        powerEventMarker: true,
        powerEventStatusId: statusId,
      },
    },
  }]);
  const createdIds = (created ?? []).map((effect) => effect.id ?? effect._id).filter(Boolean);
  return { success: true, createdEffectIds: createdIds, removedEffectIds: [] };
}

async function applyActiveEffectOutcome(actor, outcome) {
  if (typeof actor?.createEmbeddedDocuments !== "function") {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "actor-unsupported" };
  }
  const effectData = { ...outcome.effect, transfer: false };
  const created = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  const createdIds = (created ?? []).map((effect) => effect.id ?? effect._id).filter(Boolean);
  return { success: true, createdEffectIds: createdIds, removedEffectIds: [] };
}

async function applyRemoveEffectOutcome(actor, outcome) {
  const effectIds = Array.isArray(outcome.effectIds) ? outcome.effectIds : [];
  if (!effectIds.length || typeof actor?.deleteEmbeddedDocuments !== "function") {
    return { success: false, createdEffectIds: [], removedEffectIds: [] };
  }
  await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
  return { success: true, createdEffectIds: [], removedEffectIds: effectIds };
}

function resolveResourcePath(resource) {
  if (resource === "health") return "system.health.value";
  if (resource === "focus") return "system.focus.value";
  if (resource === "karma") return "system.karma.value";
  return null;
}

async function evaluateOutcomeAmount(outcome) {
  if (typeof outcome.amount === "number") return outcome.amount;
  if (typeof outcome.formula !== "string") return null;
  const RollClass = globalThis.CONFIG?.Dice?.MarvelMultiverseRoll ?? globalThis.Roll;
  if (typeof RollClass !== "function") return null;
  const roll = await new RollClass(outcome.formula).evaluate();
  return roll?.total ?? null;
}

// Experimental: covers the "damage"/"healing"/"resource-change" outcome types. Only ever invoked
// when isOutcomeTypeAutomated() has already confirmed enableExperimentalPowerOutcomes is on.
async function applyResourceOutcome(actor, outcome, options = {}) {
  const resource = outcome.type === "resource-change" ? outcome.resource : "health";
  const path = resolveResourcePath(resource);
  if (!path || typeof actor?.update !== "function") {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "actor-unsupported" };
  }
  const rawAmount = outcome.type === "resource-change" ? outcome.delta : await evaluateOutcomeAmount(outcome);
  if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount)) {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "amount-invalid" };
  }
  const healingBonus = outcome.type === "healing" ? Math.max(0, Number(options.healingBonus) || 0) : 0;
  const scaledAmount = rawAmount + healingBonus;
  const delta = outcome.type === "damage" ? -Math.abs(rawAmount) : outcome.type === "healing" ? Math.abs(scaledAmount) : rawAmount;
  const previousValue = foundry?.utils?.getProperty ? foundry.utils.getProperty(actor, path) : null;
  if (typeof previousValue !== "number") {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "resource-missing" };
  }
  const maximumPath = outcome.type === "healing" ? "system.health.max" : null;
  const maximumValue = maximumPath && foundry?.utils?.getProperty ? foundry.utils.getProperty(actor, maximumPath) : null;
  const nextValue = outcome.type === "healing" && Number.isFinite(maximumValue)
    ? Math.min(maximumValue, previousValue + delta)
    : previousValue + delta;
  await actor.update({ [path]: nextValue });
  return {
    success: true,
    createdEffectIds: [],
    removedEffectIds: [],
    restoreState: { kind: "resource", actorUuid: actor.uuid, path, previousValue },
  };
}

function resolveTokenDocumentForActor(actor) {
  const token = typeof actor?.getActiveTokens === "function" ? actor.getActiveTokens()[0] : null;
  return token?.document ?? actor?.token ?? null;
}

// Experimental: covers "forced-movement". Same-scene only (dx/dy in grid squares, or absolute
// toX/toY in pixels) - deliberately does not attempt cross-scene teleport.
async function applyForcedMovementOutcome(actor, outcome) {
  const token = resolveTokenDocumentForActor(actor);
  if (!token || typeof token.update !== "function") {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "token-unavailable" };
  }
  const previousX = token.x;
  const previousY = token.y;
  const gridSize = globalThis.canvas?.grid?.size ?? 100;
  const nextX = typeof outcome.toX === "number" ? outcome.toX : previousX + Number(outcome.dx ?? 0) * gridSize;
  const nextY = typeof outcome.toY === "number" ? outcome.toY : previousY + Number(outcome.dy ?? 0) * gridSize;
  await token.update({ x: nextX, y: nextY });
  return {
    success: true,
    createdEffectIds: [],
    removedEffectIds: [],
    restoreState: { kind: "token-position", tokenUuid: token.uuid, previousX, previousY },
  };
}

// Experimental: covers "resize" (a multiplier on the token's current width/height).
async function applyResizeOutcome(actor, outcome) {
  const token = resolveTokenDocumentForActor(actor);
  if (!token || typeof token.update !== "function") {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "token-unavailable" };
  }
  const scale = Number(outcome.scale);
  if (!Number.isFinite(scale) || scale <= 0) {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "scale-invalid" };
  }
  const previousWidth = token.width;
  const previousHeight = token.height;
  await token.update({ width: previousWidth * scale, height: previousHeight * scale });
  return {
    success: true,
    createdEffectIds: [],
    removedEffectIds: [],
    restoreState: { kind: "token-size", tokenUuid: token.uuid, previousWidth, previousHeight },
  };
}

// Cosmetic only, gated by enableSequencerEffects: plays a Sequencer effect (e.g. a JB2A asset)
// at the recipient's token. A no-op (not an error) if Sequencer isn't installed/active - nothing
// here assumes a specific JB2A version or folder layout, the file path is always author-provided.
async function applyPlayEffectOutcome(actor, outcome) {
  if (typeof globalThis.Sequence !== "function") {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "sequencer-unavailable" };
  }
  try {
    const token = resolveTokenDocumentForActor(actor);
    const sequence = new globalThis.Sequence().effect().file(outcome.sequencerFile);
    if (token) sequence.atLocation(token);
    if (typeof outcome.scale === "number") sequence.scale(outcome.scale);
    if (typeof outcome.tint === "string") sequence.tint(outcome.tint);
    await sequence.play();
    return { success: true, createdEffectIds: [], removedEffectIds: [] };
  } catch {
    return { success: false, createdEffectIds: [], removedEffectIds: [], reason: "sequencer-error" };
  }
}

export async function applyPowerOutcomes(message, options = {}) {
  const rollContext = getMessageRollContext(message);
  if (!canApplyOutcomes(message, rollContext)) {
    return {
      success: false,
      issues: [createIssue("error", "EVENT_APPLY_PERMISSION_DENIED", "You do not have permission to apply this power's outcomes.", {})],
      applied: [],
    };
  }

  const preview = previewPowerOutcomes(message, options);
  const eventIds = Array.isArray(options.eventIds) ? options.eventIds : null;
  const targetUuids = Array.isArray(options.targetUuids) ? options.targetUuids : null;

  const applied = [];
  const issues = [...preview.issues];
  const transactions = getEventTransactions(message);
  const sourceItem = rollContext?.itemUuid && typeof globalThis.fromUuidSync === "function"
    ? globalThis.fromUuidSync(rollContext.itemUuid)
    : null;
  const focusSpend = message.getFlag?.("marvel-multiverse", "actionFocus") ?? null;
  const focusTransactions = getFocusTransactions(message) ?? [];
  const latestFocusSpend = [...focusTransactions].reverse().find((entry) => entry?.type === "spend" && !entry?.refunded);
  const focusScaling = resolveFocusScaling(sourceItem, focusSpend?.amount ?? latestFocusSpend?.appliedAmount);
  const healingBonus = focusScaling.valid && focusScaling.mode === "healing" ? focusScaling.bonus : 0;

  for (const targetGroup of preview.targets) {
    for (const outcomeEntry of targetGroup.outcomes) {
      if (eventIds && !eventIds.includes(outcomeEntry.eventId)) continue;
      if (targetUuids && targetGroup.targetUuid && !targetUuids.includes(targetGroup.targetUuid)) continue;
      if (!outcomeEntry.automated) continue;

      const isSourceRecipient = outcomeEntry.recipientRole === "source";
      const actorUuid = isSourceRecipient ? rollContext?.actorUuid : targetGroup.targetUuid;
      const actor = resolveActorFromUuid(actorUuid);
      if (!actor) {
        issues.push(createIssue("warning", "EVENT_RECIPIENT_MISMATCH", "Could not resolve the recipient actor for this outcome.", { eventId: outcomeEntry.eventId, actorUuid }));
        continue;
      }

      let applyResult = { success: false, createdEffectIds: [], removedEffectIds: [] };
      const outcome = outcomeEntry.outcome;
      if (outcome.type === "status") applyResult = await applyStatusOutcome(actor, outcome);
      else if (outcome.type === "remove-status") applyResult = await applyStatusOutcome(actor, { ...outcome, mode: "remove" });
      else if (outcome.type === "active-effect") applyResult = await applyActiveEffectOutcome(actor, outcome);
      else if (outcome.type === "remove-effect") applyResult = await applyRemoveEffectOutcome(actor, outcome);
      else if (outcome.type === "chat-note") applyResult = { success: true, createdEffectIds: [], removedEffectIds: [] };
      else if (outcome.type === "damage" || outcome.type === "healing" || outcome.type === "resource-change") applyResult = await applyResourceOutcome(actor, outcome, { healingBonus });
      else if (outcome.type === "forced-movement") applyResult = await applyForcedMovementOutcome(actor, outcome);
      else if (outcome.type === "resize") applyResult = await applyResizeOutcome(actor, outcome);
      else if (outcome.type === "play-effect") applyResult = await applyPlayEffectOutcome(actor, outcome);
      else continue;

      const transaction = {
        id: getTransactionId(),
        eventId: outcomeEntry.eventId,
        outcomeType: outcome.type,
        sourceMessageUuid: message?.uuid ?? message?.id ?? null,
        sourceActorUuid: rollContext?.actorUuid ?? null,
        targetActorUuid: actor?.uuid ?? null,
        createdEffectIds: applyResult.createdEffectIds ?? [],
        removedEffectIds: applyResult.removedEffectIds ?? [],
        restoreState: applyResult.restoreState ?? null,
        appliedAt: Date.now(),
        duration: outcome.duration ?? { type: "manual" },
        expiration: buildExpirationSnapshot(outcome.duration),
        undone: false,
      };
      transactions.push(transaction);
      applied.push({ ...transaction, skipped: Boolean(applyResult.skipped) });
    }
  }

  if (applied.length) {
    await writeEventTransactions(message, transactions);
  }

  return { success: applied.length > 0, applied, issues };
}

function buildExpirationSnapshot(duration) {
  if (!duration || !["rounds", "end-of-source-turn", "end-of-source-next-turn", "end-of-target-turn", "end-of-target-next-turn", "start-of-source-turn", "start-of-target-turn"].includes(duration.type)) {
    return null;
  }
  const combat = globalThis.game?.combat ?? null;
  if (!combat) return null;
  return {
    combatId: combat.id ?? null,
    round: combat.round ?? null,
    turn: combat.turn ?? null,
  };
}

export async function undoPowerOutcomes(message, options = {}) {
  const transactions = getEventTransactions(message);
  const targetId = options.transactionId ?? null;
  const transaction = targetId
    ? transactions.find((entry) => entry?.id === targetId && !entry?.undone)
    : [...transactions].reverse().find((entry) => !entry?.undone);

  if (!transaction) {
    return { success: false, issues: [createIssue("warning", "EVENT_TRANSACTION_NOT_FOUND", "No power event transaction was found to undo.", {})] };
  }

  const actor = resolveActorFromUuid(transaction.targetActorUuid);
  if (actor && Array.isArray(transaction.createdEffectIds) && transaction.createdEffectIds.length && typeof actor.deleteEmbeddedDocuments === "function") {
    await actor.deleteEmbeddedDocuments("ActiveEffect", transaction.createdEffectIds);
  }
  await restoreTransactionSnapshot(transaction.restoreState);

  transaction.undone = true;
  transaction.undoneAt = Date.now();
  await writeEventTransactions(message, transactions);
  return { success: true, transaction };
}

// Reverses the experimental resource/token mutations recorded on a transaction's restoreState
// snapshot (taken immediately before the mutation was applied).
async function restoreTransactionSnapshot(restoreState) {
  if (!restoreState) return;
  if (restoreState.kind === "resource") {
    const actor = resolveActorFromUuid(restoreState.actorUuid);
    if (actor && typeof actor.update === "function") {
      await actor.update({ [restoreState.path]: restoreState.previousValue });
    }
    return;
  }
  if (restoreState.kind === "token-position") {
    const token = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(restoreState.tokenUuid) : null;
    if (token && typeof token.update === "function") {
      await token.update({ x: restoreState.previousX, y: restoreState.previousY });
    }
    return;
  }
  if (restoreState.kind === "token-size") {
    const token = typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(restoreState.tokenUuid) : null;
    if (token && typeof token.update === "function") {
      await token.update({ width: restoreState.previousWidth, height: restoreState.previousHeight });
    }
  }
}

/* ------------------------------------------ */
/* Duration sweep (combat-round based expiry)  */
/* ------------------------------------------ */

function isDurationExpired(duration, expiration, combat) {
  if (!duration || !expiration || !combat) return false;
  if (expiration.combatId !== combat.id) return false;
  if (duration.type === "rounds") {
    const targetRound = (expiration.round ?? 0) + Number(duration.value ?? 1);
    return combat.round >= targetRound;
  }
  if (["end-of-source-turn", "end-of-target-turn", "end-of-source-next-turn", "end-of-target-next-turn"].includes(duration.type)) {
    return combat.round > (expiration.round ?? 0);
  }
  return false;
}

export async function sweepExpiredPowerEffects(combat) {
  if (!combat || !globalThis.game?.messages) return { sweptCount: 0 };
  let sweptCount = 0;
  for (const message of globalThis.game.messages) {
    const transactions = getEventTransactions(message);
    if (!transactions.length) continue;
    let changed = false;
    for (const transaction of transactions) {
      if (transaction.undone) continue;
      if (!isDurationExpired(transaction.duration, transaction.expiration, combat)) continue;
      const actor = resolveActorFromUuid(transaction.targetActorUuid);
      if (actor && Array.isArray(transaction.createdEffectIds) && transaction.createdEffectIds.length && typeof actor.deleteEmbeddedDocuments === "function") {
        await actor.deleteEmbeddedDocuments("ActiveEffect", transaction.createdEffectIds);
      }
      transaction.undone = true;
      transaction.undoneAt = Date.now();
      transaction.undoneReason = "duration-expired";
      changed = true;
      sweptCount += 1;
    }
    if (changed) await writeEventTransactions(message, transactions);
  }
  return { sweptCount };
}

/* ------------------------------------------ */
/* Turn-boundary triggers (opt-in)             */
/* ------------------------------------------ */

function messageActorIsSource(message, actorUuid) {
  return getMessageRollContext(message)?.actorUuid === actorUuid;
}

function messageActorIsTarget(message, actorUuid) {
  const attackResolution = getAttackResolution(message);
  const targets = Array.isArray(attackResolution?.targets) ? attackResolution.targets : [];
  return targets.some((entry) => entry?.actor?.uuid === actorUuid || entry?.uuid === actorUuid);
}

// Fires start/end-of-turn power-event triggers for whichever actor's turn is starting/ending.
// Never applies anything automatically - like every other Hooks-driven trigger in this file, it
// only calls autoEvaluatePowerEvents (preview-only) so a GM/player must still press Apply.
// Gated entirely behind the "enableTurnBasedTriggers" world setting: "whose turn triggers whom"
// across arbitrary stored messages has no confirmed official procedure, unlike the always-on
// triggers above.
export async function sweepTurnBoundaryTriggers(combat, boundary, combatantId = null) {
  if (!combat || !globalThis.game?.messages) return { evaluatedCount: 0 };
  if (!globalThis.game?.settings?.get?.("marvel-multiverse", "enableTurnBasedTriggers")) return { evaluatedCount: 0 };

  const combatant = combatantId ? combat.combatants?.get?.(combatantId) : combat.combatant;
  const actorUuid = combatant?.actor?.uuid ?? null;
  if (!actorUuid) return { evaluatedCount: 0 };

  const sourceTrigger = boundary === "start" ? "start-of-source-turn" : "end-of-source-turn";
  const targetTrigger = boundary === "start" ? "start-of-target-turn" : "end-of-target-turn";

  let evaluatedCount = 0;
  for (const message of globalThis.game.messages) {
    const item = resolveItemForMessage(message, null);
    if (!getPowerEvents(item).length) continue;

    if (messageActorIsSource(message, actorUuid)) {
      await autoEvaluatePowerEvents(message, { item, triggers: [sourceTrigger] });
      evaluatedCount += 1;
    }
    if (messageActorIsTarget(message, actorUuid)) {
      await autoEvaluatePowerEvents(message, { item, triggers: [targetTrigger] });
      evaluatedCount += 1;
    }
  }
  return { evaluatedCount };
}

export {
  ACTIVE_TRIGGERS,
  RESERVED_TRIGGERS,
  RECIPIENT_TYPES,
  OUTCOME_TYPES,
  AUTOMATED_OUTCOME_TYPES,
  EXPERIMENTAL_OUTCOME_TYPES,
  EFFECT_PLAYBACK_OUTCOME_TYPES,
  DURATION_TYPES,
  REQUIREMENT_TYPES,
  MAX_EVENT_DEPTH,
};
