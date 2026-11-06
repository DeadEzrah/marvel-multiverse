# Campaign Framework Authoring

Campaign Framework Items store reusable, system-owned campaign state without supplying licensed rule text, named characters, setting records, or exact sourcebook procedures. They can be world Items or embedded on an Actor.

## Supported state

- Personal Responsibilities with an optional related Actor UUID, status, notes, and bounded progress.
- Generic bounded resources suitable for author-defined plot pools.
- General, mutant-focused, or custom reputation audiences.
- Schooling and other progression tracks.
- Henchmen groups with optional template Actor links and bounded current counts.
- Large-battle phase, round, Scene link, notes, and bounded objectives.
- Actor UUID links for every framework.

The framework type is organizational metadata only. It does not impose a book mechanic. Authors must define labels, minimums, maximums, triggers, reset procedures, and interpretations for their own table.

## Mutations and undo

Use the sheet `+` and `−` controls or the public API:

```js
const api = game.marvelMultiverse;
const result = await api.adjustCampaignValue(framework, "resources", "plot-pool", -1, {
  reason: "Author-defined spend",
});
await api.undoCampaignTransaction(framework, result.transaction.id);
```

Supported collections are `responsibilities`, `resources`, `reputations`, `progressions`, `henchmenGroups`, and `battleObjectives`. Mutations require Item ownership or GM access, clamp to authored bounds, and record before/after values, user, timestamp, and reason. Undo refuses changed state, already-undone records, and transactions superseded on the same entry.

The API also exposes `addCampaignEntry`, `removeCampaignEntry`, `linkCampaignActor`, and `unlinkCampaignActor`. Hooks `marvel-multiverse.campaignFrameworkChanged` and `marvel-multiverse.campaignFrameworkUndone` allow modules to observe successful changes.

## Distribution

Distributable modules should provide only original or authorized framework names and procedures. Keep licensed adventures, setting descriptions, named supporting casts, and reconstructed book mechanics in private worlds or separately authorized packages.
