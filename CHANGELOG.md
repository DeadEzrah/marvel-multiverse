# Changelog

All notable changes to the Marvel Multiverse Foundry system should be documented in this file.

## [Unreleased]

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
