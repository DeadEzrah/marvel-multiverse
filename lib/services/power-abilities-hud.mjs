import { getConditionRollModifiers } from "../conditions.mjs";
import { endConcentration, startConcentration } from "../concentration.mjs";
import { deriveConditionCircumstances } from "../roll-context.mjs";
import { requestRoll } from "./action-roll.mjs";

const HUD_ID = "mm-power-abilities-hud";
const ABILITY_KEYS = ["mle", "agl", "res", "vig", "ego", "log"];
const ATTACK_ABILITY_KEYS = new Set(["mle", "agl", "ego", "log"]);
const ABILITY_LABELS = {
  mle: "Melee",
  agl: "Agility",
  res: "Resilience",
  vig: "Vigilance",
  ego: "Ego",
  log: "Logic",
};
const ABILITY_ICONS = {
  mle: "fa-hand-fist",
  agl: "fa-person-running",
  res: "fa-shield-halved",
  vig: "fa-eye",
  ego: "fa-comment-dots",
  log: "fa-brain",
};
const POWER_SET_ICONS = [
  [/\bmagic\b|\bsorcery\b/i, "fa-wand-sparkles"],
  [/\belement|\bweather\b/i, "fa-cloud-bolt"],
  [/\bspeed\b/i, "fa-gauge-high"],
  [/\bmartial\b|\bmelee\b|\bweapon\b/i, "fa-hand-fist"],
  [/\btelepathy\b|\bpsychic\b/i, "fa-brain"],
  [/\btelekinesis\b|\bplasticity\b/i, "fa-hand-sparkles"],
  [/\bspider\b/i, "fa-spider"],
  [/\btravel\b|\bportal\b/i, "fa-door-open"],
  [/\bnarrative\b/i, "fa-book-open"],
  [/\bbasic\b/i, "fa-star"],
];

let activeActor = null;
let activeToken = null;
let activeTab = "abilities";
let activeAbilityMode = "check";
let hudPosition = null;
let powerSearch = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function resolveRoot(html) {
  return html?.querySelector ? html : html?.[0] ?? null;
}

function getResource(actor, resource) {
  const data = actor?.system?.[resource] ?? {};
  return {
    value: Number(data.value) || 0,
    max: Number(data.max) || 0,
  };
}

function getPowerGroups(actor) {
  const groups = new Map();
  for (const item of actor?.items ?? []) {
    if (item.type !== "power") continue;
    const group = String(item.system?.powerSet ?? "Other").split(",")[0].trim() || "Other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  return [...groups.entries()]
    .map(([name, items]) => [name, items.sort((left, right) => left.name.localeCompare(right.name))])
    .sort(([left], [right]) => left.localeCompare(right));
}

function getConcentrationState(actor) {
  const flags = actor?.flags?.["marvel-multiverse"] ?? actor?.flags?.marvelMultiverse ?? {};
  return flags.concentration ?? {};
}

function resolvePowerSetIcon(powerSet) {
  return POWER_SET_ICONS.find(([pattern]) => pattern.test(powerSet))?.[1] ?? "fa-bolt";
}

function renderAbilities(actor) {
  const abilityKeys = activeAbilityMode === "attack"
    ? ABILITY_KEYS.filter((key) => ATTACK_ABILITY_KEYS.has(key))
    : ABILITY_KEYS;
  return abilityKeys.map((key) => {
    const ability = actor.system?.abilities?.[key] ?? {};
    const detail = activeAbilityMode === "attack"
      ? `vs ${ABILITY_LABELS[key]} Defense`
      : activeAbilityMode === "noncombat"
        ? "Non-combat"
        : `Defense ${Number(ability.defense) || 0}`;
    const value = activeAbilityMode === "noncombat"
      ? Number(ability.noncom) || 0
      : Number(ability.value) || 0;
    return `
      <button type="button" class="mm-quick-hud__ability" data-ability="${key}" title="Roll ${ABILITY_LABELS[key]}">
        <i class="fas ${ABILITY_ICONS[key]}" aria-hidden="true"></i>
        <span>${ABILITY_LABELS[key]}</span>
        <strong>${value >= 0 && activeAbilityMode === "noncombat" ? "+" : ""}${value}</strong>
        <small>${detail}</small>
      </button>`;
  }).join("");
}

function renderPowers(actor) {
  const groups = getPowerGroups(actor);
  const concentration = getConcentrationState(actor);
  if (!groups.length) return '<p class="mm-quick-hud__empty">No powers available.</p>';
  return groups.map(([name, items]) => `
    <details class="mm-quick-hud__power-group" open>
      <summary><i class="fas ${resolvePowerSetIcon(name)}" aria-hidden="true"></i><span>${escapeHtml(name)}</span><strong>${items.length}</strong></summary>
      ${items.map((item) => `
        <div class="mm-quick-hud__power-row" data-power-search="${escapeHtml(`${name} ${item.name} ${item.system?.action ?? ""}`.toLowerCase())}">
          <button type="button" class="mm-quick-hud__power" data-item-id="${item.id}" title="Use ${escapeHtml(item.name)}">
            <span>${escapeHtml(item.name)}</span>
            <small><i class="fas fa-clock" aria-hidden="true"></i>${escapeHtml(item.system?.action || "Power")}<i class="fas fa-bolt" aria-hidden="true"></i>${escapeHtml(item.system?.cost || "—")}</small>
          </button>
          ${item.system?.requiresConcentration || /concentration/i.test(item.system?.duration ?? "") ? `
            <button type="button" class="mm-quick-hud__concentration${concentration.active && (concentration.itemUuid === item.uuid || concentration.itemName === item.name) ? " active" : ""}"
              data-concentration-item-id="${item.id}"
              aria-label="${concentration.active && (concentration.itemUuid === item.uuid || concentration.itemName === item.name) ? "End" : "Start"} concentration for ${escapeHtml(item.name)}"
              title="${concentration.active && (concentration.itemUuid === item.uuid || concentration.itemName === item.name) ? "End" : "Start"} concentration">
              <i class="fas fa-bullseye" aria-hidden="true"></i>
            </button>` : ""}
        </div>`).join("")}
    </details>`).join("");
}

function buildHud(actor) {
  const health = getResource(actor, "health");
  const focus = getResource(actor, "focus");
  const karma = getResource(actor, "karma");
  const root = document.createElement("aside");
  root.id = HUD_ID;
  root.className = "mm-quick-hud";
  root.setAttribute("aria-label", `${actor.name} quick actions`);
  if (hudPosition) {
    root.style.left = `${hudPosition.left}px`;
    root.style.top = `${hudPosition.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
  }
  root.innerHTML = `
    <header class="mm-quick-hud__header">
      <img src="${escapeHtml(actor.img)}" alt="">
      <div><strong>${escapeHtml(actor.name)}</strong><small>Quick Actions</small></div>
      <button type="button" class="mm-quick-hud__close" data-hud-action="close" aria-label="Close quick actions" title="Close"><i class="fas fa-xmark"></i></button>
    </header>
    <div class="mm-quick-hud__resources">
      <span title="Health" aria-label="Health ${health.value} of ${health.max}"><small><i class="fas fa-heart" aria-hidden="true"></i></small><strong>${health.value}/${health.max}</strong></span>
      <span title="Focus" aria-label="Focus ${focus.value} of ${focus.max}"><small><i class="fas fa-bullseye" aria-hidden="true"></i></small><strong>${focus.value}/${focus.max}</strong></span>
      <span title="Karma" aria-label="Karma ${karma.value} of ${karma.max}"><small><i class="fas fa-clover" aria-hidden="true"></i></small><strong>${karma.value}/${karma.max}</strong></span>
    </div>
    <nav class="mm-quick-hud__tabs" aria-label="Quick action categories">
      <button type="button" data-hud-tab="abilities" class="${activeTab === "abilities" ? "active" : ""}" aria-pressed="${activeTab === "abilities"}"><i class="fas fa-dice-d6" aria-hidden="true"></i>Abilities</button>
      <button type="button" data-hud-tab="powers" class="${activeTab === "powers" ? "active" : ""}" aria-pressed="${activeTab === "powers"}"><i class="fas fa-bolt" aria-hidden="true"></i>Powers</button>
    </nav>
    <div class="mm-quick-hud__body">
      ${activeTab === "abilities" ? `
        <div class="mm-quick-hud__ability-modes" role="group" aria-label="Ability roll type">
          <button type="button" data-ability-mode="check" class="${activeAbilityMode === "check" ? "active" : ""}" aria-pressed="${activeAbilityMode === "check"}" title="Ability check"><i class="fas fa-dice-d6" aria-hidden="true"></i><span>Check</span></button>
          <button type="button" data-ability-mode="attack" class="${activeAbilityMode === "attack" ? "active" : ""}" aria-pressed="${activeAbilityMode === "attack"}" title="Attack"><i class="fas fa-crosshairs" aria-hidden="true"></i><span>Attack</span></button>
          <button type="button" data-ability-mode="noncombat" class="${activeAbilityMode === "noncombat" ? "active" : ""}" aria-pressed="${activeAbilityMode === "noncombat"}" title="Non-combat check"><i class="fas fa-masks-theater" aria-hidden="true"></i><span>Non-Combat</span></button>
          <button type="button" data-hud-action="initiative" title="Roll initiative" aria-label="Roll initiative"><i class="fas fa-flag-checkered" aria-hidden="true"></i></button>
        </div>
        <div class="mm-quick-hud__abilities">${renderAbilities(actor)}</div>` : `
        <label class="mm-quick-hud__search">
          <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" data-power-search-input value="${escapeHtml(powerSearch)}" placeholder="Find a power" aria-label="Find a power">
        </label>
        <div class="mm-quick-hud__powers">${renderPowers(actor)}</div>`}
    </div>`;
  return root;
}

function clampHudPosition(root, left, top) {
  const bounds = root.getBoundingClientRect();
  return {
    left: Math.max(8, Math.min(left, window.innerWidth - bounds.width - 8)),
    top: Math.max(8, Math.min(top, window.innerHeight - bounds.height - 8)),
  };
}

function bindHudDrag(root) {
  const handle = root.querySelector(".mm-quick-hud__header");
  handle?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    const bounds = root.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;
    root.style.left = `${bounds.left}px`;
    root.style.top = `${bounds.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.classList.add("is-dragging");

    const move = (moveEvent) => {
      hudPosition = clampHudPosition(root, moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
      root.style.left = `${hudPosition.left}px`;
      root.style.top = `${hudPosition.top}px`;
    };
    const stop = () => {
      root.classList.remove("is-dragging");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop, { once: true });
  });
}

function closeHud() {
  document.getElementById(HUD_ID)?.remove();
  activeActor = null;
  activeToken = null;
  powerSearch = "";
}

async function rollAbility(actor, token, ability, event) {
  const isAttack = activeAbilityMode === "attack";
  const isNonCombat = activeAbilityMode === "noncombat";
  const targets = Array.from(game.user?.targets ?? []);
  const circumstances = deriveConditionCircumstances(null);
  const conditionMods = getConditionRollModifiers(actor, {
    rollType: isAttack ? "attack" : "ability",
    ability,
    item: null,
    circumstances,
  });
  return requestRoll({
    actor,
    token,
    actionName: `${ABILITY_LABELS[ability]} ${isAttack ? "Attack" : isNonCombat ? "Non-Combat Check" : "Check"}`,
    actionType: isAttack ? "attack" : "ability",
    ability,
    baseModifier: isNonCombat ? Number(actor.system?.abilities?.[ability]?.noncom) || 0 : undefined,
    attackTarget: isAttack ? ability : null,
    isAttack,
    dealsDamage: isAttack,
    targets,
    event,
    trouble: conditionMods.trouble,
  });
}

function bindHud(root, actor, token) {
  bindHudDrag(root);
  const searchInput = root.querySelector("[data-power-search-input]");
  const filterPowers = () => {
    powerSearch = searchInput?.value.trim().toLowerCase() ?? "";
    for (const group of root.querySelectorAll(".mm-quick-hud__power-group")) {
      let visibleCount = 0;
      for (const row of group.querySelectorAll(".mm-quick-hud__power-row")) {
        row.hidden = Boolean(powerSearch) && !row.dataset.powerSearch.includes(powerSearch);
        if (!row.hidden) visibleCount += 1;
      }
      group.hidden = visibleCount === 0;
      if (powerSearch && visibleCount > 0) group.open = true;
    }
  };
  searchInput?.addEventListener("input", filterPowers);
  filterPowers();

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.hudAction === "close") {
      closeHud();
      return;
    }
    if (button.dataset.hudAction === "initiative") {
      button.disabled = true;
      try {
        await actor.rollInitiative({ createCombatants: true });
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (button.dataset.hudTab) {
      activeTab = button.dataset.hudTab;
      openPowerAbilitiesHud(actor, token);
      return;
    }
    if (button.dataset.abilityMode) {
      activeAbilityMode = button.dataset.abilityMode;
      openPowerAbilitiesHud(actor, token);
      return;
    }
    if (button.dataset.ability) {
      button.disabled = true;
      root.hidden = true;
      try {
        await rollAbility(actor, token, button.dataset.ability, event);
      } finally {
        button.disabled = false;
        if (root.isConnected) root.hidden = false;
      }
      return;
    }
    if (button.dataset.concentrationItemId) {
      const item = actor.items.get(button.dataset.concentrationItemId);
      if (!item) return;
      const concentration = getConcentrationState(actor);
      const isActive = concentration.active
        && (concentration.itemUuid === item.uuid || concentration.itemName === item.name);
      button.disabled = true;
      try {
        const result = isActive
          ? await endConcentration(actor, { reason: "quick-actions" })
          : await startConcentration(actor, {
            itemName: item.name,
            itemUuid: item.uuid,
            targetUuids: Array.from(game.user?.targets ?? []).map((target) => target.document?.uuid ?? target.uuid),
          });
        if (result?.success) {
          ui.notifications.info(`Concentration ${isActive ? "ended" : "started"}.`);
        }
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (button.dataset.itemId) {
      const item = actor.items.get(button.dataset.itemId);
      if (!item) return;
      button.disabled = true;
      root.hidden = true;
      try {
        await item.roll();
      } finally {
        button.disabled = false;
        if (root.isConnected) root.hidden = false;
      }
    }
  });
}

export function openPowerAbilitiesHud(actor, token = null) {
  if (!actor) {
    ui.notifications.warn("Select a token with a character before opening Quick Actions.");
    return null;
  }
  if (activeActor?.uuid && activeActor.uuid !== actor.uuid) powerSearch = "";
  activeActor = actor;
  activeToken = token;
  const previous = document.getElementById(HUD_ID);
  const root = buildHud(actor);
  bindHud(root, actor, token);
  if (previous) previous.replaceWith(root);
  else document.body.append(root);
  if (hudPosition) {
    hudPosition = clampHudPosition(root, hudPosition.left, hudPosition.top);
    root.style.left = `${hudPosition.left}px`;
    root.style.top = `${hudPosition.top}px`;
  }
  return root;
}

export function registerPowerAbilitiesHudHooks() {
  Hooks.on("renderTokenHUD", (app, html) => {
    const root = resolveRoot(html);
    const actor = app.object?.actor ?? app.object?.document?.actor ?? null;
    const token = app.object?.object ?? app.object ?? null;
    const column = root?.querySelector(".col.right");
    if (!column || !actor || column.querySelector("[data-action='mmQuickActions']")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-icon mm-quick-hud-launcher";
    button.dataset.action = "mmQuickActions";
    button.title = "Abilities and Powers";
    button.setAttribute("aria-label", "Open abilities and powers");
    button.innerHTML = '<i class="fas fa-bolt" aria-hidden="true"></i>';
    button.addEventListener("click", () => openPowerAbilitiesHud(actor, token));
    column.append(button);
  });

  Hooks.on("updateActor", (actor) => {
    if (activeActor?.uuid === actor.uuid && document.getElementById(HUD_ID)) {
      openPowerAbilitiesHud(actor, activeToken);
    }
  });

  Hooks.on("deleteActor", (actor) => {
    if (activeActor?.uuid === actor.uuid) closeHud();
  });
}