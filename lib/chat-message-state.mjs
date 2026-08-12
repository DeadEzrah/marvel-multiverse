function isMessageLike(value) {
  return Boolean(value && typeof value === "object" && (typeof value.update === "function" || typeof value.getFlag === "function"));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeFlagValues(existingValue, incomingValue) {
  if (isPlainObject(existingValue) && isPlainObject(incomingValue)) {
    const merged = { ...(existingValue ?? {}) };
    for (const [key, value] of Object.entries(incomingValue ?? {})) {
      merged[key] = mergeFlagValues(existingValue?.[key], value);
    }
    return merged;
  }
  return incomingValue;
}

function mergeFlagPayloads(existingPayload = {}, incomingPayload = {}) {
  const merged = { ...(existingPayload ?? {}) };
  for (const [scope, scopeValue] of Object.entries(incomingPayload ?? {})) {
    merged[scope] = mergeFlagValues(existingPayload?.[scope], scopeValue);
  }
  return merged;
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqual(left[index], right[index])) return false;
    }
    return true;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
      if (!deepEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function sanitizeForFlags(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForFlags(entry, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) return null;
    seen.add(value);
    if (typeof value.toJSON === "function") {
      try {
        return sanitizeForFlags(value.toJSON(), seen);
      } catch {
        // Fall through to a plain-object sanitization.
      }
    }
    if (isPlainObject(value)) {
      const result = {};
      for (const [key, entry] of Object.entries(value)) {
        if (key.startsWith("_")) continue;
        result[key] = sanitizeForFlags(entry, seen);
      }
      return result;
    }
    return null;
  }
  return null;
}

function getCurrentScopeFlags(message) {
  if (typeof message?.getFlag === "function") {
    const scopeFlags = message.getFlag("marvel-multiverse") ?? null;
    if (scopeFlags !== null) return scopeFlags;
  }
  return message?.flags?.["marvel-multiverse"] ?? message?.flags?.marvelMultiverse ?? {};
}

function getUpdateGuard(message) {
  if (!message || typeof message !== "object") return null;
  if (!message.__marvelMultiverseFlagUpdateGuard) {
    message.__marvelMultiverseFlagUpdateGuard = {
      depth: 0,
      pendingPayload: null,
      active: false,
      lastAppliedScopeFlags: null,
      inFlightKeys: new Set(),
    };
  }
  return message.__marvelMultiverseFlagUpdateGuard;
}

function getScopeKeys(scopeValue) {
  if (!isPlainObject(scopeValue)) return [];
  return Object.keys(scopeValue);
}

export async function updateChatMessageFlags(message, flags = {}) {
  if (!isMessageLike(message)) return null;
  if (typeof message.getFlag !== "function" && typeof message.update !== "function") return null;

  const payload = {
    flags: {
      ...(flags ?? {}),
    },
  };

  const sanitizedPayload = {
    flags: Object.fromEntries(
      Object.entries(payload.flags ?? {}).map(([scope, scopeValue]) => [scope, sanitizeForFlags(scopeValue)])
    ),
  };

  const currentScopeFlags = getCurrentScopeFlags(message);
  const nextScopeFlags = mergeFlagValues(currentScopeFlags, sanitizedPayload.flags?.["marvel-multiverse"] ?? {});
  const hasChanges = !deepEqual(currentScopeFlags, nextScopeFlags);

  const guard = getUpdateGuard(message);
  if (guard?.lastAppliedScopeFlags && deepEqual(guard.lastAppliedScopeFlags, nextScopeFlags)) {
    return message;
  }

  if (!hasChanges) {
    return message;
  }

  if (guard?.depth > 0 || guard?.active) {
    const incomingScope = sanitizedPayload.flags?.["marvel-multiverse"] ?? {};
    const incomingKeys = getScopeKeys(incomingScope);
    const hasConflict = incomingKeys.some((key) => guard.inFlightKeys?.has?.(key));
    if (!hasConflict) {
      guard.pendingPayload = mergeFlagPayloads(guard.pendingPayload ?? {}, sanitizedPayload.flags ?? {});
    }
    return message;
  }

  guard.active = true;
  guard.depth += 1;
  guard.inFlightKeys = new Set(getScopeKeys(sanitizedPayload.flags?.["marvel-multiverse"] ?? {}));
  try {
    if (typeof message.update !== "function") return null;
    const mergedPayload = {
      flags: {
        ...(sanitizedPayload.flags ?? {}),
        "marvel-multiverse": nextScopeFlags,
      },
    };
    const result = await message.update(mergedPayload);
    guard.lastAppliedScopeFlags = nextScopeFlags;
    return result;
  } catch (error) {
    if (error?.message?.includes?.("does not exist") || error?.message?.includes?.("not exist")) {
      return null;
    }
    throw error;
  } finally {
    guard.depth = Math.max(0, guard.depth - 1);
    guard.active = false;
    guard.inFlightKeys = new Set();
    if (guard.depth === 0 && guard.pendingPayload) {
      const pendingPayload = guard.pendingPayload;
      guard.pendingPayload = null;
      await updateChatMessageFlags(message, pendingPayload);
    }
  }
}
