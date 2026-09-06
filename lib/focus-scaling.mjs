import { parseFocusCost } from "./focus-automation.mjs";

const SCALING_MODES = new Set(["damage", "healing"]);

function toNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function resolveFocusScalingConfig(source) {
  const system = source?.system ?? source ?? {};
  const scaling = system.focusScaling ?? {};
  if (scaling.enabled !== true) return { enabled: false, valid: true };

  const cost = parseFocusCost(system.cost ?? system.focusCost ?? null);
  const mode = typeof scaling.mode === "string" ? scaling.mode.trim().toLowerCase() : "";
  const benefitPerFocus = toNonNegativeInteger(scaling.benefitPerFocus);
  const focusPerBenefit = toNonNegativeInteger(scaling.focusPerBenefit ?? 1);
  const maxExtraFocus = scaling.maxExtraFocus === undefined || scaling.maxExtraFocus === null || scaling.maxExtraFocus === ""
    ? null
    : toNonNegativeInteger(scaling.maxExtraFocus);
  const baseFocus = cost?.type === "variable" ? toNonNegativeInteger(cost.minimum) : null;
  const valid = SCALING_MODES.has(mode)
    && benefitPerFocus !== null
    && benefitPerFocus > 0
    && focusPerBenefit !== null
    && focusPerBenefit > 0
    && (maxExtraFocus === null || maxExtraFocus >= 0)
    && baseFocus !== null;

  return {
    enabled: true,
    valid,
    mode,
    benefitPerFocus,
    focusPerBenefit,
    maxExtraFocus,
    baseFocus,
    maxTotalFocus: baseFocus === null || maxExtraFocus === null ? null : baseFocus + maxExtraFocus,
    reason: valid ? null : "invalid-focus-scaling-config",
  };
}

export function resolveFocusScaling(source, totalFocus) {
  const config = resolveFocusScalingConfig(source);
  if (!config.enabled || !config.valid) return { ...config, extraFocus: 0, bonus: 0 };

  const selectedFocus = toNonNegativeInteger(totalFocus ?? config.baseFocus);
  if (selectedFocus === null || selectedFocus < config.baseFocus || (config.maxTotalFocus !== null && selectedFocus > config.maxTotalFocus)) {
    return {
      ...config,
      valid: false,
      selectedFocus,
      extraFocus: 0,
      bonus: 0,
      reason: "focus-scaling-limit-exceeded",
    };
  }

  const extraFocus = selectedFocus - config.baseFocus;
  return {
    ...config,
    selectedFocus,
    extraFocus,
    bonus: Math.floor(extraFocus / config.focusPerBenefit) * config.benefitPerFocus,
    reason: null,
  };
}
