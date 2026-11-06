export const RANK_MODES = Object.freeze({
  standard: "Standard Rank",
  x: "Rank X",
});

export function normalizeRankMode(value) {
  return String(value ?? "").trim().toLowerCase() === "x" ? "x" : "standard";
}

export function resolveRankScale(rank, fallback = 1) {
  const value = Number(rank?.value);
  const safeValue = Number.isFinite(value) ? value : fallback;
  if (normalizeRankMode(rank?.mode) !== "x") return safeValue;

  const scale = Number(rank?.scale);
  return Number.isFinite(scale) && scale > 0 ? scale : safeValue;
}

export function resolveActorRankScale(actor, fallback = 1) {
  return resolveRankScale(
    actor?.system?.attributes?.rank
      ?? actor?.system?.rank
      ?? actor?.attributes?.rank
      ?? actor?.rank,
    fallback,
  );
}

export function getRankLabel(rank) {
  return normalizeRankMode(rank?.mode) === "x" ? "X" : String(resolveRankScale(rank, 1));
}
