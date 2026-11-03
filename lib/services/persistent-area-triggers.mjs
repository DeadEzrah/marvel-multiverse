import { applyMessageConditions } from "../conditions.mjs";
import { recordStatusTransaction } from "../escape-automation.mjs";
import { updateChatMessageFlags } from "../chat-message-state.mjs";
import { requestRoll } from "./action-roll.mjs";
import { normalizePersistentAreaTrigger } from "./persistent-area-trigger-schema.mjs";

export { normalizePersistentAreaTrigger } from "./persistent-area-trigger-schema.mjs";

export function matchesPersistentAreaTrigger(trigger, event, membership = {}) {
  const normalized = normalizePersistentAreaTrigger(trigger);
  if (!normalized || !normalized.events.includes(event)) return false;
  if (event === "enter") return membership.wasInside === false && membership.isInside === true;
  return event === "start-turn" && membership.isInside === true;
}

function getRegionTrigger(region) {
  return normalizePersistentAreaTrigger(
    region?.flags?.["marvel-multiverse"]?.powerArea?.trigger
      ?? region?.document?.flags?.["marvel-multiverse"]?.powerArea?.trigger,
  );
}

function resolveTargetUuid(token) {
  const document = token?.document ?? token;
  return document?.uuid ?? token?.uuid ?? null;
}

function resolveActor(token) {
  return token?.actor ?? token?.document?.actor ?? null;
}

function createCheckSource(region, trigger) {
  const area = region?.document ?? region;
  return {
    name: area?.name ?? "Persistent Power Area",
    system: {
      ability: trigger.check.ability,
      damage: { enabled: false },
      targeting: { required: false, count: 0 },
    },
  };
}

export function isPersistentAreaTriggerAuthority(token, game = globalThis.game) {
  const currentUser = game?.user;
  if (!currentUser?.id) return false;
  const actor = resolveActor(token);
  const activeOwners = Array.from(game?.users ?? [])
    .filter((user) => user?.active && !user?.isGM && actor?.testUserPermission?.(user, "OWNER"))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (activeOwners.length) return activeOwners[0].id === currentUser.id;
  const activeGM = game?.users?.activeGM;
  if (activeGM) return activeGM.id === currentUser.id;
  return Boolean(currentUser.isGM);
}

export async function requestPersistentAreaCheck(region, token, event, options = {}) {
  const trigger = getRegionTrigger(region);
  const isInside = options.isInside ?? true;
  const wasInside = options.wasInside ?? (event === "enter" ? false : isInside);
  if (!matchesPersistentAreaTrigger(trigger, event, { wasInside, isInside })) {
    return { matched: false, requested: false };
  }

  const actor = resolveActor(token);
  const targetUuid = resolveTargetUuid(token);
  if (!actor || !targetUuid) return { matched: true, requested: false, reason: "target-unavailable" };

  const rollRequest = options.requestRoll ?? requestRoll;
  const rollResult = await rollRequest({
    actor,
    token: token?.document ?? token,
    source: createCheckSource(region, trigger),
    actionName: `${region?.name ?? region?.document?.name ?? "Power Area"} ${trigger.check.ability.toUpperCase()} Check`,
    actionType: "ability",
    ability: trigger.check.ability,
    targetNumber: trigger.check.targetNumber,
    isAttack: false,
    dealsDamage: false,
    targets: [],
  });
  if (rollResult?.cancelled || !rollResult?.message) {
    return { matched: true, requested: true, cancelled: true, rollResult };
  }

  const message = rollResult.message;
  await updateChatMessageFlags(message, {
    "marvel-multiverse": {
      persistentAreaTrigger: {
        version: 1,
        event,
        regionUuid: region?.uuid ?? region?.document?.uuid ?? null,
        targetUuid,
        check: trigger.check,
      },
    },
  });
  if (rollResult.result?.isSuccess) {
    return { matched: true, requested: true, success: true, statusApplied: false, message };
  }

  const applyConditions = options.applyMessageConditions ?? applyMessageConditions;
  const conditionResult = await applyConditions(message, {
    conditions: [trigger.failure.statusId],
    targetUuids: [targetUuid],
  });
  const targetApplication = conditionResult?.transaction?.targets?.find((target) => target.targetUuid === targetUuid);
  const effectIds = targetApplication?.effectIds ?? [];
  let statusTransaction = null;
  if (effectIds.length) {
    const recordTransaction = options.recordStatusTransaction ?? recordStatusTransaction;
    statusTransaction = await recordTransaction(message, {
      actorUuid: actor.uuid ?? null,
      targetUuid,
      statuses: [{ statusKey: trigger.failure.statusId, effectIds }],
      escape: {
        ability: trigger.failure.escape.ability,
        tn: trigger.failure.escape.targetNumber,
        edgeMode: "normal",
        removesStatuses: [trigger.failure.statusId],
        timing: trigger.failure.escape.timing,
      },
    });
  }
  return {
    matched: true,
    requested: true,
    success: false,
    statusApplied: effectIds.length > 0,
    statusSkipped: effectIds.length === 0,
    conditionResult,
    statusTransaction,
    message,
  };
}

function tokenPoint(token, gridSize = 100, position = {}) {
  const document = token?.document ?? token;
  const x = Number(position.x ?? document?.x);
  const y = Number(position.y ?? document?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: x + (Number(document?.width ?? 1) * gridSize) / 2,
    y: y + (Number(document?.height ?? 1) * gridSize) / 2,
    elevation: Number(position.elevation ?? document?.elevation ?? 0),
  };
}

export function isTokenInsidePersistentArea(region, token, options = {}) {
  const document = region?.document ?? region;
  if (!getRegionTrigger(document) || typeof document?.testPoint !== "function") return false;
  const point = tokenPoint(token, options.gridSize, options.position);
  return point ? Boolean(document.testPoint(point)) : false;
}

export function getPersistentTriggerRegions(token, options = {}) {
  const scene = options.scene ?? token?.parent ?? token?.document?.parent ?? globalThis.canvas?.scene;
  return Array.from(scene?.regions ?? []).filter((region) => Boolean(getRegionTrigger(region)));
}

export async function handlePersistentAreaEntry(token, previousMembership = new Map(), options = {}) {
  if (!isPersistentAreaTriggerAuthority(token, options.game) && options.ignoreAuthority !== true) return [];
  const results = [];
  for (const region of getPersistentTriggerRegions(token, options)) {
    const regionId = region.uuid ?? region.id;
    const wasInside = previousMembership.get(regionId) === true;
    const isInside = isTokenInsidePersistentArea(region, token, options);
    if (!matchesPersistentAreaTrigger(getRegionTrigger(region), "enter", { wasInside, isInside })) continue;
    results.push(await requestPersistentAreaCheck(region, token, "enter", { ...options, wasInside, isInside }));
  }
  return results;
}

export async function handlePersistentAreaTurnStart(combat, options = {}) {
  const combatant = options.combatant ?? combat?.combatant;
  const tokenDocument = combatant?.token ?? combatant?.tokenDocument
    ?? globalThis.canvas?.scene?.tokens?.get?.(combatant?.tokenId);
  const token = tokenDocument?.object ?? tokenDocument;
  if (!token) return [];
  if (!isPersistentAreaTriggerAuthority(token, options.game) && options.ignoreAuthority !== true) return [];
  const results = [];
  for (const region of getPersistentTriggerRegions(token, options)) {
    const isInside = isTokenInsidePersistentArea(region, token, options);
    if (!matchesPersistentAreaTrigger(getRegionTrigger(region), "start-turn", { isInside })) continue;
    results.push(await requestPersistentAreaCheck(region, token, "start-turn", { ...options, isInside }));
  }
  return results;
}
