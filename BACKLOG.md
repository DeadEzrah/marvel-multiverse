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

## Telepathy Powers

Completed in related batches with local, build, deployment, live, and cleanup gates after each batch.

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
- [x] Complete the Ranged Weapons family migration.
  - [x] Double Tap has one-target two-space validation, regular/Fantastic damage, Fantastic bleeding, and generic projectile playback.
  - [x] Snap Shooting has one-or-two-target selection, half/full damage, per-target Fantastic bleeding, and generic projectile playback.
  - [x] Weapons Blazing accepts one or two targets, deals half/full damage, records its Fantastic bonus-attack reminder, and plays the generic projectile profile.
  - [x] Stopping Power has one-target validation, exact 5-Focus spend/refund, regular/Fantastic damage, a same-target bonus-attack reminder, and generic projectile playback.
  - [x] Covering Fire, Return Fire, and Suppressive Fire redirect damage to Focus after applying Health Damage Reduction, double on a Fantastic success, and apply one round of `stunned` only when Focus is actually lost. Return Fire reserves the latest incoming attack and auto-targets its attacker.
  - [x] Point-Blank Parry binds the latest incoming miss, auto-targets the attacker, enforces an enemy within two spaces, spends 5 Focus, deals regular/double damage, and applies Fantastic bleeding. Kill Zone spends 15 Focus against a visible moving enemy, deals regular/double damage, excludes each successfully affected target for the rest of the round, and reminds the player to regain the spent reaction.
  - [x] Dance of Death and Orchestra of Overkill use source-centered five-space and ten-space enemy areas with line-of-sight checks, exact 10/15-Focus costs, per-target Agility defense, half/full damage, Fantastic bleeding, and one generic projectile animation per target.
  - [x] Headshot applies automatic Trouble, exact 15-Focus spending, double ordinary or triple Fantastic damage, actual-Health-damage-gated one-round stun, and projectile playback. Sniping enforces an enemy at least 20 spaces away, spends 5 Focus, deals regular/triple damage, records its no-movement reminder, and plays the projectile profile.
  - [x] Slow-Motion Shoot-Dodge accepts one or two enemy targets, spends 10 Focus, deals half/full damage with the attacker's actual Agility multiplier, records one Fantastic bonus-attack reminder, applies Trouble only to attacks against Agility defense, and falls prone when moved or at the start of the source's next turn.
  - [x] Fast Hands exposes one additional reaction restricted to Ranged Weapons powers through a permanent transferred allowance. Full consumption remains unenforced until the system tracks reaction economy.
  - The rapid-fire batch live-validated Double Tap's 108 Fantastic damage and projectile playback; one-target Weapons Blazing for 37 half damage; two-target Fantastic Snap Shooting for 54 damage and bleeding on each target; and Stopping Power's exact 5-Focus transaction, 104 Fantastic damage, projectile playback, and bonus-attack reminder. All damage, statuses, Focus, actor data, messages, targets, and tokens were restored or removed.
  - Ten embedded copies were refreshed across Blade, Crossbones, Elsa Bloodstone, Gambit, Hawkeye, and Mystique.
  - The Focus-damage batch live-validated Health Damage Reduction with unchanged Health, Focus-only loss, Fantastic doubling, one-round `stunned`, clean status undo, no stun at zero Focus, Return Fire attacker binding, corrected Covering Fire Vigilance defense, and generic projectile profiles. Gambit's embedded Suppressive Fire copy was refreshed, and all temporary actors and messages were deleted.
  - The reaction batch live-validated Point-Blank Parry's missed-attack binding, exact 5-Focus parsing, two-space enemy targeting, regular/Fantastic damage, bleeding apply/undo, and projectile profile. Kill Zone validated exact 15-Focus parsing, enemy line-of-sight targeting, regular/Fantastic damage, hit-or-miss reaction-refund reminder, current-round exclusion, next-round reset, and projectile profile. Gambit's Point-Blank Parry copy was refreshed, and temporary actors and messages were deleted.
  - The area batch replaced inappropriate Gambit-specific card effects with generic gunshot projectiles fired independently at every target. Live gates selected two visible enemies inside Dance of Death's five-space radius and an additional enemy inside Orchestra of Overkill's ten-space radius while excluding the source and ally; Dance applied full Fantastic damage and bleeding to both targets, played two stretched projectiles, and undid both statuses cleanly. Gambit's Dance of Death copy was refreshed, and temporary actors and messages were deleted.
  - The precision batch added an explicit Fantastic damage scale and reusable minimum-range validation. Live gates verified Headshot's automatic Trouble, exact 15-Focus parsing, 14/21 double/triple damage, actual-damage-gated one-round stun and undo; Sniping's exact 5-Focus parsing, 7/21 regular/triple damage, exact-20-space acceptance, 19-space rejection, no-movement reminder, and projectile playback. Bullseye's and Hawkeye's Sniping copies were refreshed, and temporary actors and messages were deleted.
  - The final mobility/passive batch live-validated Slow-Motion Shoot-Dodge's one-or-two-target configuration, exact 10-Focus parsing, actual Agility multiplier, half/full damage, one source-level Fantastic reminder, Agility-defense-only Trouble, movement and next-turn prone lifecycle, generic movement sound, and one projectile per target. The registered token-movement hook was exercised with a temporary scene token. Fast Hands resolved to two total Ranged Weapons reactions without double-counting its transferred effect. Gambit's embedded Slow-Motion Shoot-Dodge was refreshed, and all temporary actors, tokens, effects, statuses, and messages were deleted.
- [x] Complete the Super-Strength family migration.
  - [x] Banging Heads requires exactly two enemies within Reach, gates all damage on both defenses being hit, deals full non-doubling damage, and applies Fantastic `prone` to both targets.
  - [x] Clobber and Smash use one-target Reach validation, regular/double damage, and semantic punch/heavy-impact playback. Smash also starts with Edge, scales from selected Focus, and applies a one-round Fantastic `stunned` condition.
  - [x] Ground-Shaking Stomp uses a source-centered Rank-plus-Reach area, half/full damage, per-target Fantastic `prone`, and the Free-JB2A `strength.ground-stomp` profile. Unrelenting Smash uses a Reach area, half/full damage, once-per-round target exclusion, Fantastic `prone`, and a repeat/movement reminder.
  - [x] Crushing Grip requires a grappled enemy within Reach, attacks Resilience, and deals regular/double damage. Its `pinned` result remains an explicit manual reminder until the system has a canonical pinned status.
  - [x] Quick Toss attacks one enemy with Agility for regular/double damage and applies Fantastic `prone` to the impact target. The thrown person's damage, prone, placement, and Mighty/size range remain one explicit manual outcome because the workflow has no separate subject and impact-target roles.
  - [x] Immovable is a self utility activation with a knockback-reduction reminder; automatic reduction remains unsafe until knockback transactions are tracked.
  - [x] Jump 1-3 use ordered transferred overrides. Jump 1 matches base Run Speed; Jump 2 and Jump 3 use Rank times base Run Speed with 3x and 50x out-of-combat values without multiplying into 150x. Invalid legacy Jump 2/3 identity fields were corrected and covered by regression assertions.
  - The grouped live matrix passed 21/21 family-specific gates across exact targeting, all-target damage gating, Focus scaling, half/full and regular/double damage, conditions, reminders, area sizes, once-per-round data, effect profiles, and actual derived Jump movement. Every live Jump effect was recreated with valid IDs and priorities, affected embedded owners were refreshed, and the temporary macro and test messages were removed.
- [x] Complete the Weather Control family migration.
  - [x] Control Fog, Control Weather 1-4, Weather Chill, and Weather Warm use utility activation, source-owned concentration effects, structured environmental metadata, and explicit reminders for mile-scale rules that cannot be enforced safely through canvas-token targeting.
  - [x] Control Weather 2-4 spend exactly 10, 15, and 20 Focus. Starting another Weather Control concentration replaces and removes the prior owned effect; ending concentration removes both the marker and weather effect.
  - [x] Thunder targets every character in a ten-space source-centered area, deals no damage, applies `deafened` on a hit, and applies one-round `stunned` on a Fantastic hit.
  - [x] Eight semantic Free-JB2A-first profiles cover fog, rain, storm, thunderstorm, hurricane, centered thunder, chill, and warmth.
  - The installed-runtime matrix passed 6/6 gates for exact Focus spending, concentration creation, replacement and cleanup, Thunder's ordinary/Fantastic condition split, and complete outcome undo. All eight compendium powers and 12 embedded copies on Shaman, Storm, and Thor were refreshed; temporary actors, messages, and the GM gate macro were removed.
- [x] Complete the Healing family migration.
  - [x] Healing Hands and Soothing Touch transfer the selected variable Focus amount into target Health or Focus, enforce their 10-Focus minimum, and support exact undo and source refunds.
  - [x] Let's Go and Never Surrender remove `unconscious` or `demoralized`, create target-owned maintained support, end automatically when the guarded resource rises above 0, and restore the status if support ends while that resource remains at 0. Let's Go allows only movement actions; Never Surrender prevents Focus spending.
  - [x] Cure-All uses Ego vs TN 12, removes all listed curable statuses, and restores `unconscious` or `demoralized` targets to at least 1 Health or Focus. Historical condition-attributable Fantastic healing remains an explicit reminder.
  - [x] Restore uses Ego vs TN 20, restores 1 Focus on success or full Focus on a Fantastic success, removes `shattered`, and reduces the source to 1 Focus. Resurrect uses an editable TN starting at 10, restores 1 or full Health, removes `dead` and `unconscious`, reduces the source to 1 Focus, and refunds Focus spent above 20 on failure.
  - [x] Five semantic Free-JB2A-first profiles distinguish Focus restoration, curing, maintained support, Restore, and Resurrect while normal Health healing continues to use `power.healing.target`.
  - The installed-runtime matrix passed 12/12 gates for variable transfers, undo/refunds, maintained-effect restrictions and lifecycle, fixed-TN ordinary/Fantastic outcomes, status removal, resource floors/full restoration, and Resurrect's failure refund. All seven compendium powers and Shaman's embedded Healing Hands were refreshed; temporary actors, messages, staging data, and the GM gate macro were removed.
- [x] Complete the Luck family migration.
  - [x] Charmed Life offers one optional, non-stacking Edge per combat round; Real Jinx applies one non-stacking Trouble only to direct attacks against the character.
  - [x] Lucky Me, Lucky You, Wish You Luck, and Lucky Us apply universal non-stacking Edge through concentration, with exact 3/5/5/10-Focus activation and turn upkeep.
  - [x] Evil Eye, Jinx You, and Jinx You All apply universal non-stacking Trouble through concentration. Jinx You is a Melee-vs-Agility touch attack and deals standard, non-doubled Melee damage only on a Fantastic success.
  - [x] Rank-scaled utility targeting enforces ally/enemy filters, line of sight, Reach or five-spaces-per-Rank range, and one-target-per-Rank caps before Focus is spent.
  - [x] `luck.good` and `luck.jinx` resolve to verified Free JB2A Bless and Curse animations.
  - The installed-runtime matrix passed 10/10 gates for invalid-target rejection, Focus spending, universal Edge/Trouble, concentration cleanup, paid and unpaid upkeep, once-per-round usage, attack-only defense, Fantastic-only damage, and profile resolution. All nine compendium powers were refreshed; no world actors owned embedded Luck copies, and temporary actors, tokens, messages, and staging data were removed.
- [x] Complete the Translation family migration.
  - [x] Understand Body Language, Code, Sign Language, Spoken Language, Unusual Communication, and Written Language use Logic vs. TN 13 with an explicit optional related-language Edge and ordinary/Fantastic record reminders.
  - [x] The duplicate-mislabeled Understand Written Language source record was restored to its correct identity while retaining its canonical item ID.
  - [x] Detect Lie spends exactly 5 Focus, attacks a communicator's Ego defense without damage, and distinguishes knowing-lie detection from the Fantastic motive reveal.
  - [x] Indecipherable uses a permanent transferred immunity flag that blocks Mind Reading and Mind Interrogation before Focus is spent.
  - [x] Fixed target numbers are now declared in the Foundry Power data schema, and source-only non-attack checks emit success/Fantastic events without requiring a target. The same schema repair restored live TN 12/20/10 persistence for Cure-All, Restore, and Resurrect.
  - [x] `translation.comprehend` and `translation.detect-lie` resolve to verified Free JB2A Divination and Eyes animations.
  - The installed-runtime matrix passed 8/8 gates for all six fixed-TN checks, optional Edge presentation, ordinary/Fantastic outcomes, corrected identity, Detect Lie, both telepathic immunities, and profile resolution. All eight Translation and two coupled Telepathy compendium documents were refreshed; no world actors owned embedded Translation copies, and temporary actors, messages, and staging data were removed.
- [x] Complete the Phasing family migration.
  - [x] Phase Self, Quick Phase, Phase Other, and Phase Walk create concentration-owned intangible state. Physical attacks across the phased/unphased boundary are blocked before Focus spending, while mental attacks and interactions between phased characters remain available.
  - [x] Phase Walk activates Flight at Run Speed. Phase Object and Phase Other preserve their object-size, contact-chain, grab, forced-ejection, and disruption-damage rules as structured metadata or explicit reminders where canvas geometry cannot be adjudicated safely.
  - [x] Disrupt Electronics applies a one-turn electronic Tech Reliant disable marker. Disrupt Nerves deals no damage and applies `stunned` plus Fantastic `prone`. Disrupt Person ignores Health Damage Reduction, deals regular/double Melee damage, and applies one-round Fantastic `stunned`.
  - [x] Maintained phasing gives linked and unlinked tokens a reversible 62%-opacity cyan state plus an optional persistent Free-JB2A smoke shimmer. Original token opacity/tint is restored on effect deletion and scene/token lifecycle synchronization.
  - [x] Six semantic Phasing profiles resolve only to live-verified Free JB2A database entries.
  - Focused source gates passed 43/43, the installed Phase Self activation/outcome/concentration/visual gate passed, all nine compendium powers were refreshed, and temporary actors, tokens, messages, effects, and staging data were removed.
- [x] Complete the Teleportation family migration.
  - [x] All 14 records declare structured activation or opposed-check workflows, exact Focus costs, target limits, Rank-scaled ranges, destination requirements, concentration state, and safe manual movement boundaries.
  - [x] Blink Barrage applies one round of non-stacking Trouble to attacks. Teleport Other requires a grabbed target, uses Ego versus Vigilance, and explicitly deals no automatic damage. Swap Places and Swap Items use Ego versus Vigilance at two spaces per Rank and create concentration markers for their return state.
  - [x] Teleport 1, Teleport 2, Teleport Blind, Teleport Object, Teleport Together, Teleportal, Blink Defense, and Telespot preserve their combat/out-of-combat ranges and subjective destination, collision, projectile, and inventory rules as structured metadata and reminders rather than moving tokens or items without confirmation.
  - [x] The existing `movement.teleport` semantic profile covers every safe activation, hit, and Fantastic-hit phase. Focused source gates pass 8/8, the shared automation matrix passes 46/46, effect-profile validation passes, and the LevelDB pack build succeeds.
  - [x] Repair the corrupted **Swap Status** source from a public rules reference: 5 Focus, one visible target within two spaces per Rank, concentration, selective status categories, and a current-state return swap. Runtime mutation remains manual because safely transacting arbitrary resources, conditions, Occupation, traits, tags, defeat, and death requires explicit confirmation.
  - [x] Run installed Foundry gates for Focus spend/refund, invalid targets, opposed checks, concentration cleanup, Blink Barrage duration, animation playback, and every manual movement boundary; refresh embedded copies afterward.
  - The installed matrix verified exact 5-Focus Blink Barrage spending with Trouble apply/undo, exact 15-Focus Teleportal spending with concentration creation/cleanup, Teleport Other no-target rejection before Focus spending, Swap Places' Ego/Vigilance and Rank-scaled LoS contract, and the Free JB2A teleport profile. All 14 compendium records and seven embedded copies on Magik, Nightcrawler, and Nimrod were refreshed; temporary actors, messages, effects, and staging data were removed.
- [x] Complete the Super-Speed family migration.
  - [x] Correct Speed Run 2 to require Rank 3 and provide 50x out-of-combat speed without duplicating Speed Run 1's Rank multiplier. Speed Run 1 and Speed Swim use exact Rank multipliers and 3x noncombat overrides.
  - [x] Blazing Fast Fists grants Edge only to Melee attacks. Blur spends 5 Focus and imposes one round of non-stacking attack Trouble. Run on Water and Lightning Actions expose their permanent continuous-running, action-exchange, and initiative-Fantastic rules.
  - [x] Speed Blast deals no damage, targets one enemy within 10 spaces, applies one-round `stunned`, and applies Fantastic `prone` to the target rather than the source.
  - [x] Catch Bullets recognizes incoming physical projectiles from weapons and Ranged Weapons powers, supports tokenless attackers, and uses the triggering attack result—not the attacker's defense—as its editable TN. Attack nullification, ally-within-Reach interception, and Fantastic reaction return remain explicit where the global reaction queue is not owned by the system.
  - [x] Molecular Destabilization spends 15 Focus and records its object-size limit, two-space source-excluding blast, regular/double damage, and Fantastic Health DR bypass without unsafe object or area mutation.
  - [x] Six semantic profiles resolve to live-verified Free JB2A static-electricity, gust, wind-stream, and explosion entries.
  - The installed matrix verified Rank 3 Run 15/noncombat 50, Swim 9/noncombat 3, exact Blur Focus/effect/undo, Fantastic Speed Blast target-only conditions/undo, Catch Bullets TN 17 binding, and every semantic profile. All ten compendium powers and four embedded copies on Aurora, Northstar, and Quicksilver were refreshed; temporary data was removed.
- [x] Complete the Tactics family migration.
  - [x] Add exact source-ability target caps: Vigilance for Battle Plan and Rally on Me, Ego defense for Advance, Vigilance defense for Operations Center, and Rank for Scatter.
  - [x] Battle Plan grants selected allies non-stacking Edge until the source's next turn. Change of Plans grants a selected ally one universal Edge that is consumed by the triggering check.
  - [x] Keep Moving removes `demoralized` and `stunned`; On Your Feet removes `prone`; Hit the Dirt and Scatter apply `prone` only to the selected willing allies.
  - [x] Focus Fire creates a concentration-owned source marker. Operations Center grants concentration-owned non-stacking Edge to selected allies.
  - [x] Preserve earshot, once-per-battle use, optional movement, attack invalidation, Combat Support's forced Marvel die, Operations Center's movement-action break, and Rally on Me's post-movement Focus recovery as explicit structured boundaries where the system cannot safely adjudicate them.
  - [x] Eight semantic profiles resolve to live-verified Free JB2A blessing, wind, healing, eyes, and divination entries.
  - Focused gates pass 31/31 and the full repository passes 127/127. The installed matrix verified over-cap rejection before Focus spend, exact spend/refund, Edge and condition outcomes, concentration creation/cleanup, and every profile. All eleven compendium powers and 27 embedded copies were refreshed; temporary data was removed.
- [x] Complete the Telekinesis family migration.
  - [x] Levitation grants Flight equal to Run Speed. Group Levitation enforces one target per Rank, 5 spaces per Rank, exact Focus, and concentration-owned target markers.
  - [x] Telekinetic Attack uses exact Rank-scaled Logic-versus-Melee damage and Fantastic `stunned`. Crush requires `grappled` and maps pinned to `restrained`. Grab deals no automatic damage, applies concentration-owned `grappled`/`restrained`, and records Melee TN 20 escape.
  - [x] Telekinetic Barrier requires line of sight, remains non-damaging, records side choice and durability, and applies Fantastic `paralyzed`. Manipulation has an object-safe utility concentration boundary.
  - [x] Protection tiers create concentration-owned threshold 10/20/30/40 markers. Keep pre-hit interception and Reinforcement transfer bookkeeping explicit where the system cannot safely own the damage queue.
  - [x] Sphere uses a persistent source-centered Rank-scaled area and Fantastic-only damage. Toss disables unsafe automatic damage and separates the thrown-character and collision-target outcomes.
  - [x] Ten semantic profiles resolve to live-verified Free JB2A force-wall, shield, static-energy, impact, healing, divination, and gust entries.
  - Focused gates pass 34/34 and the full repository passes 136/136. The installed matrix verified movement, target caps, exact Focus, concentration markers/cleanup, damage safety contracts, and every profile. All fourteen compendium powers and nine embedded copies were refreshed; temporary data was removed.
- [x] Complete the Sixth Sense family migration.
  - [x] Cosmic Awareness and Detect Supers use concentration-owned markers and exact same-universe, 5-mile, 25-mile single-origin, and Special Training boundaries.
  - [x] Danger Sense transfers permanent bonus-round metadata. Intuition and Microscopic Awareness spend exact Focus and preserve Narrator-choice and microscopic-analysis boundaries.
  - [x] Correct Postcognition numbering/prerequisites and encode its six-hour, 24-hour, year, century, 24-hour-window, and week-window progression.
  - [x] Correct Precognition 2 to Rank 3 and encode every Reach, 1-mile, 100-mile, and 1,000-mile future horizon without fabricating Narrator answers.
  - [x] Six semantic profiles resolve to live-verified Free JB2A divination, eyes, blessing, static-energy, and misty-vision entries.
  - Focused gates pass 31/31 and the full repository passes 142/142. The installed matrix verified exact Focus, concentration, permanent metadata, optional subject caps/storage, tier horizons, and every profile. All thirteen compendium powers were refreshed; no embedded world copies existed and temporary data was removed.
- [x] Complete the Resize family migration.
  - [x] Grow 1-4 and Shrink 1-4 create reversible source-owned size effects while preserving each actor's base size. Full Little-through-Gargantuan defense, growing Run/Reach, and growing melee-damage modifiers derive from the active size.
  - [x] Correct Grow 2 to require Grow 1 and reach Gigantic. Correct Resize Object and Resize Other to require Grow 2 or Shrink 2 and Rank 3.
  - [x] Growing Attack uses destination-size damage and Fantastic `stunned`. Shrinking Dodge gives one source-independent Trouble to the selected triggering attacker.
  - [x] Resize Other enforces one target and records the Reach/grapple boundary. Object choice, target size choice, owned-tier limits, and dimensional destinations remain explicit where Foundry cannot safely adjudicate them.
  - [x] Five semantic profiles resolve to live-verified Free JB2A healing, misty-step, impact, and static-electricity entries.
  - Focused gates pass 31/31 and the full repository passes 148/148. The installed matrix verified reversible sizes, derived combat modifiers, one-use Trouble, target caps, exact Focus, and every profile. All fourteen compendium powers and nine embedded copies were refreshed with IDs preserved; temporary data was removed.
- [x] Complete the Shield Bearer family migration.
  - [x] Shield 1-4 grant concentration-owned DR 1-4 instead of permanent transferred DR. Correct Shield 4's tier number and restore the empty Do This All Day record.
  - [x] Brace for Impact uses exact variable-Focus physical-damage mitigation. Shield Deflection and Hurled Shield Deflection apply one-use Trouble, while Shield Wall applies concentration-owned non-stacking defensive Trouble.
  - [x] Shield Bash and Hurled Shield Bash use exact targeting, damage, and Fantastic `prone`. Rico-Shield preserves regular Fantastic damage and explicit repeat/range boundaries.
  - [x] Hurled Shield Block derives temporary ally DR from the source's highest Shield tier. Thrown-shield return timing and Shield unavailability remain explicit until a universal action/equipment ledger exists.
  - [x] Nine semantic profiles resolve to live-verified Free JB2A round-shield melee, throw, return, guard, wall, deflection, impact, healing, and bracing entries.
  - Focused gates pass 32/32 and the full repository passes 155/155. The installed matrix verified concentration DR/undo, defensive Trouble, tier-derived ally DR, exact Focus, and every profile. All fourteen compendium powers and ten Captain America embedded copies were refreshed with IDs preserved; legacy effects and temporary data were removed.
- [x] Complete the Spider-Powers family migration.
  - [x] Correct Jump, Wallcrawling, Webgliding, and Webslinging movement calculations.
  - [x] Structure web attacks, escape TNs, persistent terrain, Spider-Strike scaling, Spider Sense, Spider-Dodge, and all Venom powers.
  - [x] Preserve creative/object, attraction, movement, upkeep, and area-entry decisions as explicit boundaries.
  - [x] Twelve semantic profiles resolve to live-verified Free JB2A web, bioelectric, impact, wind, dodge, and aura entries.
  - Focused gates pass 32/32 and the full repository passes 162/162. All twenty compendium powers and nine embedded Spider-Man copies were refreshed with IDs preserved; temporary data was removed.
- [x] Complete the Telepathy family migration.
  - [x] Preserve all opposed checks, target prerequisites, future-roll modifiers, group caps, Focus damage, Fantastic conditions, and safe manual boundaries across all twenty-seven powers.
  - [x] Automate Astral Form's Rank-times-Run Flight and 10-times noncombat movement with concentration and undo.
  - [x] Automate Mental Shelter's required targets, 5-spaces-per-Rank range, and concentration-owned Focus Damage Reduction from the source's highest Uncanny tier.
  - [x] Give every Telepathy power a live-verified Free JB2A semantic profile.
  - Focused gates pass 21/21 and the full repository passes 169/169. All twenty-seven compendium powers and thirty-five embedded world copies were refreshed with IDs preserved; six renamed character-specific copies retained their display names. Temporary data was removed.
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