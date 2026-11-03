# Changelog

All notable changes to the Marvel Multiverse Foundry system should be documented in this file.

## [Unreleased]

## [3.15.0] - 2026-11-03

### Added
- Added non-combat ability checks, initiative, power search, collapsible power-set categories, and per-power concentration controls to Quick Actions.
- Added a compact, consistent icon language for abilities, power-set categories, resources, action timing, and Focus costs without requiring unique artwork for every power.

### Changed
- Reduced the Quick Actions footprint while preserving readable names, values, action types, and costs.
- Widened the white Damage formula containers by five pixels to align their right inset with the surrounding comic-sheet panel.

## [3.14.0] - 2026-11-03

### Added
- Added the standard `npm test` command so the complete native regression suite is available to development, CI, and release workflows.
- Added regression coverage for Foundry 14 roll-message mode normalization.

### Changed
- Updated roll chat creation to use Foundry 14 `messageMode` without changing the system's existing public, GM, blind, or self-roll behavior.
- Made the comic character sheet switch to a stacked dashboard when its window is narrowed, preventing clipped statistics and damage controls.
- Raised the quick actions HUD above ordinary application windows while ensuring its roll dialogs remain unobstructed.

## [3.13.0] - 2026-11-02

### Changed
- Removed the experimental resource-restoration API introduced only for native Wall destruction and returned the public mutation boundary to the stable 3.11.0 surface.
- Supersedes 3.12.0 without changing power automation, animation semantics, destructible Actor profiles, or existing world data.

## [3.11.0] - 2026-11-02

### Added
- Verified Free/Patreon JB2A curse and ice profiles for explicitly cursed and frozen power outcomes.
- Regression coverage that rejects misleading animation assignments for passive traits, temporal effects, absorption, taunts, DNA transformation, and power copying or suppression.

### Changed
- Specialized Flames of the Faltine, Icy Tendrils, Jinx, Hex Bolt, Probability Manipulation Hex, and Penance Stare with behavior-appropriate fire, ice, curse, fortune, and psychic profiles.
- Removed visible animations from powers whose passive, temporal, absorptive, verbal, biological, copying, or suppression behavior has no appropriate installed JB2A asset.
- Reduced semantic animation references from 534 to 460 by preferring no visual over a misleading generic effect.

## [3.10.0] - 2026-11-02

### Added
- Twelve distinct original system-owned SVG portraits and prototype-token images for Wooden Door, Reinforced Door, Brick Wall Section, Streetlight, Fire Hydrant, Dumpster, Motorcycle, Car, Truck, Small Building Section, Large Building Section, and Reinforced Concrete Wall.
- Regression coverage requiring every destructible profile to use a unique readable SVG and matching portrait/token artwork.

### Changed
- Replaced the four shared category placeholders so destructible objects are immediately distinguishable on the canvas and in the Actor compendium.

## [3.9.0] - 2026-11-02

### Added
- Persistent Webtrapping Regions with explicit one-to-five connected-space placement, entry and turn-start Agility checks, non-duplicating paralysis, Melee escape checks, undo support, and active-owner/GM execution.
- Explicit Spider-Pheromones circumstance choices for the applicable Ego (Intimidation) or Ego (Persuasion) Edge without inferring attraction, gender, or proximity.
- Concentration-owned anchor Regions for Darkness, Silence Area, Static Illusion, Animated Illusion, and Grand Illusion, including objective placement, maintenance-range, line-of-sight, replacement, deletion, and undo handling.
- Regression coverage for persistent-area triggers, escape metadata, pheromone choice scoping, maintained Illusion anchors, and linked and unlinked Tokens.

### Changed
- Arbitrary web placement, sensory mutation, illusion geometry, perception, interaction, movement, and reveal adjudication remain explicit player or Narrator decisions rather than unsafe scene mutation.
- The remaining persistent web, aura, maintained-effect, and deterministic prose-condition migration is complete.

## [3.8.0] - 2026-11-02

### Added
- Structured family metadata, passive tiers, utility activation, reaction outcomes, safe manual boundaries, and semantic animation profiles for all forty-six Basic powers.
- Automatic alternate-defense selection for Brawling, Evasion, Integrity, and Wisdom.
- Energy Absorption damage restoration and Focus conversion capped at twice maximum Focus, Resilience-based Healing Factor recovery, Group Flight targeting, Inspiration's all-check edge, Slow-Motion Dodge defense trouble, and complete Wisecracker damage and status automation.
- Fourteen semantic Basic animation aliases and regression coverage for every Basic record, tier, transferred effect, event schema, target limit, defense substitution, conversion cap, manual boundary, and animation alias.

### Changed
- Anger's dynamic ability changes, Combat Trickery's die replacement, disguises, iconic weapons, chosen environmental protections, heightened-sense interpretation, Group Flight token movement, and Shape-Shift forms remain explicit where automatic actor or scene mutation would be unsafe.
- The Item DataModel now preserves Basic family metadata on imported and embedded powers.

### Fixed
- Corrected Discipline 2's printed bonus, Mighty 1's self-prerequisite, Mighty 2's lifting progression, and Flight's malformed movement calculation effects.
- Removed Energy Absorption's copied trigger and Focus cost from Environmental Protection.
- Corrected malformed punctuation, wording, and OCR errors across Accuracy 1 and 4, Additional Limbs, Brawling, Brilliance 4, Disguise, Evasion, Healing Factor, Heightened Senses, Reinforced Skeleton, Shape-Shift, Wisdom, and Wisecracker.

## [3.7.0] - 2026-11-02

### Added
- Structured activation, targeting, damage, concentration, family metadata, and safe manual boundaries for all twenty-eight Magic powers.
- Exact automation for variable-Focus Bolts of Balthakk, Fantastic-only Flare damage, Magic conditions, grabbed-target drains, zero-Focus Possession eligibility, dual-mode Vapors of Valtorr, and Rank-scaled ranges and areas.
- Declarative target-tag damage scaling, used by Penance Stare to halve automatic Focus damage against Heroic targets.
- Nine semantic Magic animation aliases for astral projection, attacks, impacts, bindings, hexes, mist, portals, sensing, and shields.
- Regression coverage for every Magic record, event schema, attack configuration, condition duration, utility target limit, manual boundary, animation alias, and Heroic damage scale.

### Changed
- Concentration-breaking choices, possession behavior, illusory duplicate control, vehicle mutation, simulated powers, dynamic defenses, environmental restrictions, portal placement, and subjective supernatural interpretation remain explicit rather than mutating actors or scenes unsafely.
- The Item DataModel now preserves Magic family metadata on imported and embedded powers.

### Fixed
- Corrected copied summaries for Brain Drain, Hex Bolt, and Sense Supernatural, plus malformed Astral Form, Bolts of Balthakk, Flames of the Faltine, and Flare wording.
- Corrected Bolts of Balthakk to use a ranged Ego attack with Agility-based damage, Flare to deal regular rather than half damage on a Fantastic success, and Mists of Morpheus to replace stunned with unconscious on a Fantastic success.
- Corrected Penance Stare's Rank-scaled range and Heroic half-damage handling, Winds of Watoomb's Ego defense contest, and Possess Vehicle's Rank-based damage and control range.

## [3.6.0] - 2026-11-02

### Added
- Structured family metadata, event outcomes, safe manual boundaries, and semantic animation profiles for all three Narrative powers.
- Permanent Corrupting Touch markers gated by a successful damaging Melee hit, with explicit Heroic/Villainous, Karma, domination, and escape reminders.
- Optional self/one-target DNA Manipulation activation and replaceable Magic Mask wearer markers with complete capability metadata.
- Regression coverage for Narrative targeting, source corrections, event schemas, semantic aliases, and universal action-roll damage events.

### Fixed
- Corrected Magic Masks' invalid leading-space document ID, copied Corrupting Touch summary, and missing punctuation.
- Corrected DNA Manipulation's malformed sentence.
- Universal action-roll damage now emits the canonical damage-applied hook and records both Token and Actor identities, allowing damage-gated power events to resolve against their actual hit target.

## [3.5.0] - 2026-11-02

### Added
- Structured activation, targeting, damage, concentration, family metadata, and semantic animation profiles for all eighteen Elemental Control powers.
- Conditional Elemental Protection absorption that preserves the protection at or below its threshold, breaks it above the threshold, and applies only excess Health damage.
- Tier-derived 5-Focus choices for Elemental Sphere and Elemental Prison, plus exact Health-to-Focus transfer and undo for Elemental Reinforcement.
- Regression coverage for elemental attacks, areas, grabs, suffocation, protection tiers, Focus scaling, Reinforcement, and safe manual boundaries.

### Changed
- Elemental special effects remain explicit reminders because their outcome depends on the element configured on each actor-owned power.
- Elemental Sphere, Prison, Barrier, Infusion, and Protection effects now use concentration-owned markers and cleanup.

### Fixed
- Corrected Elemental Protection 4 to require Elemental Protection 3 and Rank 5, cost 20 Focus, and absorb 40 damage.
- Corrected Elemental Push's missing 1-space-per-Rank movement value and malformed punctuation.
- Corrected Elemental Ricochet's display name, copied typos, cumulative range reminder, and Fantastic repeat boundary.
- Prevented hydrated empty tier metadata from capping unrelated variable-Focus powers at zero.
- Corrected unlimited Focus-scaling dialog text so it no longer displays a `null` limit.

## [3.4.0] - 2026-11-02

### Added
- Structured activation, targeting, Focus, event, family metadata, and semantic animation profiles for all sixteen Omniversal Travel powers.
- Regression coverage for self, together, other, portal, Time-Out, and Instant Replay workflows.
- Variable Focus support for costs paid in fixed per-round increments, including exact 15-Focus Time-Out round blocks.

### Changed
- Dimensional, Multiversal, and Time travel destinations remain Narrator-controlled rather than moving tokens across scenes, universes, or timelines automatically.
- Time-Out variants create reversible manual-duration markers without freezing every world Actor or changing combat turns automatically.

### Fixed
- Corrected Time Travel's copied reaction trigger and malformed effect text to use its intended standard-or-movement travel workflow.
- Preserved Omniversal Travel family metadata when powers are imported or embedded on actors.

## [3.3.0] - 2026-11-02

### Added
- Structured automation and semantic effect-profile aliases for the Plasticity power family.
- Regression tests for Plasticity targeting, concentration effects, damage, conditions, and manual-rule boundaries.
- Structured Power Control activation and attack workflows with safe manual resolution for copied, boosted, dampened, stolen, and swapped abilities.
- A Destructible Objects Actor compendium with twelve neutral NPC-backed token profiles for walls, doors, street objects, vehicles, and building sections.
- Original system-owned token artwork and regression coverage for destructible profile Health, Damage Reduction, defenses, token bars, and manifest registration.

### Fixed
- Body Sheet and Stilt Steps now grant concentration-owned effects rather than permanent transferred effects.
- Corrected Rubberneck's copied description and Flexible Fingers' description typo.
- Restored legacy weapon damage inference when Foundry hydrates optional damage configuration to an empty object.
- Preserved Plasticity and Power Control family metadata when powers are imported or embedded on actors.
- Bumped the system and package version from 3.2.1 to 3.3.0; release validation now keeps the Foundry manifest, package metadata, lockfile, and download URL in sync.

## [3.2.1] - 2026-10-08

### Changed
- Consolidated the canonical system repository, issue tracker, manifest, releases, and documentation under `DeadEzrah` on GitHub.
- Replaced GitLab package publishing with a repository-owned GitHub Release script.

## [3.2.0] - 2026-10-08

### Added
- Condition automation for 18 additional power records, including escape-based grabs and webs, damage-gated stuns, and previously incomplete attack metadata.
- Regression coverage proving damage-gated conditions require positive matching damage and preserve Fantastic-hit requirements.
- Public `applyDamage` and `applyStatus` system APIs for encounter-authored Health damage, Focus damage, and actor conditions.
- Regression coverage for direct damage reduction, invalid damage rejection, condition aliasing, deduplication, and removal.

## [3.1.0] - 2026-10-08

### Added
- Native Basic, Darkvision, Light Amplification, Monochromatic, and Tremorsense/Radar Sense token vision controls, plus five-foot personal vision and Torch/Flashlight lighting in the Token HUD.
- CI validation for semantic effect profiles declared by compendium sources, embedded granted items, and automation presets.
- Structured condition outcomes for 22 additional powers, including target, source, and self-and-target recipients.
- Recipient regression coverage for source deduplication and self-and-target condition application.

### Changed
- Source outcomes now apply once per event regardless of selected target count.
- Self-and-target outcomes now create separate source and target applications.

### Fixed
- Corrected the setup artwork filename used by the Foundry system manifest.
- Preserved the structure-collapse effect-profile fallback during semantic validation.

## [3.0.0] - 2026-08-02

### Added
- Structured and expanded condition automation tracking and audit documentation.
- Blinded token sight automation with reversible undo behavior.
- Shared mutation permission preflight helper.
- Multiplayer GM/player smoke-test script artifacts and expanded result templates.
- Circumstance tagging support for condition modifier evaluation across item, sheet, and macro roll entry points.

### Changed
- Condition application target eligibility now strictly uses hit/fantastic-hit targets when attack outcomes are resolved.
- Readiness and compliance documentation updated to reflect current implementation state and pending authority lock items.

### Notes
- Official condition timing/eligibility authority lock remains in progress pending page-level citation extraction from official rules PDFs.
