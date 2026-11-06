import test from "node:test";
import assert from "node:assert/strict";
import {
  boardVehicle,
  canBoardVehicle,
  getVehicleOccupants,
  leaveVehicle,
  normalizeVehicleCategory,
  vehicleCapacityRemaining,
} from "../lib/vehicles.mjs";

function mockVehicle() {
  return {
    isOwner: true,
    system: {
      vehicle: {
        enabled: true,
        operational: true,
        crewMaximum: 1,
        passengerCapacity: 2,
        operatorUuid: "",
        occupantUuids: [],
      },
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        const key = path.replace("system.vehicle.", "");
        this.system.vehicle[key] = value;
      }
    },
  };
}

test("vehicle categories include starships without changing NPC durability", () => {
  assert.equal(normalizeVehicleCategory("SPACE"), "space");
  assert.equal(normalizeVehicleCategory("unknown"), "ground");
});

test("vehicle capacity deduplicates occupants and respects operational state", () => {
  const vehicle = { enabled: true, operational: true, crewMaximum: 1, passengerCapacity: 1, occupantUuids: ["a", "a"] };
  assert.deepEqual(getVehicleOccupants(vehicle), ["a"]);
  assert.equal(vehicleCapacityRemaining(vehicle), 1);
  assert.equal(canBoardVehicle(vehicle, "b"), true);
  assert.equal(canBoardVehicle({ ...vehicle, operational: false }, "b"), false);
});

test("boarding and leaving update operator and occupant state", async () => {
  const actor = mockVehicle();
  await boardVehicle(actor, "Actor.operator", { operator: true });
  await boardVehicle(actor, "Actor.passenger");
  assert.deepEqual(actor.system.vehicle.occupantUuids, ["Actor.operator", "Actor.passenger"]);
  assert.equal(actor.system.vehicle.operatorUuid, "Actor.operator");

  await leaveVehicle(actor, "Actor.operator");
  assert.deepEqual(actor.system.vehicle.occupantUuids, ["Actor.passenger"]);
  assert.equal(actor.system.vehicle.operatorUuid, "");
});
