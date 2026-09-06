# Marvel Multiverse Automation Backlog

This document is the working list of known remaining tasks as of September 5, 2026. `AUTOMATION.md` describes the architecture and completed capabilities; this file tracks unfinished work.

## Next Session

- [x] Live-gate **Memory Blip** against a valid target.
  - Confirmed Logic versus Logic, one required target, and 5 Focus spent once.
  - Confirmed no damage copy or damage controls appear.
  - Verified success, failure, and Fantastic-success reminders.
  - Verified Refund Focus restores the exact previous value.
- [x] Live-gate **Orders** against a target with zero Focus.
  - Confirmed Logic versus Logic, exactly one required target, and 15 Focus spent once.
  - Verified the Telepathic Link, zero-Focus, conditional Trouble, and one-hour reminders.
  - Verified success, failure, Fantastic-success, and Refund Focus behavior.
  - Fixed action-roll preflight so single-target presets reject multiple selected targets before opening the roll dialog.
- [x] Recast **Command** after refreshing all live copies to generic psychic profiles; no effect-profile warnings remain.
- [x] Restore Professor X's test Focus to its intended baseline after testing.
- [x] Remove temporary **Memory Blip** and **Orders** items from the unlinked Professor X automation token after their gates pass.
- [x] Remove the temporary Professor X automation token `MTkMb9khHVRFpYgK` after Telepathy testing.

## Elemental Barrier

- [x] Complete the deferred live gate for **Elemental Barrier**.
- [x] Verify wall placement range is 10 spaces per rank.
- [x] Verify wall length is 2 spaces per rank and width is 1 space.
- [x] Verify line-of-sight validation and all-target selection.
- [x] Verify the persistent concentration Region and sustained wall animation are created and removed correctly.
- [x] Verify success/failure side-choice reminders and the Fantastic elemental-effect reminder.
- [x] Verify the durability reminder: 10 damage or less is absorbed; more than 10 destroys the barrier.
- [x] Clean up all test Regions and effects after the gate.

## Remaining Telepathy Powers

Migrate in small related batches, running local, build, deployment, live, and cleanup gates after each batch.

### Link And Communication

- [x] **Telepathic Link**: willing communication plus forced Logic-versus-Vigilance check, failure lockout, one-round success, and Fantastic day-long lockout prevention.
- [x] **Telepathic Network**: willing linked targets, maximum five targets per rank, same-dimension reminder, 5 Focus, and concentration.
- [x] **Borrow Senses**: established link/bond requirement, one target, 5 Focus, and concentration.
- [x] **Animal Bond**: persistent chosen-animal restriction and same-dimension communication reminders.
- [x] **Animal Communication**: selected taxonomic order, 500-spaces-per-rank call range, and disposition limitations.
- [x] **Machine Telepathy**: machine targeting plus Narrator-defined security difficulty for secured machines.
- [x] **Information Upload**: established link, willing or unwilling target, transferred label/knowledge, sleep expiration, 5 Focus, and concentration.

### Mirage And Concealment

- [x] **Cloak**: 20-spaces-per-rank mental concealment, Logic-defense detection target number, camera exception, 5 Focus, concentration, and a dedicated Mentally Concealed marker.
- [x] **Cloak Group**: protected group size, 10-space member placement, 20-spaces-per-rank observer range, 10 Focus, concentration, and source/target Mentally Concealed markers.
- [x] **Fool**: altered appearance, observer Logic check, known-person Edge, camera exception, 5 Focus, and concentration.
- [x] **Grand Fool**: rank-scaled group targeting, observer checks, known-person Edge, 10 Focus, and concentration.
- [x] **Mirage**: linked targets, full-sensory reminder, 10 Focus, and concentration.
- [x] **Grand Mirage**: active Telepathic Network requirement, same-locale restriction, 10 Focus, and concentration.

### Control And Memory

- [x] **Edit Memory**: Narrator-defined complexity, Logic versus Logic, recovery checks, Fantastic Trouble, 15 Focus, and permanent duration.
- [x] **Domination**: established link, zero-Focus prerequisite, initial Trouble, resistance checks, Heroic modifiers, 20 Focus, and permanent duration.
- [x] **Telepathic Possession**: established link, zero-Focus prerequisite, initial Trouble, control/resistance rules, empty-mind transfer, 20 Focus, and concentration.
- [x] **Copy Psyche**: copy capacity, transfer/removal checks, daily Resilience check, unavailable Focus, takeover rules, and shattered-state cleanup. Complex branches remain explicit reminders until a safe transaction model is designed.

### Defensive And Transformative

- [x] **Mental Shelter**: rank-scaled area, chosen allies, Focus Damage Reduction based on Uncanny, 10 Focus, and concentration lifecycle.
- [x] **Astral Form**: physical-body vulnerability, Astral state, real-world visibility by rank, flight calculation, 5 Focus, and concentration lifecycle.

## Utility Activation Workflow

Several powers activate without an attack or opposed check. They should not be forced through a fake roll.

- [x] Design a structured utility-power activation path with targeting, Focus spending, concentration, chat reminders, effects, and undo where applicable.
- [x] Support willing-target selection without requiring a defense or target number.
- [x] Support no-target/self activations such as Astral Form.
- [x] Support Narrator-entered difficulty where rules call for one, such as Machine Telepathy security.
- [x] Ensure utility activations use the same compact chat controls and Focus transaction model as action rolls.

## Weapons And Equipment

The 13 weapon records are structured locally but still require complete live gates.

- [x] Validate melee, thrown, firearm, bow, and grenade examples in Foundry.
- [x] Verify Rifle, Shotgun, and Submachine Gun distance-based Trouble.
- [x] Verify connected adjacent-target groups and split multi-target damage.
- [x] Verify Fantastic doubling configuration for each relevant weapon.
- [x] Verify arrow and thrown-blade JB2A profiles in external Edge.
- [x] Verify grenade center/scatter exceptions produce clear manual reminders.
- [x] Verify damage application and undo as both GM and player through socket relay.

## Passive And Granted Data

- [ ] Live-gate Big and Small adjustments to defenses, Run Speed, and Reach.
- [ ] Live-gate Military granting Battle Ready with its +30 Focus effect.
- [ ] Verify Assassin and Alien: Brood resolve the canonical Villainous tag.
- [ ] Verify Spirit of Vengeance grants the migrated Hellfire Chains item without losing structured automation data.
- [ ] Audit embedded grant snapshots so future compendium updates do not leave stale copies on actors or unlinked tokens.

## Rules Engine

- [ ] Add the circumstance selector and actor-trait modifier resolver for contextual Edge and Trouble.
- [ ] Keep subjective circumstances as explicit player or Narrator choices.
- [ ] Add persistent lifecycle support for webs, auras, maintained effects, and other concentration powers.
- [ ] Define expiration and cleanup behavior for rounds, combat turns, concentration, sleep, day-long effects, and permanent effects.
- [ ] Decide how one-use future Edge benefits are stored, consumed, and undone.
- [ ] Add safe prerequisites for target state, including zero Focus, existing links, statuses, tags, and active effects.
- [ ] Continue treating manual reminders as valid partial automation for subjective or choice-heavy rules.

## Authoring And Data Models

- [ ] Add Power-sheet controls for structured events and effect profiles.
- [ ] Add a manifest-backed effect-profile selector instead of requiring profile IDs to be typed manually.
- [ ] Add clear controls for targeting, area shape, range scaling, damage, duration, and automation preset selection.
- [ ] Resolve parity between the active models in `lib/documents.mjs` and the legacy models under `module/data/`.
- [ ] Preserve `effectProfile`, `effectProfiles`, `effectOverrides`, `targeting`, `events`, `options`, `focusScaling`, and `automationPreset` during model consolidation.
- [ ] Audit all embedded and compendium item update paths for schema-backed fields that cannot be removed by deleting a parent object.

## Effects And Assets

- [ ] Add an automated audit that validates every semantic profile against `assets/effects-manifest.json`.
- [ ] Check declared Sequencer database keys against supported JB2A tiers.
- [ ] Report unknown live `effectProfiles` before they reach gameplay.
- [ ] Add or select profiles for remaining power families without using hero-specific IDs.
- [ ] Verify visual gates in external Microsoft Edge; the VS Code browser does not reliably decode JB2A WebM files.
- [ ] Verify rules still complete when Sequencer effects or optional asset modules are disabled.

## Localization And Interface

- [ ] Translate newly added action labels in `es.json`, `fr.json`, and `fr-CA.json`.
- [ ] Audit chat-card localization calls so missing keys never appear as `MARVEL_MULTIVERSE.*` text.
- [ ] Verify compact icon toolbars at narrow and wide chat-sidebar sizes.
- [ ] Verify every icon action has a Foundry tooltip, native title, and accessible label.
- [ ] Verify action cards rerender correctly after apply, undo, spend, refund, resolve, and concentration changes.

## Validation And Test Coverage

- [ ] Add automated tests for automation-preset merging and explicit-field precedence.
- [ ] Add regression tests proving `damage.enabled: false` overrides attack and legacy damage hints.
- [ ] Add regression tests for modern `actionFocus` spend/refund and duplicate-spend prevention.
- [ ] Add tests for large-token nearest-cell range measurement.
- [ ] Add tests for unlinked-token embedded item behavior.
- [ ] Add tests for power-event trigger matching, duplicate status prevention, duration, and undo.
- [ ] Run each migrated power through no-target, invalid-target, success, failure, Fantastic success, insufficient-Focus, apply, and undo gates as applicable.
- [ ] Repeat permission-sensitive workflows with a player connected to a GM.
- [ ] Make the full ESLint run clean or explicitly baseline documented legacy findings.
- [ ] Run `npm run build`, pack validation, and `git diff --check` before release.

## Repository And Release Hygiene

- [ ] Review the large dirty worktree and separate changes into logical commits without reverting unrelated work.
- [ ] Review generated `css/marvel-multiverse.css` changes alongside all modified SCSS sources.
- [ ] Verify generated LevelDB packs match the reviewed JSON sources.
- [ ] Update `AUTOMATION.md`, `CHANGELOG.md`, and release notes after each completed family.
- [ ] Confirm `system.json` compatibility declarations reflect the supported Foundry versions.
- [ ] Address the `template.json` deprecation before Foundry V16.
- [ ] Remove diagnostic effects, temporary test items, tokens, Regions, and stale actor-specific profiles before release.
- [ ] Back up the world before final migration and perform one clean install/sync smoke test.

## Per-Power Definition Of Done

A power is complete only when the applicable items below pass:

- [ ] Structured source data accurately represents targeting, defense, range, Focus, damage, duration, and outcomes.
- [ ] Subjective or unsafe mechanics have concise manual reminders.
- [ ] Source validation, focused lint, `build:code`, and `build:db` pass.
- [ ] Installed files and packs match the repository build.
- [ ] The exact live `rollContext.itemUuid` is inspected and any unlinked-token copy is refreshed.
- [ ] No-target and invalid-target behavior is correct.
- [ ] Normal, failure, and Fantastic outcomes are correct.
- [ ] Focus/resource application and undo restore exact prior values.
- [ ] Chat controls, labels, summaries, and rerenders are correct.
- [ ] Optional visual effects play and clean up correctly in external Edge.
- [ ] The workflow succeeds without optional effects enabled.
- [ ] Temporary live-test data is removed.