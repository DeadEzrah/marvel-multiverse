# Team Resources and Maneuvers

The team-maneuver framework stores generic, authorable metadata. It does not include book text, named maneuvers, or licensed effect descriptions.

## Actor Data

Both Character and NPC Actors support:

- `system.teamResources`: resource pools with stable `id`, display `label`, `alignment` (`hero`, `villain`, `neutral`, or `any`), and clamped `value`/`max`.
- `system.teamManeuver.maneuverType` and `level`: the legacy fields, retained for existing worlds.
- `system.teamManeuver.alignment`: hero/villain/neutral/any classification.
- `participantUuids`: Actor or Token UUIDs selected for the maneuver.
- `cost`: individual or pooled resource spending metadata.
- `eligibility`, `duration`, `effects`, and `metadata`: author-controlled structured data.
- `transactions`: activation records used for auditing and safe undo.

Effect and duration entries are declarative. The system records and returns them but does not interpret arbitrary keys. Modules and macros can react to `marvel-multiverse.teamManeuverActivated` and `marvel-multiverse.teamManeuverUndone` without embedding sourcebook prose.

## Public API

The following functions are available from `game.marvelMultiverse`:

- `getTeamResources(actor)`, `setTeamResource(actor, resource)`, and `adjustTeamResource(actor, id, amount)`
- `normalizeTeamManeuver(definition)`
- `evaluateTeamManeuverEligibility(definition, participants)`
- `activateTeamManeuver(initiator, definition, options)`
- `undoTeamManeuver(initiator, transactionId, options)`

Supported spend resources are `focus`, `karma`, and `team:<pool-id>`. An `individual` cost is charged once to every participant. A `pooled` cost can name one payer or provide allocations whose total exactly equals the cost.

```js
const definition = {
  id: "coordinated-action",
  name: "Coordinated Action",
  maneuverType: "Offensive",
  level: 1,
  alignment: "hero",
  participantUuids: ["Actor.leader", "Actor.ally"],
  cost: { mode: "individual", resource: "focus", amount: 3 },
  eligibility: { minimumParticipants: 2, minimumRank: 1 },
  duration: { value: 1, unit: "round" },
  effects: [{ type: "author-defined", key: "roll-modifier", value: "edge" }],
};

const transaction = await game.marvelMultiverse.activateTeamManeuver(
  game.actors.get("leader"),
  definition,
);
await game.marvelMultiverse.undoTeamManeuver(
  game.actors.get("leader"),
  transaction.id,
);
```

Activation resolves participant UUIDs, checks permissions and eligibility, verifies every balance, spends resources, and persists the complete transaction on the initiating Actor. If spending or transaction storage fails, completed spends are rolled back.

Undo is intentionally conservative: it proceeds only while every affected balance still equals the transaction's recorded post-spend value. This prevents an old transaction from overwriting later resource changes. Successful undo restores exact prior values and marks the transaction undone.
