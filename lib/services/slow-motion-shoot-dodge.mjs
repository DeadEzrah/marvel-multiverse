import { updateChatMessageFlags } from "../chat-message-state.mjs";
import { applyActorStatus } from "../conditions.mjs";
import { resolveActiveCombat } from "./round-targeting.mjs";

const AUTOMATION_ID = "slow-motion-shoot-dodge";
const expirationQueues = new WeakMap();

function getFlag(document, key) {
  return document?.getFlag?.("marvel-multiverse", key)
    ?? document?.flags?.["marvel-multiverse"]?.[key]
    ?? null;
}

function collectionToArray(collection) {
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (collection && typeof collection[Symbol.iterator] === "function") return [...collection];
  return [];
}

function isPrimaryAuthority() {
  const user = globalThis.game?.user;
  if (!user?.isGM) return false;
  const activeGM = globalThis.game?.users?.activeGM;
  return !activeGM || activeGM.id === user.id;
}

function isSlowMotionSource(item) {
  return getFlag(item, "automation") === AUTOMATION_ID
    || item?.name === "Slow-Motion Shoot-Dodge";
}

function findEffect(actor) {
  return collectionToArray(actor?.effects).find((effect) =>
    getFlag(effect, AUTOMATION_ID)?.active === true);
}

function resolveActor(message, options = {}) {
  if (options.actor) return options.actor;
  const actorUuid = getFlag(message, "rollContext")?.actorUuid;
  if (!actorUuid || typeof globalThis.fromUuidSync !== "function") return null;
  const resolved = globalThis.fromUuidSync(actorUuid);
  return resolved?.actor ?? resolved;
}

function resolveCombatant(combat, actor) {
  return collectionToArray(combat?.combatants).find((combatant) =>
    combatant?.actor?.uuid === actor?.uuid || combatant?.actorId === actor?.id) ?? null;
}

export async function activateSlowMotionShootDodge(message, item, options = {}) {
  if (!isSlowMotionSource(item)) return { success: false, reason: "not-applicable" };
  if (!options.force && !isPrimaryAuthority()) return { success: false, reason: "not-authority" };
  const actor = resolveActor(message, options);
  if (!actor || typeof actor.createEmbeddedDocuments !== "function") return { success: false, reason: "actor-missing" };

  const existing = findEffect(actor);
  if (existing && typeof actor.deleteEmbeddedDocuments === "function") {
    await actor.deleteEmbeddedDocuments("ActiveEffect", [existing.id ?? existing._id]);
  }

  const combat = options.combat ?? resolveActiveCombat();
  const combatant = resolveCombatant(combat, actor);
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: "Slow-Motion Shoot-Dodge",
    img: item?.img ?? "systems/marvel-multiverse/icons/super-powers.svg",
    changes: [],
    statuses: [],
    flags: {
      "marvel-multiverse": {
        defensiveRollModifier: {
          mode: "trouble",
          count: 1,
          label: "Slow-Motion Shoot-Dodge",
          defenses: ["agl"],
          endConcentrationOnSuccessfulAttack: false,
        },
        [AUTOMATION_ID]: {
          active: true,
          combatId: combat?.id ?? null,
          combatantId: combatant?.id ?? null,
          sourceMessageUuid: message?.uuid ?? null,
        },
      },
    },
  }]);

  if (message && effect) {
    await updateChatMessageFlags(message, {
      slowMotionShootDodge: {
        actorUuid: actor.uuid ?? null,
        effectId: effect.id ?? effect._id ?? null,
      },
    });
  }
  return { success: Boolean(effect), actor, effect };
}

async function performExpiration(actor, options) {
  const effect = findEffect(actor);
  if (!effect) return { success: false, reason: "effect-missing" };
  if (typeof actor?.deleteEmbeddedDocuments !== "function") return { success: false, reason: "actor-unsupported" };
  await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id ?? effect._id]);
  const statusResult = options.applyProne === false
    ? null
    : await (options.applyStatus ?? applyActorStatus)({ actor, status: "prone", mode: "apply" });
  return { success: statusResult ? statusResult.success : true, effectId: effect.id ?? effect._id, statusResult };
}

export function expireSlowMotionShootDodge(actor, options = {}) {
  if (!actor || typeof actor !== "object") return Promise.resolve({ success: false, reason: "actor-missing" });
  const previous = expirationQueues.get(actor) ?? Promise.resolve();
  const current = previous.then(
    () => performExpiration(actor, options),
    () => performExpiration(actor, options),
  );
  expirationQueues.set(actor, current);
  const cleanup = () => {
    if (expirationQueues.get(actor) === current) expirationQueues.delete(actor);
  };
  void current.then(cleanup, cleanup);
  return current;
}

export async function handleSlowMotionTokenMovement(token, changes, options = {}) {
  if (!Object.hasOwn(changes ?? {}, "x")
    && !Object.hasOwn(changes ?? {}, "y")
    && !Object.hasOwn(changes ?? {}, "elevation")) {
    return { success: false, reason: "not-movement" };
  }
  if (!options.force && !isPrimaryAuthority()) return { success: false, reason: "not-authority" };
  const actor = token?.actor ?? token?.parent?.actor ?? null;
  if (!actor) return { success: false, reason: "actor-missing" };
  return expireSlowMotionShootDodge(actor, options);
}

export async function sweepSlowMotionNextTurn(combat, combatantId = combat?.combatant?.id, options = {}) {
  if (!combatantId) return { success: false, expiredCount: 0, reason: "combatant-missing" };
  if (!options.force && !isPrimaryAuthority()) return { success: false, expiredCount: 0, reason: "not-authority" };
  const actors = collectionToArray(options.actors ?? globalThis.game?.actors);
  let expiredCount = 0;
  for (const actor of actors) {
    const effect = findEffect(actor);
    const state = getFlag(effect, AUTOMATION_ID);
    if (!state?.active || state.combatId !== combat?.id || state.combatantId !== combatantId) continue;
    const result = await expireSlowMotionShootDodge(actor, options);
    if (result.success) expiredCount += 1;
  }
  return { success: true, expiredCount };
}
