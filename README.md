# Marvel Multiverse for Foundry VTT

![Marvel Multiverse system artwork](ui/official/mmrpg-repo.jpg)

An unofficial Foundry Virtual Tabletop system for the Marvel Multiverse Role-Playing Game.

This maintained fork provides character and item sheets, Marvel dice, action workflows, damage and condition automation, semantic visual-effect integration, and public APIs used by the companion encounter modules.

## Project Status

| Component | Current target |
|---|---|
| Marvel Multiverse system | 3.11.0 |
| Foundry VTT | 12-14; verified on 14.365 |
| Primary branch | [`main`](https://github.com/DeadEzrah/marvel-multiverse/tree/main) |
| Issue tracker | [GitHub issues](https://github.com/DeadEzrah/marvel-multiverse/issues) |

The GitHub repository above is the canonical home for this fork. Installation and development documentation in this repository describes this branch, not an upstream release.

> **Canonical host:** Use only `github.com/DeadEzrah` for active suite repositories, issues, manifests, releases, and documentation. The former `wboyea63-group` GitLab project is retired and exists only as a migration redirect; do not clone, publish, or install from it.

## Install

For the current development build and the complete optional encounter suite, follow the [installation guide](docs/INSTALLATION.md).

The system manifest is:

```text
https://raw.githubusercontent.com/DeadEzrah/marvel-multiverse/main/system.json
```

## Companion Projects

The system works on its own. These optional companion projects add encounter orchestration and reusable encounter content:

| Project | Purpose | Repository |
|---|---|---|
| Marvel Encounter Framework | Clocks, objectives, phases, scene orchestration, damage/status actions, and optional VFX | [GitHub](https://github.com/DeadEzrah/marvel-encounter-framework) |
| Marvel Encounter Packs | Reusable encounters for the framework | [GitHub](https://github.com/DeadEzrah/marvel-encounter-packs) |
| Marvel Character Library | Actor compendiums used by reinforcement-enabled encounter packs | [GitHub](https://github.com/DeadEzrah/marvel-character-library) |

The companion module manifests are:

```text
https://raw.githubusercontent.com/DeadEzrah/marvel-encounter-framework/main/module.json
https://raw.githubusercontent.com/DeadEzrah/marvel-character-library/main/module.json
https://raw.githubusercontent.com/DeadEzrah/marvel-encounter-packs/main/module.json
```

Optional visual integrations include Sequencer, JB2A, PSFX, and FXMaster. Missing visual modules never prevent rules or encounter progression.

The public Character Library contains only original, generic, or redistribution-approved content. Recognizable or uncertain personal campaign conversions should remain in a separate private/local vault; public suite packages must never require or reference that vault.

## Destructible Objects

The **Destructible Objects** Actor compendium provides neutral, unlinked NPC token profiles for walls and doors, street objects, vehicles, and large structure sections. Import a profile, place its token, and target it with ordinary attacks; Health, Damage Reduction, defenses, token bars, and damage application use the same workflow as every other NPC.

The supplied durability values are editable Narrator-ready starting points, not a replacement for an official ruling. Destroying a token does not automatically delete Foundry Wall or Tile documents, trigger a collapse, or create debris. The Narrator should hide or remove matching scene geometry when appropriate.

## Documentation

- [Documentation home](docs/DOCUMENTATION-HOME.md)
- [Installation and updates](docs/INSTALLATION.md)
- [Automation architecture](AUTOMATION.md)
- [Current backlog](BACKLOG.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

Repository documentation is the source of truth because it is versioned with each code change. Add tutorials, examples, and FAQs under `docs/` so the complete documentation remains in the canonical GitHub repository.

## Development

Requirements:

- Node.js and npm
- A licensed Foundry VTT installation

Common commands:

```powershell
npm install
npm run build
npm run validate:effects
npm run validate:release
```

Focused native Node regression tests live in `tests/`:

```powershell
node --test tests\*.test.mjs
```

Do not commit licensed rules text or proprietary sourcebook content. Compendium and automation data must contain only content the contributor is authorized to distribute.

## Legal Notice

This is a fan-made software project and is not associated with Marvel Entertainment, LLC, The Walt Disney Company, or their partners.

The system contains no official RPG rules text and is not a substitute for the Marvel Multiverse Role-Playing Game books. You must purchase the official publications needed for your game.

The software component is distributed under the [MIT License](LICENSE.txt).

## Original Project Support

Support the original system creator:

- [Ko-fi](https://ko-fi.com/mjording)
- [Rollbones on Patreon](https://patreon.com/rollbones)
