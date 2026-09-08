import { getConditionRollModifiers } from "../conditions.mjs";
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

let activeActor = null;
let activeToken = null;
let activeTab = "abilities";
let activeAbilityMode = "check";
let hudPosition = null;

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
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function renderAbilities(actor) {
  const abilityKeys = activeAbilityMode === "attack"
    ? ABILITY_KEYS.filter((key) => ATTACK_ABILITY_KEYS.has(key))
    : ABILITY_KEYS;
  return abilityKeys.map((key) => {
    const ability = actor.system?.abilities?.[key] ?? {};
    const detail = activeAbilityMode === "attack"
      ? `vs ${ABILITY_LABELS[key]} Defense`
      : `Defense ${Number(ability.defense) || 0}`;
    return `
      <button type="button" class="mm-quick-hud__ability" data-ability="${key}" title="Roll ${ABILITY_LABELS[key]}">
        <span>${ABILITY_LABELS[key]}</span>
        <strong>${Number(ability.value) || 0}</strong>
        <small>${detail}</small>
      </button>`;
  }).join("");
}

function renderPowers(actor) {
  const groups = getPowerGroups(actor);
  if (!groups.length) return '<p class="mm-quick-hud__empty">No powers available.</p>';
  return groups.map(([name, items]) => `
    <section class="mm-quick-hud__power-group">
      <h3>${escapeHtml(name)}</h3>
      ${items.map((item) => `
        <button type="button" class="mm-quick-hud__power" data-item-id="${item.id}" title="Use ${escapeHtml(item.name)}">
          <span>${escapeHtml(item.name)}</span>
          <small>${escapeHtml(item.system?.action || "Power")}</small>
          <strong>${escapeHtml(item.system?.cost || "-")}</strong>
        </button>`).join("")}
    </section>`).join("");
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
      <span><small>Health</small><strong>${health.value}/${health.max}</strong></span>
      <span><small>Focus</small><strong>${focus.value}/${focus.max}</strong></span>
      <span><small>Karma</small><strong>${karma.value}/${karma.max}</strong></span>
    </div>
    <nav class="mm-quick-hud__tabs" aria-label="Quick action categories">
      <button type="button" data-hud-tab="abilities" class="${activeTab === "abilities" ? "active" : ""}" aria-pressed="${activeTab === "abilities"}">Abilities</button>
      <button type="button" data-hud-tab="powers" class="${activeTab === "powers" ? "active" : ""}" aria-pressed="${activeTab === "powers"}">Powers</button>
    </nav>
    <div class="mm-quick-hud__body">
      ${activeTab === "abilities" ? `
        <div class="mm-quick-hud__ability-modes" role="group" aria-label="Ability roll type">
          <button type="button" data-ability-mode="check" class="${activeAbilityMode === "check" ? "active" : ""}" aria-pressed="${activeAbilityMode === "check"}">Check</button>
          <button type="button" data-ability-mode="attack" class="${activeAbilityMode === "attack" ? "active" : ""}" aria-pressed="${activeAbilityMode === "attack"}">Attack</button>
        </div>
        <div class="mm-quick-hud__abilities">${renderAbilities(actor)}</div>` : renderPowers(actor)}
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
}

async function rollAbility(actor, token, ability, event) {
  const isAttack = activeAbilityMode === "attack";
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
    actionName: `${ABILITY_LABELS[ability]} ${isAttack ? "Attack" : "Check"}`,
    actionType: isAttack ? "attack" : "ability",
    ability,
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
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.hudAction === "close") {
      closeHud();
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
      try {
        await rollAbility(actor, token, button.dataset.ability, event);
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (button.dataset.itemId) {
      const item = actor.items.get(button.dataset.itemId);
      if (!item) return;
      button.disabled = true;
      try {
        await item.roll();
      } finally {
        button.disabled = false;
      }
    }
  });
}

export function openPowerAbilitiesHud(actor, token = null) {
  if (!actor) {
    ui.notifications.warn("Select a token with a character before opening Quick Actions.");
    return null;
  }
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