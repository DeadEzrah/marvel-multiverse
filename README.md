# Marvel Multiverse for Foundry VTT

![Marvel Multiverse system artwork](ui/official/mmrpg-repo.jpg)

An unofficial Foundry Virtual Tabletop system for the Marvel Multiverse Role-Playing Game.

This maintained fork provides character and item sheets, Marvel dice, action workflows, damage and condition automation, semantic visual-effect integration, and public APIs used by the companion encounter modules.

## Project Status

| Component | Current target |
|---|---|
| Marvel Multiverse system | 3.2.1 |
| Foundry VTT | 12-14; verified on 14.365 |
| Primary branch | [`main`](https://github.com/DeadEzrah/marvel-multiverse/tree/main) |
| Issue tracker | [GitHub issues](https://github.com/DeadEzrah/marvel-multiverse/issues) |

The GitHub repository above is the canonical home for this fork. Installation and development documentation in this repository describes this branch, not an upstream release.

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

Optional visual integrations include Sequencer, JB2A, PSFX, and FXMaster. Missing visual modules never prevent rules or encounter progression.

## Documentation

- [Installation and updates](docs/INSTALLATION.md)
- [Automation architecture](AUTOMATION.md)
- [Current backlog](BACKLOG.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

Repository documentation is the source of truth because it is versioned with each code change. The GitHub Wiki can hold collaborative notes and tutorials; stable installation and API documentation should link back to these versioned files.

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
