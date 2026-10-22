# Power and Effect Automation

This document records the current automation architecture, verified behavior, and the next implementation steps for power healing, ranged blasts, weapons, and other visual effects.

## Design Boundary

Rules and presentation are separate:

- Power data describes targeting, rolls, costs, damage, healing, and other outcomes.
- Semantic effect profiles describe intent, such as `healing`, `energy.blast`, or `weapon.blade.hit`.
- `assets/effects-manifest.json` maps semantic profiles to optional JB2A animations and PSFX sounds.
- Sequencer plays the selected database entry.

Compendium items must not contain module installation paths such as `modules/JB2A_DnD5e/...`. Use semantic profile IDs in item data and Sequencer database keys in the manifest.

This is similar to the D&D5e ecosystem split: the game system provides structured activities and hooks, Automated Animations recognizes intent, JB2A supplies assets, and Sequencer performs playback. Marvel Multiverse keeps recognition inside its own structured item data so behavior does not depend on item names.

## Optional Dependencies

Visual and audio effects are optional. The system remains playable without them.

- Sequencer module ID: `sequencer`
- Free JB2A module ID: `JB2A_DnD5e`
- Patreon JB2A module ID: `jb2a_patreon`
- PSFX module ID: `psfx`

The world setting `enableSequencerEffects` must be enabled before semantic effects or `play-effect` outcomes run. Assets are filtered by their declared `moduleIds`. Missing modules or assets should produce a skipped cosmetic effect, never block a roll or rules outcome.

## Runtime Flow

The action workflow creates an `EffectProfileSession` for the item and plays configured phases as the action progresses.

1. Read `system.effectProfile` and `system.effectProfiles`.
2. Resolve the phase-specific semantic profile.
3. Resolve aliases and parent fallbacks through `assets/effects-manifest.json`.
4. Select an available animation and sound for active modules.
5. Play through Sequencer at the source, target, or along the source-to-target path.

Relevant files:

- `lib/services/action-roll.mjs`: action orchestration and phase emission
- `lib/services/effect-profile-manager.mjs`: phase resolution and placement
- `lib/services/effect-library.mjs`: manifest lookup, availability, and Sequencer playback
- `assets/effects-manifest.json`: semantic profile registry
- `assets/effect-profile.schema.json`: effect metadata schema
- `lib/services/power-events.mjs`: structured rules outcomes

## Effect Metadata

An item can provide a default profile and phase-specific profiles:

```json
{
  "effectProfile": "energy.blast",
  "effectProfiles": {
    "attack": "energy.blast",
    "hit": "power.energy.impact",
    "fantasticHit": "destruction.explosion.medium",
    "miss": "melee.miss"
  }
}
```

Supported phases are:

- `activation`
- `attack`
- `cast`
- `movement`
- `hit`
- `fantasticHit`
- `miss`
- `impact`
- `landing`
- `success`
- `failure`

The default `effectProfile` currently falls back only for the `attack` phase. Configure other phases explicitly.

## Placement Rules

- `attack`: starts at the source and stretches to each target.
- `hit`, `fantasticHit`, `miss`, and `impact`: plays on each target.
- A profile whose manifest `type` is `healing`: plays on supplied recipients, or on the source for self-healing.
- Other non-target phases: play on the source.

These rules allow one generic engine to handle a beam, projectile, melee swing, impact, targeted heal, and self-heal.

## Healing

The semantic healing profile is implemented and verified against the free JB2A database:

```json
{
  "effectProfiles": {
    "success": "healing"
  }
}
```

`healing` resolves to `power.healing.target`, which currently uses:

```text
jb2a.healing_generic.400px.green
```

The database key was verified live with Sequencer and the active `JB2A_DnD5e` module. Do not replace it with `jb2a.healing_ability.01.green`; that key is not registered by the tested free package.

### Healing Family Migration

All seven records under `packs/_source/powers/Healing/` now have structured automation. Healing Hands and Soothing Touch use the selected variable Focus spend as the exact Health or Focus transfer. Let's Go and Never Surrender use target-owned maintained effects that restrict actions or Focus spending, end when the guarded resource rises above 0, and restore the removed status if support ends while that resource remains at 0. Cure-All, Restore, and Resurrect use fixed-TN non-attack action rolls whose ordinary, failure, and Fantastic results drive power events.

Fixed-TN rolls fall back to `item.system.targetNumber` when no defense or explicit request TN exists, while the dialog keeps that value editable. Stored non-attack action results map success to `hit`, Fantastic success to `fantastic-hit`, and failures to `miss`, allowing the existing event trigger system to handle these utility checks. Formula roll data exposes `@powerEvent.focusSpent`; generic resource formulas use Foundry's base `Roll` rather than the Marvel action-die class. Status removal accepts Foundry 14 `Set` collections as well as arrays.

The Healing support service is wired into actor updates, effect deletion, action rolls, and Focus spending. Its concentration cleanup is serialized per source actor so simultaneous resource-update hooks cannot delete the same maintained effect twice. The installed-runtime matrix passed 12/12 gates, all seven compendium records were refreshed, and Shaman's embedded Healing Hands was recreated from the updated compendium document.

Do not infer healing formulas from description text at runtime. Encode them as structured data after validating the official rule and the focus-scaling contract.

Rules mutation and animation are intentionally independent. The `healing` event outcome is gated by `enableExperimentalPowerOutcomes`; the cosmetic profile is gated by `enableSequencerEffects`.

## Public Actor Mutation API

Encounter modules and macros can apply direct consequences through the system API without editing actor data themselves:

```js
await game.marvelMultiverse.applyDamage({
  actor,
  kind: "health",
  amount: 10
});

await game.marvelMultiverse.applyStatus({
  actor,
  status: "stunned",
  mode: "apply"
});
```

`applyDamage` accepts `health` or `focus`, applies the corresponding actor Damage Reduction by default, floors the resource at zero, and supports `ignoreReduction: true` for mechanics that explicitly bypass reduction. `applyStatus` supports `apply`, `remove`, and `toggle`, normalizes condition aliases, prevents duplicate effects, and uses the system's condition icons and ActiveEffect markers. Both methods also accept `actorUuid` or `tokenUuid`, enforce actor ownership/GM permission, and return structured success or failure results.

## Areas and Walls

Power targeting distances are stored in Marvel rules **spaces**, not feet or meters. At runtime, one rules-space maps to one Foundry grid cell, regardless of the scene's displayed distance unit.

Use `system.targeting.area` for reviewed area mechanics. Keep placement range separate from area size:

```json
{
  "required": true,
  "count": 999,
  "defense": "agl",
  "area": {
    "shape": "wall",
    "units": "spaces",
    "distance": 2,
    "distanceScaling": "rank",
    "width": 1,
    "placementRange": 10,
    "placementRangeScaling": "rank",
    "persistent": true,
    "duration": "concentration",
    "includeSelf": false
  }
}
```

`distance` is the radius, length, or primary dimension of the shape. `placementRange` is how far from the source the area may be placed. `wall` is a semantic shape rendered as a rotatable rectangular Region; it does not automatically create Foundry collision walls.

For bounded multi-target actions, `targeting.count` is the maximum number of targets and `targeting.minCount` is the minimum. Omit `minCount` to require one target for attacks and other required-target actions. For example, Fast Strikes uses `count: 2` and `minCount: 1`, while Flying Double Kick uses `count: 2` and `minCount: 2`.

Multi-target damage can set `damage.requireAllTargetsHit` when the entire action fails if any selected target is missed. Variable-Focus utility powers use the same parsed minimum and actor-resource limits as rolled actions, while formula-based resource outcomes evaluate against actor roll data and clamp Health or Focus recovery to the resource maximum.

Extract targeting data from prose during compendium authoring, then review it before committing. Do not parse prose when a power is rolled. Similar phrases can describe different mechanics: an aura centered on the source, a single target's maximum range, an explosion centered on an object, or a persistent zone.

## Ranged Blasts and Beams

Ranged powers should use an attack-phase profile for travel and target-phase profiles for impact:

```json
{
  "effectProfile": "energy.blast",
  "effectProfiles": {
    "attack": "energy.blast",
    "hit": "energy.impact",
    "fantasticHit": "destruction.explosion.medium",
    "impact": "energy.impact"
  }
}
```

Available semantic profiles include:

- `energy.blast` -> `power.energy.blast`
- `energy.beam` -> `power.energy.beam`
- `energy.impact` -> `power.energy.impact`
- `power.electricity.arc`
- `power.fire.impact`
- `power.psychic.impact`
- `weapon.projectile.gunshot`

The `attack` phase uses Sequencer's `atLocation(source).stretchTo(target)` behavior. Sequencer chooses distance-aware variants when the selected database family supports them.

Before migrating a ranged power, verify:

- The roll is marked as an attack.
- `system.targeting` identifies whether a target is required, target count, and defense.
- Damage configuration is structured and tested independently from animation.
- The chosen JB2A database key exists in both supported asset tiers when both module IDs are declared.
- Miss behavior does not display a target impact unless explicitly intended.

## Weapons and Other Profiles

Existing profiles cover common presentation:

- Blade: `weapon.blade.swing`, `weapon.blade.hit`
- Blunt: `weapon.blunt.hit`
- Unarmed: `melee.punch`, `melee.hit.light`, `melee.hit.heavy`, `melee.miss`
- Shield: `defense.shield`
- Magic: `magic.cast`
- Movement: `teleport`, `movement.superspeed`, `movement.flight`, `landing.light`, `landing.heavy`
- Destruction: `destruction.explosion.medium`

Add new profiles by semantic behavior, not by hero or power name. For example, prefer `power.web.projectile` over `spider-man.web-shot`.

## Effect Durations

Power-event status and Active Effect outcomes use structured `duration` objects. Supported automatic cleanup profiles are:

- `{ "type": "rounds", "value": 1 }`: expires after the declared number of combat rounds.
- `{ "type": "start-of-source-turn" }` or `{ "type": "end-of-target-turn" }`: expires at the next matching actor boundary. Source/target and start/end variants are supported.
- `{ "type": "end-of-source-next-turn" }` or `{ "type": "end-of-target-next-turn" }`: expires at the matching boundary in a later round.
- `{ "type": "concentration" }`: owned and removed by the source actor's concentration lifecycle.
- `{ "type": "days", "value": 1 }`: expires after that many 24-hour world-time periods.
- `{ "type": "until-sleep", "actor": "target" }`: expires when `Hooks.callAll("marvel-multiverse.actorSlept", actor)` is emitted. Use `actor: "source"` when the source's sleep ends the effect.
- `{ "type": "permanent" }`: never expires automatically; removal must be explicit.
- `{ "type": "manual" }`: intentionally requires Narrator cleanup.

Turn and round durations require an active combat when the outcome is applied. Sleep is an integration hook because the system does not currently own a rest workflow.

## One-Use Roll Modifiers

Use a `future-roll-modifier` outcome for a benefit or penalty that applies to one later roll:

```json
{
  "type": "future-roll-modifier",
  "mode": "edge",
  "count": 1,
  "label": "Fantastic Command: Edge against this target"
}
```

The grant is stored as an owned Active Effect on the recipient and participates in the normal power-event transaction undo. By default it matches only the same source item UUID and the target actor from the triggering event. Set `matchTarget` to `false` only when the rule is not target-specific.

A matching benefit is automatic and is consumed only after the later roll creates its chat message successfully. The consuming message stores a sanitized effect snapshot and offers **Restore Used Modifier** so an accidental or reverted roll can restore the benefit once.

## Content Migration Order

Use a narrow vertical slice before bulk changes:

1. Complete Healing Hands targeting, Focus selection, Health application, chat state, undo, and animation.
2. Complete one basic ranged energy blast from declaration through damage and animation.
3. Add effect-profile controls to the Power item sheet.
4. Add a manifest-backed selector rather than requiring authors to type profile IDs.
5. Migrate related Healing and ranged-power compendium entries.
6. Expand to blades, shields, webs, movement, and persistent effects.
7. Run a compendium audit for unknown profiles, missing assets, and prose-only mechanics.

Bulk migration should begin only after the first healing and ranged examples pass multiplayer permission and undo tests.

## Model Parity

`lib/documents.mjs` is the single source for active data models. The legacy paths under `module/data/` are compatibility re-exports of those same classes, so consumers of either path receive identical schema metadata and actor derivation behavior. The shared contract covers `automationPreset`, `effectProfile`, `effectProfiles`, `effectOverrides`, `targeting`, `damage`, `events`, `rollModifiers`, `options`, `activation`, and `focusScaling`.

When changing model schemas or the build entry point, keep the compatibility exports pointed at the active classes so structured automation data is not narrowed or discarded.

## Structured Item Updates

Schema-backed object fields must not be cleared by deleting the parent field. Foundry can remove the raw source parent, reject the prepared model as undefined, and leave stale prepared values in memory. Delete descendants with `foundry.data.operators.ForcedDeletion` instead.

Power-sheet edits already update or delete individual leaves. Compendium JSON upserts use `buildItemUpdateData` to replace descendants of each explicitly supplied object, while dotted CSV columns remain leaf patches and leave omitted siblings untouched. CSV paths cannot address array indexes; import complete arrays through JSON instead. These rules apply equally to world, embedded, and compendium Item update payloads.

## Validation Checklist

For each migrated power:

1. Roll with no target and verify the expected targeting error.
2. Roll against one valid target and verify the correct defense and result.
3. Verify fixed or variable Focus spending and insufficient-Focus handling.
4. Verify normal success, fantastic success, and failure phases.
5. Apply the rules outcome and verify resource limits and transaction state.
6. Undo the outcome and verify the prior resource value is restored.
7. Verify source, target, and source-to-target animation placement.
8. Disable Sequencer effects and confirm the rules workflow still completes.
9. Disable optional asset modules and confirm playback skips without an exception.
10. Repeat as a player with a GM connected to verify socket and ownership behavior.

Useful checks:

```powershell
npx eslint lib/services/effect-profile-manager.mjs lib/services/effect-library.mjs
npm run build:code
npm run build:db
```

The local Foundry installation loads `marvel-multiverse.mjs` and `lib/*.mjs` directly. When testing source changes, deploy the touched source modules and assets in addition to `marvel-multiverse-compiled.mjs`.

In a live Foundry console, verify a database key before committing it:

```js
Sequencer.Database.entryExists("jb2a.healing_generic.400px.green")
```

Use `Sequencer.Database.searchFor("healing")` or the Sequencer database viewer to discover keys. Prefer database keys over physical asset paths.

## Current Status

Completed:

- Semantic effect manifest and fallback resolution.
- Optional module filtering.
- Phase-based action playback.
- Source-to-target attack playback.
- Target impact playback.
- Targeted and self-healing placement.
- Verified free-JB2A healing database key.
- Existing profiles for energy, melee, blades, guns, shields, magic, movement, and explosions.
- Seventeen powers have passed local and live Foundry gates: Healing Hands, Elemental Blast, Elemental Burst, Elemental Barrage, Supernova, Dance of Death, Orchestra of Overkill, Weapons Blazing, both Flare entries, Venom Burst, Thunder, Telekinetic Barrier, Ground-Shaking Stomp, Whirling Frenzy, Hellfire Chains, and Vapors of Valtorr.
- Elemental Burst live-validates the reusable `attack.ranged.single-blast` automation preset. Preset defaults provide attack, damage, single-target line-of-sight targeting, and semantic effects; explicit power fields override inherited values. The power sheet exposes registered presets and validation rejects unknown preset IDs.
- Elemental Barrier is the eighteenth live-gated structured power. Its placed Region and sustained wall animation persist for concentration, then end together; rank scaling, placement range, line of sight, targeting, no-damage behavior, reminders, Focus refund, and cleanup are verified live.
- Telepathic Link is the nineteenth live-gated structured power. Willing communication remains a manual activation reminder; forced links use Logic versus Vigilance with failure, one-round success, and Fantastic day-long lockout reminders. No-target, no-cost, no-damage, psychic effects, concentration controls, live-owner refresh, and cleanup are verified live.
- Utility powers now have a shared non-dice activation workflow with required, optional, and rank-scaled targeting; fixed Focus spend/refund; concentration controls; event reminders; semantic activation effects; and compact utility chat cards. Required-target rejection, willing single-target activation, no-target activation, exact Focus refund, and cleanup are verified live.
- The Telepathy link-and-communication batch now structures Telepathic Network, Borrow Senses, Animal Bond, Animal Communication, Machine Telepathy, and Information Upload. Five use utility activation; Machine Telepathy reuses the Narrator-difficulty Logic-check path for secured machines.
- Utility activation now enforces selected-target range before Focus spend and excludes the source from selected recipients. The Mirage and Concealment batch structures Cloak, Cloak Group, Fool, Grand Fool, Mirage, and Grand Mirage with self, rank-scaled group, and linked-target declarations. Self activation, 10-space rejection/success, rank-cap rejection, linked-target requirements, Focus refund, concentration, reminders, and cleanup are verified live.
- Cloak and Cloak Group apply the dedicated `mentally-concealed` cosmetic status to the source and protected targets when concentration starts. It deliberately does not use Foundry's global Invisible special status, so cameras and unaffected observers remain rules-correct; concentration replacement/end removes the exact owned effects. Source/target application and chat-button cleanup are verified live.
- The Control and Memory batch structures Edit Memory, Domination, Telepathic Possession, and Copy Psyche. Universal action preflight can require a target's Focus to be at or below a declared maximum, and declared `attackEdgeMode` now initializes Edge/Trouble correctly. Edit Memory uses editable Logic difficulty; Domination and contested Possession enforce 0 target Focus and initial Trouble; Copy Psyche uses utility activation with capacity, daily-check, unavailable-Focus, deletion, transfer, takeover, and shattered-state reminders.
- Live gates verified Trouble initialization, nonzero-target-Focus rejection before dialog/message/Focus spend, Copy Psyche's exact 15-Focus spend/refund and reminders, and cleanup. Professor X's live Edit Memory and Telepathic Possession items were refreshed.
- The Defensive and Transformative batch structures Mental Shelter and Astral Form. Utility targeting supports rank-scaled range and hard no-target declarations. Mental Shelter enforces 5 spaces per rank and records its Uncanny-based Focus Damage Reduction as a manual reminder; Astral Form applies a dedicated source-owned status for concentration and records body vulnerability, visibility, and flight rules.
- Live gates verified Mental Shelter's rank-6 boundary at 30 spaces, exact 10-Focus spend/refund, and concentration context. Astral Form rejected stale targets before spending, spent/refunded exactly 5 Focus, created its named source status, and removed that exact effect when concentration ended.
- Foundry 14 compatibility checks now normalize active TokenDocuments before resource floaters and persist the active Marvel Die result in chat roll context.
- All thirteen weapon compendium records now have explicit targeting and semantic effects. Weapon damage applies each record's existing `damageMultiplierBonus`; Rifle, Shotgun, and Submachine Gun apply range-based Trouble; adjacent multi-target firearms split damage; grenade exceptions remain visible manual outcomes where center/scatter state cannot be resolved safely.
- Weapon live gates cover melee, thrown blade, bow, firearm, and grenade workflows. Rifle, Shotgun, and Submachine Gun apply exactly one Trouble within 5 spaces and none beyond; disconnected multi-target groups are rejected, while adjacent Shotgun and Submachine Gun groups split damage across two and three targets. Standard weapon Fantastic damage doubles, while Frag Grenade preserves regular area damage and emits its center-space extra-damage reminder.
- Free-JB2A arrow and thrown-dagger effects resolve and play through Sequencer. Action-roll damage now records normal undo transactions for single and multi-target attacks; chat apply, reapply, and undo requests route through socketlib's GM RPC. Live Shotgun cycles applied, undid, reapplied, and undid exact split damage, and explicit Player permission checks reject direct mutation while allowing the GM relay boundary.
- Big and Small now apply their deterministic defense, Run Speed, and Reach adjustments from effective actor size. Battle Ready and Situational Awareness retain their existing transferred effects.
- Occupation and origin grant snapshots were audited. Military now grants Battle Ready with its +30 Focus effect, Assassin and Alien: Brood use the canonical Villainous tag, and Spirit of Vengeance grants the migrated Hellfire Chains data.
- Passive and granted-data live gates passed through the actor-sheet drop workflow. Big and Small applied exact defense, Run Speed, and Reach changes; Military granted Battle Ready and raised maximum Focus by 30; Assassin and Alien: Brood granted canonical Villainous data; and Spirit of Vengeance preserved Hellfire Chains targeting, damage, effects, and events. Forty-four stale embedded copies were refreshed across world actors and the unlinked Apocalypse token. Sasquatch retains his intentional Huge actor size with his actor-specific Big transfer disabled.
- The universal roll dialog now resolves structured `rollModifiers` from actor traits and presents matching circumstances as checkboxes. Objective rules may be preselected, while subjective rules remain explicit player or Narrator choices; changing the final roll ability revalidates selected rules. Selected reasons persist in action-roll state and appear on the chat card. Live gates cover Combat Expert's automatic Rank 1 Melee Edge, Signature Attack's optional Edge, and Abrasive's optional Ego Edge or Trouble.
- Dice and utility actions may declare `system.targeting.prerequisites`. Supported checks are target `resource` (`focus` or `health`, with `eq`, `lte`, or `gte`), source concentration `source-link` by item UUID or name, and target `status`, `tag`, or `active-effect` presence/absence. Every selected target must pass before a dialog opens, Focus is spent, effects play, or a chat message is created. Orders, Domination, and contested Telepathic Possession require both 0 target Focus and an active Telepathic Link to that exact target; choice-heavy exceptions remain manual.
- `manual` event outcomes are intentional partial automation for subjective choices, Narrator rulings, follow-up bookkeeping, and unsupported exceptions. They require a non-empty label, always appear in the power-event preview, never mutate documents or create undo transactions, and do not render Apply/Undo controls unless the same preview also contains an automated outcome. All 50 manual outcomes in the source powers pass this contract; Copy Psyche is the live-gated manual-only example.
- The Martial Arts attack and recovery slice now live-validates exact minimum target counts, all-target-success damage gating, variable utility Focus, self-healing apply/undo/refund, actor-data Focus recovery with maximum clamping, and the Free-JB2A `melee.flurry` profile. A Fantastic Banging Heads result applied `prone` to both targets, and one default undo reversed both outstanding target transactions.
- Concentration-duration power outcomes automatically start concentration with their transaction IDs, so replacement, explicit concentration ending, and chat undo remove the exact owned effects. Attack Stance uses a dynamic actor damage modifier to double the current Melee bonus. Defense Stance contributes automatic Trouble from the target's Active Effect to close-attack dialogs and ends concentration only after a successful close attack. Both stance animations, embedded character copies, mechanical changes, expiration, undo, and cleanup passed live Foundry gates.
- Reaction utility powers may bind to the latest unused incoming attack message, synthesize the attacker as their target, enforce a required stance, and derive capped mitigation or response damage from the audited attack data. Brace for Impact, Counterstrike Technique, and Reverse-Momentum Throw live-validate exact trigger matching, duplicate prevention, Focus spend/refund, automatic targeting, damage or healing, status application, undo, and cleanup.
- Martial Arts passives are complete. Always Ready uses clearly labeled homebrew wording and remains manual until reaction economy is tracked. Unflappable Poise resolves transferred item effects as one permanent Trouble on incoming close attacks and stacks with Defense Stance. Untouchable Position applies only after its triggering attack, contributes one non-stacking Trouble to subsequent close attacks, plays `martial.untouchable`, and expires through the combat lifecycle at the start of the defender's next turn. Live gates covered each modifier count, reason, stacking rule, turn boundary, refreshed embedded copy, and cleanup.
- The Melee Weapons migration has started with Vicious Attack. It now enforces one target within Reach, applies regular damage and Fantastic doubling, records the target-specific weapon-special-effect reminder, and plays the Free-JB2A `weapon.melee.swing` profile. Live gates verified missing-target rejection, 75 regular damage with exact undo, 110 Fantastic damage, reminder evaluation, playback metadata, all eight refreshed world-actor copies, and complete cleanup.
- Fast Attacks now reuses the proven split-attack contract: one or two targets within Reach, half regular damage, full Fantastic damage, and one source-level reminder for its bonus Fast Attacks use. Live gates verified 28 one-target damage with exact undo, 53 Fantastic damage to each of two targets with one-call multi-target undo, both target evaluations, the refreshed unlinked Northstar token, embedded world-actor copies, and complete cleanup.
- Whirling Frenzy now completes its existing Reach-scaled enemy-area structure with explicit Fantastic scaling, per-target weapon-special-effect reminders, and the centered Free-JB2A `weapon.melee.whirlwind` profile. Live gates verified exact 5-Focus spend/refund, 35 half-damage and 55 Fantastic full damage to each of two enemies, one-call multi-target undo, both target reminders, refreshed Lady Deathstrike and Sabretooth copies, and complete cleanup.
- The Focus-powered Melee Weapons batch structures Furious Attacks and Focused Fury with variable Focus, actor-specific Melee multipliers, split or single targeting, half/full or regular/double scaling, automatic Edge where required, weapon-effect reminders, and semantic melee playback. Live gates verified Furious Attacks at 14 Focus against two targets and a 9-Focus Fantastic Focused Fury for 118 damage, exact damage undo, and exact Focus refunds.
- Fast Attacks and Fast Strikes were corrected to use the attacker's actual Melee damage multiplier instead of forcing 2. Grouped refresh updated every affected world actor and unlinked token. Attack-resolution hooks are now deferred until the action message has recorded its damage transaction, and concurrent flag updates queue rather than drop overlapping payloads; a live Fantastic hit proved the event preview and damage undo transaction coexist.
- The Melee Weapons reactions and mobility batch adds shared attack-reaction context for Exploit and Riposte plus structured Hit n Run movement. Exploit reserves an outgoing Fantastic weapon hit, auto-targets its victim, attacks Resilience for exactly 5 Focus, and bypasses Health Damage Reduction. Riposte reserves an incoming close miss and auto-targets the attacker; attack reactions remain valid even when the missed attack had no positive hypothetical damage, while utility responses that derive damage from the miss still require positive hypothetical damage. Hit n Run starts with Edge and records the successful half-Run-Speed movement and Fantastic weapon effect as manual reminders.
- Live gates verified Exploit against 20 Health Damage Reduction with zero reduction applied, exact Focus spend/refund, duplicate rejection, damage undo, and source-trigger undo; Riposte automatic targeting, Fantastic damage, duplicate rejection, reminder evaluation, and undo; and Hit n Run's one Edge, regular/Fantastic scaling, both reminders, and undo. Seven Exploit/Riposte embedded copies were refreshed, the temporary Hit n Run copy was removed, and all test resources, messages, targets, and tokens were restored or deleted.
- Unstoppable Assault completes the Melee Weapons family with Reach-scaled enemy-area targeting, exact 15-Focus activations, half regular damage, full Fantastic damage, centered `weapon.melee.whirlwind` playback, a movement-and-repeat reminder, and per-target weapon-effect reminders. A reusable combat-round target ledger records active action-damage transactions and filters enemies already affected by the same actor and power; undone damage releases the target, and advancing the round resets eligibility.
- The capstone live gate hit two adjacent enemies for half damage, rejected an all-ineligible repeat without spending Focus, moved to a new enemy and spent another 15 Focus against only that eligible target, then advanced the combat round and included all three enemies again. A Fantastic activation dealt full damage and evaluated every weapon-effect reminder. All damage and Focus transactions were undone or refunded, Sabretooth's embedded power was refreshed, and temporary combat, tokens, messages, targets, and actor changes were removed.
- Power sheets now include an Automation tab for semantic effect-profile assignments and structured events. Each phase selector is populated from `assets/effects-manifest.json`, labels profiles with their category and type, and preserves an existing custom profile as an explicit legacy option. Authors can save or clear each phase profile, open the Animation Designer directly on that phase, and add, edit, or delete events and the currently used `manual`, `status`, `healing`, and `future-roll-modifier` outcomes. Event changes validate atomically and preserve fields the editor does not expose; changing an outcome type seeds a valid editable shape before rerendering.
- The Power Attributes tab groups power details, rules text, Focus scaling, attack and damage, targeting, and area configuration. It exposes target count; fixed, Rank, Reach, and Rank-plus-Reach scaling; structured damage flags and scale; complete area geometry; persistence; and structured area duration. Native configuration controls save only their changed leaf path, preserving omitted preset defaults and unexposed nested data. Shape changes rerender the relevant geometry controls immediately.
- `npm run validate:effects` audits semantic profile declarations in all compendium source records, embedded granted items, and automation presets. It rejects malformed or unknown profile IDs, unsupported phases, duplicate manifest effects, and aliases that cannot resolve through the runtime fallback rules; the GitHub release script runs it before packaging.
- The condition-event audit now covers 44 power records across five verified batches. The latest direct-target pass adds Deafen, Double Tap, Point-Blank Parry, and Snap Shooting. Deafen applies one round of `deafened` on any hit while its damage is gated to a non-doubled Fantastic success. The three Ranged Weapons powers apply manual-duration `bleeding` on Fantastic hits and now have explicit targeting and damage structures where directly required for the condition to function.
- Live gates verified Deafen's 5-Focus spend, ordinary-success zero damage, status application, correct active-combat expiration snapshot, and next-round cleanup. The duration lifecycle now selects the genuinely active combat, serializes overlapping combat-hook sweeps, and idempotently closes stale transactions whose effects were already removed. Fantastic Double Tap dealt 108 damage, applied bleeding, and supported both status and damage undo. Nine embedded copies were refreshed and all temporary actors, combat, messages, targets, and tokens were restored or removed.
- The Ranged Weapons rapid-fire batch structures Double Tap, Snap Shooting, Weapons Blazing, and Stopping Power with explicit target counts, split or full damage, Fantastic doubling, bleeding or bonus-attack outcomes, exact Focus handling, and the Free-JB2A `weapon.projectile.gunshot` profile. Snap Shooting and Weapons Blazing use the attacker's actual Agility damage multiplier and half/full scaling rather than a forced multiplier.
- Live gates verified Double Tap's 108 Fantastic damage and playback metadata, one-target Weapons Blazing for 37 half damage, two-target Fantastic Snap Shooting for 54 damage each plus bleeding on both targets, and Stopping Power's exact 5-Focus spend, 104 Fantastic damage, projectile playback, and bonus same-target attack reminder. Ten embedded copies were refreshed; all damage, statuses, resources, messages, targets, and tokens were restored or deleted.
- Suppressive Fire, Return Fire, and Covering Fire use Focus as the damage destination while explicitly retaining Health Damage Reduction as the calculation basis. Fantastic successes double the post-reduction result and apply one round of `stunned` only when the damage transaction records a real Focus decrease. Shared damage-gated event checks now use the transaction's previous and new resource values rather than merely trusting calculated damage.
- Return Fire binds to and reserves the latest attack targeting the reacting character, then automatically targets that attacker. Covering Fire now correctly attacks Vigilance rather than Agility; its ally-turn trigger and chosen enemy remain player-declared because the system does not yet track turn-start reaction opportunities. All three use `weapon.projectile.gunshot`.
- Live gates verified Focus-only loss with unchanged Health, Health Damage Reduction, Fantastic doubling, one-round stun creation and undo, no stun against a target already at 0 Focus, and Return Fire attacker binding. Gambit's embedded Suppressive Fire copy was refreshed, temporary actors and messages were deleted, and the full 47-test suite passed.
- Point-Blank Parry binds to the latest unused attack that missed the reacting character, auto-targets that attacker, and relies on its explicit two-space enemy targeting to reject invalid triggers before its 5-Focus spend. It deals regular/Fantastic damage, applies manual-duration bleeding on a Fantastic hit, and uses `weapon.projectile.gunshot`.
- Kill Zone has explicit one-target enemy line-of-sight validation, exact 15-Focus handling, regular/Fantastic damage, and the generic projectile profile. It reuses the combat-round target ledger to exclude targets already successfully affected by that actor's Kill Zone until the next round. Because movement-start opportunities and reaction economy are not system-tracked, selecting the moving enemy remains player-declared and an after-roll reminder instructs the player to regain the reaction whether the attack hits or misses.
- Live gates verified Point-Blank Parry trigger binding, two-space configuration, 7/14 damage, bleeding apply/undo, and Kill Zone's 7/14 damage, hit-or-miss reminder, current-round exclusion, and next-round reset. Both Focus costs and effect profiles were verified, Gambit's embedded Point-Blank Parry was refreshed, and all temporary actors and messages were removed.
- Dance of Death and Orchestra of Overkill use source-centered circles of five and ten spaces, respectively. Both select every visible enemy in line of sight, compare one Agility roll against each target's Agility defense, spend exactly 10 or 15 Focus, deal half regular damage or full Fantastic damage, and apply manual-duration bleeding independently to each Fantastic-hit target.
- Their prior Gambit-specific movement, card, and kinetic profiles were inappropriate for generic Ranged Weapons users and were replaced by `weapon.projectile.gunshot`. The area playback policy targets each enemy rather than the area center, producing one Free-JB2A bullet path per selected target.
- Live gates selected two enemies inside Dance of Death and a third enemy inside Orchestra of Overkill while excluding the source and an ally. Fantastic Dance of Death applied 7 damage and bleeding to both targets, cleanly undid both statuses, and recorded two stretched projectile calls. Gambit's embedded Dance of Death was refreshed, all temporary actors and messages were removed, and source-level area regression coverage increased the suite to 53 tests.
- Precision attacks support an explicit `damage.fantasticScale` for powers whose Fantastic result is not the standard double. Headshot uses ordinary scale 2 and Fantastic scale 3, producing double normal damage or triple base damage while preserving the resolved 1.5× Fantastic multiplier in transaction metadata. Sniping uses ordinary scale 1 and Fantastic scale 3.
- Targeting now supports `minimumRange` independently of maximum range. Sniping rejects a target closer than 20 spaces before Focus is spent while accepting exactly 20 spaces, targets one enemy, spends exactly 5 Focus, and records that both the standard and movement actions were used and the character cannot move that turn. Headshot targets one enemy, starts with Trouble, spends exactly 15 Focus, applies a one-round stun only after actual Health loss, and uses the same generic gunshot projectile. Headshot's weapon-range maximum remains player-validated because the generic power does not identify which owned ranged weapon is being fired.
- Live gates verified Headshot at 14 ordinary and 21 Fantastic damage, Sniping at 7 ordinary and 21 Fantastic damage, the resolved 1.5×/3× metadata, Trouble, both Focus costs, stun apply/undo and duration, exact minimum-range boundaries, the movement reminder, and stretched projectile playback. Bullseye's and Hawkeye's embedded Sniping copies were refreshed, and all temporary actors and messages were removed.
- Slow-Motion Shoot-Dodge completes the Ranged Weapons attack migration with one-or-two-enemy targeting, exact 10-Focus handling, the attacker's current Agility damage multiplier, half regular or full Fantastic damage, one source-level bonus-attack reminder, `movement.whoosh`, and one `weapon.projectile.gunshot` path per target.
- Its post-roll Active Effect contributes Trouble only to attacks against Agility defense. A serialized lifecycle removes the effect and applies prone when the character moves, is moved, or starts their next combat turn. The live gate exercised both direct next-turn sweeping and the registered Foundry `updateToken` hook, confirming the effect disappeared and prone appeared after actual token movement.
- Fast Hands uses a permanent transferred reaction-allowance effect. The shared resolver reports one base plus one additional reaction when restricted to Ranged Weapons and deduplicates the same transferred effect if it appears on both actor and item collections. Reaction spending remains player-managed because the system has no global reaction-economy ledger.
- The final live gate verified 4/7 half/full damage with the test actor's current Agility multiplier, exact Focus parsing, one Fantastic reminder across two targets, Agility-only Trouble, both prone boundaries, two projectile calls, and a total Ranged Weapons reaction allowance of two. Gambit's embedded Slow-Motion Shoot-Dodge was refreshed, temporary data was removed, and the Ranged Weapons family is complete.

- The Super-Strength migration completes all 11 powers as one logical batch. Banging Heads uses exact two-target selection and reusable all-target-success damage gating; Clobber and Smash provide regular/double strikes, with Smash adding Edge, selected-Focus damage scaling, and a one-round Fantastic stun. Ground-Shaking Stomp and Unrelenting Smash provide Rank-plus-Reach and Reach source areas with half/full damage, centered semantic impacts, Fantastic prone, and Unrelenting's once-per-round target ledger plus repeat/movement reminder.
- Crushing Grip requires a grappled enemy and attacks Resilience; Quick Toss separates automated impact-target damage from one explicit thrown-person reminder; and Immovable uses a utility activation with a knockback reminder. `pinned`, thrown-person placement/damage, and knockback reduction remain manual because the current status and transaction models cannot represent those outcomes safely.
- Character and NPC movement derivation now support `rank-runspeed`. Jump 1-3 use ordered override priorities of 10, 20, and 30 so only the highest owned tier controls Jump calculation and out-of-combat movement. Jump 2 and Jump 3 source records also had invalid trailing-space and overlong identity fields corrected; source tests now enforce 16-character item IDs and exact Active Effect origins.
- The installed compendium initially lacked the Jump transferred effects and retained only one Unrelenting Smash event. Live repair recreated all three Jump effects, restored both Unrelenting events, and refreshed embedded owners. A grouped installed-runtime matrix passed 21/21 gates for targeting, defenses, area size, damage, Focus scaling, conditions, reminders, profiles, once-per-round data, and derived Jump values. The temporary macro and all diagnostic chat messages were deleted afterward.

- The Weather Control migration completes all eight powers as one logical batch. Control Fog, Control Weather 1-4, Weather Chill, and Weather Warm activate as utilities and create source-owned concentration effects with structured `weatherControl` metadata. These records automate Focus spending, concentration replacement and cleanup, presentation, and animations while leaving global mile-scale range, speed, flight, visibility, and temperature enforcement as explicit Narrator reminders rather than mutating every canvas actor.
- Weather metadata records Fog's Rank-scaled radius and ten-space line-of-sight limit; Weather 1-3's range and speed multipliers; Weather 3's Elemental Blast (Electricity) reaction exception; Weather 4's quarter range/speed and flight prohibition; and Chill/Warm's one-mile 0-100°F limits. Exact tier costs are 10, 15, and 20 Focus for Control Weather 2-4.
- Thunder uses an all-character ten-space source area, attacks Ego against Resilience, and explicitly disables damage. An ordinary hit applies `deafened`; a Fantastic hit also applies one-round `stunned`. Centered `weather.thunder` playback avoids inappropriate per-target lightning arcs.
- Eight semantic profiles resolve to verified Free JB2A assets for fog, rain, storm, thunderstorm, hurricane, thunder, chill, and warmth. The installed-runtime matrix passed 6/6 gates for exact Focus spending, concentration creation/replacement/removal, Thunder's ordinary/Fantastic conditions, and full undo. All eight live compendium documents and 12 embedded copies on Shaman, Storm, and Thor were refreshed, and all temporary actors, diagnostics, messages, and the macro were deleted.

- The Healing migration completes all seven powers as one logical batch. Healing Hands and Soothing Touch perform selected-Focus Health and Focus transfers; Let's Go and Never Surrender provide maintained zero-resource support with action and spending guards; Cure-All removes its listed statuses and applies resource floors; Restore and Resurrect distinguish ordinary and Fantastic restoration while applying their source costs and failure refund rules.
- Five semantic profiles resolve to verified Free JB2A healing and cure assets. The installed-runtime matrix passed 12/12 gates for variable transfers, undo/refunds, maintained support restrictions and automatic ending, status reversion, fixed-TN event routing, ordinary/Fantastic resource restoration, status removal, and Resurrect's extra-Focus failure refund. All seven live compendium documents and Shaman's embedded Healing Hands were refreshed, and temporary actors, diagnostics, staging data, and the macro were deleted.

- The Luck migration completes all nine powers as one logical batch. Actor-owned `actionRollModifier` effects contribute universal Edge or Trouble to action checks, support automatic or optional selection, and can declare non-stacking and once-per-round behavior. Charmed Life records the selected modifier ID on the action-roll audit and suppresses it for the remainder of that combat round. Real Jinx uses an attack-only, non-stacking defensive modifier.
- Utility activation now reuses structured targeting for Rank-scaled target caps and range, Reach, line of sight, self eligibility, and ally/enemy filters before spending Focus. Concentration outcomes derive turn-based Focus maintenance from the parsed item cost; the existing combat sweeper pays exact upkeep or ends concentration and removes every source/target effect when payment fails.
- Lucky Me, Lucky You, Wish You Luck, and Lucky Us grant universal Edge; Evil Eye, Jinx You, and Jinx You All impose universal Trouble. Jinx You attacks Agility at Reach and uses Fantastic-required, non-doubled standard Melee damage. The installed-runtime matrix passed 10/10 gates, both semantic profiles resolved to Free JB2A Bless/Curse assets, all nine compendium records were refreshed, and temporary data was removed.

- The Translation migration completes all eight powers as one logical batch. Six comprehension powers use source-only Logic vs. TN 13 checks and expose an optional item-owned Edge when the character knows a related language or communication form. Ordinary and Fantastic events provide distinct current-use and permanent-record reminders without guessing the language name or writing uncontrolled actor data.
- `targetNumber` and Translation metadata are now declared on the Foundry Power data model, so installed documents retain fixed TNs. Non-attack action results synthesize a source resolution entry when no target exists, allowing source-success, source-failure, and source-Fantastic events to work for self-contained checks. This schema correction also restored the live fixed TNs for Cure-All, Restore, and Resurrect.
- Detect Lie is a non-damaging Ego attack with exact 5-Focus spending and separate knowing-lie/motive reminders. Indecipherable contributes a permanent transferred `telepathicLanguageImmunity` flag; generic `effect-flag` target prerequisites make Mind Reading and Mind Interrogation reject protected targets before spending resources.
- The installed-runtime matrix passed 8/8 gates, the mislabeled Written Language record was corrected without changing its ID, both semantic profiles resolved to verified Free JB2A Divination/Eyes assets, all eight Translation and two coupled Telepathy documents were refreshed, and temporary data was removed.

- The Phasing migration completes all nine powers as one logical batch. Phase Self, Quick Phase, Phase Other, and Phase Walk create concentration-owned intangible state. Physical actions are rejected before Focus spending when exactly one participant is phased, while mental actions, interactions between phased characters, Disrupt Nerves, and Disrupt Person remain valid.
- Phase Walk grants Flight at Run Speed while maintained. Phase Object records its Rank-scaled size ceiling and contents/attachments rule; Phase Other records its grab, contact-chain, forced-ejection, and disruption-damage boundaries as explicit Narrator reminders rather than guessing collision geometry. Disrupt Electronics applies a one-turn electronic Tech Reliant disable marker. Disrupt Nerves applies one-round `stunned` and Fantastic `prone`; Disrupt Person deals regular/double Melee Health damage while ignoring Health Damage Reduction and adds one-round Fantastic `stunned`.
- Maintained phasing has a persistent token presentation distinct from invisibility: 62% opacity, cyan tint, and an optional Free-JB2A blue-purple smoke shimmer. The original opacity and tint are stored and restored when the effect ends. Create/delete ActiveEffect, token creation, and canvas-ready synchronization cover linked and unlinked tokens.
- Six semantic Phasing profiles use live-verified Free JB2A entries. Source regression gates passed 43/43 across Phasing and coupled shared services. The installed Phase Self activation gate created the concentration effect, entered the visual state, retained exact Focus, and cleaned up; all nine compendium documents were refreshed and all temporary actors, tokens, messages, effects, and staging data were removed.

- The Teleportation source migration structures all 14 powers around the existing utility, opposed-check, targeting, Focus, concentration, and power-event engines. The Power data model now preserves dedicated `teleportation` metadata for combat and out-of-combat range, destination knowledge, clear-space requirements, portal direction, carried targets or objects, swap return state, and reaction adjudication.
- Blink Barrage creates one round of non-stacking attack Trouble. Teleport Other requires `grappled`, rolls Ego versus Vigilance, and cannot infer damage from the generic opposed-check preset. Swap Places and Swap Items use line of sight and two spaces per Rank, create concentration markers, and leave position or inventory mutation explicit because willing-target checks and safe return transactions require player confirmation.
- Teleport 1, Teleport 2, Teleport Blind, Teleport Object, Teleport Together, Teleportal, Blink, Blink Defense, and Telespot reuse `movement.teleport` and automate their exact costs and target contracts while presenting concise destination, collision, portal, and projectile reminders. They do not guess a destination or move tokens across scenes.
- Swap Status's corrupted Blink duplicate was repaired from a public rules reference. It now spends 5 Focus, requires one visible target within two spaces per Rank, creates source/target concentration markers, and records the selective resource, condition, Occupation, trait, and tag categories plus the current-state return rule. Arbitrary actor-data mutation remains manual because it must safely transact later changes, defeat, or death.
- Focused source gates pass 8/8, the shared action/utility/event matrix passes 46/46, effect-profile validation passes, and the LevelDB pack build succeeds. The installed matrix verified exact 5-Focus Blink Barrage spending with Trouble apply/undo, exact 15-Focus Teleportal spending with concentration creation/cleanup, Teleport Other rejection before Focus spending, Swap Places' opposed-check contract, and live Free JB2A teleport resolution. All 14 compendium documents and seven embedded copies on Magik, Nightcrawler, and Nimrod were refreshed; temporary actors, messages, effects, and staging data were removed.

- The Super-Speed migration completes all ten powers as one logical batch. Speed Run 1 multiplies Run Speed by Rank and uses 3x noncombat speed; corrected Speed Run 2 requires Rank 3 and overrides only noncombat speed to 50x. Speed Swim multiplies Swim Speed by Rank and uses 3x noncombat speed. Run on Water and Lightning Actions provide permanent transferred rules metadata without pretending Foundry tracks continuous running or the once-per-round standard/reaction exchange.
- Blazing Fast Fists uses an attack-only, Melee-only actor-effect Edge. Blur spends exactly 5 Focus and applies one round of non-stacking Trouble to attacks. Speed Blast is explicitly non-damaging, attacks one enemy's Agility within 10 spaces, applies one-round `stunned` on a hit, and applies `prone` to the target—not the source—on a Fantastic hit.
- Catch Bullets binds to the latest incoming non-elemental ranged weapon or Ranged Weapons power, targets its attacker even when no attacker token exists, and prefills the triggering attack result as an editable TN ahead of the attacker's defense. Nullifying the original attack and returning the reaction on a Fantastic success remain explicit reminders because the system does not own a universal reaction/action ledger or pre-damage interruption queue.
- Molecular Destabilization uses a source-only Melee check with exact 15-Focus spending and structured object-size, two-space blast, source exclusion, double-damage, and Fantastic DR-bypass metadata. Object selection and multi-actor blast mutation remain explicit outcomes because token targeting cannot safely represent a non-Actor object as the primary subject.
- Six semantic profiles resolve to live-verified Free JB2A static-electricity, gust, wind-stream, and explosion entries. The final focused Super-Speed/shared-reaction gates pass 20/20, and the full repository passes 121/121. The installed matrix verified Rank 3 Run 15/noncombat 50, Swim 9/noncombat 3, Blur Focus/effect/undo, Fantastic Speed Blast target-only statuses/undo, Catch Bullets TN 17 binding, and every profile. All ten compendium documents and four embedded copies on Aurora, Northstar, and Quicksilver were refreshed; temporary actors, messages, statuses, effects, and staging data were removed.

- The Tactics migration completes all eleven powers as one logical batch. Utility targeting can now cap selected allies by a source ability value or defense, allowing Battle Plan and Rally on Me to use Vigilance, Advance to use Ego defense, Operations Center to use Vigilance defense, and Scatter to use Rank without hard-coded limits.
- Battle Plan spends exactly 10 Focus and grants selected allies one non-stacking Edge on all checks until the source's next turn. Change of Plans spends exactly 5 Focus and grants its selected ally a source-independent one-use Edge that the next action check consumes. Keep Moving removes `demoralized` and `stunned`; On Your Feet removes `prone`; selected willing recipients of Hit the Dirt and Scatter receive `prone`.
- Focus Fire validates one visible enemy, spends 10 Focus, and creates a concentration-owned source marker. Operations Center spends 15 Focus, grants concentration-owned non-stacking Edge to selected allies, and records its movement-action concentration break. Combat Support's forced Marvel-die result, once-per-battle uses, earshot, optional movement, attack invalidation, post-movement Reach checks, and Rally on Me Focus recovery remain explicit structured boundaries where the system does not own the required action ledger, auditory range, movement choice, or triggering-attack queue.
- Eight semantic profiles resolve live to verified Free JB2A blessing, wind, healing, eyes, and divination entries. Focused Tactics/shared gates pass 31/31, and the full repository passes 127/127. The installed matrix verified over-cap rejection before spending, exact Focus spend/refund, Battle Plan Edge on two allies, universal one-use Change of Plans Edge, condition removal, Focus Fire and Operations Center concentration creation/cleanup, and all eight profiles. All eleven compendium documents and 27 embedded copies were refreshed; temporary actors, messages, effects, statuses, and staging data were removed.

- The Telekinesis migration completes all fourteen powers as one logical batch. Levitation now transfers Flight equal to Run Speed. Group Levitation enforces one target per Rank and 5 spaces per Rank, spends exactly 5 Focus, and creates concentration-owned target markers with explicit unwilling-target and movement boundaries.
- Telekinetic Attack has exact Logic-versus-Melee targeting, Rank-scaled range, regular/Fantastic damage, and one-round Fantastic `stunned`. Telekinetic Crush requires a `grappled` target, attacks Resilience at Reach, deals regular/Fantastic damage, and maps the rules term pinned to the system's `restrained` condition. Telekinetic Grab explicitly deals no damage, applies concentration-owned `grappled` and Fantastic `restrained`, and records the Melee TN 20 escape contract.
- Telekinetic Barrier now correctly requires line of sight, deals no automatic damage, preserves source/target side choice, applies one-round Fantastic `paralyzed`, and records its Logic-defense 10-damage durability. Telekinetic Manipulation uses utility concentration with its object, range, line-of-sight, and contested-check boundaries.
- Telekinetic Protection 1-4 spend exact Focus and create concentration-owned source markers carrying thresholds 10/20/30/40 and Logic-defense metadata. Their all-or-nothing attack interception remains explicit because the shared damage pipeline does not own pre-hit shield routing. Reinforcement uses variable Focus with a protected-target prerequisite and explicit transfer bookkeeping.
- Telekinetic Sphere uses a source-centered, Rank-scaled persistent circle; its variable Focus and durability must match the owned Protection tier, and only Fantastic results deal full damage. Telekinetic Toss explicitly disables unsafe single-target damage and separately records the thrown character's always-on damage/prone placement, collision-target hit damage, and Fantastic target `prone`.
- Ten semantic profiles resolve live to verified Free JB2A force-wall, shield, static-energy, impact, healing, divination, and gust entries. Focused Telekinesis/shared gates pass 34/34, and the full repository passes 136/136. The installed matrix verified Levitation movement, Group Levitation over-cap rejection/spend/markers/cleanup, Protection 2 threshold/spend/cleanup, Grab/Toss non-damage, Sphere Fantastic-only damage, and every profile. All fourteen compendium documents and nine embedded copies were refreshed; temporary actors, messages, effects, statuses, and staging data were removed.

- The Sixth Sense migration completes all thirteen powers as one logical batch. Cosmic Awareness spends exactly 15 Focus and creates a same-universe concentration marker with known-subject location, velocity, emotional-status, and physical-status boundaries. Detect Supers now restores its missing 5-mile general range, 25-mile single-origin range, and Special Training exclusion, with concentration-owned sensing metadata.
- Danger Sense has a permanent transferred marker recording its unconditional bonus-round turn without pretending the current initiative tracker owns bonus-round scheduling. Intuition spends exactly 5 Focus and presents its long-term-choice question as an explicit Narrator outcome. Microscopic Awareness spends 5 Focus, creates concentration, and records its one-space-per-Rank fingerprint, hair, and DNA analysis limits.
- Postcognition tiers now have corrected numbering and prerequisites and preserve exact six-hour, 24-hour, past-year 24-hour-window, and past-century week-window contracts. Each accepts at most one optional Reach subject while retaining place, item, and self narration.
- Precognition 2 now correctly requires Rank 3. All four tiers expose exact Reach/1-mile/100-mile/1,000-mile future horizons and one-question narrative boundaries. The system spends exact Focus and stores the optional subject, but never fabricates a Narrator answer or treats possible futures as fixed.
- Six semantic profiles resolve live to verified Free JB2A divination, eyes, blessing, static-energy, and misty-vision entries. Focused Sixth Sense/shared gates pass 31/31, and the full repository passes 142/142. The installed matrix verified Danger Sense transfer, Cosmic Awareness and Detect Supers concentration, exact Focus spend/refund, Postcognition target-cap rejection, optional subject storage, Precognition horizons, and every profile. All thirteen compendium documents were refreshed; no embedded world copies existed, and temporary actors, messages, effects, and staging data were removed.

- The Resize migration completes all fourteen powers as one logical batch. Grow 1-4 and Shrink 1-4 now activate as reversible source-owned size effects instead of overwriting an actor's base size. Actor preparation supports the full Little through Gargantuan rules progression: exact Melee/Agility defense changes, growing Run Speed and Reach multipliers, and growing melee damage-multiplier bonuses. Grow 2 now correctly requires Grow 1 and reaches Gigantic.
- Growing Attack retains its close attack Edge, regular/double destination-size damage, and Fantastic `stunned`, with an explicit reminder to apply the destination Grow tier before damage. Shrinking Dodge spends exactly 5 Focus and applies one source-independent Trouble to the selected attacker's triggering roll.
- Resize Object and Resize Other now correctly require Grow 2 or Shrink 2 and Rank 3. Object selection remains explicit because ordinary token targeting cannot represent arbitrary objects safely. Resize Other enforces one selected target within Reach and records the `grappled` requirement for an unwilling target without guessing the chosen size or owned tier.
- Macro- and Microdimensional Travel spend exactly 15 Focus and preserve Narrator-owned destinations, altered time/space rules, and return-at-will boundaries. Microdimensional Travel's source typo is corrected.
- Five semantic profiles resolve live to verified Free JB2A healing, misty-step, impact, and static-electricity entries. Focused Resize/shared gates pass 31/31, and the full repository passes 148/148. The installed matrix verified reversible Huge and Microscopic effects, exact derived defenses/Run/Reach/melee damage, one-use Shrinking Dodge Trouble, target-cap rejection, exact Focus costs, and every profile. All fourteen compendium documents and nine embedded copies on Ant-Man, Apocalypse, Hank Pym, and Wasp were refreshed with embedded IDs preserved; temporary actors, messages, effects, and staging data were removed.

- The Shield Bearer migration completes all fourteen powers as one logical batch. Shield 1-4 now create concentration-owned Health Damage Reduction 1-4 rather than granting permanent reduction merely because the item is owned. Shield 4's incorrect tier number is corrected from 1 to 4, and the empty Shield Bearer copy of Do This All Day now uses exact variable Focus and two Health restored per Focus.
- Brace for Impact reuses the proven latest-unresolved-physical-damage reaction and restores at most one Health per Focus spent. Shield Deflection and Hurled Shield Deflection apply one source-independent Trouble to the selected triggering attacker. Shield Wall creates concentration-owned, non-stacking Trouble against all attacks and records its movement-action concentration break.
- Shield Bash and Hurled Shield Bash have exact Reach/Rank-scaled targeting, regular/double damage, and Fantastic `prone`. Rico-Shield keeps regular damage on a Fantastic success, applies `prone`, and records its different-target, inter-target-range, and repeat-while-Fantastic sequence explicitly because the action roller owns one attack at a time.
- Hurled Shield Block derives temporary Health Damage Reduction from the source's highest owned Shield tier. It must be undone after the triggering attack because the shared damage pipeline does not yet own pre-roll third-party reaction expiration. All thrown powers record the start-of-next-turn return and the period in which other Shield powers and benefits are unavailable. Immovable records exact Melee-defense knockback reduction and the no-prone result when reduced to zero.
- Nine semantic profiles resolve live to verified Free JB2A round-shield melee, throw, return, guard, wall, deflection, impact, healing, and bracing entries. Focused Shield Bearer/shared gates pass 32/32, and the full repository passes 155/155. The installed matrix verified concentration DR and undo, Shield Wall Trouble, one-use Deflection Trouble, tier-derived ally DR, exact fixed and variable Focus, and every profile. All fourteen compendium documents and ten embedded copies on Captain America were refreshed with IDs preserved; legacy transferred Shield effects and all temporary actors, messages, effects, and staging data were removed.

Not completed:

- Migration of the remaining prose-only compendium powers.
- A circumstance selector and actor-trait modifier resolver for contextual Edge/Trouble benefits.
- Migration of remaining persistent web, aura, and maintained-effect power data.