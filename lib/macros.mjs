function isOwnedUuid(uuid) {
  return typeof uuid === "string" && (uuid.includes("Actor.") || uuid.includes("Token."));
}

export function shouldHandleHotbarDrop(data) {
  if (!data) return false;
  if (data.type === "MarvelRoll") return true;
  return Boolean(data.uuid && isOwnedUuid(data.uuid));
}

function isItemLikeDropData(data) {
  if (!data?.uuid || !isOwnedUuid(data.uuid)) return false;
  if (data.uuid.includes(".Item.")) return true;

  const type = String(data.type ?? "").toLowerCase();
  return ["item", "weapon", "power", "trait", "tag", "origin", "occupation"].includes(type);
}

function buildFormulaMacroCommand(payload) {
  const serialized = JSON.stringify(payload, null, 2);
  return `
const payload = ${serialized};
fromUuid(payload.actorUuid).then(async (actor) => {
  if (!actor) {
    ui.notifications?.warn?.("Could not resolve actor for this macro.");
    return;
  }

  const item = payload.itemUuid
    ? await fromUuid(payload.itemUuid)
    : actor.items?.find?.((candidate) => candidate.name === payload.itemName) ?? null;
  if (item?.roll) return item.roll();

  const requestRoll = game.marvelMultiverse?.requestRoll || game.MarvelMultiverse?.requestRoll;
  if (typeof requestRoll !== "function") {
    ui.notifications?.warn?.("The Marvel Multiverse action-roll service is unavailable.");
    return;
  }

  const targets = Array.from(game.user?.targets ?? []);
  return requestRoll({
    actor,
    token: actor.token,
    actionName: payload.itemName || payload.label || "Check",
    actionType: payload.isAttack ? "attack" : "ability",
    ability: payload.ability || payload.label,
    baseModifier: payload.baseModifier,
    attackTarget: payload.attackTarget,
    isAttack: Boolean(payload.isAttack),
    dealsDamage: Boolean(payload.dealsDamage || payload.damagetype),
    targets,
  });
});`;
}

export async function migrateLegacyRollMacros() {
  if (!globalThis.game?.user || !globalThis.game?.macros) return 0;

  let migrated = 0;
  for (const macro of globalThis.game.macros) {
    if (!macro.getFlag?.("marvel-multiverse", "rollMacro")) continue;
    if (!macro.canUserModify?.(globalThis.game.user, "update")) continue;
    if (!macro.command?.includes("new CONFIG.Dice.MarvelMultiverseRoll")) continue;

    const payloadMatch = /const payload\s*=\s*(\{[\s\S]*?\});\s*fromUuid/.exec(macro.command);
    if (!payloadMatch) continue;

    let payload;
    try {
      payload = JSON.parse(payloadMatch[1]);
    } catch {
      continue;
    }

    const actor = payload.actorUuid ? await globalThis.fromUuid?.(payload.actorUuid) : null;
    const item = actor?.items?.find?.((candidate) => candidate.name === payload.itemName) ?? null;
    if (!item?.uuid) continue;

    await macro.update({
      command: `game.MarvelMultiverse.rollItemMacro("${item.uuid}");`,
      "flags.marvel-multiverse.itemMacro": true,
      "flags.marvel-multiverse.legacyRollMacroMigrated": true,
    });
    migrated += 1;
  }
  return migrated;
}

async function createFormulaMacro(data, slot) {
  if (!data?.actorUuid || !data?.formula) return;

  const macroLabel = data.itemName || data.label || "Check";
  const command = buildFormulaMacroCommand({
    actorUuid: data.actorUuid,
    itemUuid: data.itemUuid || "",
    formula: data.formula,
    ability: data.ability || data.label || "check",
    baseModifier: data.baseModifier,
    label: data.label || "check",
    title: data.title || "",
    damagetype: data.damagetype || "",
    itemName: data.itemName || "",
    isAttack: Boolean(data.isAttack),
    dealsDamage: Boolean(data.dealsDamage),
  });

  let macro = globalThis.game?.macros?.find?.((candidate) => candidate.name === macroLabel && candidate.command === command);
  if (!macro) {
    macro = await globalThis.Macro?.create?.({
      name: macroLabel,
      type: "script",
      img: data.img || "icons/svg/d20-black.svg",
      command,
      flags: { "marvel-multiverse.rollMacro": true },
    });
  }

  if (macro) {
    globalThis.game?.user?.assignHotbarMacro?.(macro, slot);
  }
  return false;
}

function getPowerRollMacroData(item) {
  if (!item) return null;

  const isExplicitPower = item.type === "power";
  const isPowerLike = Boolean(
    item.system?.powerSet
    || item.system?.action
    || item.system?.trigger
    || item.system?.duration
    || item.system?.cost
    || item.system?.effect
  );
  if (!isExplicitPower && !isPowerLike) return null;

  const ability = item.system?.ability;
  if (!ability) return null;

  return {
    type: "MarvelRoll",
    actorUuid: item.parent?.uuid,
    itemUuid: item.uuid,
    formula: `{1d6,1dm,1d6}+@abilities.${ability}.value`,
    ability,
    label: ability,
    title: `[power] ${item.name}`,
    damagetype: item.system?.damageType ?? "",
    isAttack: Boolean(item.system?.attack || item.system?.attackTarget || item.system?.attackKind || item.system?.attackRange || item.system?.attackMultiplier || item.system?.damageType),
    dealsDamage: Boolean(item.system?.attack || item.system?.attackTarget || item.system?.attackKind || item.system?.attackRange || item.system?.attackMultiplier || item.system?.damageType),
    itemName: item.name,
    img: item.img,
  };
}

export async function createItemMacro(data, slot) {
  if (!data) return;

  if (data.type === "MarvelRoll") {
    return createFormulaMacro(data, slot);
  }

  if (!isItemLikeDropData(data)) return;
  if (!isOwnedUuid(data.uuid)) {
    globalThis.ui?.notifications?.warn?.("You can only create macro buttons for owned Items");
    return;
  }

  const item = await globalThis.Item?.fromDropData?.(data);
  if (!item) return;

  const powerRollData = getPowerRollMacroData(item);
  if (powerRollData) {
    return createFormulaMacro(powerRollData, slot);
  }

  const command = `game.MarvelMultiverse.rollItemMacro("${data.uuid}");`;
  let macro = globalThis.game?.macros?.find?.((candidate) => candidate.name === item.name && candidate.command === command);
  if (!macro) {
    macro = await globalThis.Macro?.create?.({
      name: item.name,
      type: "script",
      img: item.img,
      command,
      flags: { "marvel-multiverse.itemMacro": true },
    });
  }

  if (macro) {
    globalThis.game?.user?.assignHotbarMacro?.(macro, slot);
  }
  return false;
}

export function rollItemMacro(itemUuid) {
  const dropData = {
    type: "Item",
    uuid: itemUuid,
  };

  globalThis.Item?.fromDropData?.(dropData).then((item) => {
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      globalThis.ui?.notifications?.warn?.(`Could not find item ${itemName}. You may need to delete and recreate this macro.`);
      return;
    }

    item.roll();
  });
}
