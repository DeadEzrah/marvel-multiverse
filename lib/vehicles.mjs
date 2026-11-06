export const VEHICLE_CATEGORIES = Object.freeze({
  ground: "Ground Vehicle",
  water: "Watercraft",
  air: "Aircraft",
  space: "Starship",
  special: "Special Vehicle",
});

export function normalizeVehicleCategory(value) {
  const category = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(VEHICLE_CATEGORIES, category) ? category : "ground";
}

export function getVehicleOccupants(vehicle = {}) {
  return [...new Set((vehicle.occupantUuids ?? []).filter((uuid) => typeof uuid === "string" && uuid.trim()))];
}

export function vehicleCapacityRemaining(vehicle = {}) {
  const maximum = Math.max(0, Number(vehicle.passengerCapacity) || 0) + Math.max(0, Number(vehicle.crewMaximum) || 0);
  return Math.max(0, maximum - getVehicleOccupants(vehicle).length);
}

export function canBoardVehicle(vehicle = {}, occupantUuid) {
  if (!vehicle.enabled || !vehicle.operational) return false;
  const occupants = getVehicleOccupants(vehicle);
  if (occupants.includes(occupantUuid)) return true;
  return vehicleCapacityRemaining(vehicle) > 0;
}

function assertVehicleActor(actor) {
  if (!actor?.system?.vehicle?.enabled) throw new Error("The selected actor is not configured as a vehicle.");
  if (!actor.isOwner && !globalThis.game?.user?.isGM) throw new Error("You do not have permission to update this vehicle.");
  if (typeof actor.update !== "function") throw new Error("The vehicle cannot be updated.");
}

export async function boardVehicle(actor, occupantUuid, { operator = false } = {}) {
  assertVehicleActor(actor);
  if (!occupantUuid) throw new Error("An occupant UUID is required.");
  const vehicle = actor.system.vehicle;
  if (!canBoardVehicle(vehicle, occupantUuid)) throw new Error("The vehicle is not operational or has no available capacity.");

  const occupants = getVehicleOccupants(vehicle);
  if (!occupants.includes(occupantUuid)) occupants.push(occupantUuid);
  const update = { "system.vehicle.occupantUuids": occupants };
  if (operator) update["system.vehicle.operatorUuid"] = occupantUuid;
  await actor.update(update);
  return { occupantUuids: occupants, operatorUuid: operator ? occupantUuid : vehicle.operatorUuid };
}

export async function leaveVehicle(actor, occupantUuid) {
  assertVehicleActor(actor);
  const vehicle = actor.system.vehicle;
  const occupants = getVehicleOccupants(vehicle).filter((uuid) => uuid !== occupantUuid);
  const update = { "system.vehicle.occupantUuids": occupants };
  if (vehicle.operatorUuid === occupantUuid) update["system.vehicle.operatorUuid"] = "";
  await actor.update(update);
  return { occupantUuids: occupants, operatorUuid: update["system.vehicle.operatorUuid"] ?? vehicle.operatorUuid };
}
