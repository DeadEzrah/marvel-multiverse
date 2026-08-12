import { applyMessageDamage, hasAppliedMessageDamage } from "../damage-application.mjs";
import { applyResolvedDamage } from "./damage-resolver.mjs";

const SOCKET_NAMESPACE = "marvel-multiverse";
const RPC_APPLY_DAMAGE = "applyDamageForMessage";
const RPC_APPLY_ACTION_ROLL_DAMAGE = "applyActionRollDamage";

let registeredSocket = null;

function getMessage(messageId) {
  return globalThis.game?.messages?.get?.(messageId) ?? null;
}

function hasNonUndoneDamage(message) {
  return hasAppliedMessageDamage(message);
}

// The RPC handler socketlib invokes on a GM's client (via executeAsGM) so a non-GM player's
// hit can apply damage to a GM-owned actor without a manual button click. Guards against
// double-applying damage if a transaction already exists for this message (e.g. the GM already
// clicked "Apply Damage" manually, or this hook already fired once for the same message).
export async function applyDamageForMessageRpc(messageId) {
  const message = getMessage(messageId);
  if (!message) return { success: false, reason: "message-not-found" };
  if (hasNonUndoneDamage(message)) return { success: false, reason: "already-applied" };

  const result = await applyMessageDamage(message, { mode: "full", quiet: true });
  if (result?.success && typeof message._applyIntegratedConditions === "function") {
    await message._applyIntegratedConditions(message);
  }
  return { success: Boolean(result?.success), transactionId: result?.transactionId ?? null };
}

// The RPC handler for the newer Action Roll damage workflow (lib/services/action-roll.mjs +
// lib/services/damage-resolver.mjs). Unlike applyDamageForMessageRpc, this never re-derives hit/
// miss or recalculates damage - it reads the already-resolved `actionDamage` flag (the pending
// resolution/target uuid recorded before the message existed) and performs only the Actor Health/
// Focus document update on the GM's client, then stamps the flag with the real applied result.
export async function applyActionRollDamageRpc(messageId) {
  const message = getMessage(messageId);
  if (!message) return { success: false, reason: "message-not-found" };

  const actionDamage = message.getFlag?.("marvel-multiverse", "actionDamage") ?? null;
  if (!actionDamage?.damage?.hit) return { success: false, reason: "no-pending-damage" };
  if (actionDamage.apply?.success) return { success: false, reason: "already-applied" };

  const targetUuid = actionDamage.targetUuid ?? null;
  const target = targetUuid && typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(targetUuid) : null;
  const targetActor = target?.documentName === "Actor" ? target : target?.actor ?? null;
  if (!targetActor) return { success: false, reason: "target-missing" };

  const applyResult = await applyResolvedDamage(targetActor, actionDamage.damage, { user: globalThis.game?.user });
  await message.update?.({ "flags.marvel-multiverse.actionDamage.apply": applyResult });
  return applyResult;
}

export function isSocketlibActive() {
  return Boolean(globalThis.game?.modules?.get?.("socketlib")?.active);
}

// Call from a Hooks.once("socketlib.ready", ...) listener - socketlib requires functions to be
// registered only once it has finished its own setup, per the module's documented integration
// pattern (mirrors the diceSoNiceReady precedent already used in this codebase).
export function registerSocketRelay() {
  const socketlib = globalThis.socketlib;
  if (!socketlib?.registerSystem) return null;
  registeredSocket = socketlib.registerSystem(SOCKET_NAMESPACE);
  registeredSocket.register(RPC_APPLY_DAMAGE, applyDamageForMessageRpc);
  registeredSocket.register(RPC_APPLY_ACTION_ROLL_DAMAGE, applyActionRollDamageRpc);
  return registeredSocket;
}

// Requests damage application for `messageId`, relaying to a connected GM client via socketlib
// when available so it works regardless of which client's attack roll triggered it. Falls back
// to applying directly when the current user is already the GM (works even without socketlib),
// and no-ops (returning a failure reason) when neither path is available - callers should treat
// that as "requires a GM online and/or the socketlib module" rather than an error to surface loudly.
export async function requestAutoApplyDamage(messageId) {
  if (registeredSocket) {
    try {
      return await registeredSocket.executeAsGM(RPC_APPLY_DAMAGE, messageId);
    } catch (error) {
      console.warn("Marvel Multiverse | socketlib auto-apply-on-hit request failed", error);
      return { success: false, reason: "socketlib-request-failed" };
    }
  }
  if (globalThis.game?.user?.isGM) {
    return applyDamageForMessageRpc(messageId);
  }
  return { success: false, reason: "socketlib-unavailable" };
}

// Same GM-relay pattern as requestAutoApplyDamage, routed to the Action Roll damage workflow's
// own RPC instead - used when a player rolling an Action Roll attack doesn't own the target Actor
// (e.g. a GM-owned NPC), so the Health/Focus update still happens without an insecure client-side
// write and without requiring the GM to click anything.
export async function requestAutoApplyActionDamage(messageId) {
  if (registeredSocket) {
    try {
      return await registeredSocket.executeAsGM(RPC_APPLY_ACTION_ROLL_DAMAGE, messageId);
    } catch (error) {
      console.warn("Marvel Multiverse | socketlib action-roll damage relay failed", error);
      return { success: false, reason: "socketlib-request-failed" };
    }
  }
  if (globalThis.game?.user?.isGM) {
    return applyActionRollDamageRpc(messageId);
  }
  return { success: false, reason: "socketlib-unavailable" };
}
