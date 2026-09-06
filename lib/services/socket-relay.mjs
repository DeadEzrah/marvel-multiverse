import {
  applyMessageDamage,
  hasAppliedMessageDamage,
  recordActionDamageApplication,
  undoMessageDamage,
} from "../damage-application.mjs";
import { applyResolvedDamage } from "./damage-resolver.mjs";

const SOCKET_NAMESPACE = "marvel-multiverse";
const RPC_APPLY_DAMAGE = "applyDamageForMessage";
const RPC_APPLY_ACTION_ROLL_DAMAGE = "applyActionRollDamage";
const RPC_UNDO_DAMAGE = "undoDamageForMessage";

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
export async function applyDamageForMessageRpc(messageId, options = {}) {
  const message = getMessage(messageId);
  if (!message) return { success: false, reason: "message-not-found" };
  if (hasNonUndoneDamage(message)) return { success: false, reason: "already-applied" };
  const actionDamage = message.getFlag?.("marvel-multiverse", "actionDamage") ?? null;
  if ((options.mode ?? "full") === "full" && actionDamage?.damage?.hit) {
    return applyActionRollDamageRpc(messageId);
  }

  const result = await applyMessageDamage(message, { ...options, quiet: true });
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
  if (actionDamage.apply?.success && actionDamage.apply?.undone !== true) return { success: false, reason: "already-applied" };

  if (actionDamage.damage.multiTarget) {
    const previousApplications = new Map(
      (actionDamage.apply?.undone === true ? [] : actionDamage.apply?.targets ?? [])
        .map((entry) => [entry.tokenUuid ?? entry.actorUuid, entry]),
    );
    const applications = [];
    for (const targetDamage of actionDamage.damage.targets ?? []) {
      const key = targetDamage.tokenUuid ?? targetDamage.actorUuid;
      const previous = previousApplications.get(key);
      if (previous?.apply?.success || !targetDamage.damage?.hit) {
        applications.push(previous ?? {
          tokenUuid: targetDamage.tokenUuid ?? null,
          actorUuid: targetDamage.actorUuid ?? null,
          name: targetDamage.name ?? null,
          apply: { success: false, reason: "not-applicable" },
        });
        continue;
      }

      const target = key && typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(key) : null;
      const targetActor = target?.documentName === "Actor" ? target : target?.actor ?? null;
      const apply = targetActor
        ? await applyResolvedDamage(targetActor, targetDamage.damage, { user: globalThis.game?.user })
        : { success: false, reason: "target-missing" };
      applications.push({
        tokenUuid: targetDamage.tokenUuid ?? null,
        actorUuid: targetDamage.actorUuid ?? null,
        name: targetDamage.name ?? null,
        apply,
      });
    }

    const applicable = applications.filter((entry) => entry.apply.reason !== "not-applicable");
    const failed = applicable.find((entry) => !entry.apply.success);
    const applyResult = {
      success: applicable.length > 0 && !failed,
      multiTarget: true,
      reason: failed?.apply?.reason ?? null,
      targets: applications,
    };
    const updatedActionDamage = { ...actionDamage, apply: applyResult };
    await message.update?.({ "flags.marvel-multiverse.actionDamage": updatedActionDamage });
    if (applyResult.success) await recordActionDamageApplication(message, updatedActionDamage);
    return applyResult;
  }

  const targetUuid = actionDamage.targetUuid ?? null;
  const target = targetUuid && typeof globalThis.fromUuidSync === "function" ? globalThis.fromUuidSync(targetUuid) : null;
  const targetActor = target?.documentName === "Actor" ? target : target?.actor ?? null;
  if (!targetActor) return { success: false, reason: "target-missing" };

  const applyResult = await applyResolvedDamage(targetActor, actionDamage.damage, { user: globalThis.game?.user });
  const updatedActionDamage = { ...actionDamage, apply: applyResult };
  await message.update?.({ "flags.marvel-multiverse.actionDamage": updatedActionDamage });
  if (applyResult.success) await recordActionDamageApplication(message, updatedActionDamage);
  return applyResult;
}

export async function undoDamageForMessageRpc(messageId) {
  const message = getMessage(messageId);
  if (!message) return { success: false, reason: "message-not-found" };
  return undoMessageDamage(message, { quiet: true });
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
  registeredSocket.register(RPC_UNDO_DAMAGE, undoDamageForMessageRpc);
  return registeredSocket;
}

export async function requestApplyMessageDamage(messageId, options = {}) {
  if (registeredSocket) {
    try {
      return await registeredSocket.executeAsGM(RPC_APPLY_DAMAGE, messageId, options);
    } catch (error) {
      console.warn("Marvel Multiverse | socketlib damage request failed", error);
      return { success: false, reason: "socketlib-request-failed" };
    }
  }
  const message = getMessage(messageId);
  return message ? applyMessageDamage(message, options) : { success: false, reason: "message-not-found" };
}

export async function requestUndoMessageDamage(messageId) {
  if (registeredSocket) {
    try {
      return await registeredSocket.executeAsGM(RPC_UNDO_DAMAGE, messageId);
    } catch (error) {
      console.warn("Marvel Multiverse | socketlib damage undo request failed", error);
      return { success: false, reason: "socketlib-request-failed" };
    }
  }
  return undoDamageForMessageRpc(messageId);
}

// Requests damage application for `messageId`, relaying to a connected GM client via socketlib
// when available so it works regardless of which client's attack roll triggered it. Without
// socketlib, the normal document permission checks still govern the direct fallback.
export async function requestAutoApplyDamage(messageId) {
  return requestApplyMessageDamage(messageId, { mode: "full" });
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
