const LEGACY_MESSAGE_MODES = {
  publicroll: "public",
  gmroll: "gm",
  blindroll: "blind",
  selfroll: "self",
};

export function normalizeRollMessageOptions(options = {}, defaultMode = null) {
  const normalized = { ...options };
  const legacyMode = normalized.rollMode ?? defaultMode;
  const messageMode = normalized.messageMode
    ?? (legacyMode === "roll" ? null : LEGACY_MESSAGE_MODES[legacyMode] ?? legacyMode);
  delete normalized.rollMode;
  if (messageMode != null) normalized.messageMode = messageMode;
  return normalized;
}
