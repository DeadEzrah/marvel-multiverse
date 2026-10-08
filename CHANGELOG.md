# Changelog

All notable changes to the Marvel Multiverse Foundry system should be documented in this file.

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
