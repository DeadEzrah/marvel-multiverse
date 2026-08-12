function resolveDocumentFromUuid(uuid) {
  if (typeof uuid !== "string" || !uuid.trim()) return null;
  if (typeof globalThis.fromUuidSync !== "function") return null;
  const resolved = globalThis.fromUuidSync(uuid);
  return resolved ?? null;
}

function resolveActorFromDocument(document) {
  if (!document || typeof document !== "object") return null;
  if (document.documentName === "Actor") return document;
  if (document.documentName === "Token" || document.documentName === "TokenDocument") {
    return document.actor ?? null;
  }
  return document.actor ?? null;
}

export function resolveActorForMutation({ actor = null, actorUuid = null, tokenUuid = null } = {}) {
  if (actor && typeof actor === "object") return actor;
  const actorFromUuid = resolveActorFromDocument(resolveDocumentFromUuid(actorUuid));
  if (actorFromUuid) return actorFromUuid;
  const tokenFromUuid = resolveDocumentFromUuid(tokenUuid);
  return resolveActorFromDocument(tokenFromUuid);
}

export function hasActorMutationPermission(actor, options = {}) {
  const user = options.user ?? globalThis.game?.user ?? null;
  if (!user) return false;
  if (user.isGM) return true;
  if (!actor || typeof actor !== "object") return false;
  if (actor.isOwner === true || actor.owner === true) return true;
  if (typeof actor.testUserPermission === "function") {
    try {
      return Boolean(actor.testUserPermission(user, "OWNER"));
    } catch {
      return false;
    }
  }
  return false;
}

export function canMutateMessage(options = {}) {
  const {
    message = null,
    actor = null,
    actorUuid = null,
    tokenUuid = null,
    rollContext = null,
    allowMessageOwner = true,
  } = options;

  const user = options.user ?? globalThis.game?.user ?? null;
  if (!user) {
    return { allowed: false, reason: "missing-user", actor: null };
  }
  if (user.isGM) {
    return { allowed: true, reason: "gm", actor: resolveActorForMutation({ actor, actorUuid, tokenUuid }) };
  }

  const resolvedActor = resolveActorForMutation({
    actor,
    actorUuid: actorUuid ?? rollContext?.actorUuid ?? null,
    tokenUuid: tokenUuid ?? rollContext?.tokenUuid ?? null,
  });

  if (resolvedActor && hasActorMutationPermission(resolvedActor, { user })) {
    return { allowed: true, reason: "actor-owner", actor: resolvedActor };
  }

  if (allowMessageOwner && message?.isOwner) {
    return { allowed: true, reason: "message-owner", actor: resolvedActor };
  }

  return { allowed: false, reason: "permission-denied", actor: resolvedActor };
}
