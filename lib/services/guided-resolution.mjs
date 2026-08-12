import { buildRollContext } from "../roll-context.mjs";
import { updateChatMessageFlags } from "../chat-message-state.mjs";

const DEFAULT_EDGE_MODE = Object.freeze({
  NORMAL: 0,
  EDGE: 1,
  TROUBLE: -1,
});

function getEdgeModeConfig() {
  return globalThis.CONFIG?.Dice?.MarvelMultiverseRoll?.EDGE_MODE ?? DEFAULT_EDGE_MODE;
}

function toEdgeModeKey(edgeMode) {
  const config = getEdgeModeConfig();
  if (edgeMode === config.EDGE) return "edge";
  if (edgeMode === config.TROUBLE) return "trouble";
  return "normal";
}

function toEdgeModeValue(edgeModeKey = "normal") {
  const config = getEdgeModeConfig();
  if (edgeModeKey === "edge") return config.EDGE;
  if (edgeModeKey === "trouble") return config.TROUBLE;
  return config.NORMAL;
}

function normalizeTargets(targets) {
  const collection = Array.isArray(targets) ? targets : [];
  const deduped = [];
  const seen = new Set();
  for (const entry of collection) {
    const uuid = typeof entry === "string" ? entry : entry?.document?.uuid ?? entry?.uuid ?? null;
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    deduped.push(entry);
  }
  return deduped;
}

function appendSituationalBonus(baseFormula, bonus) {
  const value = Number(bonus);
  if (!Number.isFinite(value) || value === 0) return baseFormula;
  if (value > 0) return `(${baseFormula}) + ${value}`;
  return `(${baseFormula}) - ${Math.abs(value)}`;
}

// Resolution type vocabulary follows the official Marvel Multiverse terminology (no "saving throw").
// "manual" covers powers whose resolution cannot be safely automated; the UI must say so, not guess.
function getSupportedWorkflowModes() {
  return ["check", "attack", "target-check", "opposed", "automatic", "manual"];
}

const GUIDED_RULES_VERSION = Object.freeze({
  // Verified against https://www.marvel.com/rpg downloads at execution time; see docs/resolution-workflow/rule-sources.md.
  coreErrata: "2025-07-18",
  faq: "2025-03-27",
});

function normalizeWorkflowMode(mode) {
  if (!mode) return null;
  const normalized = String(mode).trim().toLowerCase();
  return getSupportedWorkflowModes().includes(normalized) ? normalized : null;
}

function inferWorkflowMode(context = {}) {
  const requestedMode = normalizeWorkflowMode(context.mode);
  if (requestedMode) return requestedMode;
  if (context.rollType === "attack" || context.isAttack) return "attack";
  return "check";
}

function isGuidedResolutionEnabled() {
  const setting = globalThis.game?.settings?.get?.("marvel-multiverse", "guidedResolutionEnabled");
  return setting === true;
}

function buildActionContext({
  actor = null,
  token = null,
  item = null,
  formula = "",
  rollType = "ability",
  isAttack = false,
  dealsDamage = false,
  targets = [],
  source = "unknown",
  title = "",
  label = "",
  edgeMode = null,
  mode = null,
} = {}) {
  const normalizedTargets = normalizeTargets(targets);
  const baseContext = buildRollContext({
    actor,
    token: token ?? actor?.token ?? null,
    item,
    rollType,
    targets: normalizedTargets,
    options: {
      dealsDamage,
      userId: globalThis.game?.user?.id ?? null,
    },
  });

  return {
    ...baseContext,
    source,
    title,
    label,
    formula,
    isAttack: Boolean(isAttack),
    edgeMode: edgeMode ?? null,
    mode: inferWorkflowMode({ mode, rollType, isAttack }),
    phase: "configure",
  };
}

function validateActionContext(context) {
  const errors = [];
  const warnings = [...(Array.isArray(context?.warnings) ? context.warnings : [])];

  if (!context?.actorUuid) {
    errors.push({ code: "GUIDED_CONTEXT_ACTOR_MISSING", message: "A valid source actor is required." });
  }
  if (!context?.formula || typeof context.formula !== "string") {
    errors.push({ code: "GUIDED_CONTEXT_FORMULA_MISSING", message: "A roll formula is required." });
  }

  const requiresTargets = context?.isAttack || context?.rollType === "attack";
  if (requiresTargets && (!Array.isArray(context?.targetUuids) || context.targetUuids.length === 0)) {
    errors.push({
      code: "GUIDED_CONTEXT_TARGET_REQUIRED",
      message: globalThis.game?.i18n?.localize?.("MARVEL_MULTIVERSE.TargetRequired")
        || "Select at least one target before using an attack power.",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function getDialogClass() {
  return globalThis.foundry?.applications?.api?.DialogV2 ?? globalThis.Dialog ?? null;
}

function parseDialogSelection(html, baseFormula, defaultEdgeModeKey) {
  const root = html?.[0] ?? html;
  const workflowMode = root?.querySelector?.("[name='guided-workflow-mode']")?.value ?? "check";
  const edgeModeKey = root?.querySelector?.("[name='guided-edge-mode']")?.value ?? defaultEdgeModeKey;
  const bonusRaw = root?.querySelector?.("[name='guided-situational-bonus']")?.value ?? "0";
  const bonus = Number.parseInt(String(bonusRaw), 10);
  return {
    workflowMode: inferWorkflowMode({ mode: workflowMode }),
    edgeModeKey,
    edgeModeValue: toEdgeModeValue(edgeModeKey),
    situationalBonus: Number.isFinite(bonus) ? bonus : 0,
    formula: appendSituationalBonus(baseFormula, bonus),
  };
}

function buildModeOptions(mode) {
  const selected = inferWorkflowMode({ mode });
  const labels = {
    check: "Check",
    attack: "Attack",
    "target-check": "Target Check",
    opposed: "Opposed",
    automatic: "Automatic",
    manual: "Manual Resolution Required",
  };
  return getSupportedWorkflowModes().map((entry) => (
    `<option value="${entry}" ${entry === selected ? "selected" : ""}>${labels[entry]}</option>`
  )).join("");
}

async function promptGuidedResolution(context, { defaultEdgeModeKey = "normal" } = {}) {
  const DialogClass = getDialogClass();
  if (!DialogClass) {
    return {
      confirmed: true,
      selection: {
        edgeModeKey: defaultEdgeModeKey,
        edgeModeValue: toEdgeModeValue(defaultEdgeModeKey),
        situationalBonus: 0,
        formula: context.formula,
      },
      bypassed: true,
    };
  }

  const attackText = context.isAttack ? "Attack" : "Check";
  const title = globalThis.game?.i18n?.localize?.("MARVEL_MULTIVERSE.ResolveAction") ?? "Resolve Action";
  const bypassSelection = () => ({
    edgeModeKey: defaultEdgeModeKey,
    edgeModeValue: toEdgeModeValue(defaultEdgeModeKey),
    situationalBonus: 0,
    formula: context.formula,
  });
  // Labels are associated to their inputs via for/id so screen readers announce them (Part 31 accessibility).
  const content = `
    <form class="mm-guided-resolution-dialog">
      <p><strong>${attackText}:</strong> ${context.title || context.source?.itemName || context.label || "Untitled action"}</p>
      <p><strong>Formula:</strong> <code>${context.formula}</code></p>
      <div class="form-group">
        <label for="guided-workflow-mode">Workflow</label>
        <select id="guided-workflow-mode" name="guided-workflow-mode">
          ${buildModeOptions(context.mode)}
        </select>
      </div>
      <div class="form-group">
        <label for="guided-edge-mode">Edge/Trouble</label>
        <select id="guided-edge-mode" name="guided-edge-mode">
          <option value="normal" ${defaultEdgeModeKey === "normal" ? "selected" : ""}>Normal</option>
          <option value="edge" ${defaultEdgeModeKey === "edge" ? "selected" : ""}>Edge</option>
          <option value="trouble" ${defaultEdgeModeKey === "trouble" ? "selected" : ""}>Trouble</option>
        </select>
      </div>
      <div class="form-group">
        <label for="guided-situational-bonus">Situational Bonus</label>
        <input id="guided-situational-bonus" name="guided-situational-bonus" type="number" step="1" value="0" />
      </div>
    </form>`;

  if (typeof DialogClass.wait === "function") {
    // DialogV2.wait() resolves to whatever a button's OWN callback returns (or its bare
    // action string if no callback is defined) - a top-level `submit` option is a side-effect
    // hook only and its return value is never used to resolve the wait(). Each button must
    // compute its own result here or the dialog silently "cancels" every roll.
    const result = await DialogClass.wait({
      window: { title },
      content,
      buttons: [
        {
          action: "cancel",
          label: "Cancel",
          callback: () => ({ confirmed: false, selection: null }),
        },
        {
          action: "bypass",
          label: "Bypass",
          callback: () => ({ confirmed: true, selection: bypassSelection(), bypassed: true }),
        },
        {
          action: "roll",
          label: "Roll",
          default: true,
          callback: (event, button) => ({
            confirmed: true,
            selection: parseDialogSelection(button?.form, context.formula, defaultEdgeModeKey),
          }),
        },
      ],
    });
    return result ?? { confirmed: false, selection: null };
  }

  return new Promise((resolve) => {
    const dialog = new DialogClass({
      title,
      content,
      buttons: {
        cancel: {
          label: "Cancel",
          callback: () => resolve({ confirmed: false, selection: null }),
        },
        bypass: {
          label: "Bypass",
          callback: () => resolve({ confirmed: true, selection: bypassSelection(), bypassed: true }),
        },
        roll: {
          label: "Roll",
          callback: (html) => {
            resolve({
              confirmed: true,
              selection: parseDialogSelection(html, context.formula, defaultEdgeModeKey),
            });
          },
        },
      },
      default: "roll",
      close: () => resolve({ confirmed: false, selection: null }),
    });
    dialog.render(true);
  });
}

function buildGuidedResolutionState(context = {}, selection = {}) {
  const now = Date.now();
  const mode = inferWorkflowMode({ mode: selection.workflowMode ?? context.mode, rollType: context.rollType, isAttack: context.isAttack });
  const applyStatus = context.dealsDamage || (Array.isArray(context.conditions) && context.conditions.length > 0)
    ? "pending"
    : "not-required";

  return {
    version: 1,
    mode,
    phase: "roll",
    // Records which errata/FAQ dates the automated resolution behavior was verified against (docs/resolution-workflow/rule-sources.md).
    rulesVersion: { ...GUIDED_RULES_VERSION },
    source: {
      kind: context.source ?? "unknown",
      actorUuid: context.actorUuid ?? null,
      tokenUuid: context.tokenUuid ?? null,
      itemUuid: context.itemUuid ?? null,
      title: context.title ?? null,
      label: context.label ?? null,
    },
    configure: {
      confirmedAt: now,
      edgeMode: selection.edgeModeKey ?? "normal",
      situationalBonus: Number(selection.situationalBonus ?? 0) || 0,
      formula: selection.formula ?? context.formula ?? "",
      targetUuids: Array.isArray(context.targetUuids) ? [...context.targetUuids] : [],
    },
    roll: {
      status: "rolled",
      rolledAt: now,
    },
    resolve: {
      status: mode === "manual" ? "manual-required" : "pending",
    },
    apply: {
      status: mode === "manual" ? "manual-required" : applyStatus,
    },
  };
}

function createGuidedTransactionId(kind = "guided") {
  return `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getGuidedResolutionState(message) {
  if (typeof message?.getFlag === "function") {
    return message.getFlag("marvel-multiverse", "guidedResolution") ?? null;
  }
  return message?.flags?.["marvel-multiverse"]?.guidedResolution ?? null;
}

async function updateGuidedResolutionState(message, patch = {}) {
  const current = getGuidedResolutionState(message) ?? {};
  const next = {
    ...current,
    ...patch,
    resolve: { ...(current.resolve ?? {}), ...(patch.resolve ?? {}) },
    apply: { ...(current.apply ?? {}), ...(patch.apply ?? {}) },
  };
  await updateChatMessageFlags(message, { "marvel-multiverse": { guidedResolution: next } });
  return next;
}

async function markGuidedResolutionResolved(message, { outcomeSummary = null, force = false } = {}) {
  const state = getGuidedResolutionState(message);
  if (!state) return null;
  if (state.resolve?.status === "resolved" && !force) return state;

  return updateGuidedResolutionState(message, {
    phase: "resolve",
    resolve: {
      status: "resolved",
      resolvedAt: Date.now(),
      resolvedBy: globalThis.game?.user?.id ?? null,
      outcomeSummary: outcomeSummary ?? state.resolve?.outcomeSummary ?? null,
    },
  });
}

async function markGuidedResolutionApplied(message, { transactionId = null, transactionIds = null, force = false } = {}) {
  const state = getGuidedResolutionState(message);
  if (!state) return null;
  if (state.apply?.status === "applied" && !force && !transactionId && !transactionIds) return state;

  const existingIds = Array.isArray(state.apply?.transactionIds) ? state.apply.transactionIds : [];
  const resolvedTransactionIds = Array.isArray(transactionIds)
    ? transactionIds
    : transactionId
      ? [...existingIds, transactionId]
      : existingIds;

  return updateGuidedResolutionState(message, {
    phase: "apply",
    apply: {
      status: "applied",
      appliedAt: Date.now(),
      appliedBy: globalThis.game?.user?.id ?? null,
      transactionIds: resolvedTransactionIds,
    },
  });
}

async function markGuidedResolutionUndone(message, { transactionId = null } = {}) {
  const state = getGuidedResolutionState(message);
  if (!state) return null;

  const existingIds = Array.isArray(state.apply?.transactionIds) ? state.apply.transactionIds : [];
  const remainingIds = transactionId ? existingIds.filter((id) => id !== transactionId) : [];
  const nextStatus = remainingIds.length > 0 ? "applied" : "pending";

  return updateGuidedResolutionState(message, {
    apply: {
      status: nextStatus,
      transactionIds: remainingIds,
      undoneAt: Date.now(),
      undoneBy: globalThis.game?.user?.id ?? null,
    },
  });
}

export async function openGuidedResolution(options = {}) {
  const context = buildActionContext(options);
  const validation = validateActionContext(context);

  if (!isGuidedResolutionEnabled()) {
    return {
      handled: false,
      enabled: false,
      context,
      validation,
      selection: null,
    };
  }

  if (!validation.valid) {
    const firstError = validation.errors[0];
    if (firstError?.message) {
      globalThis.ui?.notifications?.warn?.(firstError.message);
    }
    return {
      handled: true,
      enabled: true,
      blocked: true,
      context,
      validation,
      selection: null,
    };
  }

  const defaultEdgeModeKey = toEdgeModeKey(options.edgeMode);
  const promptResult = await promptGuidedResolution(context, { defaultEdgeModeKey });
  if (!promptResult?.confirmed) {
    return {
      handled: true,
      enabled: true,
      cancelled: true,
      context,
      validation,
      selection: null,
    };
  }

  return {
    handled: true,
    enabled: true,
    cancelled: false,
    blocked: false,
    context,
    validation,
    selection: promptResult.selection,
    state: buildGuidedResolutionState(context, promptResult.selection ?? {}),
  };
}

export {
  buildActionContext,
  validateActionContext,
  isGuidedResolutionEnabled,
  inferWorkflowMode,
  buildGuidedResolutionState,
  createGuidedTransactionId,
  getGuidedResolutionState,
  markGuidedResolutionApplied,
  markGuidedResolutionResolved,
  markGuidedResolutionUndone,
};