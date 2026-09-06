import { updateChatMessageFlags } from "../chat-message-state.mjs";
import { spendActorFocus } from "../focus-automation.mjs";
import { buildRollContext } from "../roll-context.mjs";
import { createEffectProfileSession } from "./effect-profile-manager.mjs";
import { autoEvaluatePowerEvents } from "./power-events.mjs";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function normalizeTargets(targets) {
  const values = Array.isArray(targets)
    ? targets
    : targets && typeof targets === "object" ? Array.from(targets) : [];
  return values.filter((target) => target?.actor || target?.document?.actor || target?.uuid);
}

function resolveTargetLimits(source, actor) {
  const activation = source?.system?.activation ?? {};
  const rank = Math.max(1, Number(actor?.system?.attributes?.rank?.value ?? actor?.system?.rank?.value ?? 1));
  const required = activation.target === "required";
  const configuredMinimum = Number.isFinite(Number(activation.minTargets)) ? Number(activation.minTargets) : 0;
  const minimum = Math.max(required ? 1 : 0, configuredMinimum);
  const explicitMaximum = Number(activation.maxTargets);
  const perRankMaximum = Number(activation.maxTargetsPerRank);
  const maximum = Number.isFinite(explicitMaximum) && explicitMaximum > 0
    ? explicitMaximum
    : Number.isFinite(perRankMaximum) && perRankMaximum > 0 ? perRankMaximum * rank : null;
  return { minimum, maximum };
}

function resolveFixedFocusCost(source) {
  const match = String(source?.system?.cost ?? "").match(/^(\d+)\s*Focus$/i);
  return match ? Number(match[1]) : 0;
}

function notifyTargetIssue(actionName, limits, count) {
  let message = `${actionName} requires at least ${limits.minimum} selected target${limits.minimum === 1 ? "" : "s"}.`;
  if (limits.maximum !== null && count > limits.maximum) {
    message = `${actionName} allows no more than ${limits.maximum} selected target${limits.maximum === 1 ? "" : "s"}.`;
  }
  globalThis.ui?.notifications?.warn?.(message);
}

export async function activateUtilityPower({ actor, token = null, source, targets = [], effectsEnabled, effectLibrary } = {}) {
  if (!actor || !source) return { cancelled: true, error: "missing-source" };

  const resolvedTargets = normalizeTargets(targets);
  const limits = resolveTargetLimits(source, actor);
  if (resolvedTargets.length < limits.minimum || (limits.maximum !== null && resolvedTargets.length > limits.maximum)) {
    notifyTargetIssue(source.name ?? "This power", limits, resolvedTargets.length);
    return { cancelled: true, error: "invalid-target-count", message: null };
  }

  const focusCost = resolveFixedFocusCost(source);
  const focusSpend = focusCost > 0 ? await spendActorFocus(actor, focusCost) : null;
  if (focusCost > 0 && !focusSpend?.success) {
    globalThis.ui?.notifications?.warn?.(focusSpend?.issues?.[0]?.message ?? `Focus could not be spent for ${source.name}.`);
    return { cancelled: true, error: "focus-spend-failed", message: null };
  }

  const effectSession = createEffectProfileSession(source, {
    actor,
    source,
    sourceToken: token?.object ?? token ?? actor?.token,
    targets: resolvedTargets.map((target) => target?.object ?? target),
  }, { enabled: effectsEnabled, library: effectLibrary });
  await effectSession.playPhase("activation");
  await effectSession.playPhase("cast");

  const rollContext = buildRollContext({
    actor,
    token,
    item: source,
    roll: null,
    rollType: "utility",
    targets: resolvedTargets,
    options: { dealsDamage: false },
  });
  const speaker = globalThis.ChatMessage?.getSpeaker?.({ actor }) ?? {};
  const rollMode = globalThis.game?.settings?.get?.("core", "rollMode") ?? "publicroll";
  const targetNames = resolvedTargets
    .map((target) => target?.name ?? target?.document?.name ?? target?.actor?.name)
    .filter(Boolean);
  const targetLine = targetNames.length ? `<p><strong>Targets:</strong> ${targetNames.map(escapeHtml).join(", ")}</p>` : "";
  const message = await globalThis.ChatMessage?.create?.({
    speaker,
    rollMode,
    flavor: escapeHtml(source.name),
    content: `<div class="marvel-multiverse utility-activation"><p>${escapeHtml(source.system?.description)}</p>${targetLine}<p>${escapeHtml(source.system?.effect)}</p></div>`,
    flags: {
      "marvel-multiverse": {
        rollContext,
        utilityActivation: { version: 1, targetCount: resolvedTargets.length },
        actionFocus: focusSpend?.success ? {
          version: 1,
          actorUuid: actor.uuid ?? null,
          amount: focusCost,
          previousValue: focusSpend.previousValue,
          newValue: focusSpend.newValue,
        } : null,
        effectsPlayed: effectSession.getPlayedMetadata(),
      },
    },
  });

  if (message) {
    await updateChatMessageFlags(message, { "marvel-multiverse": { rollContext } });
    await autoEvaluatePowerEvents(message, { item: source, triggers: ["action-declared"] });
  }
  return { cancelled: false, message, roll: null };
}