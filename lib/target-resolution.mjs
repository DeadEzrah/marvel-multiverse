import { getRollContext } from "./roll-context.mjs";

const TARGET_RESOLUTION_VERSION = 1;

function isValidTargetUuid(value) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.includes(".");
}

function getMessageRollContext(message) {
  const context = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext")
    : null;
  return context ?? getRollContext(message) ?? null;
}

function getStoredTargetUuids(message) {
  const context = getMessageRollContext(message);
  if (!context) return [];
  const values = Array.isArray(context.targetUuids) ? context.targetUuids : [];
  const deduped = [];
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    deduped.push(value);
  }
  return deduped;
}

function createIssue(severity, code, message, details = {}) {
  return {
    severity,
    code,
    message,
    ...details,
  };
}

function debugTargetResolution(result, options = {}) {
  if (options.quiet || globalThis.game?.settings?.get?.("marvel-multiverse", "debug") !== true) return;
  console.groupCollapsed("Marvel Multiverse Stored Targets");
  console.log(`Requested: ${result.summary.requestedCount}`);
  console.log(`Resolved: ${result.summary.resolvedCount}`);
  console.log(`Missing: ${result.summary.missingCount}`);
  console.log(`Inaccessible: ${result.summary.inaccessibleCount}`);
  console.log(`Invalid: ${result.summary.invalidCount}`);
  console.groupEnd();
}

function normalizeTargetEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.uuid && typeof entry.uuid === "string") return entry;
  return null;
}

function resolveActorFromToken(tokenDocument, options = {}) {
  if (!tokenDocument) return null;
  if (typeof tokenDocument.actor === "object" && tokenDocument.actor) return tokenDocument.actor;
  if (tokenDocument.documentName === "Token" && tokenDocument.actor?.uuid) return tokenDocument.actor;
  if (options.actor) return options.actor;
  return null;
}

function canPerformPositionalAction(targetEntry) {
  return Boolean(targetEntry?.tokenDocument && targetEntry?.scene && targetEntry?.tokenDocument?.uuid);
}

function getResolvedTargetActors(result) {
  return (result?.resolved ?? []).filter((entry) => entry?.actor).map((entry) => entry.actor);
}

function getResolvedTargetTokens(result) {
  return (result?.resolved ?? []).filter((entry) => entry?.tokenDocument).map((entry) => entry.tokenDocument);
}

async function resolveTargetUuid(uuid, options = {}) {
  const result = {
    uuid,
    targetType: "token",
    tokenDocument: null,
    tokenObject: null,
    actor: null,
    scene: null,
    isOnActiveScene: false,
    isVisibleToUser: false,
    resolved: false,
    issues: [],
  };

  if (!isValidTargetUuid(uuid)) {
    result.issues.push(createIssue("warning", "STORED_TARGET_INVALID_UUID", "Stored target UUID is invalid.", { uuid }));
    return result;
  }

  try {
    const document = globalThis.fromUuidSync ? globalThis.fromUuidSync(uuid) : null;
    const resolved = document && typeof document.then === "function"
      ? await document
      : document ?? (globalThis.fromUuid ? await globalThis.fromUuid(uuid) : null);
    if (!resolved) {
      result.issues.push(createIssue("warning", "STORED_TARGET_NOT_FOUND", "A target stored on this roll no longer exists.", { uuid }));
      return result;
    }

    if (resolved.documentName === "Actor") {
      result.targetType = "actor";
      result.actor = resolved;
      result.resolved = true;
      return result;
    }

    if (resolved.documentName !== "Token") {
      result.issues.push(createIssue("warning", "STORED_TARGET_INVALID_UUID", "Stored target UUID does not resolve to a token or actor.", { uuid }));
      return result;
    }

    result.tokenDocument = resolved;
    result.actor = resolveActorFromToken(resolved, options);
    result.scene = resolved.parent ?? null;
    result.isOnActiveScene = Boolean(result.scene && result.scene.id === globalThis.canvas?.scene?.id);
    result.isVisibleToUser = typeof resolved.canUserView === "function" ? resolved.canUserView(globalThis.game?.user) : true;

    const user = globalThis.game?.user;
    if (options.checkPermissions !== false && typeof resolved.testUserPermission === "function" && !resolved.testUserPermission(user, "OWNER")) {
      result.issues.push(createIssue("warning", "STORED_TARGET_PERMISSION_DENIED", "This target exists but is not accessible to the current user.", { uuid }));
      return result;
    }

    result.resolved = true;
    if (result.scene?.id === globalThis.canvas?.scene?.id) {
      result.tokenObject = globalThis.canvas?.tokens?.placeables?.find((token) => token?.document?.uuid === uuid) ?? null;
    } else {
      result.tokenObject = null;
    }
    return result;
  } catch (error) {
    result.issues.push(createIssue("warning", "STORED_TARGET_NOT_FOUND", error?.message ?? "Target resolution failed.", { uuid }));
    return result;
  }
}

export async function resolveTargetUuids(targetUuids, options = {}) {
  const normalizedUuids = [];
  const seen = new Set();
  for (const value of Array.isArray(targetUuids) ? targetUuids : []) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalizedUuids.push(value);
  }

  const result = {
    targetUuids: normalizedUuids,
    resolved: [],
    missing: [],
    inaccessible: [],
    invalid: [],
    issues: [],
    summary: {
      requestedCount: 0,
      resolvedCount: 0,
      missingCount: 0,
      inaccessibleCount: 0,
      invalidCount: 0,
    },
    usedLegacyCurrentTargets: false,
  };

  result.summary.requestedCount = normalizedUuids.length;

  for (const uuid of normalizedUuids) {
    const entry = await resolveTargetUuid(uuid, options);
    if (!isValidTargetUuid(uuid)) {
      result.invalid.push({ uuid, reason: "invalid" });
      result.summary.invalidCount += 1;
      result.issues.push(createIssue("warning", "STORED_TARGET_INVALID_UUID", "Stored target UUID is invalid.", { uuid }));
      continue;
    }
    const issue = entry.issues?.find((item) => item.code === "STORED_TARGET_PERMISSION_DENIED");
    if (issue) {
      result.inaccessible.push({ uuid, reason: "permission" });
      result.summary.inaccessibleCount += 1;
      result.issues.push(issue);
      continue;
    }
    if (!entry.resolved) {
      result.missing.push({ uuid, reason: entry.issues?.[0]?.code === "STORED_TARGET_NOT_FOUND" ? "not-found" : "unresolved" });
      result.summary.missingCount += 1;
      result.issues.push(...entry.issues);
      continue;
    }
    if (options.requireToken && entry.targetType !== "token") {
      result.missing.push({ uuid, reason: "token-required" });
      result.summary.missingCount += 1;
      result.issues.push(createIssue("warning", "STORED_TARGET_NOT_FOUND", "A token target was required but this stored target is actor-only.", { uuid }));
      continue;
    }
    if (options.requireActor && !entry.actor) {
      result.missing.push({ uuid, reason: "actor-required" });
      result.summary.missingCount += 1;
      result.issues.push(createIssue("warning", "STORED_TARGET_ACTOR_MISSING", "A target actor could not be resolved.", { uuid }));
      continue;
    }
    if (options.requireActiveScene && !entry.isOnActiveScene) {
      result.missing.push({ uuid, reason: "inactive-scene" });
      result.summary.missingCount += 1;
      result.issues.push(createIssue("warning", "STORED_TARGET_INACTIVE_SCENE", "Stored target was on an inactive scene.", { uuid }));
      continue;
    }
    result.resolved.push({
      uuid,
      targetType: entry.targetType,
      tokenDocument: entry.tokenDocument,
      tokenObject: entry.tokenObject,
      actor: entry.actor,
      scene: entry.scene,
      isOnActiveScene: entry.isOnActiveScene,
      isVisibleToUser: entry.isVisibleToUser,
    });
    result.summary.resolvedCount += 1;
  }

  result.summary.invalidCount = result.invalid.length;
  result.summary.missingCount = result.missing.length;
  result.summary.inaccessibleCount = result.inaccessible.length;
  result.summary.resolvedCount = result.resolved.length;
  debugTargetResolution(result, options);
  return result;
}

export async function resolveStoredTargets(message, options = {}) {
  const resolvedOptions = { requireToken: false, requireActor: true, requireActiveScene: false, checkPermissions: true, allowLegacyCurrentTargets: false, quiet: false, ...options };
  const context = getMessageRollContext(message);
  if (!context) {
    const issue = createIssue("warning", "ROLL_CONTEXT_MISSING", "This message does not contain structured roll context, so locked targets are unavailable.", { messageId: message?.id ?? null });
    const result = {
      targetUuids: [],
      resolved: [],
      missing: [],
      inaccessible: [],
      invalid: [],
      issues: [issue],
      summary: { requestedCount: 0, resolvedCount: 0, missingCount: 0, inaccessibleCount: 0, invalidCount: 0 },
      usedLegacyCurrentTargets: false,
    };
    if (resolvedOptions.allowLegacyCurrentTargets) {
      const legacyTargets = Array.isArray(globalThis.game?.user?.targets) ? Array.from(globalThis.game.user.targets) : [];
      const legacyUuids = legacyTargets.map((target) => target?.uuid ?? target?.document?.uuid ?? target).filter(Boolean);
      result.usedLegacyCurrentTargets = true;
      result.targetUuids = legacyUuids;
      result.issues.unshift(createIssue("warning", "LEGACY_CURRENT_TARGETS_USED", "Current targets were used as a legacy fallback because no stored roll context was available.", { messageId: message?.id ?? null }));
      const legacyResolution = await resolveTargetUuids(legacyUuids, { ...resolvedOptions, allowLegacyCurrentTargets: false });
      return {
        ...result,
        ...legacyResolution,
        issues: [...result.issues, ...(legacyResolution.issues ?? [])],
        summary: {
          ...result.summary,
          ...legacyResolution.summary,
        },
        usedLegacyCurrentTargets: true,
      };
    }
    return result;
  }

  const targetUuids = getStoredTargetUuids(message);
  const result = await resolveTargetUuids(targetUuids, { ...resolvedOptions, checkPermissions: resolvedOptions.checkPermissions });
  return {
    ...result,
    targetUuids: result.targetUuids,
  };
}

export { getStoredTargetUuids, resolveTargetUuid, canPerformPositionalAction, getResolvedTargetActors, getResolvedTargetTokens };
