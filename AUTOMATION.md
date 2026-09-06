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

### Healing Hands Migration

`packs/_source/powers/Healing/healing-hands.json` now includes single-target Reach targeting, variable Focus spending, structured healing, and the `healing` success profile. Its Focus cost, Health application, undo, target/self playback, and cleanup passed live validation.

Do not infer healing formulas from description text at runtime. Encode them as structured data after validating the official rule and the focus-scaling contract.

Rules mutation and animation are intentionally independent. The `healing` event outcome is gated by `enableExperimentalPowerOutcomes`; the cosmetic profile is gated by `enableSequencerEffects`.

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

`lib/documents.mjs` remains the active runtime model source. The legacy models under `module/data/` now match its schema metadata and actor derivation behavior, including open structured fields used by automation. The parity contract covers `automationPreset`, `effectProfile`, `effectProfiles`, `effectOverrides`, `targeting`, `damage`, `events`, `rollModifiers`, `options`, `activation`, and `focusScaling`.

Before consolidating models or changing the build entry point, verify this contract again so structured automation data is not narrowed or discarded.

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
- Power sheets now include an Automation tab for semantic effect-profile assignments and structured events. Each phase selector is populated from `assets/effects-manifest.json`, labels profiles with their category and type, and preserves an existing custom profile as an explicit legacy option. Authors can save or clear each phase profile, open the Animation Designer directly on that phase, and add, edit, or delete events and the currently used `manual`, `status`, `healing`, and `future-roll-modifier` outcomes. Event changes validate atomically and preserve fields the editor does not expose; changing an outcome type seeds a valid editable shape before rerendering.
- The Power Attributes tab groups power details, rules text, Focus scaling, attack and damage, targeting, and area configuration. It exposes target count; fixed, Rank, Reach, and Rank-plus-Reach scaling; structured damage flags and scale; complete area geometry; persistence; and structured area duration. Native configuration controls save only their changed leaf path, preserving omitted preset defaults and unexposed nested data. Shape changes rerender the relevant geometry controls immediately.

Not completed:

- Migration of the remaining prose-only compendium powers.
- A circumstance selector and actor-trait modifier resolver for contextual Edge/Trouble benefits.
- Automated manifest/database compatibility audit.
- Migration of remaining persistent web, aura, and maintained-effect power data.