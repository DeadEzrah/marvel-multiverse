import { resolvePowerSetCategory } from "./validation.mjs";
import { endConcentration, prepareActorStatusDisplay, startConcentration } from "./concentration.mjs";
import { getConditionRollModifiers } from "./conditions.mjs";
import { recoverWithKarma } from "./karma-automation.mjs";
import { requestRoll } from "./services/action-roll.mjs";
import { deriveConditionCircumstances } from "./roll-context.mjs";
import { promptDialog } from "./services/dialog-compat.mjs";

const ActorSheetBase = typeof foundry !== "undefined" && foundry?.appv1?.sheets?.ActorSheet
  ? foundry.appv1.sheets.ActorSheet
  : globalThis.ActorSheet ?? class ActorSheetBase {};
const ItemSheetBase = typeof foundry !== "undefined" && foundry?.appv1?.sheets?.ItemSheet
  ? foundry.appv1.sheets.ItemSheet
  : globalThis.ItemSheet ?? class ItemSheetBase {};

const ItemSheetV2Base = typeof foundry !== "undefined" && foundry?.applications?.api?.HandlebarsApplicationMixin && foundry?.applications?.sheets?.ItemSheetV2
  ? foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2)
  : ItemSheetBase;
const ActorSheetV2Base = typeof foundry !== "undefined" && foundry?.applications?.api?.HandlebarsApplicationMixin && foundry?.applications?.sheets?.ActorSheetV2
  ? foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2)
  : ActorSheetBase;

export function resolveActorSheetTheme(settings = globalThis.game?.settings) {
  try {
    return settings?.get?.("marvel-multiverse", "actorSheetTheme") === "classicComic"
      ? "theme-classic-comic"
      : "theme-standard";
  } catch {
    return "theme-standard";
  }
}

function onManageActiveEffect(event, owner) {
  event.preventDefault();
  const a = event.currentTarget;
  const li = a.closest("li");
  const effect = li.dataset.effectId ? owner.effects.get(li.dataset.effectId) : null;
  switch (a.dataset.action) {
    case "create":
      return owner.createEmbeddedDocuments("ActiveEffect", [
        {
          name: game.i18n.format("DOCUMENT.New", {
            type: game.i18n.localize("DOCUMENT.ActiveEffect"),
          }),
          img: "icons/svg/aura.svg",
          origin: owner.uuid,
          "duration.rounds": li.dataset.effectType === "temporary" ? 1 : undefined,
          disabled: li.dataset.effectType === "inactive",
        },
      ]);
    case "edit":
      return effect.sheet.render(true);
    case "delete":
      return effect.delete();
    case "toggle":
      return effect.update({ disabled: !effect.disabled });
  }
}

export function resolveConcentrationAction(datasetAction) {
  if (datasetAction === "startConcentration") return "start";
  if (datasetAction === "endConcentration") return "end";
  return null;
}

export async function replaceActorSizeEffect(actor, effectKey, options = {}) {
  const sizeEffects = options.sizeEffects ?? globalThis.CONFIG?.MARVEL_MULTIVERSE?.sizeEffects ?? {};
  const ActiveEffectClass = options.ActiveEffectClass ?? globalThis.ActiveEffect;
  const effect = sizeEffects[effectKey] ?? null;
  if (!actor || !effect || typeof actor.deleteEmbeddedDocuments !== "function" || typeof ActiveEffectClass?.create !== "function") {
    return { success: false, reason: !effect ? "size-effect-missing" : "size-effect-unavailable" };
  }

  const sizeEffectNames = new Set(Object.values(sizeEffects).map((entry) => entry?.name).filter(Boolean));
  const currentSizeEffectIds = (actor.effects?.contents ?? [])
    .filter((entry) => sizeEffectNames.has(entry?.name))
    .map((entry) => entry?._id ?? entry?.id)
    .filter(Boolean);

  if (currentSizeEffectIds.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", currentSizeEffectIds);
  }
  const created = await ActiveEffectClass.create(effect, { parent: actor });
  return { success: true, removedIds: currentSizeEffectIds, created };
}

function getResourceConfig(resource) {
  if (resource === "health") {
    return {
      valuePath: "system.health.value",
      maxPath: "system.health.max",
      label: "Health",
    };
  }
  if (resource === "focus") {
    return {
      valuePath: "system.focus.value",
      maxPath: "system.focus.max",
      label: "Focus",
    };
  }
  return null;
}

async function promptResourceValue({ label, currentValue, maxValue }) {
  return promptDialog({
    title: `Set ${label}`,
    content: `<p><label>${label} value</label><input type="number" min="0" step="1" value="${currentValue}" /></p><p><small>Max ${label}: ${maxValue}</small></p>`,
    callback: (root) => {
      const value = Number.parseInt(root.querySelector("input")?.value ?? "", 10);
      return Number.isFinite(value) ? value : null;
    },
  });
}

async function adjustActorResource(actor, { resource, mode } = {}) {
  const config = getResourceConfig(resource);
  if (!actor || !config) return { updated: false };

  const rawCurrent = Number(foundry.utils.getProperty(actor, config.valuePath));
  const rawMax = Number(foundry.utils.getProperty(actor, config.maxPath));
  const currentValue = Number.isFinite(rawCurrent) ? rawCurrent : 0;
  const maxValue = Number.isFinite(rawMax) ? rawMax : currentValue;

  let nextValue = currentValue;
  if (mode === "decrement") nextValue = currentValue - 1;
  else if (mode === "increment") nextValue = currentValue + 1;
  else if (mode === "full") nextValue = maxValue;
  else if (mode === "set") {
    const chosen = await promptResourceValue({
      label: config.label,
      currentValue,
      maxValue,
    });
    if (chosen === null) return { updated: false, cancelled: true };
    nextValue = chosen;
  }

  const clampedValue = Math.min(maxValue, Math.max(0, Number(nextValue)));
  if (clampedValue === currentValue) return { updated: false, value: currentValue };

  await actor.update({ [config.valuePath]: clampedValue });
  return { updated: true, value: clampedValue };
}

function prepareActiveEffectCategories(effects) {
  const categories = {
    temporary: {
      type: "temporary",
      label: game.i18n.localize("MARVEL_MULTIVERSE.Effect.Temporary"),
      effects: [],
    },
    passive: {
      type: "passive",
      label: game.i18n.localize("MARVEL_MULTIVERSE.Effect.Passive"),
      effects: [],
    },
    inactive: {
      type: "inactive",
      label: game.i18n.localize("MARVEL_MULTIVERSE.Effect.Inactive"),
      effects: [],
    },
  };

  for (const e of effects) {
    if (e.disabled) categories.inactive.effects.push(e);
    else if (e.isTemporary) categories.temporary.effects.push(e);
    else categories.passive.effects.push(e);
  }
  return categories;
}

function resolveUserTargets() {
  const targetCollection = game.user?.targets;
  if (Array.isArray(targetCollection)) return targetCollection;
  if (targetCollection && typeof targetCollection === "object") return Array.from(targetCollection);
  return [];
}

function inferRollAutomationFromItem(item) {
  const itemSystem = item?.system ?? {};
  const hasAttackTarget = typeof itemSystem.attackTarget === "string" && itemSystem.attackTarget.trim().length > 0;
  const hasAttackKind = typeof itemSystem.attackKind === "string" && itemSystem.attackKind.trim().length > 0;
  const hasAttackRange = Number.isFinite(Number(itemSystem.attackRange)) && Number(itemSystem.attackRange) > 0;
  const hasAttackMultiplier = Number.isFinite(Number(itemSystem.attackMultiplier)) && Number(itemSystem.attackMultiplier) > 0;
  const hasDamageType = typeof itemSystem.damageType === "string" && itemSystem.damageType.trim().length > 0;
  const isAttack = Boolean(itemSystem.attack || hasAttackTarget || hasAttackKind || hasAttackRange || hasAttackMultiplier || hasDamageType);
  return {
    isAttack,
    dealsDamage: Boolean(isAttack || hasDamageType || hasAttackMultiplier),
  };
}

function getRollMacroDropData(sheet, element) {
  const itemId = element?.closest?.(".item")?.dataset?.itemId;
  const item = itemId ? sheet.actor?.items?.get?.(itemId) : null;
  if (item?.uuid) {
    return {
      type: "Item",
      uuid: item.uuid,
    };
  }

  const dataset = element?.dataset ?? {};
  if (!dataset.formula) return null;
  const formulaStat = /@abilities\.([^.]+)\.(value|noncom)\b/.exec(dataset.formula);
  const ability = formulaStat?.[1] ?? dataset.label ?? "check";
  const statField = formulaStat?.[2] ?? "value";
  const baseModifier = formulaStat
    ? Number(sheet.actor?.system?.abilities?.[ability]?.[statField])
    : undefined;

  return {
    type: "MarvelRoll",
    actorUuid: sheet.actor?.uuid,
    itemUuid: item?.uuid ?? "",
    formula: dataset.formula,
    ability,
    baseModifier: Number.isFinite(baseModifier) ? baseModifier : undefined,
    label: dataset.label ?? "check",
    title: dataset.power ? `[power] ${dataset.power}` : "",
    damagetype: dataset.damagetype ?? "",
    isAttack: Boolean(item?.system?.attack || item?.system?.attackTarget || item?.system?.attackKind || item?.system?.attackRange || item?.system?.attackMultiplier || item?.system?.damageType),
    dealsDamage: Boolean(item?.system?.damageType || item?.system?.attackMultiplier),
    itemName: item?.name ?? "",
    img: item?.img ?? "",
  };
}

function onRollMacroDragStart(sheet, event) {
  if (!event.dataTransfer) return;
  const data = getRollMacroDropData(sheet, event.currentTarget);
  if (!data) return;
  event.dataTransfer.setData("text/plain", JSON.stringify(data));
  event.dataTransfer.effectAllowed = "copy";
}

export function buildItemCreationData({ type, name, dataset = {} } = {}) {
  const normalizedDataset = { ...(dataset ?? {}) };
  const baseName = name || `New ${String(type || "Item").charAt(0).toUpperCase()}${String(type || "Item").slice(1)}`;

  if (type === "weapon") {
    return {
      name: baseName,
      type,
      system: {
        ...normalizedDataset,
        ability: normalizedDataset.ability ?? "",
        attackTarget: normalizedDataset.attackTarget ?? "mle",
        attackKind: normalizedDataset.attackKind ?? "close",
        damageType: normalizedDataset.damageType ?? "health",
        formula: normalizedDataset.formula ?? "{1d6,1dm,1d6}",
        damageMultiplierBonus: normalizedDataset.damageMultiplierBonus ?? "0",
        range: normalizedDataset.range ?? "Reach",
        attackMultiplier: normalizedDataset.attackMultiplier ?? 0,
        attackRange: normalizedDataset.attackRange ?? 0,
        equipped: normalizedDataset.equipped ?? false,
        description: normalizedDataset.description ?? "",
      },
    };
  }

  return {
    name: baseName,
    type,
    system: normalizedDataset,
  };
}

const POWER_MOVEMENT_TYPES = Object.freeze({
  flight: "flight",
  glide: "glide",
  swingline: "swingline",
  levitation: "levitation",
});

export function prepareMovementFromPowers(movement = {}, items = []) {
  for (const item of items) {
    if (item?.type !== "power") continue;
    const match = String(item.name ?? "").trim().match(/^(flight|glide|swingline|levitation)(?:\s+(\d+))?$/i);
    if (!match) continue;

    const movementKey = POWER_MOVEMENT_TYPES[match[1].toLowerCase()];
    const movementData = movement[movementKey];
    if (!movementData) continue;

    const wasActive = movementData.active === true;
    const configuredSpeed = Number(movementData.noncom);
    const level = Number(item.system?.numbered ?? match[2]);
    movementData.active = true;

    if (movementKey === "flight" && !wasActive && configuredSpeed === 5 && Number.isFinite(level) && level > 0) {
      movementData.noncom = level * 10;
    }

    if (Number.isFinite(Number(movementData.noncom)) && Number(movementData.noncom) > 0) {
      movementData.value = Number(movementData.noncom);
    }
  }

  return movement;
}

class MarvelMultiverseCharacterSheet extends ActorSheetV2Base {
  static DEFAULT_OPTIONS = {
    classes: ["marvel-multiverse", "sheet", "actor"],
    position: {
      width: 960,
      height: 760,
    },
    window: {
      resizable: true,
    },
  };

  static PARTS = {
    form: { template: "systems/marvel-multiverse/templates/actor/actor-character-sheet.hbs" },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actorData = this.actor.toObject(false);

    context.actor = this.actor;
    context.data = actorData;
    context.items = Array.from(this.actor.items ?? []);
    context.owner = this.actor.isOwner;
    context.editable = this.isEditable;
    context.cssClass = `${this.isEditable ? "editable" : "locked"} ${resolveActorSheetTheme()}`;

    context.system = actorData.system;
    context.flags = actorData.flags;
    prepareMovementFromPowers(context.system.movement, context.items);

    this._prepareItems(context);
    this._prepareData(context);

    context.rollData = this.actor.getRollData();
    context.sizes = CONFIG.MARVEL_MULTIVERSE.sizes;

    context.sizeSelection = Object.fromEntries(
      Object.keys(CONFIG.MARVEL_MULTIVERSE.sizes).map((key) => [
        key,
        game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.sizes[key].label),
      ])
    );

    context.teamManeuverTypes = Object.fromEntries(
      CONFIG.MARVEL_MULTIVERSE.teamManeuvers.map((teamMan) => [
        teamMan.maneuverType.toLowerCase(),
        teamMan.maneuverType,
      ])
    );
    context.teamManeuverLevels = Object.fromEntries(
      [1, 2, 3].map((tml) => [tml, tml.toString()])
    );

    context.elements = Object.fromEntries(
      Object.keys(CONFIG.MARVEL_MULTIVERSE.elements).map((k) => [
        k,
        CONFIG.MARVEL_MULTIVERSE.elements[k].label,
      ])
    );

    context.effects = prepareActiveEffectCategories(this.actor.allApplicableEffects());
    context.statusDisplay = prepareActorStatusDisplay(this.actor);

    return context;
  }

  _prepareItems(context) {
    const gear = [];
    const origins = [];
    const occupations = [];
    const weapons = [];
    const traits = [];
    const tags = [];
    const powers = Object.fromEntries(
      Object.keys(CONFIG.MARVEL_MULTIVERSE.reverseSetList).map((ps) => [ps, []])
    );

    for (const i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;

      if (i.type === "origin") {
        origins.push(i);
      }
      if (i.type === "occupation") {
        occupations.push(i);
      } else if (i.type === "item") {
        gear.push(i);
      } else if (i.type === "weapon") {
        weapons.push(i);
      } else if (i.type === "trait") {
        traits.push(i);
      } else if (i.type === "tag") {
        tags.push(i);
      } else if (i.type === "power") {
        const resolvedCategory = resolvePowerSetCategory(i.system?.powerSet, powers, {
          config: CONFIG.MARVEL_MULTIVERSE,
          fallbackCategoryKey: "basic",
        });
        const category = powers[resolvedCategory.categoryKey];
        if (Array.isArray(category)) {
          category.push(i);
        } else {
          console.warn(
            `Marvel Multiverse | Unable to place power ${i.name || i._id || "unknown"} under category ${resolvedCategory.categoryKey}.`
          );
        }
        if (resolvedCategory.usedFallback && resolvedCategory.invalidSets.length) {
          console.warn(
            `Marvel Multiverse | Unknown power set "${resolvedCategory.invalidSets.join(", ")}" on power "${i.name || i._id || "unknown"}" for actor "${context.actor?.name || context.actor?.id || "unknown"}". Displaying under ${resolvedCategory.categoryKey}.`
          );
        }
      }

      context.gear = gear;
      context.origins = origins;
      context.occupations = occupations;
      context.weapons = weapons;
      context.traits = traits;
      context.tags = tags;
      context.powers = powers;
    }
  }

  _prepareData(context) {
    for (const [k, v] of Object.entries(context.system.abilities)) {
      v.label = game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities[k]) ?? k;
    }

    for (const i of context.items.filter((item) => item.type === "power")) {
      const resolvedCategory = resolvePowerSetCategory(i.system?.powerSet, context.system?.powers ?? {}, {
        config: CONFIG.MARVEL_MULTIVERSE,
        fallbackCategoryKey: "basic",
      });
      const category = context.system.powers[resolvedCategory.categoryKey];
      if (Array.isArray(category)) {
        category.push(i);
      } else {
        console.warn(
          `Marvel Multiverse | Unable to place power ${i.name || i._id || "unknown"} under category ${resolvedCategory.categoryKey}.`
        );
      }
      if (resolvedCategory.usedFallback && resolvedCategory.invalidSets.length) {
        console.warn(
          `Marvel Multiverse | Unknown power set "${resolvedCategory.invalidSets.join(", ")}" on power "${i.name || i._id || "unknown"}" for actor "${context.actor?.name || context.actor?.id || "unknown"}". Displaying under ${resolvedCategory.categoryKey}.`
        );
      }
    }

    for (const i of context.items.filter((item) => item.type === "origin")) {
      context.system.origins.push(i);
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    new foundry.applications.ux.Tabs({
      navSelector: ".sheet-tabs",
      contentSelector: ".sheet-body",
      initial: "abilities",
    }).bind(root);

    root.querySelectorAll("[data-action='startConcentration'], [data-action='endConcentration']").forEach((element) => element.addEventListener("click", (event) => {
      event.preventDefault();
      const action = event.currentTarget.dataset.action === "startConcentration" ? "start" : "end";
      return this._onConcentrationAction(event, action);
    }));

    root.querySelectorAll("[data-action='adjustResource']").forEach((element) => element.addEventListener("click", (event) => this._onAdjustResource(event)));
    root.querySelectorAll("[data-action='recoverWithKarma']").forEach((element) => element.addEventListener("click", (event) => this._onKarmaRecovery(event)));

    root.querySelectorAll(".item-edit").forEach((element) => element.addEventListener("click", (event) => {
      const itemId = event.currentTarget.closest(".item")?.dataset?.itemId;
      const item = this.actor.items.get(itemId);
      item.sheet.render(true);
    }));

    root.querySelectorAll(".item-create").forEach((element) => element.addEventListener("click", (event) => this._onItemCreate(event)));

    root.querySelectorAll(".item-delete").forEach((element) => element.addEventListener("click", async (event) => {
      const row = event.currentTarget.closest(".item");
      const itemId = row?.dataset?.itemId;
      if (!itemId) return;
      await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
      this.render(false);
    }));

    root.querySelectorAll(".effect-control").forEach((element) => element.addEventListener("click", (event) => {
      const row = event.currentTarget.closest("li");
      const document = row.dataset.parentId === this.actor.id ? this.actor : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(event, document);
    }));

    root.querySelectorAll(".rollable").forEach((element) => element.addEventListener("click", (event) => this._onRoll(event)));

    root.querySelectorAll('select[name="system.size"]').forEach((element) => element.addEventListener("change", (event) => this._onSizeChange(event)));

    root.querySelectorAll(".roll-initiative").forEach((element) => element.addEventListener("click", () => {
      this.actor.rollInitiative({ createCombatants: true });
    }));

    if (this.actor.isOwner) {
      const handler = (event) => this._onDragStart(event);
      root.querySelectorAll("li.item").forEach((li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });

      const macroDragHandler = (event) => onRollMacroDragStart(this, event);
      root.querySelectorAll(".rollable[data-formula], .rollable[data-roll-type='item']").forEach((rollable) => {
        rollable.setAttribute("draggable", true);
        rollable.addEventListener("dragstart", macroDragHandler, false);
      });
    }
  }

  async _onSizeChange(event) {
    event.preventDefault();
    const selected = event.target.value;
    await this._changeSizeEffect(selected);
  }

  async _changeSizeEffect(effectKey) {
    return replaceActorSizeEffect(this.actor, effectKey);
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;
    const data = foundry.utils.duplicate(header.dataset);
    const name = `New ${type.capitalize()}`;
    const itemData = {
      name,
      type,
      system: data,
    };
    itemData.system["type"] = undefined;

    return await Item.create(itemData, { parent: this.actor });
  }

  async _createTrait(traitData) {
    if (!this.actor.items.map((item) => item.name).includes(traitData.name) && !traitData.multiple) {
      return Item.implementation.create(traitData, { parent: this.actor });
    }
    return null;
  }

  async _createTag(tagData) {
    if (!this.actor.items.map((item) => item.name).includes(tagData.name) && !tagData.multiple) {
      return Item.implementation.create(tagData, { parent: this.actor });
    }
    return null;
  }

  async _onDropItem(event, item) {
    if (this.actor.uuid === item.parent?.uuid) return super._onDropItem(event, item);

    const keepId = !this.actor.items.has(item.id);
    const itemData = item.inCompendium
      ? game.items.fromCompendium(item, { clearFolder: true, keepId })
      : item.toObject();
    if (this.actor.items.map((entry) => entry.name).includes(itemData.name)) return null;

    if (itemData.type === "power" && itemData.system.powerSet === "Elemental Control" && !itemData.system.element) {
      itemData.system.element = this.actor.system.defaultElement;
    }

    if (itemData.type === "occupation") {
      for (const tag of itemData.system.tags ?? []) {
        await this._createTag(tag);
      }
      for (const trait of itemData.system.traits ?? []) {
        await this._createTrait(trait);
      }
    } else if (itemData.type === "origin") {
      for (const tag of itemData.system.tags ?? []) {
        await this._createTag(tag);
      }
      for (const trait of itemData.system.traits ?? []) {
        await this._createTrait(trait);
      }
      for (const power of itemData.system.powers ?? []) {
        const powerData = {
          name: power.name,
          type: "power",
          system: { ...(power.system ?? {}) },
        };
        if (this.actor.system.defaultElement && !powerData.system.element) {
          powerData.system.element = this.actor.system.defaultElement;
        }
        await Item.implementation.create(powerData, { parent: this.actor });
      }
    } else if (itemData.type === "trait" && ["Big", "Small"].includes(itemData.name)) {
      await this._changeSizeEffect(itemData.name.toLowerCase());
    }

    return Item.implementation.create(itemData, { parent: this.actor, keepId });
  }

  async _onConcentrationAction(event, action) {
    event.preventDefault();
    const power = this.actor.items.find((item) => item.type === "power" && (item.system?.requiresConcentration || /concentration/i.test(item.system?.duration ?? "")));
    if (action === "start") {
      const result = await startConcentration(this.actor, {
        itemName: power?.name ?? this.actor.name,
        itemUuid: power?.uuid ?? null,
        targetUuids: resolveUserTargets().map((target) => target.document?.uuid ?? target.uuid),
      });
      if (result?.success) {
        ui.notifications.info("Concentration started.");
      }
    } else {
      const result = await endConcentration(this.actor, { reason: "sheet" });
      if (result?.success) {
        ui.notifications.info("Concentration ended.");
      }
    }
    this.render(false);
  }

  async _onAdjustResource(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const resource = button?.dataset?.resource;
    const mode = button?.dataset?.adjust;
    if (!resource || !mode) return;

    button.disabled = true;
    try {
      const result = await adjustActorResource(this.actor, { resource, mode });
      if (result?.updated) this.render(false);
    } finally {
      button.disabled = false;
    }
  }

  async _onKarmaRecovery(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await recoverWithKarma(this.actor, button.dataset.resource);
      if (result.success) {
        const label = button.dataset.resource === "focus" ? "Focus" : "Health";
        ui.notifications.info(`${label} recovery complete: ${result.transaction.appliedRecovery} restored.`);
        this.render(false);
      } else {
        ui.notifications.warn(result.issues?.[0]?.message ?? "Karma recovery failed.");
      }
    } finally {
      button.disabled = false;
    }
  }

  async _onRoll(event) {
    event.preventDefault();
    game.settings.get("core", "rollMode");
    const element = event.currentTarget;
    const dataset = element.dataset;

    const itemId = element.closest(".item")?.dataset?.itemId;
    const item = this.actor.items.get(itemId);

    if (dataset.rollType) {
      if (dataset.rollType === "item") {
        if (item) return item.roll();
      }
    }
    if (dataset.formula) {
      const ability = CONFIG.MARVEL_MULTIVERSE.damageAbility[dataset.label] ?? dataset.label;
      let label = `ability: ${ability}<br/>${item?.type}: ${item?.name}`;
      const automation = inferRollAutomationFromItem(item);

      label = dataset.damagetype ? `${label}<br/>damagetype: ${dataset.damagetype}` : label;

      if (item?.system?.description) {
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          rollMode: game.settings.get("core", "rollMode"),
          flavor: label,
          content: `<div>${item.system.description}</div><div>${item.system.effect ? item.system.effect : ""}</div>`,
        });
      }

      const rollType = automation.isAttack ? "attack" : "ability";
      const circumstances = deriveConditionCircumstances(item);
      const conditionMods = getConditionRollModifiers(this.actor, {
        rollType,
        ability,
        item,
        circumstances,
      });
      // Target detection/validation (required target missing, too many targets for a
      // single-target action, etc.) is centralized inside requestRoll() - see
      // lib/services/action-roll.mjs's resolveTargetingConfig/getDefenseValue.
      const targets = resolveUserTargets();

      const { roll } = await requestRoll({
        actor: this.actor,
        token: this.actor?.token,
        source: item,
        actionName: item?.name ?? ability,
        actionType: rollType,
        ability,
        attackTarget: item?.system?.attackTarget,
        isAttack: automation.isAttack,
        dealsDamage: automation.dealsDamage,
        targets,
        event,
        trouble: conditionMods.trouble,
      });
      return roll ?? null;
    }
  }
}

class MarvelMultiverseModernCharacterSheet extends MarvelMultiverseCharacterSheet {
  static DEFAULT_OPTIONS = {
    ...MarvelMultiverseCharacterSheet.DEFAULT_OPTIONS,
    classes: ["marvel-multiverse", "sheet", "actor", "modern-character-sheet"],
    position: {
      width: 1180,
      height: 820,
    },
  };

  static PARTS = {
    form: { template: "systems/marvel-multiverse/templates/actor/actor-character-modern-sheet.hbs" },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.cssClass = `${this.isEditable ? "editable" : "locked"} mmrdp-sheet`;
    const resourceView = (resource) => {
      const value = Number(resource?.value) || 0;
      const max = Number(resource?.max) || 0;
      const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
      return { value, max, percent };
    };

    context.modernAbilities = Object.entries(context.system.abilities ?? {}).map(([key, ability]) => ({
      key,
      letter: key.slice(0, 1).toUpperCase(),
      label: ability.label,
      labelSuffix: String(ability.label ?? "").slice(1),
      value: ability.value,
      defense: ability.defense,
      noncom: ability.noncom,
      damageMultiplier: ability.damageMultiplier,
    }));
    context.modernMovement = Object.entries(context.system.movement ?? {})
      .filter(([, movement]) => movement?.active)
      .map(([key, movement]) => ({ key, label: movement.label, value: movement.value }));
    context.modernResources = {
      health: resourceView(context.system.health),
      focus: resourceView(context.system.focus),
      karma: resourceView(context.system.karma),
    };

    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    for (const resource of ["health", "focus", "karma"]) {
      const valueInput = this.element.querySelector(`input[name="system.${resource}.value"]`);
      const maxInput = this.element.querySelector(`input[name="system.${resource}.max"]`);
      const bar = this.element.querySelector(`.mmrdp-resource--${resource} .mmrdp-resource__bar > span`);
      if (!valueInput || !maxInput || !bar) continue;

      const updateBar = () => {
        const value = Number(valueInput.value) || 0;
        const max = Number(maxInput.value) || 0;
        const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
        bar.style.setProperty("--pct", `${percent}%`);
      };

      valueInput.addEventListener("input", updateBar);
      maxInput.addEventListener("input", updateBar);
    }

    this.element.querySelectorAll(".mmrdp-damage-chip[data-ability-key]").forEach((chip) => {
      const abilityInput = this.element.querySelector(`input[name="system.abilities.${chip.dataset.abilityKey}.value"]`);
      const bonus = chip.querySelector(".mmrdp-damage-chip__bonus");
      if (!abilityInput || !bonus) return;

      abilityInput.addEventListener("input", () => {
        const value = Number(abilityInput.value) || 0;
        bonus.textContent = value >= 0 ? `+${value}` : `${value}`;
      });
    });
  }
}

class MarvelMultiverseNPCSheet extends ActorSheetV2Base {
  static DEFAULT_OPTIONS = {
    classes: ["marvel-multiverse", "sheet", "actor"],
    position: {
      width: 900,
      height: 650,
    },
    window: {
      resizable: true,
    },
  };

  static PARTS = {
    form: { template: "systems/marvel-multiverse/templates/actor/actor-npc-sheet.hbs" },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actorData = this.actor.toObject(false);

    context.actor = this.actor;
    context.data = actorData;
    context.items = Array.from(this.actor.items ?? []);
    context.owner = this.actor.isOwner;
    context.editable = this.isEditable;
    context.cssClass = `${this.isEditable ? "editable" : "locked"} ${resolveActorSheetTheme()}`;

    context.system = actorData.system;
    context.flags = actorData.flags;
    prepareMovementFromPowers(context.system.movement, context.items);

    const resourceView = (resource) => {
      const value = Number(resource?.value) || 0;
      const max = Number(resource?.max) || 0;
      const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
      return { value, max, percent };
    };

    context.modernAbilities = Object.entries(context.system.abilities ?? {}).map(([key, ability]) => ({
      key,
      letter: key.slice(0, 1).toUpperCase(),
      label: ability.label,
      labelSuffix: String(ability.label ?? "").slice(1),
      value: ability.value,
      defense: ability.defense,
      noncom: ability.noncom,
      damageMultiplier: ability.damageMultiplier,
    }));
    context.modernMovement = Object.entries(context.system.movement ?? {})
      .filter(([, movement]) => movement?.active)
      .map(([key, movement]) => ({ key, label: movement.label, value: movement.value }));
    context.modernResources = {
      health: resourceView(context.system.health),
      focus: resourceView(context.system.focus),
      karma: resourceView(context.system.karma),
    };

    if (actorData.type === "character") {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    if (actorData.type === "npc") {
      this._prepareItems(context);
      context.cssClass = `${this.isEditable ? "editable" : "locked"} npc mmrdp-sheet`;
    }

    context.rollData = this.actor.getRollData();
    context.sizes = CONFIG.MARVEL_MULTIVERSE.sizes;

    context.sizeSelection = Object.fromEntries(
      Object.keys(CONFIG.MARVEL_MULTIVERSE.sizes).map((key) => [
        key,
        game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.sizes[key].label),
      ])
    );

    context.teamManeuverTypes = Object.fromEntries(
      CONFIG.MARVEL_MULTIVERSE.teamManeuvers.map((teamMan) => [
        teamMan.maneuverType.toLowerCase(),
        teamMan.maneuverType,
      ])
    );
    context.teamManeuverLevels = Object.fromEntries(
      [1, 2, 3].map((tml) => [tml, tml.toString()])
    );

    context.elements = Object.fromEntries(
      Object.keys(CONFIG.MARVEL_MULTIVERSE.elements).map((k) => [
        k,
        CONFIG.MARVEL_MULTIVERSE.elements[k].label,
      ])
    );

    context.effects = prepareActiveEffectCategories(this.actor.allApplicableEffects());
    context.statusDisplay = prepareActorStatusDisplay(this.actor);

    return context;
  }

  _prepareItems(context) {
    const gear = [];
    const traits = [];
    const origins = [];
    const occupations = [];
    const tags = [];
    const weapons = [];
    const powers = Object.fromEntries(
      Object.keys(CONFIG.MARVEL_MULTIVERSE.reverseSetList).map((ps) => [ps, []])
    );

    for (const i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;

      if (i.type === "origin") {
        origins.push(i);
      }
      if (i.type === "occupation") {
        occupations.push(i);
      } else if (i.type === "trait") {
        traits.push(i);
      } else if (i.type === "tag") {
        tags.push(i);
      } else if (i.type === "power") {
        const resolvedCategory = resolvePowerSetCategory(i.system?.powerSet, powers, {
          config: CONFIG.MARVEL_MULTIVERSE,
          fallbackCategoryKey: "basic",
        });
        const category = powers[resolvedCategory.categoryKey];
        if (Array.isArray(category)) {
          category.push(i);
        } else {
          console.warn(
            `Marvel Multiverse | Unable to place power ${i.name || i._id || "unknown"} under category ${resolvedCategory.categoryKey}.`
          );
        }
        if (resolvedCategory.usedFallback && resolvedCategory.invalidSets.length) {
          console.warn(
            `Marvel Multiverse | Unknown power set "${resolvedCategory.invalidSets.join(", ")}" on power "${i.name || i._id || "unknown"}" for actor "${context.actor?.name || context.actor?.id || "unknown"}". Displaying under ${resolvedCategory.categoryKey}.`
          );
        }
      } else if (i.type === "item") {
        gear.push(i);
      } else if (i.type === "weapon") {
        weapons.push(i);
      }

      context.gear = gear;
      context.traits = traits;
      context.tags = tags;
      context.powers = powers;
      context.origins = origins;
      context.occupations = occupations;
      context.weapons = weapons;
    }
  }

  _prepareCharacterData(context) {
    for (const [k, v] of Object.entries(context.system.abilities)) {
      v.label = game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities[k]) ?? k;
    }

    for (const i of context.items.filter((item) => item.type === "power")) {
      const resolvedCategory = resolvePowerSetCategory(i.system?.powerSet, context.system?.powers ?? {}, {
        config: CONFIG.MARVEL_MULTIVERSE,
        fallbackCategoryKey: "basic",
      });
      const category = context.system.powers[resolvedCategory.categoryKey];
      if (Array.isArray(category)) {
        category.push(i);
      } else {
        console.warn(
          `Marvel Multiverse | Unable to place power ${i.name || i._id || "unknown"} under category ${resolvedCategory.categoryKey}.`
        );
      }
      if (resolvedCategory.usedFallback && resolvedCategory.invalidSets.length) {
        console.warn(
          `Marvel Multiverse | Unknown power set "${resolvedCategory.invalidSets.join(", ")}" on power "${i.name || i._id || "unknown"}" for actor "${context.actor?.name || context.actor?.id || "unknown"}". Displaying under ${resolvedCategory.categoryKey}.`
        );
      }
    }

    for (const i of context.items.filter((item) => item.type === "origin")) {
      context.system.origins.push(i);
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    new foundry.applications.ux.Tabs({
      navSelector: ".sheet-tabs",
      contentSelector: ".sheet-body",
      initial: "overview",
    }).bind(root);

    root.querySelectorAll("[data-action='startConcentration'], [data-action='endConcentration']").forEach((element) => element.addEventListener("click", (event) => {
      event.preventDefault();
      const action = event.currentTarget.dataset.action === "startConcentration" ? "start" : "end";
      return this._onConcentrationAction(event, action);
    }));

    root.querySelectorAll("[data-action='adjustResource']").forEach((element) => element.addEventListener("click", (event) => this._onAdjustResource(event)));

    root.querySelectorAll(".item-edit").forEach((element) => element.addEventListener("click", (event) => {
      const itemId = event.currentTarget.closest(".item")?.dataset?.itemId;
      const item = this.actor.items.get(itemId);
      item.sheet.render(true);
    }));

    root.querySelectorAll(".item-create").forEach((element) => element.addEventListener("click", (event) => this._onItemCreate(event)));

    root.querySelectorAll(".item-delete").forEach((element) => element.addEventListener("click", async (event) => {
      const row = event.currentTarget.closest(".item");
      const itemId = row?.dataset?.itemId;
      if (!itemId) return;
      await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
      this.render(false);
    }));

    root.querySelectorAll(".effect-control").forEach((element) => element.addEventListener("click", (event) => {
      const row = event.currentTarget.closest("li");
      const document = row.dataset.parentId === this.actor.id ? this.actor : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(event, document);
    }));

    root.querySelectorAll(".rollable").forEach((element) => element.addEventListener("click", (event) => this._onRoll(event)));

    root.querySelectorAll('select[name="system.size"]').forEach((element) => element.addEventListener("change", (event) => this._onSizeChange(event)));

    root.querySelectorAll(".roll-initiative").forEach((element) => element.addEventListener("click", () => {
      this.actor.rollInitiative({ createCombatants: true });
    }));

    if (this.actor.isOwner) {
      const handler = (event) => this._onDragStart(event);
      root.querySelectorAll("li.item").forEach((li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });

      const macroDragHandler = (event) => onRollMacroDragStart(this, event);
      root.querySelectorAll(".rollable[data-formula], .rollable[data-roll-type='item']").forEach((rollable) => {
        rollable.setAttribute("draggable", true);
        rollable.addEventListener("dragstart", macroDragHandler, false);
      });
    }
  }

  async _onSizeChange(event) {
    event.preventDefault();
    const selected = event.target.value;
    await this._changeSizeEffect(selected);
  }

  async _changeSizeEffect(effectKey) {
    return replaceActorSizeEffect(this.actor, effectKey);
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header?.dataset?.type;
    if (!type) return null;

    const dataset = foundry.utils.duplicate(header.dataset);
    const { type: _ignoredType, ...systemData } = dataset;
    const itemData = buildItemCreationData({
      type,
      name: `New ${String(type).charAt(0).toUpperCase()}${String(type).slice(1)}`,
      dataset: systemData,
    });

    if (!this.actor?.createEmbeddedDocuments) return null;
    const created = await this.actor.createEmbeddedDocuments("Item", [itemData]);
    if (created?.length) this.render(false);
    return created;
  }

  async _createTrait(traitData) {
    if (!this.actor.items.map((item) => item.name).includes(traitData.name) && !traitData.multiple) {
      return Item.implementation.create(traitData, { parent: this.actor });
    }
    return null;
  }

  async _createTag(tagData) {
    if (!this.actor.items.map((item) => item.name).includes(tagData.name) && !tagData.multiple) {
      return Item.implementation.create(tagData, { parent: this.actor });
    }
    return null;
  }

  async _onDropItem(event, item) {
    if (this.actor.uuid === item.parent?.uuid) return super._onDropItem(event, item);

    const keepId = !this.actor.items.has(item.id);
    const itemData = item.inCompendium
      ? game.items.fromCompendium(item, { clearFolder: true, keepId })
      : item.toObject();
    if (this.actor.items.map((entry) => entry.name).includes(itemData.name)) return null;

    if (itemData.type === "power" && itemData.system.powerSet === "Elemental Control" && !itemData.system.element) {
      itemData.system.element = this.actor.system.defaultElement;
    }

    if (itemData.type === "occupation") {
      for (const tag of itemData.system.tags ?? []) {
        await this._createTag(tag);
      }
      for (const trait of itemData.system.traits ?? []) {
        await this._createTrait(trait);
      }
    } else if (itemData.type === "origin") {
      for (const tag of itemData.system.tags ?? []) {
        await this._createTag(tag);
      }
      for (const trait of itemData.system.traits ?? []) {
        await this._createTrait(trait);
      }
      for (const power of itemData.system.powers ?? []) {
        const powerData = {
          name: power.name,
          type: "power",
          system: { ...(power.system ?? {}) },
        };
        if (this.actor.system.defaultElement && !powerData.system.element) {
          powerData.system.element = this.actor.system.defaultElement;
        }
        await Item.implementation.create(powerData, { parent: this.actor });
      }
    } else if (itemData.type === "trait" && ["Big", "Small"].includes(itemData.name)) {
      await this._changeSizeEffect(itemData.name.toLowerCase());
    }

    return Item.implementation.create(itemData, { parent: this.actor, keepId });
  }

  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    if (dataset.rollType) {
      if (dataset.rollType === "item") {
        const itemId = element.closest(".item").dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    if (dataset.formula) {
      const itemId = element.closest(".item")?.dataset?.itemId;
      const item = itemId ? this.actor.items.get(itemId) : null;
      const ability = CONFIG.MARVEL_MULTIVERSE.damageAbility[dataset.label] ?? dataset.label;
      const automation = inferRollAutomationFromItem(item);

      const rollType = automation.isAttack ? "attack" : "ability";
      const circumstances = deriveConditionCircumstances(item);
      const conditionMods = getConditionRollModifiers(this.actor, {
        rollType,
        ability,
        item,
        circumstances,
      });
      // Target detection/validation (required target missing, too many targets for a
      // single-target action, etc.) is centralized inside requestRoll() - see
      // lib/services/action-roll.mjs's resolveTargetingConfig/getDefenseValue.
      const targets = resolveUserTargets();

      const { roll } = await requestRoll({
        actor: this.actor,
        token: this.actor?.token,
        source: item,
        actionName: item?.name ?? ability,
        actionType: rollType,
        ability,
        attackTarget: item?.system?.attackTarget,
        isAttack: automation.isAttack,
        dealsDamage: automation.dealsDamage,
        targets,
        event,
        trouble: conditionMods.trouble,
      });
      return roll ?? null;
    }
  }

  async _onAdjustResource(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const resource = button?.dataset?.resource;
    const mode = button?.dataset?.adjust;
    if (!resource || !mode) return;

    button.disabled = true;
    try {
      const result = await adjustActorResource(this.actor, { resource, mode });
      if (result?.updated) this.render(false);
    } finally {
      button.disabled = false;
    }
  }
}

class MarvelMultiverseItemSheet extends ItemSheetV2Base {
  static DEFAULT_OPTIONS = {
    classes: ["marvel-multiverse", "sheet", "item"],
    position: {
      width: 520,
      height: 480,
    },
    window: {
      resizable: true,
    },
    actions: {
      create: MarvelMultiverseItemSheet.#onEffectControl,
      toggle: MarvelMultiverseItemSheet.#onEffectControl,
      edit: MarvelMultiverseItemSheet.#onEffectControl,
      delete: MarvelMultiverseItemSheet.#onEffectControl,
    },
  };

  static PARTS = {
    form: { template: "systems/marvel-multiverse/templates/item/item-sheet.hbs" },
  };

  _configureRenderParts(options) {
    const path = "systems/marvel-multiverse/templates/item";
    return {
      form: { template: `${path}/item-${this.item.type}-sheet.hbs` },
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const itemData = this.item.toObject(false);

    context.item = this.item;
    context.rollData = this.item.getRollData();
    context.system = itemData.system;
    context.flags = itemData.flags;
    context.effects = prepareActiveEffectCategories(this.item.effects);
    context.owner = this.item.isOwner;
    context.editable = this.isEditable;
    context.cssClass = `${this.isEditable ? "editable" : "locked"} ${resolveActorSheetTheme()}`;
    const enrichHTML = foundry.applications.ux.TextEditor.enrichHTML.bind(foundry.applications.ux.TextEditor);
    context.enriched = {
      description: await enrichHTML(context.system.description ?? "", {
        async: true,
        relativeTo: this.item,
        secrets: this.item.isOwner,
      }),
      effect: await enrichHTML(context.system.effect ?? "", {
        async: true,
        relativeTo: this.item,
        secrets: this.item.isOwner,
      }),
    };

    if (itemData.type === "power" || itemData.type === "weapon") {
      context.elements = Object.fromEntries(
        Object.keys(CONFIG.MARVEL_MULTIVERSE.elements).map((k) => [
          k,
          CONFIG.MARVEL_MULTIVERSE.elements[k].label,
        ])
      );
      context.selectedElement = context.system.element;
      context.damageTypes = {
        health: { label: "Health" },
        focus: { label: "Focus" },
      };
      context.attackKinds = {
        ranged: { label: "Ranged" },
        close: { label: "Close" },
      };
      context.attackEdgeModes = {
        edge: { label: "Edge" },
        normal: { label: "Normal" },
        trouble: { label: "Trouble" },
      };
      context.areaShapes = {
        circle: { label: "Circle" },
        cone: { label: "Cone" },
        line: { label: "Line" },
        rectangle: { label: "Rectangle" },
      };
      context.abilities = {
        mle: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.mle) },
        agl: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.agl) },
        res: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.res) },
        vig: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.vig) },
        ego: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.ego) },
        log: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.log) },
      };
    }
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const initialTab = this.element.querySelector(".sheet-tabs [data-tab]")?.dataset.tab;
    if (initialTab) {
      new foundry.applications.ux.Tabs({
        navSelector: ".sheet-tabs",
        contentSelector: ".sheet-body",
        initial: initialTab,
      }).bind(this.element);
    }

    for (const editor of this.element.querySelectorAll("prose-mirror[name]")) {
      let saveTimer = null;
      const save = async () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        const path = editor.getAttribute("name");
        const value = editor.value ?? editor._getValue?.() ?? "";
        if (!path || foundry.utils.getProperty(this.item, path) === value) return;
        await this.item.update({ [path]: value }, { render: false });
      };
      editor.addEventListener("input", () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 400);
      });
      editor.addEventListener("focusout", (event) => {
        if (!editor.contains(event.relatedTarget)) save();
      });
    }
  }

  static #onEffectControl(event, target) {
    if (!this.isEditable) return;
    return onManageActiveEffect(
      { preventDefault: () => event.preventDefault(), currentTarget: target },
      this.item
    );
  }
}

export { onManageActiveEffect, prepareActiveEffectCategories, MarvelMultiverseCharacterSheet, MarvelMultiverseModernCharacterSheet, MarvelMultiverseNPCSheet, MarvelMultiverseItemSheet };
export default { onManageActiveEffect, prepareActiveEffectCategories, MarvelMultiverseCharacterSheet, MarvelMultiverseModernCharacterSheet, MarvelMultiverseNPCSheet, MarvelMultiverseItemSheet };
