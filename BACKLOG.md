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

- [x] Live-gate Big and Small adjustments to defenses, Run Speed, and Reach.
- [x] Live-gate Military granting Battle Ready with its +30 Focus effect.
- [x] Verify Assassin and Alien: Brood resolve the canonical Villainous tag.
- [x] Verify Spirit of Vengeance grants the migrated Hellfire Chains item without losing structured automation data.
- [x] Audit embedded grant snapshots so future compendium updates do not leave stale copies on actors or unlinked tokens.

## Rules Engine

- [x] Add the circumstance selector and actor-trait modifier resolver for contextual Edge and Trouble.
- [x] Keep subjective circumstances as explicit player or Narrator choices.
- [x] Add persistent lifecycle support for webs, auras, maintained effects, and other concentration powers.
- [x] Define expiration and cleanup behavior for rounds, combat turns, concentration, sleep, day-long effects, and permanent effects.
- [x] Decide how one-use future Edge benefits are stored, consumed, and undone.
- [x] Add safe prerequisites for target state, including zero Focus, existing links, statuses, tags, and active effects.
- [x] Continue treating manual reminders as valid partial automation for subjective or choice-heavy rules.

## Authoring And Data Models

- [x] Add Power-sheet controls for structured events and effect profiles.
- [x] Add a manifest-backed effect-profile selector instead of requiring profile IDs to be typed manually.
- [x] Add clear controls for targeting, area shape, range scaling, damage, duration, and automation preset selection.
- [x] Resolve parity between the active models in `lib/documents.mjs` and the legacy models under `module/data/`.
- [x] Preserve `effectProfile`, `effectProfiles`, `effectOverrides`, `targeting`, `events`, `options`, `focusScaling`, and `automationPreset` during model consolidation.
- [x] Audit all embedded and compendium item update paths for schema-backed fields that cannot be removed by deleting a parent object.

## Effects And Assets

- [x] Add an automated audit that validates every semantic profile against `assets/effects-manifest.json`.
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

- [x] Complete the Martial Arts family migration.
  - Banging Heads, Chain Strikes, Crushing Grip, Fast Strikes, Flying Double Kick, Focused Strike, Grappling Technique, Leaping Leglock, Leg Sweep, and Spin & Throw now have explicit targeting, damage, semantic melee effects, and safe condition/manual outcomes.
  - Fast Strikes and Flying Double Kick use minimum/maximum target contracts; the Free JB2A flurry-of-blows animation is registered as `melee.flurry`.
  - Banging Heads uses reusable all-target-success damage gating so either miss prevents damage to both targets.
  - Do This All Day uses variable-Focus utility activation and self-healing. Regain Focus uses actor-data formula recovery capped at maximum Focus.
  - Live gates passed for Banging Heads one-target rejection, both-target success, mixed success/failure damage gating, Fantastic `prone` application to both targets, and one-call reversal of both target transactions; Do This All Day's 7-Focus spend, 14-Health application, undo, and refund; Regain Focus's Vigilance-based recovery and maximum cap; and `melee.flurry` Free-JB2A playback. All live-test data was restored or removed.
  - Attack Stance and Defense Stance now use concentration-owned Active Effects and dedicated Free-JB2A activation profiles. Attack Stance dynamically doubles the current Melee ability bonus to damage. Defense Stance adds one Trouble to incoming close attacks and ends after the first successful close attack, including legacy single-target rolls.
  - Live stance gates passed on the refreshed Jade Meridian and Sable Crane embedded powers: Attack Stance changed Chain Strikes damage from 22 to 28 for Melee 6 and undid cleanly; Defense Stance populated one Trouble, identified its reason, and removed its effect and concentration after a successful close hit. All test damage and temporary data were restored or removed.
  - Brace for Impact, Counterstrike Technique, and Reverse-Momentum Throw now bind to the latest qualifying unresolved attack message and reserve that trigger against duplicate reactions. Brace caps restoration at the incoming physical damage and pre-hit Health. Counterstrike requires Attack Stance, auto-targets the attacker, and deals half regular damage. Reverse-Momentum Throw requires Defense Stance after a close miss, auto-targets the attacker, deals half hypothetical damage, and applies `prone`.
  - Live reaction gates passed for exact Focus spending/refund, reaction damage or mitigation, automatic attacker targeting, stance requirements and preservation, duplicate rejection, multi-outcome undo, and Free-JB2A reaction profiles. Sable Crane's embedded reaction powers were refreshed, and Attack Stance was added to satisfy Counterstrike Technique's prerequisite. All test damage, statuses, resources, messages, and tokens were restored or removed.
  - Always Ready has clearly labeled homebrew reaction-economy wording and remains manual because the system does not track reactions per round. Unflappable Poise contributes one permanent Trouble to incoming close attacks through its transferred item effect and stacks with Defense Stance. Untouchable Position activates after the triggering attack, adds one non-stacking Trouble to later close attacks, and expires at the start of the defender's next turn.
  - Live passive gates verified one Trouble from Unflappable Poise, two Trouble while Defense Stance was also active, no retroactive Untouchable Position modifier on its triggering attack, one additional Trouble on subsequent attacks, no duplicate stacking, exact next-turn expiration, and Free-JB2A playback. Jade Meridian and Sable Crane retain the intended Always Ready homebrew text, Sable Crane's embedded passive powers were refreshed, and all temporary combat data was removed.
- [x] Complete the Melee Weapons family migration.
  - [x] Vicious Attack has one-target Reach validation, regular/Fantastic damage, a safe weapon-special-effect reminder, and the Free-JB2A `weapon.melee.swing` profile.
  - [x] Fast Attacks has one-or-two-target Reach validation, half/full multi-target damage scaling, one source-level Fantastic bonus-attack reminder, and the Free-JB2A `weapon.melee.swing` profile.
  - [x] Whirling Frenzy has Reach-scaled enemy-area targeting, 5 Focus spend/refund, half/full multi-target damage, per-target Fantastic weapon-effect reminders, and the centered Free-JB2A `weapon.melee.whirlwind` profile.
  - [x] Furious Attacks has one-or-two-target Reach validation, variable Focus scaling, actor-specific Melee multipliers, half/full damage, per-target Fantastic weapon-effect reminders, and the Free-JB2A melee weapon profile.
  - [x] Exploit binds to the latest unreserved outgoing Fantastic weapon hit, auto-targets that victim, attacks Resilience for 5 Focus, ignores Health Damage Reduction, doubles on a Fantastic success, and retains the weapon-effect reminder.
  - [x] Focused Fury has automatic Edge, variable Focus scaling, actor-specific Melee multipliers, regular/Fantastic damage, a target weapon-effect reminder, and the Free-JB2A melee weapon profile.
  - [x] Hit n Run starts with Edge, deals regular/Fantastic damage, reminds the source to move up to half Run Speed after a hit, and retains the Fantastic weapon-effect reminder.
  - [x] Riposte binds to the latest unreserved incoming close miss, auto-targets the attacker, deals regular/Fantastic damage, and retains the Fantastic weapon-effect reminder.
  - [x] Unstoppable Assault uses Reach-scaled enemy-area targeting, exact 15-Focus repeat activations, half/full damage, movement and weapon-effect reminders, centered whirlwind playback, and a combat-round ledger that excludes targets already affected by the same attacker.
  - Vicious Attack live gates passed for missing-target rejection, automatic regular damage, exact damage undo, Fantastic doubling, target-specific special-effect reminder, animation playback, and cleanup. Embedded copies were refreshed on Baron Zemo, Blade, Crossbones, Elsa Bloodstone, Kraven, Lady Bullseye, Lady Deathstrike, and Sabretooth.
  - Fast Attacks live gates passed for missing-target rejection, isolated one-target half damage, exact single-target undo, two-target Fantastic full damage, one-call multi-target undo, bonus-attack evaluation, animation playback, and cleanup. Embedded copies were refreshed on Lady Deathstrike, Northstar, Puck, Sabretooth, Wolverine, and the unlinked Northstar encounter token.
  - Whirling Frenzy live gates passed for exact 5-Focus spend/refund, two-enemy Reach-area selection, half regular damage, full Fantastic damage, per-target weapon-effect evaluation, centered whirlwind playback, one-call multi-target undo, and cleanup. Embedded copies were refreshed on Lady Deathstrike and Sabretooth.
  - The Focus-powered attack batch live-validated Furious Attacks at 14 Focus against two targets and Focused Fury at 9 Focus with automatic Edge. Both used Sabretooth's actual Melee damage multiplier, spent/refunded exact Focus, applied/undid exact damage, played semantic effects, and preserved Fantastic weapon-effect reminders alongside damage undo transactions. Furious Attacks and Focused Fury copies were refreshed on all owners.
  - Fast Attacks and Martial Arts Fast Strikes no longer force a damage multiplier of 2; both now use the attacker's current Melee damage multiplier. Thirty-five world-actor copies and three unlinked-token copies affected by the grouped update were refreshed.
  - The reactions and mobility batch live-validated Exploit's automatic Fantastic-hit victim targeting, exact 5-Focus spend/refund, Resilience attack, zero applied Health Damage Reduction, duplicate-trigger rejection, damage undo, and trigger undo. Riposte auto-targeted the attacker after a close miss, rejected duplicate use, resolved Fantastic damage and its weapon-effect reminder, and undid cleanly. Hit n Run started at one Edge, applied regular and Fantastic damage, preserved both movement and weapon-effect reminders, and undid cleanly.
  - Exploit copies were refreshed on Blade, Karnak, Lady Deathstrike, and Sabretooth; Riposte copies were refreshed on Blade, Lady Deathstrike, and Sabretooth. Hit n Run had no existing owner and was live-gated through a temporary embedded copy that was removed during cleanup. Riposte's shared reaction lookup now permits a missed close attack with zero or negative hypothetical damage when the reaction makes its own attack, while response-damage reactions retain their positive-damage requirement.
  - Unstoppable Assault completed the family. Live gates verified exact 15-Focus spending, half damage to every enemy within Reach, rejection of a repeat with only already-affected targets before Focus spend, filtering an already-affected enemy while allowing a newly reached enemy, exact repeat Focus spending, next-round eligibility reset, full Fantastic damage, per-target weapon-effect reminders, damage undo, Focus refunds, and cleanup. Sabretooth's embedded copy was refreshed.
- [ ] Complete the Ranged Weapons family migration.
  - [x] Double Tap has one-target two-space validation, regular/Fantastic damage, Fantastic bleeding, and generic projectile playback.
  - [x] Snap Shooting has one-or-two-target selection, half/full damage, per-target Fantastic bleeding, and generic projectile playback.
  - [x] Weapons Blazing accepts one or two targets, deals half/full damage, records its Fantastic bonus-attack reminder, and plays the generic projectile profile.
  - [x] Stopping Power has one-target validation, exact 5-Focus spend/refund, regular/Fantastic damage, a same-target bonus-attack reminder, and generic projectile playback.
  - [x] Covering Fire, Return Fire, and Suppressive Fire redirect damage to Focus after applying Health Damage Reduction, double on a Fantastic success, and apply one round of `stunned` only when Focus is actually lost. Return Fire reserves the latest incoming attack and auto-targets its attacker.
  - [x] Point-Blank Parry binds the latest incoming miss, auto-targets the attacker, enforces an enemy within two spaces, spends 5 Focus, deals regular/double damage, and applies Fantastic bleeding. Kill Zone spends 15 Focus against a visible moving enemy, deals regular/double damage, excludes each successfully affected target for the rest of the round, and reminds the player to regain the spent reaction.
  - [x] Dance of Death and Orchestra of Overkill use source-centered five-space and ten-space enemy areas with line-of-sight checks, exact 10/15-Focus costs, per-target Agility defense, half/full damage, Fantastic bleeding, and one generic projectile animation per target.
  - [ ] Headshot and Sniping precision group.
  - [ ] Slow-Motion Shoot-Dodge mobility group.
  - [ ] Fast Hands passive.
  - The rapid-fire batch live-validated Double Tap's 108 Fantastic damage and projectile playback; one-target Weapons Blazing for 37 half damage; two-target Fantastic Snap Shooting for 54 damage and bleeding on each target; and Stopping Power's exact 5-Focus transaction, 104 Fantastic damage, projectile playback, and bonus-attack reminder. All damage, statuses, Focus, actor data, messages, targets, and tokens were restored or removed.
  - Ten embedded copies were refreshed across Blade, Crossbones, Elsa Bloodstone, Gambit, Hawkeye, and Mystique.
  - The Focus-damage batch live-validated Health Damage Reduction with unchanged Health, Focus-only loss, Fantastic doubling, one-round `stunned`, clean status undo, no stun at zero Focus, Return Fire attacker binding, corrected Covering Fire Vigilance defense, and generic projectile profiles. Gambit's embedded Suppressive Fire copy was refreshed, and all temporary actors and messages were deleted.
  - The reaction batch live-validated Point-Blank Parry's missed-attack binding, exact 5-Focus parsing, two-space enemy targeting, regular/Fantastic damage, bleeding apply/undo, and projectile profile. Kill Zone validated exact 15-Focus parsing, enemy line-of-sight targeting, regular/Fantastic damage, hit-or-miss reaction-refund reminder, current-round exclusion, next-round reset, and projectile profile. Gambit's Point-Blank Parry copy was refreshed, and temporary actors and messages were deleted.
  - The area batch replaced inappropriate Gambit-specific card effects with generic gunshot projectiles fired independently at every target. Live gates selected two visible enemies inside Dance of Death's five-space radius and an additional enemy inside Orchestra of Overkill's ten-space radius while excluding the source and ally; Dance applied full Fantastic damage and bleeding to both targets, played two stretched projectiles, and undid both statuses cleanly. Gambit's Dance of Death copy was refreshed, and temporary actors and messages were deleted.
- [ ] Complete the prose-power condition audit, skipping powers with existing structured events and assigning every new status outcome to the source, target, or both as required.
  - Deterministic hit, Fantastic-hit, and Health-damage-gated source/target applications are complete for 44 records.
  - Deafen now applies `deafened` for one round on a hit and deals regular damage only on a Fantastic success. Double Tap, Point-Blank Parry, and Snap Shooting apply `bleeding` on a Fantastic success; their directly coupled targeting and regular/Fantastic damage structures are explicit, including Snap Shooting's one-or-two-target half/full scaling.
  - Live gates verified Deafen's exact 5-Focus spend, zero ordinary-success damage, one-round status lifecycle, active-combat selection, and expiration cleanup. Fantastic Double Tap dealt double damage, applied manual-duration bleeding, and supported condition and damage undo. Nine embedded Ranged Weapons copies were refreshed and all temporary data was removed.
  - Remaining applications require optional-choice controls, third-party recipients, delayed movement/reaction triggers, area-entry checks, or a canonical ruling for `pinned`.
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