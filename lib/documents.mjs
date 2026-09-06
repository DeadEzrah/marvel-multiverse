import { attachRollContext, buildRollContext, debugRollContext, deriveConditionCircumstances } from "./roll-context.mjs";
import { compareAttackToStoredTargets } from "./attack-resolution.mjs";
import { buildDamageContext } from "./damage-calculation.mjs";
import { getConditionRollModifiers } from "./conditions.mjs";
import { buildGuidedResolutionState } from "./services/guided-resolution.mjs";
import { promptDialog } from "./services/dialog-compat.mjs";
import { requestRoll } from "./services/action-roll.mjs";
import { resolveAutomationSystem } from "./services/automation-presets.mjs";

const BaseRoll = globalThis.Roll ?? class Roll {
  constructor(formula, data, options = {}) {
    this.formula = formula;
    this.data = data;
    this.options = options;
    this._evaluated = false;
    this.dice = [];
    this.terms = [];
  }

  async evaluate() {
    this._evaluated = true;
    return this;
  }

  async toMessage(messageData = {}, options = {}) {
    return { messageData, options };
  }
};

const BaseActor = globalThis.Actor ?? class Actor {};
const BaseCombatant = globalThis.foundry?.documents?.Combatant ?? globalThis.Combatant ?? class Combatant {};
const BaseItem = globalThis.Item ?? class Item {};
const BaseTypeDataModel = globalThis.foundry?.abstract?.TypeDataModel ?? class TypeDataModel {};
const BaseDieTerm = globalThis.foundry?.dice?.terms?.Die ?? class Die {};

function inferRollAutomationFromItemSystem(itemSystem = {}) {
  itemSystem = resolveAutomationSystem(itemSystem);
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

export function buildItemFlavor(entries = []) {
  return entries
    .filter(([, value]) => {
      if (value === undefined || value === null) return false;
      const normalized = String(value).trim();
      return normalized.length > 0 && normalized.toLowerCase() !== "undefined";
    })
    .map(([label, value]) => `${label}: ${String(value).trim()}`)
    .join("<br/>");
}

class MarvelMultiverseRoll extends BaseRoll {
  constructor(formula, data, options) {
    super(formula, data, options);
    const initiative = data?.attributes?.init ?? data?.system?.attributes?.init ?? null;
    if (String(formula).includes("@attributes.init.value") && initiative) {
      if (!Number.isFinite(Number(this.options.edgeCount))) this.options.edgeCount = initiative.edge ? 1 : 0;
      if (!Number.isFinite(Number(this.options.troubleCount))) this.options.troubleCount = initiative.trouble ? 1 : 0;
      const net = this.options.edgeCount - this.options.troubleCount;
      if (this.options.edgeMode === undefined) {
        this.options.edgeMode = net > 0
          ? MarvelMultiverseRoll.EDGE_MODE.EDGE
          : net < 0
            ? MarvelMultiverseRoll.EDGE_MODE.TROUBLE
            : MarvelMultiverseRoll.EDGE_MODE.NORMAL;
      }
    }
    if (!this.options.configured) this.configureModifiers();
  }

  static fromRoll(roll) {
    const newRoll = new this(roll.formula, roll.data, roll.options);
    Object.assign(newRoll, roll);
    return newRoll;
  }

  static fromTerms(terms) {
    const newRoll = super.fromTerms(terms);
    Object.assign(newRoll, { terms });
    return newRoll;
  }

  static determineEdgeMode({ event, edge = false, trouble = false, fastForward } = {}) {
    const isFF = fastForward ?? (event?.shiftKey || event?.altKey || event?.ctrlKey || event?.metaKey);
    let edgeMode = this.EDGE_MODE.NORMAL;
    if (edge || event?.altKey) edgeMode = this.EDGE_MODE.EDGE;
    else if (trouble || event?.ctrlKey || event?.metaKey) edgeMode = this.EDGE_MODE.TROUBLE;
    return { isFF: !!isFF, edgeMode };
  }

  static EDGE_MODE = {
    NORMAL: 0,
    EDGE: 1,
    TROUBLE: -1,
  };

  static EVALUATION_TEMPLATE = "systems/marvel-multiverse/templates/chat/roll-dialog.hbs";
  static DAMAGE_EVALUATION_TEMPLATE = "systems/marvel-multiverse/templates/chat/damage-roll-dialog.hbs";
  static CHAT_TEMPLATE = "systems/marvel-multiverse/templates/dice/roll.hbs";

  get validD616Roll() {
    return this.dice.length === 3 && this.terms[0] instanceof foundry.dice.terms.PoolTerm;
  }

  get hasEdge() {
    return this.options.edgeMode === MarvelMultiverseRoll.EDGE_MODE.EDGE;
  }

  get hasTrouble() {
    return this.options.edgeMode === MarvelMultiverseRoll.EDGE_MODE.TROUBLE;
  }

  get edgeCount() {
    const configured = Number(this.options.edgeCount);
    if (Number.isFinite(configured)) return Math.max(0, Math.floor(configured));
    return this.hasEdge ? 1 : 0;
  }

  get troubleCount() {
    const configured = Number(this.options.troubleCount);
    if (Number.isFinite(configured)) return Math.max(0, Math.floor(configured));
    return this.hasTrouble ? 1 : 0;
  }

  async evaluate(options = {}) {
    if (this._evaluated) return this;
    await super.evaluate(options);
    await this._applyEdgeTroubleRerolls();
    this.configureModifiers();
    return this;
  }

  async _applyEdgeTroubleRerolls() {
    if (this.options.edgeTroubleApplied) return;
    this.options.edgeTroubleApplied = true;

    const net = this.edgeCount - this.troubleCount;
    if (!net || !this.validD616Roll) return;

    const keepHigher = net > 0;
    let runningTotal = Number(this.total);
    if (!Number.isFinite(runningTotal)) return;

    for (let iteration = 0; iteration < Math.abs(net); iteration += 1) {
      const candidates = this.dice
        .map((die, index) => ({ die, index, result: die?.results?.find((entry) => entry?.active !== false && !entry?.discarded) }))
        .filter((entry) => entry.result && typeof entry.die?.roll === "function");
      if (!candidates.length) break;

      const score = ({ index, result }) => index === 1 && result.result === 1 ? 6.5 : Number(result.result);
      candidates.sort((left, right) => keepHigher ? score(left) - score(right) : score(right) - score(left));
      const selected = candidates[0];
      const oldResult = selected.result;
      const newResult = await selected.die.roll();
      const oldValue = selected.index === 1 && oldResult.result === 1 ? 6 : Number(oldResult.result);
      const newValue = selected.index === 1 && newResult.result === 1 ? 6 : Number(newResult.result);
      const oldScore = selected.index === 1 && oldResult.result === 1 ? 6.5 : oldValue;
      const newScore = selected.index === 1 && newResult.result === 1 ? 6.5 : newValue;
      const keepNew = keepHigher ? newScore >= oldScore : newScore <= oldScore;
      const discardedResult = keepNew ? oldResult : newResult;
      discardedResult.active = false;
      discardedResult.discarded = true;
      const activeResult = keepNew ? newResult : oldResult;
      activeResult.active = true;
      delete activeResult.discarded;

      if (keepNew) runningTotal += newValue - oldValue;
      this._total = runningTotal;
    }
  }

  get isFantastic() {
    if (!this._evaluated) return undefined;
    const marvelDie = this.dice[1];
    const activeResults = Array.isArray(marvelDie?.results)
      ? marvelDie.results.filter((result) => result?.active !== false && !result?.discarded)
      : [];
    if (activeResults.length) {
      return activeResults.some((result) => result.result === 1);
    }
    return marvelDie?.result === 1;
  }

  configureModifiers() {
    const valid616 = this.validD616Roll;
    if (!valid616) return;
    this.options.fantastic = 1;

    if (this.isFantastic) {
      this.dice[1].results.map((r) => {
        if (r.result === 1) {
          r.discarded = false;
          r.active = true;
        } else {
          r.discarded = true;
          r.active = false;
        }
      });
    }

    this.options.configured = true;
  }

  async toMessage(messageData = {}, options = {}) {
    if (!this._evaluated) await this.evaluate({});

    messageData.flavor = messageData.flavor || this.options.flavor;
    messageData.fantastic = this.isFantastic;
    if (options.itemId) {
      foundry.utils.setProperty(messageData, "flags.marvel-multiverse.itemId", options.itemId);
    }

    const rollContext = buildRollContext({
      actor: options.actor,
      token: options.token,
      item: options.item,
      roll: this,
      rollType: options.rollType ?? "ability",
      targets: options.targets ?? [],
      options: {
        userId: options.userId ?? game.user?.id,
        timestamp: options.timestamp ?? Date.now(),
        actorUuid: options.actorUuid,
        tokenUuid: options.tokenUuid,
        itemUuid: options.itemUuid,
        dealsDamage: options.dealsDamage,
        config: CONFIG.MARVEL_MULTIVERSE,
      },
    });
    rollContext.ability = options.ability ?? rollContext.ability;
    rollContext.targetNumber = options.targetNumber ?? null;
    rollContext.actionType = this.options.actionType ?? null;
    rollContext.cardPresentation = this.options.cardPresentation ?? null;
    debugRollContext(rollContext);
    attachRollContext(messageData, rollContext);

    if (rollContext.rollType === "attack") {
      const damageContext = await buildDamageContext(null, {
        rollContext,
        attackResolution: null,
        actor: options.actor,
        token: options.token,
        item: options.item,
        roll: this,
        dealsDamage: options.dealsDamage,
      });
      if (!messageData.flags) messageData.flags = {};
      messageData.flags["marvel-multiverse"] = { ...(messageData.flags["marvel-multiverse"] ?? {}), damageContext };
    }

    if (options.guidedResolution?.selection || options.guidedResolution?.context || options.guidedResolution?.state) {
      const guidedState = options.guidedResolution?.state
        ?? buildGuidedResolutionState(options.guidedResolution?.context ?? rollContext ?? {}, options.guidedResolution?.selection ?? {});
      if (!messageData.flags) messageData.flags = {};
      messageData.flags["marvel-multiverse"] = {
        ...(messageData.flags["marvel-multiverse"] ?? {}),
        guidedResolution: guidedState,
      };
    }

    if (this.hasEdge) {
      const edgeLabel = game.i18n.localize("MARVEL_MULTIVERSE.edgeMode.edge");
      messageData.flavor += ` (${edgeLabel === "MARVEL_MULTIVERSE.edgeMode.edge" ? "Edge" : edgeLabel})`;
    } else if (this.hasTrouble) {
      const troubleLabel = game.i18n.localize("MARVEL_MULTIVERSE.edgeMode.trouble");
      messageData.flavor += ` (${troubleLabel === "MARVEL_MULTIVERSE.edgeMode.trouble" ? "Trouble" : troubleLabel})`;
    }

    options.rollMode = options.rollMode ?? this.options.rollMode;
    const message = await super.toMessage(messageData, options);
    if (rollContext.rollType === "attack") {
      const attackResolution = await compareAttackToStoredTargets(message, { quiet: true, store: true });
      await buildDamageContext(message, {
        rollContext,
        attackResolution,
        actor: options.actor,
        token: options.token,
        item: options.item,
        roll: this,
        dealsDamage: options.dealsDamage,
      });
      Hooks.callAll("marvel-multiverse.attackResolved", message, options.item ?? null);
    }
    return message;
  }

  async configureDialog({ title, chooseModifier = false, defaultAbility, template } = {}, options = {}) {
    const content = await renderTemplate(template ?? this.constructor.EVALUATION_TEMPLATE, {
      formulas: [{ formula: `${this.formula} + @bonus` }],
      chooseModifier,
      defaultAbility,
      abilities: Object.fromEntries(Object.entries(CONFIG.MARVEL_MULTIVERSE.abilities).map((abl) => [abl[0], game.i18n.localize(abl[1])])),
    });

    return promptDialog({
      title,
      content,
      label: "Roll",
      callback: (root) => this._onDamageDialogSubmit(root),
    });
  }

  _onDialogSubmit(html) {
    const form = html.querySelector?.("form") ?? html?.[0]?.querySelector("form") ?? html;

    if (form.bonus.value) {
      const bonus = new Roll(form.bonus.value, this.data);
      if (!(bonus.terms[0] instanceof foundry.dice.terms.OperatorTerm)) this.terms.push(new foundry.dice.terms.OperatorTerm({ operator: "+" }));
      this.terms = this.terms.concat(bonus.terms);
    }

    if (form.ability?.value) {
      const abl = this.data.abilities[form.ability.value];
      this.terms = this.terms.flatMap((t) => {
        if (t.term === "@mod") return new foundry.dice.terms.NumericTerm({ number: abl.value });
        if (t.term === "@abilityCheckBonus") {
          const bonus = abl.bonuses?.check;
          if (bonus) return new Roll(bonus, this.data).terms;
          return new foundry.dice.terms.NumericTerm({ number: 0 });
        }
        return t;
      });
      this.options.flavor += ` (${CONFIG.MARVEL_MULTIVERSE.abilities[form.ability.value]?.label ?? ""})`;
    }

    this.configureModifiers();
    return this;
  }
}

class MarvelMultiverseCombatant extends BaseCombatant {
  getInitiativeRoll(formula) {
    const resolvedFormula = formula || this._getInitiativeFormula();
    const rollData = this.actor?.getRollData?.() ?? {};
    const initiative = rollData?.attributes?.init ?? rollData?.system?.attributes?.init ?? {};
    const edgeCount = initiative.edge ? 1 : 0;
    const troubleCount = initiative.trouble ? 1 : 0;
    const net = edgeCount - troubleCount;
    const edgeMode = net > 0
      ? MarvelMultiverseRoll.EDGE_MODE.EDGE
      : net < 0
        ? MarvelMultiverseRoll.EDGE_MODE.TROUBLE
        : MarvelMultiverseRoll.EDGE_MODE.NORMAL;
    return new MarvelMultiverseRoll(resolvedFormula, rollData, { edgeCount, troubleCount, edgeMode });
  }
}

class MarvelMultiverseActor extends BaseActor {
  prepareData() {
    super.prepareData();
  }

  prepareBaseData() {
    // Core `Actor.prepareBaseData()` calls `_clearData()`, which resets
    // `overrides`/`tokenActiveEffectChanges`/`statuses`/`_completedActiveEffectPhases`
    // before `applyActiveEffects()` runs later in the same prepareData() pass. This
    // override previously skipped calling super(), so those fields were never reset -
    // on an actor's first preparation pass (before Actor's own class-field defaults
    // have initialized, since prepareData() runs synchronously inside the super()
    // chain from DataModel's own constructor) `this.overrides` stayed undefined,
    // and `applyActiveEffects()`'s `mergeObject(this.overrides, ...)` threw "One of
    // original or other are not Objects!". Unlinked tokens (built on-demand via
    // ActorDelta.apply(), once) never got a natural second pass to self-heal.
    super.prepareBaseData();
  }

  prepareDerivedData() {
    this.flags.MarvelMultiverse || {};
  }

  getRollData() {
    const data = {};
    if (this.system.abilities) {
      for (const [k, v] of Object.entries(this.system.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    data.rank = this.system.attributes.rank.value;
    return { ...super.getRollData(), ...data };
  }

  async rollInitiative(options = {}, rollOptions = {}) {
    const initiative = this.system.attributes?.init ?? {};
    const configured = await requestRoll({
      ...rollOptions,
      actor: this,
      token: this.token,
      actionName: game.i18n.localize("MARVEL_MULTIVERSE.Initiative") || "Initiative",
      actionType: "initiative",
      ability: "vig",
      baseModifier: Number(initiative.value) || 0,
      edgeCount: initiative.edge ? 1 : 0,
      troubleCount: initiative.trouble ? 1 : 0,
      isAttack: false,
      dealsDamage: false,
      targets: [],
      postMessage: false,
    });
    if (configured.cancelled || !configured.roll) return null;

    this._cachedInitiativeRoll = configured.roll;
    try {
      return await super.rollInitiative(options);
    } finally {
      delete this._cachedInitiativeRoll;
    }
  }

  getInitiativeRoll(options = {}) {
    if (this._cachedInitiativeRoll) return this._cachedInitiativeRoll.clone();

    this.system.attributes?.init;
    const data = this.getRollData();
    const parts = ["{1d6,1dm,1d6}"];
    const formula = parts.join(" + ");
    return new CONFIG.Dice.MarvelMultiverseRoll(formula, data, options);
  }
}

export function applySizeModifiers(system) {
  if (!system?.abilities || !system?.movement) return system;
  if (system.size === "big") {
    system.abilities.mle.defense -= 1;
    system.abilities.agl.defense -= 1;
    system.movement.run.value += 1;
    system.reach = Math.max(system.reach, 2);
  } else if (system.size === "small") {
    system.abilities.mle.defense += 1;
    system.abilities.agl.defense += 1;
    system.movement.run.value = Math.max(0, system.movement.run.value - 1);
  }
  return system;
}

let MarvelMultiverseItem$1 = class MarvelMultiverseItem extends BaseItem {
  prepareData() {
    super.prepareData();
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.formula = this.system.ability && this.formula ? `${this.formula} + @${this.system.ability}.value` : "";
  }

  getRollData() {
    const rollData = { ...super.getRollData() };
    if (!this.actor) return rollData;
    rollData.actor = this.actor.getRollData();
    return rollData;
  }

  async roll() {
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings?.get?.("core", "rollMode") ?? "publicroll";
    const label = buildItemFlavor([
      ["ability", CONFIG.MARVEL_MULTIVERSE.damageAbility[this.system.ability]],
      [this.type, this.name],
      ["damagetype", this.system.damageType],
    ]);

    if (this.system.formula && this.system.ability) {
      try {
        const automation = inferRollAutomationFromItemSystem(this.system ?? {});
        const rollType = automation.isAttack ? "attack" : "ability";
        const circumstances = deriveConditionCircumstances(this);
        const conditionMods = getConditionRollModifiers(this.actor, {
          rollType,
          ability: this.system?.ability,
          item: this,
          circumstances,
        });

        const targetCollection = game.user?.targets;
        const resolvedTargets = Array.isArray(targetCollection)
          ? targetCollection
          : targetCollection && typeof targetCollection === "object"
            ? Array.from(targetCollection ?? [])
            : [];

        // Target detection/validation (required target missing, too many targets for a
        // single-target action, etc.) is centralized inside requestRoll() - see
        // lib/services/action-roll.mjs's resolveTargetingConfig/getDefenseValue.
        const { roll, message, cancelled } = await requestRoll({
          actor: this.actor,
          token: this.actor?.token,
          source: this,
          actionName: this.name,
          actionType: rollType,
          ability: this.system?.ability,
          attackTarget: this.system?.attackTarget,
          isAttack: automation.isAttack,
          dealsDamage: automation.dealsDamage,
          targets: resolvedTargets,
          trouble: conditionMods.trouble,
        });

        if (cancelled) {
          return { roll: null, message: null, blocked: true };
        }

        if (automation.isAttack) {
          Hooks.callAll("marvel-multiverse.rollAttack", this, roll);
          Hooks.callAll("marvel-multiverse.calcDamage", this, roll);
        }
        return { roll, message };
      } catch (error) {
        console.warn("Marvel Multiverse item roll failed, falling back to simple chat message.", error);
      }
    }

    return ChatMessage.create({
      speaker,
      rollMode,
      flavor: label,
      content: `<div>${this.system.description}</div><div>${this.system.effect ? this.system.effect : ""}</div>`,
    });
  }
};

class MarvelMultiverseActorBase extends BaseTypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};

    schema.attributes = new fields.SchemaField({
      init: new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
        edge: new fields.BooleanField({ required: true, initial: false }),
        trouble: new fields.BooleanField({ required: true, initial: false }),
      }),
      rank: new fields.SchemaField({ value: new fields.NumberField({ ...requiredInteger, initial: 1 }) }),
    });

    schema.abilities = new fields.SchemaField(
      Object.keys(CONFIG.MARVEL_MULTIVERSE.abilities).reduce((obj, ability) => {
        obj[ability] = new fields.SchemaField({
          value: new fields.NumberField({ required: true, nullable: false, initial: 0, min: -3 }),
          defense: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
          noncom: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 }),
          edge: new fields.BooleanField({ required: true, initial: false }),
          damageMultiplier: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
          label: new fields.StringField({ required: true, blank: true }),
        });
        return obj;
      }, {})
    );

    schema.health = new fields.SchemaField({
      value: new fields.NumberField({ required: true, nullable: false, initial: 0, min: -300 }),
      max: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
    });

    schema.healthDamageReduction = new fields.NumberField({ ...requiredInteger, initial: 0 });
    schema.focus = new fields.SchemaField({
      value: new fields.NumberField({ required: true, nullable: false, initial: 0, min: -300 }),
      max: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
    });

    schema.focusDamageReduction = new fields.NumberField({ ...requiredInteger, initial: 0 });
    schema.karma = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 0 }),
    });

    schema.codename = new fields.StringField({ required: true, blank: true });
    schema.realname = new fields.StringField({ required: true, blank: true });
    schema.height = new fields.StringField({ required: true, blank: true });
    schema.weight = new fields.StringField({ required: true, blank: true });
    schema.gender = new fields.StringField({ required: true, blank: true });
    schema.eyes = new fields.StringField({ required: true, blank: true });
    schema.hair = new fields.StringField({ required: true, blank: true });
    schema.size = new fields.StringField({ required: true, initial: "average" });
    schema.distinguishingFeatures = new fields.StringField({ required: true, blank: true });
    schema.teams = new fields.StringField({ required: true, blank: true });
    schema.history = new fields.StringField({ required: true, blank: true });
    schema.personality = new fields.StringField({ required: true, blank: true });

    schema.actorSizes = new fields.SchemaField(
      Object.keys(CONFIG.MARVEL_MULTIVERSE.sizes).reduce((obj, size) => {
        obj[size] = new fields.SchemaField({ label: new fields.StringField({ required: true, initial: CONFIG.MARVEL_MULTIVERSE.sizes[size].label }) });
        return obj;
      }, {})
    );

    schema.movement = new fields.SchemaField(
      Object.keys(CONFIG.MARVEL_MULTIVERSE.movementTypes).reduce((obj, movement) => {
        obj[movement] = new fields.SchemaField({
          label: new fields.StringField({ required: true, initial: CONFIG.MARVEL_MULTIVERSE.movementTypes[movement].label }),
          value: new fields.NumberField({ ...requiredInteger, initial: 5, min: 0 }),
          noncom: new fields.NumberField({ ...requiredInteger, initial: 5, min: 0 }),
          active: new fields.BooleanField({ required: true, initial: CONFIG.MARVEL_MULTIVERSE.movementTypes[movement].active }),
          rankMode: new fields.StringField({ required: true, blank: true }),
          calc: new fields.StringField({ blank: true }),
        });
        return obj;
      }, {})
    );

    schema.base = new fields.StringField({ required: true, blank: true });
    schema.occupations = new fields.ArrayField(new fields.ObjectField());
    schema.weapons = new fields.ArrayField(new fields.ObjectField());
    schema.origins = new fields.ArrayField(new fields.ObjectField());
    schema.gear = new fields.ArrayField(new fields.ObjectField());
    schema.tags = new fields.ArrayField(new fields.ObjectField());
    schema.traits = new fields.ArrayField(new fields.ObjectField());
    schema.powers = new fields.SchemaField(Object.keys(CONFIG.MARVEL_MULTIVERSE.powersets).reduce((obj, powerset) => {
      obj[powerset] = new fields.ArrayField(new fields.ObjectField());
      return obj;
    }, {}));
    schema.reach = new fields.NumberField({ ...requiredInteger, initial: 1, min: 0 });
    schema.defaultElement = new fields.StringField({ required: true, blank: true });

    return schema;
  }

  prepareBaseData() {}

  prepareDerivedData() {
    // The reset lives here (not in prepareBaseData) because Foundry can invoke
    // prepareBaseData a second time on its own (e.g. for unlinked/ActorDelta token
    // actors) without a matching follow-up prepareDerivedData call. If the reset were
    // split into prepareBaseData, that stray extra pass would zero out defense/
    // damageMultiplier/noncom and leave them stuck at 0 since derivation never re-runs.
    // Keeping reset + recompute together in prepareDerivedData makes it self-contained
    // and idempotent no matter how many extra prepareBaseData-only passes occur.
    for (const key in this.abilities) {
      this.abilities[key].defense = 0;
      this.abilities[key].damageMultiplier = 0;
      this.abilities[key].noncom = 0;
    }
    this.attributes.init.value = 0;
    for (const key in this.movement) {
      this.movement[key].value = 5;
    }

    for (const key in this.abilities) {
      this.abilities[key].defense += this.abilities[key].value + 10;
      this.abilities[key].damageMultiplier += this.attributes.rank.value;
      this.abilities[key].noncom += this.abilities[key].value;
      this.abilities[key].label = game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities[key]) ?? key;
    }

    this.movement.climb.value = Math.ceil(this.movement.run.value * 0.5);
    this.movement.jump.value = Math.ceil(this.movement.run.value * 0.5);
    this.movement.swim.value = Math.ceil(this.movement.run.value * 0.5);

    this.attributes.init.value += this.abilities.vig.value;

    for (const key in this.movement) {
      this.movement[key].label = game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.movementTypes[key].label) ?? key;
      switch (this.movement[key].calc) {
        case "half": {
          this.movement[key].value = Math.ceil(this.movement[key].value * 0.5);
          break;
        }
        case "double": {
          this.movement[key].value *= 2;
          break;
        }
        case "triple":
          this.movement[key].value *= 3;
          break;
        case "runspeed":
          this.movement[key].value = this.movement.run.value;
          break;
        case "rank": {
          const val = this.movement[key].value === 0 ? 1 : this.movement[key].value;
          this.movement[key].value = val * this.attributes.rank.value;
          break;
        }
      }
    }
    applySizeModifiers(this);
  }
}

class MarvelMultiverseCharacter extends MarvelMultiverseActorBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = MarvelMultiverseActorBase.defineSchema();

    schema.teamManeuver = new fields.SchemaField({
      maneuverType: new fields.StringField({ required: true, blank: true }),
      level: new fields.NumberField({ min: 1, max: 3, integer: true }),
    });

    return schema;
  }
}

class MarvelMultiverseNPC extends MarvelMultiverseActorBase {
  prepareDerivedData() {
    // See MarvelMultiverseActorBase.prepareDerivedData for why reset + recompute must
    // stay together here rather than splitting the reset into prepareBaseData.
    for (const key in this.abilities) {
      this.abilities[key].defense = 0;
      this.abilities[key].damageMultiplier = 0;
      this.abilities[key].noncom = 0;
    }
    this.attributes.init.value = 0;
    for (const key in this.movement) {
      this.movement[key].value = 5;
    }

    for (const key in this.abilities) {
      this.abilities[key].defense += this.abilities[key].value + 10;
      this.abilities[key].damageMultiplier += this.attributes.rank.value;
      this.abilities[key].noncom += this.abilities[key].value;
      this.abilities[key].label = game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.abilities[key]) ?? key;
    }

    this.movement.climb.value = Math.ceil(this.movement.run.value * 0.5);
    this.movement.jump.value = Math.ceil(this.movement.run.value * 0.5);
    this.movement.swim.value = Math.ceil(this.movement.run.value * 0.5);

    this.attributes.init.value += this.abilities.vig.value;

    for (const key in this.movement) {
      this.movement[key].label = game.i18n.localize(CONFIG.MARVEL_MULTIVERSE.movementTypes[key].label) ?? key;
      switch (this.movement[key].calc) {
        case "half": {
          this.movement[key].value = Math.ceil(this.movement[key].value * 0.5);
          break;
        }
        case "double": {
          this.movement[key].value *= 2;
          break;
        }
        case "triple":
          this.movement[key].value *= 3;
          break;
        case "runspeed":
          this.movement[key].value = this.movement.run.value;
          break;
        case "rank": {
          const val = this.movement[key].value === 0 ? 1 : this.movement[key].value;
          this.movement[key].value = val * this.attributes.rank.value;
          break;
        }
      }
    }
    applySizeModifiers(this);
  }
}

class MarvelMultiverseItemBase extends BaseTypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};

    schema.description = new fields.StringField({ required: true, blank: true });
    schema.size = new fields.StringField({ blank: true });
    schema.quantity = new fields.NumberField({ ...requiredInteger, initial: 1, min: 1 });
    schema.ability = new fields.StringField({ required: true, blank: true });
    schema.attack = new fields.BooleanField({ required: true, initial: false });
    schema.formula = new fields.StringField({ required: true, initial: "{1d6,1dm,1d6}" });
    schema.automationPreset = new fields.StringField({ blank: true });
    schema.effectProfile = new fields.StringField({ blank: true });
    schema.effectProfiles = new fields.ObjectField();
    schema.effectOverrides = new fields.ObjectField();
    schema.targeting = new fields.ObjectField();
    schema.damage = new fields.ObjectField();
    // Structured special events (trigger -> eligibility -> outcome -> duration -> removal). See lib/services/power-events.mjs.
    schema.events = new fields.ArrayField(new fields.ObjectField());
    schema.rollModifiers = new fields.ArrayField(new fields.ObjectField());
    // Pre-roll configurable choices referenced by "power-option-selected" event requirements.
    schema.options = new fields.ArrayField(new fields.ObjectField());

    return schema;
  }
}

class MarvelMultiverseItem extends MarvelMultiverseItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = MarvelMultiverseItemBase.defineSchema();

    schema.weight = new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0 });

    return schema;
  }
}

class MarvelMultiverseWeapon extends MarvelMultiverseItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = MarvelMultiverseItemBase.defineSchema();

    schema.kind = new fields.StringField({ required: true, initial: "close" });
    schema.range = new fields.StringField({ required: true, initial: "Reach" });
    schema.damageMultiplierBonus = new fields.StringField({ required: true, initial: "0" });
    schema.rule = new fields.StringField({ blank: true });
    schema.recommendedRank = new fields.StringField({ blank: true });
    schema.category = new fields.StringField({ blank: true });
    schema.reach = new fields.StringField({ blank: true });
    schema.history = new fields.StringField({ blank: true });
    schema.commentary = new fields.StringField({ blank: true });

    schema.equipped = new fields.BooleanField({ required: true, initial: false });
    schema.attackTarget = new fields.StringField({ required: true, initial: "mle" });
    schema.attackRange = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.attackKind = new fields.StringField({ required: true, initial: "close" });
    schema.damageType = new fields.StringField({ required: true, initial: "health" });
    schema.attackEdgeMode = new fields.StringField({ blank: true });
    schema.attackMultiplier = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    return schema;
  }
}

class MarvelMultiverseOccupation extends MarvelMultiverseItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = MarvelMultiverseItemBase.defineSchema();

    schema.examples = new fields.StringField({ required: true, blank: true });
    schema.tags = new fields.ArrayField(new fields.ObjectField());
    schema.traits = new fields.ArrayField(new fields.ObjectField());

    return schema;
  }
}

class MarvelMultiverseOrigin extends MarvelMultiverseItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = MarvelMultiverseItemBase.defineSchema();

    schema.examples = new fields.StringField({ required: true, blank: true });
    schema.suggestedOccupation = new fields.StringField({ required: true, blank: true });
    schema.suggestedTags = new fields.ArrayField(new fields.ObjectField());
    schema.minimumRank = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.tags = new fields.ArrayField(new fields.ObjectField());
    schema.traits = new fields.ArrayField(new fields.ObjectField());
    schema.powers = new fields.ArrayField(new fields.ObjectField());
    schema.limitation = new fields.StringField({ required: true, blank: true });

    return schema;
  }
}

class MarvelMultiverseTag extends MarvelMultiverseItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = MarvelMultiverseItemBase.defineSchema();

    schema.restriction = new fields.StringField({ required: true, blank: true });
    schema.rarity = new fields.StringField({ required: true, blank: true });
    schema.multiple = new fields.BooleanField({ required: true, initial: false });

    return schema;
  }
}

class MarvelMultiverseTrait extends MarvelMultiverseItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.restriction = new fields.StringField({ required: true, blank: true });
    schema.multiple = new fields.BooleanField({ required: true, initial: false });
    return schema;
  }
}

class MarvelMultiversePower extends MarvelMultiverseItemBase {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    const requiredInteger = { required: true, nullable: false, integer: true };

    schema.powerSet = new fields.StringField({ required: true, initial: "Basic" });
    schema.prerequisites = new fields.StringField({ initial: "", blank: true });
    schema.action = new fields.StringField({ initial: "", blank: true });
    schema.trigger = new fields.StringField({ initial: "", blank: true });
    schema.duration = new fields.StringField({ initial: "", blank: true });
    schema.range = new fields.StringField({ initial: "", blank: true });
    schema.cost = new fields.StringField({ initial: "", blank: true });
    schema.focusScaling = new fields.ObjectField();
    schema.effect = new fields.StringField({ initial: "", blank: true });
    schema.modifiers = new fields.ArrayField(new fields.ObjectField());
    schema.numbered = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.attackTarget = new fields.StringField({ blank: true });
    schema.attackRange = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.attackKind = new fields.StringField({ blank: true });
    schema.damageType = new fields.StringField({ blank: true });
    schema.attackEdgeMode = new fields.StringField({ blank: true });
    schema.attackMultiplier = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.isElemental = new fields.BooleanField({ required: true, initial: false });
    schema.element = new fields.StringField({ blank: true });

    return schema;
  }

  static migrateData(source) {
    if (source.attackAbility) {
      source.ability = source.attackAbility;
      source.attackAbility = undefined;
    }
    return super.migrateData(source);
  }
}

class MarvelDie extends BaseDieTerm {
  static DENOMINATION = "m";

  constructor(termData) {
    super({ ...termData, faces: 6 });
  }

  getResultCSS(result) {
    const resultStyles = ["marvel-roll", "die", "d6"];
    if (result.result === 1) resultStyles.push("fantastic");
    else if (result.result === 6) resultStyles.push("max");
    if (result.discarded) resultStyles.push("discarded");
    return resultStyles;
  }

  getResultLabel(result) {
    if (result.result === 1) return "m";
    return result.result.toString();
  }

  async roll({ minimize = false, maximize = false } = {}) {
    const roll = await super.roll({ minimize, maximize });
    if (roll.result === 1) this.results[this.results.length - 1].count = 6;
    return roll;
  }

  get total() {
    const total = super.total;
    return total === 1 ? 6 : total;
  }
}

const dice = Object.freeze({ MarvelDie });
const models = Object.freeze({
  MarvelMultiverseActorBase,
  MarvelMultiverseCharacter,
  MarvelMultiverseItem,
  MarvelMultiverseItemBase,
  MarvelMultiverseNPC,
  MarvelMultiverseOccupation,
  MarvelMultiverseOrigin,
  MarvelMultiversePower,
  MarvelMultiverseTag,
  MarvelMultiverseTrait,
  MarvelMultiverseWeapon,
});

export {
  MarvelMultiverseRoll,
  MarvelMultiverseCombatant,
  MarvelMultiverseActor,
  MarvelMultiverseItem$1 as MarvelMultiverseItem,
  MarvelMultiverseActorBase,
  MarvelMultiverseCharacter,
  MarvelMultiverseNPC,
  MarvelMultiverseItemBase,
  MarvelMultiverseWeapon,
  MarvelMultiverseOccupation,
  MarvelMultiverseOrigin,
  MarvelMultiverseTag,
  MarvelMultiverseTrait,
  MarvelMultiversePower,
  MarvelDie,
  dice,
  models,
};

export default {
  MarvelMultiverseRoll,
  MarvelMultiverseCombatant,
  MarvelMultiverseActor,
  MarvelMultiverseItem: MarvelMultiverseItem$1,
  MarvelMultiverseActorBase,
  MarvelMultiverseCharacter,
  MarvelMultiverseNPC,
  MarvelMultiverseItemBase,
  MarvelMultiverseWeapon,
  MarvelMultiverseOccupation,
  MarvelMultiverseOrigin,
  MarvelMultiverseTag,
  MarvelMultiverseTrait,
  MarvelMultiversePower,
  MarvelDie,
  dice,
  models,
};
