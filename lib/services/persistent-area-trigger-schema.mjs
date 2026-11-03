const AREA_TRIGGER_EVENTS = new Set(["enter", "start-turn"]);
const ABILITY_KEYS = new Set(["mle", "agl", "res", "vig", "ego", "log"]);
const ESCAPE_TIMINGS = new Set(["action", "end-of-turn", "start-of-turn", "manual"]);

function normalizeAbility(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return ABILITY_KEYS.has(key) ? key : null;
}

export function normalizePersistentAreaTrigger(value) {
  if (!value || typeof value !== "object") return null;
  const events = [...new Set(
    (Array.isArray(value.events) ? value.events : [])
      .map((event) => String(event).trim().toLowerCase())
      .filter((event) => AREA_TRIGGER_EVENTS.has(event)),
  )];
  const ability = normalizeAbility(value.check?.ability);
  const targetNumber = Number(value.check?.targetNumber);
  const statusId = String(value.failure?.statusId ?? "").trim().toLowerCase();
  const escapeAbility = normalizeAbility(value.failure?.escape?.ability);
  const escapeTargetNumber = Number(value.failure?.escape?.targetNumber);
  const escapeTiming = String(value.failure?.escape?.timing ?? "action").trim().toLowerCase();
  if (!events.length || !ability || !Number.isFinite(targetNumber) || targetNumber < 0 || !statusId) return null;
  if (!escapeAbility || !Number.isFinite(escapeTargetNumber) || escapeTargetNumber < 0 || !ESCAPE_TIMINGS.has(escapeTiming)) return null;
  return {
    version: 1,
    events,
    check: { ability, targetNumber },
    failure: {
      statusId,
      escape: {
        ability: escapeAbility,
        targetNumber: escapeTargetNumber,
        timing: escapeTiming,
      },
    },
  };
}
