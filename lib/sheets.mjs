import { resolveAutomationSystem } from "./services/automation-presets.mjs";
import { resolvePowerSetCategory } from "./validation.mjs";
import { endConcentration, prepareActorStatusDisplay, startConcentration } from "./concentration.mjs";
import { getConditionRollModifiers } from "./conditions.mjs";
import { recoverWithKarma } from "./karma-automation.mjs";
import { requestRoll } from "./services/action-roll.mjs";
import { deriveConditionCircumstances } from "./roll-context.mjs";
import { promptDialog } from "./services/dialog-compat.mjs";
import { automationPresetIds } from "./services/automation-presets.mjs";
import { validatePowerEvents } from "./services/power-events.mjs";

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
  if (resource === "karma") {
    return {
      valuePath: "system.karma.value",
      maxPath: "system.karma.max",
      label: "Karma",
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
  const itemSystem = resolveAutomationSystem(item?.system ?? {});
  const hasAttackTarget = typeof itemSystem.attackTarget === "string" && itemSystem.attackTarget.trim().length > 0;
  const hasAttackKind = typeof itemSystem.attackKind === "string" && itemSystem.attackKind.trim().length > 0;
  const hasAttackRange = Number.isFinite(Number(itemSystem.attackRange)) && Number(itemSystem.attackRange) > 0;
  const hasAttackMultiplier = Number.isFinite(Number(itemSystem.attackMultiplier)) && Number(itemSystem.attackMultiplier) > 0;
  const hasDamageType = typeof itemSystem.damageType === "string" && itemSystem.damageType.trim().length > 0;
  const isAttack = Boolean(itemSystem.attack || hasAttackTarget || hasAttackKind || hasAttackRange || hasAttackMultiplier || hasDamageType);
  return {
    isAttack,
    dealsDamage: typeof itemSystem.damage?.enabled === "boolean"
      ? itemSystem.damage.enabled
      : Boolean(isAttack || hasDamageType || hasAttackMultiplier),
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
  jump: "jump",
  webgliding: "glide",
  swingline: "swingline",
  webslinging: "swingline",
  levitation: "levitation",
});

export function prepareMovementFromPowers(movement = {}, items = []) {
  for (const item of items) {
    if (item?.type !== "power") continue;
    const match = String(item.name ?? "").trim().match(/^(flight|glide|jump|webgliding|swingline|webslinging|levitation)(?:\s+(\d+))?$/i);
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
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
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

  _resolveTabSelection() {
    if (this._lastActiveTab) return this._lastActiveTab;
    const persisted = this.actor?.getFlag?.("marvel-multiverse", "currentTab");
    if (persisted) {
      this._lastActiveTab = persisted;
      return persisted;
    }
    const active = this.element?.querySelector(".sheet-tabs .item.active, .sheet-tabs [data-tab].active")?.dataset?.tab;
    return active || "abilities";
  }

  async _rememberActiveTab(tabName) {
    if (!tabName) return;
    this._lastActiveTab = tabName;
    if (this.actor?.isOwner && typeof this.actor.setFlag === "function") {
      await this.actor.setFlag("marvel-multiverse", "currentTab", tabName);
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    const initialTab = this._resolveTabSelection();
    await this._rememberActiveTab(initialTab);

    root.querySelectorAll(".sheet-tabs [data-tab], .sheet-body .tab[data-tab]").forEach((element) => {
      const active = element.dataset.tab === initialTab;
      element.classList.toggle("active", active);
      if (element.dataset.tab) {
        element.setAttribute("aria-selected", active ? "true" : "false");
      }
    });

    const tabs = new foundry.applications.ux.Tabs({
      navSelector: ".sheet-tabs",
      contentSelector: ".sheet-body",
      initial: initialTab,
    });
    tabs.bind(root);
    tabs.activate(initialTab);

    root.querySelectorAll(".sheet-tabs [data-tab]").forEach((element) => element.addEventListener("click", async () => {
      await this._rememberActiveTab(element.dataset.tab);
    }));

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
      const tabName = this._resolveTabSelection();
      await this._rememberActiveTab(tabName);
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
    const currentTab = this._resolveTabSelection();
    console.debug("[MM sheet trace] create item start", {
      actor: this.actor?.name ?? this.actor?.id ?? "unknown",
      type,
      currentTab,
    });
    const name = `New ${type.capitalize()}`;
    const itemData = {
      name,
      type,
      system: data,
    };
    itemData.system["type"] = undefined;

    const created = await Item.create(itemData, { parent: this.actor });
    console.debug("[MM sheet trace] create item complete", {
      actor: this.actor?.name ?? this.actor?.id ?? "unknown",
      type,
      currentTab,
      createdCount: created?.length ?? (created ? 1 : 0),
      savedTab: this.actor?.getFlag?.("marvel-multiverse", "currentTab"),
    });
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

  async _onConcentrationAction(event, action) {
    event.preventDefault();
    const itemId = event.currentTarget?.dataset?.itemId;
    const selectedPower = itemId ? this.actor.items.get(itemId) : null;
    const power = selectedPower?.type === "power"
      ? selectedPower
      : this.actor.items.find((item) => item.type === "power" && (item.system?.requiresConcentration || /concentration/i.test(item.system?.duration ?? "")));
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
    const damageAbilityKeys = new Set(["mle", "agl", "ego", "log"]);
    context.modernDamageAbilities = context.modernAbilities.filter(({ key }) => damageAbilityKeys.has(key));
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

class MarvelMultiverseComicCharacterSheet extends MarvelMultiverseModernCharacterSheet {
  static DEFAULT_OPTIONS = {
    ...MarvelMultiverseModernCharacterSheet.DEFAULT_OPTIONS,
    classes: ["marvel-multiverse", "sheet", "actor", "comic-character-sheet"],
    position: {
      width: 1180,
      height: 860,
    },
  };

  static PARTS = {
    form: { template: "systems/marvel-multiverse/templates/actor/actor-character-comic-sheet.hbs" },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.cssClass = `${this.isEditable ? "editable" : "locked"} mmcomic-sheet`;
    const damageAbilityKeys = new Set(["mle", "agl", "ego", "log"]);
    context.comicDamageAbilities = context.modernAbilities.filter(({ key }) => damageAbilityKeys.has(key));
    const movementPowerPattern = /\b(?:flight|glide|jump|levitation|swingline|wallcrawling|webgliding|webslinging)\b/i;
    const prepareComicPower = (item) => {
      const template = document.createElement("template");
      template.innerHTML = String(item.system?.effect || item.system?.description || "");
      const summary = String(template.content.textContent ?? "").replace(/\s+/g, " ").trim();
      const cost = String(item.system?.cost ?? "").replace(/\s*focus\s*/i, "").trim();
      const abilityKey = String(item.system?.ability ?? "");
      const abilityValue = Number(context.system.abilities?.[abilityKey]?.value);
      const action = String(item.system?.action ?? "").trim();
      const requiresConcentration = Boolean(item.system?.requiresConcentration || /concentration/i.test(item.system?.duration ?? ""));
      const activeConcentration = context.statusDisplay?.concentration;
      return {
        ...item.toObject(false),
        comicSummary: summary || "No description available.",
        comicFocusCost: cost || "—",
        comicPowerActionLabel: action || (item.system?.duration === "Permanent" ? "Passive" : ""),
        comicRequiresConcentration: requiresConcentration,
        comicConcentrationActive: requiresConcentration && Boolean(activeConcentration?.active)
          && (activeConcentration.itemUuid === item.uuid || activeConcentration.itemName === item.name),
        comicAbilityLabel: abilityKey
          ? game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities[abilityKey] ?? abilityKey)
          : "",
        comicAbilityScore: abilityKey && Number.isFinite(abilityValue)
          ? `${abilityValue >= 0 ? "+" : ""}${abilityValue}`
          : "",
      };
    };
    const comicPowers = context.items.filter((item) => item.type === "power").map(prepareComicPower);
    const compareNames = (left, right) => String(left ?? "").localeCompare(String(right ?? ""), game.i18n.lang, {
      sensitivity: "base",
      numeric: true,
    });
    context.comicPowerGroups = Object.values(
      comicPowers.reduce((groups, item) => {
        const powerSet = String(item.system?.powerSet || "Basic");
        groups[powerSet] ??= { label: powerSet, items: [] };
        groups[powerSet].items.push(item);
        return groups;
      }, {})
    )
      .map((group) => ({ ...group, items: group.items.sort((left, right) => compareNames(left.name, right.name)) }))
      .sort((left, right) => compareNames(left.label, right.label));
    context.comicActions = comicPowers
      .map((item) => {
        const action = String(item.system?.action ?? "").trim().toLowerCase();
        let category = null;
        if (action.includes("movement") || movementPowerPattern.test(item.name)) category = "movement";
        else if (action.includes("standard")) category = "standard";
        else if (action.includes("reaction")) category = "reaction";
        if (!category) return null;
        return {
          ...item,
          comicActionCategory: category,
          comicActionLabel: category === "movement" ? "Movement" : item.system.action,
        };
      })
      .filter(Boolean);
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);

    for (const resource of ["health", "focus", "karma"]) {
      const valueInput = this.element.querySelector(`input[name="system.${resource}.value"]`);
      const maxInput = this.element.querySelector(`input[name="system.${resource}.max"]`);
      const bar = this.element.querySelector(`.mmcomic-resource--${resource} .mmcomic-resource__bar > span`);
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

    this.element.querySelectorAll(".mmcomic-damage-chip[data-ability-key]").forEach((chip) => {
      const abilityInput = this.element.querySelector(`input[name="system.abilities.${chip.dataset.abilityKey}.value"]`);
      const bonus = chip.querySelector(".mmcomic-damage-chip__bonus");
      if (!abilityInput || !bonus) return;

      abilityInput.addEventListener("input", () => {
        bonus.textContent = String(Number(abilityInput.value) || 0);
      });
    });

    this.element.querySelectorAll(".mmcomic-action-filter button[data-action-filter]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const filter = event.currentTarget.dataset.actionFilter;
        const card = event.currentTarget.closest(".mmcomic-actions-card");
        if (!card || !filter) return;

        card.querySelectorAll(".mmcomic-action-filter button[data-action-filter]").forEach((filterButton) => {
          const active = filterButton.dataset.actionFilter === filter;
          filterButton.classList.toggle("active", active);
          filterButton.setAttribute("aria-pressed", String(active));
        });

        let visibleCount = 0;
        card.querySelectorAll(".mmcomic-action-item[data-action-category]").forEach((row) => {
          const visible = filter === "all" || row.dataset.actionCategory === filter;
          row.hidden = !visible;
          if (visible) visibleCount += 1;
        });
        const emptyState = card.querySelector(".mmcomic-action-empty");
        if (emptyState) emptyState.hidden = visibleCount > 0;
      });
    });
  }
}

class MarvelMultiverseNPCSheet extends ActorSheetV2Base {
  static DEFAULT_OPTIONS = {
    classes: ["marvel-multiverse", "sheet", "actor"],
    form: {
      submitOnChange: true,
      closeOnSubmit: false,
    },
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

  _resolveTabSelection() {
    const active = this.element?.querySelector(".sheet-tabs .item.active, .sheet-tabs [data-tab].active")?.dataset?.tab;
    const persisted = this.actor?.getFlag?.("marvel-multiverse", "currentTab");
    const chosen = this._lastActiveTab || persisted || active || "abilities";
    console.debug("[MM sheet trace] _resolveTabSelection", {
      actor: this.actor?.name ?? this.actor?.id ?? "unknown",
      lastActiveTab: this._lastActiveTab,
      persistedTab: persisted,
      domActiveTab: active,
      chosenTab: chosen,
    });
    if (this._lastActiveTab !== chosen) this._lastActiveTab = chosen;
    return chosen;
  }

  async _rememberActiveTab(tabName) {
    if (!tabName) return;
    console.debug("[MM sheet trace] _rememberActiveTab", {
      actor: this.actor?.name ?? this.actor?.id ?? "unknown",
      tabName,
      previous: this._lastActiveTab,
    });
    this._lastActiveTab = tabName;
    if (this.actor?.isOwner && typeof this.actor.setFlag === "function") {
      await this.actor.setFlag("marvel-multiverse", "currentTab", tabName);
    }
  }

  async _onRender(context, options) {
    console.debug("[MM sheet trace] _onRender start", {
      actor: this.actor?.name ?? this.actor?.id ?? "unknown",
      renderContext: context?.type ?? "unknown",
      options,
    });
    await super._onRender(context, options);
    const root = this.element;

    const initialTab = this._resolveTabSelection();
    await this._rememberActiveTab(initialTab);

    root.querySelectorAll(".sheet-tabs [data-tab], .sheet-body .tab[data-tab]").forEach((element) => {
      const active = element.dataset.tab === initialTab;
      element.classList.toggle("active", active);
      if (element.dataset.tab) {
        element.setAttribute("aria-selected", active ? "true" : "false");
      }
    });

    const tabs = new foundry.applications.ux.Tabs({
      navSelector: ".sheet-tabs",
      contentSelector: ".sheet-body",
      initial: initialTab,
    });
    tabs.bind(root);
    tabs.activate(initialTab);

    root.querySelectorAll(".sheet-tabs [data-tab]").forEach((element) => element.addEventListener("click", async () => {
      console.debug("[MM sheet trace] tab click", {
        actor: this.actor?.name ?? this.actor?.id ?? "unknown",
        clickedTab: element.dataset.tab,
      });
      await this._rememberActiveTab(element.dataset.tab);
    }));

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
      const tabName = this._resolveTabSelection();
      console.debug("[MM sheet trace] delete item start", {
        actor: this.actor?.name ?? this.actor?.id ?? "unknown",
        itemId,
        currentTabBeforeDelete: tabName,
      });
      await this._rememberActiveTab(tabName);
      await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
      console.debug("[MM sheet trace] delete item complete", {
        actor: this.actor?.name ?? this.actor?.id ?? "unknown",
        itemId,
        currentTabAfterDelete: this._resolveTabSelection(),
      });
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

    const currentTab = this._resolveTabSelection();
    console.debug("[MM sheet trace] create item start", {
      actor: this.actor?.name ?? this.actor?.id ?? "unknown",
      type,
      currentTab,
    });

    const dataset = foundry.utils.duplicate(header.dataset);
    const { type: _ignoredType, ...systemData } = dataset;
    const itemData = buildItemCreationData({
      type,
      name: `New ${String(type).charAt(0).toUpperCase()}${String(type).slice(1)}`,
      dataset: systemData,
    });

    if (!this.actor?.createEmbeddedDocuments) return null;
    const created = await this.actor.createEmbeddedDocuments("Item", [itemData]);
    console.debug("[MM sheet trace] create item complete", {
      actor: this.actor?.name ?? this.actor?.id ?? "unknown",
      type,
      currentTab,
      createdCount: created?.length ?? (created ? 1 : 0),
      savedTab: this.actor?.getFlag?.("marvel-multiverse", "currentTab"),
    });
    if (created?.length) {
      const createdItemId = created[0].id;
      const powerSet = created[0].system?.powerSet;
      const location = type === "power" && powerSet ? ` under ${powerSet}` : "";
      ui.notifications.info(`${created[0].name} created${location}. Use Edit to configure it.`);
      globalThis.setTimeout(() => {
        const createdRow = document.querySelector(
          `.application.actor.comic-character-sheet [data-item-id="${createdItemId}"]`
        );
        createdRow?.classList.add("mmcomic-item-created");
        createdRow?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 400);
    }
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

const ANIMATION_PHASES = Object.freeze({
  activation: "Activation",
  cast: "Cast",
  movement: "Movement",
  attack: "Attack",
  hit: "Hit",
  fantasticHit: "Fantastic Hit",
  miss: "Miss",
  impact: "Area Impact",
  landing: "Landing",
  success: "Success",
  failure: "Failure",
});

const POWER_EVENT_TRIGGERS = Object.freeze([
  "action-declared",
  "before-roll",
  "after-roll",
  "source-success",
  "source-failure",
  "source-fantastic-success",
  "target-hit",
  "target-miss",
  "target-fantastic-hit",
  "damage-calculated",
  "damage-applied",
  "focus-damage-applied",
  "health-damage-applied",
  "source-effect-applied",
  "target-effect-applied",
  "escape-succeeded",
  "escape-failed",
  "concentration-started",
  "concentration-ended",
  "start-of-source-turn",
  "end-of-source-turn",
  "start-of-target-turn",
  "end-of-target-turn",
]);

const POWER_EVENT_RECIPIENTS = Object.freeze([
  "source",
  "target",
  "all-hit-targets",
  "all-failed-targets",
  "all-fantastic-targets",
  "selected-target",
  "self-and-target",
]);

const POWER_OUTCOME_TYPES = Object.freeze({
  manual: "Manual reminder",
  status: "Status",
  healing: "Healing",
  "future-roll-modifier": "Future Edge or Trouble",
});

const AUTOMATION_PRESET_LABELS = Object.freeze({
  "check.opposed.single": "Opposed Check - Single Target",
  "attack.single-focus": "Focus Attack - Single Target",
  "attack.ranged.single-blast": "Ranged Health Attack - Single Target",
});

function clonePowerEvents(item) {
  const events = Array.isArray(item?.system?.events) ? item.system.events : [];
  if (typeof globalThis.foundry?.utils?.deepClone === "function") return globalThis.foundry.utils.deepClone(events);
  return JSON.parse(JSON.stringify(events));
}

function readAuthoringField(container, field) {
  return container?.querySelector?.(`[data-authoring-field="${field}"]`)?.value?.trim?.() ?? "";
}

function setOptionalNumber(object, key, value) {
  if (value === "" || !Number.isFinite(Number(value))) delete object[key];
  else object[key] = Number(value);
}

function applyPowerOutcomeDefaults(outcome, type) {
  if (type === "manual") outcome.label = "Resolve this outcome manually.";
  else if (type === "status") Object.assign(outcome, { statusId: "prone", mode: "apply", stacking: "none" });
  else if (type === "healing") outcome.amount = 1;
  else if (type === "future-roll-modifier") Object.assign(outcome, { mode: "edge", count: 1, label: "Edge on next matching roll" });
}

function buildFieldDeletionUpdate(path) {
  const ForcedDeletion = globalThis.foundry?.data?.operators?.ForcedDeletion;
  if (!ForcedDeletion) {
    const segments = path.split(".");
    const key = segments.pop();
    return { [`${segments.join(".")}.-=${key}`]: null };
  }

  const update = {};
  const segments = path.split(".");
  const key = segments.pop();
  let parent = update;
  for (const segment of segments) {
    parent[segment] = {};
    parent = parent[segment];
  }
  parent[key] = new ForcedDeletion();
  return update;
}

function powerConfigurationUpdate(control) {
  const path = control?.name;
  if (!path) return null;
  if (control.type === "checkbox") return { [path]: control.checked };

  const value = control.value?.trim?.() ?? control.value;
  const optionalObjectField = ["system.targeting.", "system.damage.", "system.focusScaling."]
    .some((prefix) => path.startsWith(prefix));
  if (value === "" && optionalObjectField) return buildFieldDeletionUpdate(path);
  if (control.type === "number") return { [path]: value === "" ? 0 : Number(value) };
  return { [path]: value };
}

async function savePowerEvents(item, events) {
  const validation = validatePowerEvents(events);
  const error = validation.issues.find((issue) => issue.severity === "error");
  if (error) {
    globalThis.ui?.notifications?.warn?.(`${error.message} (${error.path})`);
    return false;
  }
  await item.update({ "system.events": events });
  return true;
}

function escapeAnimationValue(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[character]));
}

function readAnimationDesignerForm(root) {
  const value = (name) => root?.querySelector?.(`[name="${name}"]`)?.value ?? "";
  const checked = (name) => Boolean(root?.querySelector?.(`[name="${name}"]`)?.checked);
  return {
    phase: value("phase"),
    profile: value("profile").trim(),
    override: {
      animation: value("animation").trim(),
      sound: value("sound").trim(),
      scale: Number(value("scale")) || 1,
      opacity: Number(value("opacity")) || 1,
      playbackRate: Number(value("playbackRate")) || 1,
      duration: Number(value("duration")) || 0,
      volume: Number(value("volume")) || 1,
      fitArea: checked("fitArea"),
      tint: checked("useTint") ? value("tint") : null,
    },
  };
}

function animationOverrideHasChanges(override) {
  return Boolean(
    override.animation
    || override.sound
    || override.tint
    || override.fitArea === false
    || override.scale !== 1
    || override.opacity !== 1
    || override.playbackRate !== 1
    || override.duration > 0
    || override.volume !== 1
  );
}

async function openAnimationDesigner(item, requestedPhase = null) {
  const library = globalThis.game?.marvelMultiverse?.effects;
  const profiles = library?.manifest?.effects ?? [];
  const phaseOptions = Object.entries(ANIMATION_PHASES)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  const profileOptions = profiles
    .map((profile) => `<option value="${escapeAnimationValue(profile.id)}">${escapeAnimationValue(profile.id)}</option>`)
    .join("");
  const initialPhase = requestedPhase && ANIMATION_PHASES[requestedPhase]
    ? requestedPhase
    : item.system?.targeting?.area?.shape ? "impact" : "attack";
  const content = `
    <div class="mm-animation-designer">
      <div class="form-group"><label>Phase</label><div class="form-fields"><select name="phase">${phaseOptions}</select></div></div>
      <div class="form-group"><label>Semantic Profile</label><div class="form-fields"><input name="profile" type="text" list="mm-effect-profile-list" placeholder="None / custom only"><datalist id="mm-effect-profile-list">${profileOptions}</datalist></div></div>
      <div class="form-group"><label>Animation Key</label><div class="form-fields"><input name="animation" type="text" placeholder="jb2a..."></div></div>
      <div class="form-group"><label>Sound Key</label><div class="form-fields"><input name="sound" type="text" placeholder="psfx..."></div></div>
      <div class="form-group"><label>Scale</label><div class="form-fields"><input name="scale" type="number" min="0.05" step="0.05"></div></div>
      <div class="form-group"><label>Opacity</label><div class="form-fields"><input name="opacity" type="number" min="0" max="1" step="0.05"></div></div>
      <div class="form-group"><label>Playback Rate</label><div class="form-fields"><input name="playbackRate" type="number" min="0.05" step="0.05"></div></div>
      <div class="form-group"><label>Duration (ms)</label><div class="form-fields"><input name="duration" type="number" min="0" step="100" placeholder="Native duration"></div></div>
      <div class="form-group"><label>Sound Volume</label><div class="form-fields"><input name="volume" type="number" min="0" max="1" step="0.05"></div></div>
      <div class="form-group"><label>Fit Placed Area</label><div class="form-fields"><input name="fitArea" type="checkbox"></div></div>
      <div class="form-group"><label>Apply Tint</label><div class="form-fields"><input name="useTint" type="checkbox"><input name="tint" type="color" value="#ffffff"></div></div>
      <button type="button" data-animation-preview><i class="fas fa-play"></i> Preview</button>
    </div>`;

  const loadPhase = (root, phase) => {
    const override = item.system?.effectOverrides?.[phase] ?? {};
    root.querySelector('[name="profile"]').value = item.system?.effectProfiles?.[phase] ?? "";
    root.querySelector('[name="animation"]').value = override.animation ?? "";
    root.querySelector('[name="sound"]').value = override.sound ?? "";
    root.querySelector('[name="scale"]').value = override.scale ?? 1;
    root.querySelector('[name="opacity"]').value = override.opacity ?? 1;
    root.querySelector('[name="playbackRate"]').value = override.playbackRate ?? 1;
    root.querySelector('[name="duration"]').value = override.duration ?? "";
    root.querySelector('[name="volume"]').value = override.volume ?? 1;
    root.querySelector('[name="fitArea"]').checked = override.fitArea !== false;
    root.querySelector('[name="useTint"]').checked = Boolean(override.tint);
    root.querySelector('[name="tint"]').value = override.tint ?? "#ffffff";
  };

  await promptDialog({
    title: `${item.name}: Animation Designer`,
    content,
    label: "Save",
    render: (root) => {
      const phaseSelect = root.querySelector('[name="phase"]');
      phaseSelect.value = initialPhase;
      loadPhase(root, initialPhase);
      phaseSelect.addEventListener("change", () => loadPhase(root, phaseSelect.value));
      root.querySelector("[data-animation-preview]")?.addEventListener("click", async () => {
        const actor = item.actor ?? item.parent;
        const location = actor?.getActiveTokens?.(false, true)?.[0] ?? globalThis.canvas?.tokens?.controlled?.[0] ?? null;
        if (!location) {
          globalThis.ui?.notifications?.warn?.("Place or select a token to preview this animation.");
          return;
        }
        const data = readAnimationDesignerForm(root);
        const result = await library?.playEffect?.(data.profile || null, { location, override: data.override });
        if (!result?.success) globalThis.ui?.notifications?.warn?.(`Animation preview unavailable (${result?.reason ?? "effect-library-unavailable"}).`);
      });
    },
    callback: async (root) => {
      const data = readAnimationDesignerForm(root);
      if (!data.phase) return null;
      const update = { system: { effectProfiles: {}, effectOverrides: {} } };
      const ForcedDeletion = globalThis.foundry?.data?.operators?.ForcedDeletion;
      if (data.profile) update.system.effectProfiles[data.phase] = data.profile;
      else if (ForcedDeletion) update.system.effectProfiles[data.phase] = new ForcedDeletion();
      else update.system.effectProfiles[`-=${data.phase}`] = null;
      const hasOverride = animationOverrideHasChanges(data.override);
      if (hasOverride) update.system.effectOverrides[data.phase] = data.override;
      else if (ForcedDeletion) update.system.effectOverrides[data.phase] = new ForcedDeletion();
      else update.system.effectOverrides[`-=${data.phase}`] = null;
      await item.update(update);
      return data;
    },
  });
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
      animationDesigner: MarvelMultiverseItemSheet.#onAnimationDesigner,
      saveEffectProfile: MarvelMultiverseItemSheet.#onSaveEffectProfile,
      addPowerEvent: MarvelMultiverseItemSheet.#onAddPowerEvent,
      savePowerEvent: MarvelMultiverseItemSheet.#onSavePowerEvent,
      deletePowerEvent: MarvelMultiverseItemSheet.#onDeletePowerEvent,
      addPowerOutcome: MarvelMultiverseItemSheet.#onAddPowerOutcome,
      deletePowerOutcome: MarvelMultiverseItemSheet.#onDeletePowerOutcome,
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
      context.automationPresets = Object.fromEntries(
        automationPresetIds.map((id) => [id, { label: AUTOMATION_PRESET_LABELS[id] ?? id }])
      );
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
        wall: { label: "Wall" },
      };
      context.abilities = {
        mle: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.mle) },
        agl: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.agl) },
        res: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.res) },
        vig: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.vig) },
        ego: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.ego) },
        log: { label: game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities.log) },
      };
      if (itemData.type === "power") {
        const effectProfiles = globalThis.game?.marvelMultiverse?.effects?.manifest?.effects ?? [];
        const effectProfileOptions = Object.fromEntries(
          effectProfiles
            .filter((profile) => typeof profile?.id === "string" && profile.id.trim())
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((profile) => [profile.id, `${profile.id} (${profile.category ?? "uncategorized"} / ${profile.type ?? "effect"})`])
        );
        context.effectProfileRows = Object.entries(ANIMATION_PHASES).map(([phase, label]) => ({
          phase,
          label,
          profile: context.system.effectProfiles?.[phase] ?? "",
          options: {
            ...effectProfileOptions,
            ...(context.system.effectProfiles?.[phase] && !Object.hasOwn(effectProfileOptions, context.system.effectProfiles[phase])
              ? { [context.system.effectProfiles[phase]]: `${context.system.effectProfiles[phase]} (preserved custom profile)` }
              : {}),
          },
        }));
        context.powerEvents = (context.system.events ?? []).map((powerEvent, eventIndex) => ({
          ...powerEvent,
          eventIndex,
          outcomes: (powerEvent.outcomes ?? []).map((outcome, outcomeIndex) => ({
            ...outcome,
            outcomeIndex,
          })),
        }));
        context.powerEventTriggers = Object.fromEntries(POWER_EVENT_TRIGGERS.map((trigger) => [trigger, trigger]));
        context.powerEventRecipients = Object.fromEntries(POWER_EVENT_RECIPIENTS.map((recipient) => [recipient, recipient]));
        context.powerOutcomeTypes = Object.fromEntries(Object.entries(POWER_OUTCOME_TYPES).map(([type, label]) => [type, { label }]));
        for (const powerEvent of context.powerEvents) {
          if (powerEvent.trigger && !Object.hasOwn(context.powerEventTriggers, powerEvent.trigger)) {
            context.powerEventTriggers[powerEvent.trigger] = `${powerEvent.trigger} (preserved)`;
          }
          if (powerEvent.recipient && !Object.hasOwn(context.powerEventRecipients, powerEvent.recipient)) {
            context.powerEventRecipients[powerEvent.recipient] = `${powerEvent.recipient} (preserved)`;
          }
          for (const outcome of powerEvent.outcomes) {
            if (outcome.type && !Object.hasOwn(context.powerOutcomeTypes, outcome.type)) {
              context.powerOutcomeTypes[outcome.type] = { label: `${outcome.type} (preserved)` };
            }
          }
        }
        context.powerStatusModes = { apply: "Apply", remove: "Remove", toggle: "Toggle" };
        context.powerStackingModes = {
          none: "No duplicates",
          "refresh-duration": "Refresh duration",
          "stack-value": "Stack value",
          replace: "Replace",
          "allow-duplicate": "Allow duplicate",
        };
        context.powerDurationTypes = {
          manual: "Manual",
          permanent: "Permanent",
          rounds: "Rounds",
          concentration: "Concentration",
          "end-of-source-turn": "End of source turn",
          "end-of-source-next-turn": "End of source next turn",
          "end-of-target-turn": "End of target turn",
          "end-of-target-next-turn": "End of target next turn",
          "start-of-source-turn": "Start of source turn",
          "start-of-target-turn": "Start of target turn",
          days: "Days",
          "until-sleep": "Until sleep",
        };
      }
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

    if (this.item.type === "power" && this.isEditable) {
      for (const control of this.element.querySelectorAll('.power-attributes input[name], .power-attributes select[name]')) {
        control.addEventListener("change", async () => {
          const update = powerConfigurationUpdate(control);
          if (!update) return;
          const rerender = control.name === "system.isElemental" || control.name === "system.targeting.area.shape";
          await this.item.update(update, { render: false });
          if (rerender) this.render(false);
        });
      }
    }
  }

  static #onEffectControl(event, target) {
    if (!this.isEditable) return;
    return onManageActiveEffect(
      { preventDefault: () => event.preventDefault(), currentTarget: target },
      this.item
    );
  }

  static async #onAnimationDesigner(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    await openAnimationDesigner(this.item, target?.dataset?.phase ?? null);
  }

  static async #onSaveEffectProfile(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const phase = target.dataset.phase;
    if (!ANIMATION_PHASES[phase]) return;
    const value = target.closest(".power-profile-row")?.querySelector("select")?.value?.trim() ?? "";
    const ForcedDeletion = globalThis.foundry?.data?.operators?.ForcedDeletion;
    if (value) await this.item.update({ [`system.effectProfiles.${phase}`]: value });
    else if (ForcedDeletion) await this.item.update({ system: { effectProfiles: { [phase]: new ForcedDeletion() } } });
    else await this.item.update({ [`system.effectProfiles.-=${phase}`]: null });
  }

  static async #onAddPowerEvent(event) {
    event.preventDefault();
    if (!this.isEditable) return;
    const events = clonePowerEvents(this.item);
    const suffix = globalThis.foundry?.utils?.randomID?.(8) ?? Date.now();
    events.push({ id: `event-${suffix}`, trigger: "action-declared", recipient: "source", outcomes: [] });
    await savePowerEvents(this.item, events);
  }

  static async #onDeletePowerEvent(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const eventIndex = Number(target.closest("[data-event-index]")?.dataset?.eventIndex);
    const events = clonePowerEvents(this.item);
    if (!Number.isInteger(eventIndex) || !events[eventIndex]) return;
    events.splice(eventIndex, 1);
    await savePowerEvents(this.item, events);
  }

  static async #onAddPowerOutcome(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const eventIndex = Number(target.closest("[data-event-index]")?.dataset?.eventIndex);
    const events = clonePowerEvents(this.item);
    if (!Number.isInteger(eventIndex) || !events[eventIndex]) return;
    const suffix = globalThis.foundry?.utils?.randomID?.(8) ?? Date.now();
    events[eventIndex].outcomes ??= [];
    events[eventIndex].outcomes.push({ id: `outcome-${suffix}`, type: "manual", label: "Resolve this outcome manually." });
    await savePowerEvents(this.item, events);
  }

  static async #onDeletePowerOutcome(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const eventElement = target.closest("[data-event-index]");
    const outcomeElement = target.closest("[data-outcome-index]");
    const eventIndex = Number(eventElement?.dataset?.eventIndex);
    const outcomeIndex = Number(outcomeElement?.dataset?.outcomeIndex);
    const events = clonePowerEvents(this.item);
    if (!Number.isInteger(eventIndex) || !Number.isInteger(outcomeIndex) || !events[eventIndex]?.outcomes?.[outcomeIndex]) return;
    events[eventIndex].outcomes.splice(outcomeIndex, 1);
    await savePowerEvents(this.item, events);
  }

  static async #onSavePowerEvent(event, target) {
    event.preventDefault();
    if (!this.isEditable) return;
    const eventElement = target.closest("[data-event-index]");
    const eventIndex = Number(eventElement?.dataset?.eventIndex);
    const events = clonePowerEvents(this.item);
    const powerEvent = events[eventIndex];
    if (!Number.isInteger(eventIndex) || !powerEvent) return;

    powerEvent.id = readAuthoringField(eventElement, "event.id");
    powerEvent.trigger = readAuthoringField(eventElement, "event.trigger");
    powerEvent.recipient = readAuthoringField(eventElement, "event.recipient");
    for (const outcomeElement of eventElement.querySelectorAll("[data-outcome-index]")) {
      const outcomeIndex = Number(outcomeElement.dataset.outcomeIndex);
      const outcome = powerEvent.outcomes?.[outcomeIndex];
      if (!Number.isInteger(outcomeIndex) || !outcome) continue;
      const previousType = outcome.type;
      const nextType = readAuthoringField(outcomeElement, "outcome.type");
      if (previousType !== nextType) {
        for (const key of ["label", "statusId", "mode", "stacking", "duration", "amount", "count"]) delete outcome[key];
        applyPowerOutcomeDefaults(outcome, nextType);
      }
      outcome.id = readAuthoringField(outcomeElement, "outcome.id");
      outcome.type = nextType;
      if (nextType === "manual" && previousType === nextType) {
        outcome.label = readAuthoringField(outcomeElement, "outcome.label");
      } else if (nextType === "status" && previousType === nextType) {
        outcome.statusId = readAuthoringField(outcomeElement, "outcome.statusId");
        outcome.mode = readAuthoringField(outcomeElement, "outcome.mode") || "apply";
        outcome.stacking = readAuthoringField(outcomeElement, "outcome.stacking") || "none";
        const durationType = readAuthoringField(outcomeElement, "outcome.duration.type");
        if (durationType) {
          outcome.duration = { ...(outcome.duration ?? {}), type: durationType };
          setOptionalNumber(outcome.duration, "value", readAuthoringField(outcomeElement, "outcome.duration.value"));
        } else delete outcome.duration;
      } else if (nextType === "healing" && previousType === nextType) {
        setOptionalNumber(outcome, "amount", readAuthoringField(outcomeElement, "outcome.amount"));
      } else if (nextType === "future-roll-modifier" && previousType === nextType) {
        outcome.mode = readAuthoringField(outcomeElement, "outcome.mode") || "edge";
        setOptionalNumber(outcome, "count", readAuthoringField(outcomeElement, "outcome.count"));
        outcome.label = readAuthoringField(outcomeElement, "outcome.label");
      }
    }
    await savePowerEvents(this.item, events);
  }
}

export { onManageActiveEffect, prepareActiveEffectCategories, MarvelMultiverseCharacterSheet, MarvelMultiverseModernCharacterSheet, MarvelMultiverseComicCharacterSheet, MarvelMultiverseNPCSheet, MarvelMultiverseItemSheet };
export default { onManageActiveEffect, prepareActiveEffectCategories, MarvelMultiverseCharacterSheet, MarvelMultiverseModernCharacterSheet, MarvelMultiverseComicCharacterSheet, MarvelMultiverseNPCSheet, MarvelMultiverseItemSheet };
