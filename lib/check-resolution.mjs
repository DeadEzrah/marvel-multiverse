import { updateChatMessageFlags } from "./chat-message-state.mjs";
import { getRollContext } from "./roll-context.mjs";

const CHECK_RESOLUTION_VERSION = 1;

function getMessageRollContext(message) {
  const context = typeof message?.getFlag === "function"
    ? message.getFlag("marvel-multiverse", "rollContext")
    : null;
  return context ?? getRollContext(message) ?? null;
}

function getMessageRollTotal(message, context) {
  if (typeof context?.rollTotal === "number") return context.rollTotal;
  const total = message?.rolls?.[0]?.total;
  return typeof total === "number" ? total : null;
}

function getMessageIsFantastic(message, context) {
  if (typeof context?.isFantastic === "boolean") return context.isFantastic;
  return Boolean(message?.rolls?.[0]?.isFantastic);
}

/** Determine a check outcome after the Marvel die's M face has contributed 6 to the total. */
export function resolveCheckOutcome({ rollTotal, isFantastic, difficulty } = {}) {
  // Number(null) === 0 and Number("") === 0, which would silently read as a valid roll total of
  // zero - reject nullish/empty values explicitly instead of letting them coerce that way.
  if (rollTotal === null || rollTotal === undefined || rollTotal === "") return "unresolved";
  if (difficulty === null || difficulty === undefined || difficulty === "") return "unresolved";
  const total = Number(rollTotal);
  const target = Number(difficulty);
  if (!Number.isFinite(total) || !Number.isFinite(target)) return "unresolved";
  const success = total >= target;
  if (isFantastic) return success ? "fantastic-success" : "fantastic-failure";
  return success ? "success" : "failure";
}

export function getCheckResolution(message) {
  if (typeof message?.getFlag === "function") {
    return message.getFlag("marvel-multiverse", "checkResolution") ?? null;
  }
  return message?.flags?.["marvel-multiverse"]?.checkResolution ?? null;
}

/**
 * Record the difficulty a Narrator called out (and the ability/state it's checked against) onto
 * the message, and compare it to the roll already stored on that message. This never re-rolls or
 * infers a difficulty on its own - the number always comes from the caller (the person who heard
 * the Narrator's stated difficulty).
 */
export async function applyCheckDifficulty(message, { difficulty, against = null, againstLabel = null } = {}) {
  const numericDifficulty = Number(difficulty);
  if (!Number.isFinite(numericDifficulty)) {
    return {
      success: false,
      issues: [{ severity: "warning", code: "CHECK_DIFFICULTY_INVALID", message: "Enter a valid numeric difficulty." }],
    };
  }

  const context = getMessageRollContext(message);
  const rollTotal = getMessageRollTotal(message, context);
  const isFantastic = getMessageIsFantastic(message, context);
  const outcome = resolveCheckOutcome({ rollTotal, isFantastic, difficulty: numericDifficulty });

  const state = {
    version: CHECK_RESOLUTION_VERSION,
    mode: "difficulty",
    difficulty: numericDifficulty,
    against: against || null,
    againstLabel: againstLabel || null,
    rollTotal,
    isFantastic,
    outcome,
    resolvedAt: Date.now(),
    resolvedBy: globalThis.game?.user?.id ?? null,
  };

  await updateChatMessageFlags(message, { "marvel-multiverse": { checkResolution: state } });
  return { success: true, state };
}

/**
 * Compare a roll's own total against an opponent's total for an opposed check. This is a house
 * rule, not an official ruling - the exact opposed-check procedure is flagged as unverified in
 * docs/resolution-workflow/open-rule-questions.md (ORQ-1: who rolls, how ties are broken). Only
 * used when the "enableOpposedCheckAutomation" world setting is turned on.
 */
export function resolveOpposedOutcome({ rollTotal, isFantastic, opponentTotal, opponentIsFantastic } = {}) {
  if (rollTotal === null || rollTotal === undefined || rollTotal === "") return "unresolved";
  if (opponentTotal === null || opponentTotal === undefined || opponentTotal === "") return "unresolved";
  const total = Number(rollTotal);
  const opponent = Number(opponentTotal);
  if (!Number.isFinite(total) || !Number.isFinite(opponent)) return "unresolved";

  if (total === opponent) return "tie";
  const won = total > opponent;
  if (isFantastic) return won ? "fantastic-win" : "fantastic-loss";
  return won ? "win" : "loss";
}

/**
 * Record an opposed check's result: the roll already on this message vs a manually entered
 * opponent total (honor system, same as applyCheckDifficulty - no automatic lookup of another
 * actor's roll).
 */
export async function applyOpposedCheck(message, { opponentTotal, opponentIsFantastic = false, opponentLabel = null } = {}) {
  const numericOpponentTotal = Number(opponentTotal);
  if (!Number.isFinite(numericOpponentTotal)) {
    return {
      success: false,
      issues: [{ severity: "warning", code: "CHECK_OPPONENT_TOTAL_INVALID", message: "Enter a valid numeric opposing total." }],
    };
  }

  const context = getMessageRollContext(message);
  const rollTotal = getMessageRollTotal(message, context);
  const isFantastic = getMessageIsFantastic(message, context);
  const outcome = resolveOpposedOutcome({ rollTotal, isFantastic, opponentTotal: numericOpponentTotal, opponentIsFantastic });

  const state = {
    version: CHECK_RESOLUTION_VERSION,
    mode: "opposed",
    opponentTotal: numericOpponentTotal,
    opponentIsFantastic: Boolean(opponentIsFantastic),
    opponentLabel: opponentLabel || null,
    rollTotal,
    isFantastic,
    outcome,
    resolvedAt: Date.now(),
    resolvedBy: globalThis.game?.user?.id ?? null,
  };

  await updateChatMessageFlags(message, { "marvel-multiverse": { checkResolution: state } });
  return { success: true, state };
}
