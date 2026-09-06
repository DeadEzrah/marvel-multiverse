const RESOURCE_STYLES = Object.freeze({
  health: { fill: "#ffd54a", label: "Health" },
  focus: { fill: "#a970ff", label: "Focus" },
});

function getChangedValue(changes, resource) {
  const dotted = changes?.[`system.${resource}.value`];
  const nested = changes?.system?.[resource]?.value;
  const value = dotted ?? nested;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getResourceDeltas(actor, changes = {}) {
  const deltas = [];
  for (const resource of Object.keys(RESOURCE_STYLES)) {
    const previousValue = actor?.system?.[resource]?.value;
    const nextValue = getChangedValue(changes, resource);
    if (typeof previousValue !== "number" || !Number.isFinite(previousValue) || nextValue === null) continue;
    const delta = nextValue - previousValue;
    if (delta !== 0) deltas.push({ resource, delta, previousValue, nextValue });
  }
  return deltas;
}

function getActorTokens(actor) {
  const syntheticToken = actor?.token?.object;
  if (syntheticToken) return [syntheticToken];
  const activeTokens = actor?.getActiveTokens?.(false, true);
  if (Array.isArray(activeTokens) && activeTokens.length) {
    return activeTokens.map((token) => token?.object ?? token).filter((token) => token?.center);
  }
  const placeables = globalThis.canvas?.tokens?.placeables ?? [];
  return placeables.filter((token) => token?.actor === actor || token?.actor?.uuid === actor?.uuid);
}

export async function playResourceDeltaFloaters(actor, deltas = []) {
  const createScrollingText = globalThis.canvas?.interface?.createScrollingText;
  if (typeof createScrollingText !== "function" || !Array.isArray(deltas) || !deltas.length) return false;
  const tokens = getActorTokens(actor);
  if (!tokens.length) return false;

  for (const token of tokens) {
    for (const entry of deltas) {
      const style = RESOURCE_STYLES[entry.resource];
      if (!style || !Number.isFinite(entry.delta) || entry.delta === 0) continue;
      const text = `${entry.delta > 0 ? "+" : ""}${entry.delta}`;
      await createScrollingText.call(globalThis.canvas.interface, token.center, text, {
        anchor: globalThis.CONST?.TEXT_ANCHOR_POINTS?.TOP,
        direction: globalThis.CONST?.TEXT_ANCHOR_POINTS?.TOP,
        duration: 1200,
        jitter: 0.25,
        fontSize: 36,
        fill: style.fill,
        stroke: "#111111",
        strokeThickness: 4,
      });
    }
  }
  return true;
}

export function captureResourceDeltas(actor, changes, options = {}) {
  const deltas = getResourceDeltas(actor, changes);
  if (deltas.length) options.marvelMultiverseResourceDeltas = deltas;
  return deltas;
}

export function displayCapturedResourceDeltas(actor, options = {}) {
  const deltas = options.marvelMultiverseResourceDeltas ?? [];
  if (!deltas.length) return false;
  void playResourceDeltaFloaters(actor, deltas);
  return true;
}