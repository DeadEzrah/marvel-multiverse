export const GEAR_CATEGORIES = Object.freeze({
  equipment: "Equipment",
  "iconic-item": "Iconic Item",
  "battle-suit": "Battle Suit",
  "narrative-item": "Narrative Item",
  gadget: "Gadget",
  "vehicle-mount": "Vehicle Mount",
});

export function normalizeGearCategory(value) {
  const category = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(GEAR_CATEGORIES, category) ? category : "equipment";
}

export function getGearCategoryLabel(value) {
  return GEAR_CATEGORIES[normalizeGearCategory(value)];
}
