# Expansion Coverage Audit

This audit compares the system's distributable data and rule support with the publicly advertised features of the X-Men, Spider-Verse, Avengers, and Secret Wars expansions. It records feature categories and implementation status only. It does not reproduce sourcebook rules, character profiles, or other licensed text.

Audit date: November 6, 2026.

## Status Definitions

- **Supported**: The repository has a dedicated data model or workflow for the feature.
- **Partial**: Some data or presentation exists, but the complete rule framework does not.
- **Missing**: No dedicated implementation was found.
- **Book verification required**: Public sources confirm a content category, but the owned book must be checked for its complete record list.
- **Out of scope**: Licensed setting, adventure, map, or character content that should not be redistributed with the system.

## Current Compendium Inventory

| Category | Records | Coverage note |
|---|---:|---|
| Powers | 384 | All records belong to one or more of 26 configured power sets. Expansion attribution is not stored. |
| Traits | 75 | Includes expansion-related options, but sourcebook attribution is not stored. |
| Tags | 57 | Includes Alternate Form, Clone, Headquarters, Krakoan, Villainous, X-Gene, and other expansion-related tags. |
| Origins | 38 | Includes mutant, symbiote, high-tech, battle-suit, and related variants. |
| Occupations | 18 | Full expansion-by-expansion comparison requires the owned books. |
| Items and weapons | 13 | Only ordinary weapons and grenades are supplied. |
| Destructible actors | 12 | Includes a motorcycle, car, and truck as attackable NPC-backed tokens. |

The configured power sets are Basic, Elemental Control, Healing, Illusion, Luck, Magic, Martial Arts, Melee Weapons, Narrative, Omniversal Travel, Phasing, Plasticity, Power Control, Ranged Weapons, Resize, Shield Bearer, Sixth Sense, Spider-Powers, Super-Speed, Super-Strength, Tactics, Telekinesis, Telepathy, Teleportation, Translation, and Weather Control.

## Shared Rule-Framework Coverage

| Feature | Status | Repository evidence | Required work |
|---|---|---|---|
| Ordinary powers | Supported | Power Item model, 384 records, action and utility workflows | Verify each expansion's complete power list from the owned books. |
| Narrative powers | Partial | Narrative power set with three records | Verify expansion records and add any Narrative Limitations framework required by Secret Wars. |
| Traits, tags, origins, occupations | Partial | Dedicated Item models and compendiums | Compare exact names and restrictions against each owned book. |
| Team maneuvers | Supported | Characters and NPCs retain legacy type/level fields while adding alignment, participant UUIDs, eligibility, individual/pooled spending, duration/effect metadata, transaction records, and safe undo | Author verified maneuver definitions without copying licensed rules text. |
| Equipment and gear | Supported | Structured `gear` records coexist with legacy `item` records | Add authorized compendium records as they are verified. |
| Iconic Items | Partial | Structured gear supports category, reliance, requirements, grants, equip state, protection, and durability | Add safe ownership and transfer behavior. |
| Battle Suits | Partial | Structured gear supports Battle Suit records, grants, protection, durability, and equip state | Add automated granted-item transactions and suit damage behavior. |
| Alternate forms | Supported | Alternate Form records provide reversible Cosmetic Change, Power Down, and Power Swap transitions with whitelisted overrides | Verify book-specific form records without redistributing licensed profiles. |
| Headquarters | Supported | First-class reusable records support ownership and teams, Scene and Actor links, scale, location, resources, defenses, facilities, and upgrades | Verify book-specific records without redistributing licensed maps or profiles. |
| Vehicles | Partial | NPC-backed vehicles now support category, operational state, crew, passengers, operator, handling, speed, stations, cargo, and boarding transactions | Add collision and chase workflows after book verification. |
| Starships | Partial | Space-category vehicle profiles support scale, crews, stations, cargo, and mounted Gear | Add authorized starship profiles and any verified starship-only mechanics. |
| Large-scale battles | Supported | Generic Campaign Framework Items track henchmen groups, battle state, linked Scenes, and bounded objectives without imposing book mechanics | Author any book-specific procedures only after owned-book verification. |
| Sinister Plot resource | Supported | Generic named resource pools enforce authored bounds, record mutations, and provide drift-safe undo | Author any book-specific resource lifecycle only after owned-book verification. |
| Personal Responsibilities | Supported | Generic responsibility records support status, notes, related Actor UUIDs, and optional bounded progress | Author only original or authorized supporting-cast records. |
| Mutant reputation and schooling | Supported | Reputation scopes and schooling/general progression tracks use author-defined labels and bounds | Author book-specific thresholds and effects only after owned-book verification. |
| Rank X | Supported | Actors have an explicit Rank X mode and author-controlled numerical scale with legacy fallback | Verify each authorized Rank X profile's scale and bespoke mechanics from the owned book. |
| Battleworld campaign material | Out of scope | No licensed setting or adventure compendium is distributed | Use private worlds or separately authorized adventure modules for domains, maps, rulers, and events. |

## Expansion Assessment

### X-Men Expansion

Public feature lists identify new powers, Narrative Powers, origins, traits, tags, team rules, mutant-focused campaign rules, headquarters or mapped bases, equipment, and vehicles.

| Area | Status |
|---|---|
| Mutant origins and metadata | Partial; relevant origins and tags exist, but the exact book list requires verification. |
| Powers and Narrative Powers | Partial; relevant power sets and Narrative records exist, but sourcebook attribution and completeness are unknown. |
| Team maneuvers | Supported by the generic executable workflow; exact book definitions require verification. |
| Mental combat | Partial; Focus damage and opposed checks exist, but the book's complete framework requires verification. |
| Mutant reputation and schooling | Supported by generic reputation and progression tracks; exact labels and procedures require verification. |
| Headquarters and mapped bases | Generic Headquarters records and Scene links are supported; licensed maps and setting entries are out of scope. |
| Vehicles and equipment | Partial; generic destructible vehicles do not implement vehicle operation. |

### Spider-Verse Expansion

Public feature lists identify Spider-focused character options, Symbiote and clone support, Personal Responsibilities, Sinister Plot points, equipment, gadgets, vehicles, and team maneuvers.

| Area | Status |
|---|---|
| Spider-Powers | Partial; 20 records exist and receive extensive automation, but the exact expansion list requires verification. |
| Symbiote and clone options | Partial; related origins and tags exist, but the complete expansion rules require verification. |
| Personal Responsibilities | Supported by generic linked responsibility records; licensed examples remain out of scope. |
| Sinister Plot points | Supported as an author-defined bounded resource with transaction history and safe undo. |
| Equipment, gadgets, and vehicles | Partial; no expansion-specific inventory or operational vehicle model exists. |
| Team maneuvers | Supported by the generic executable workflow; exact book definitions require verification. |

### Avengers Expansion

Public feature lists identify Iconic Items, Battle Suits, alternate forms, headquarters, new character options, team and stunt rules, henchmen, and large-fight mechanics.

| Area | Status |
|---|---|
| Iconic Items | Missing as a dedicated framework. |
| Battle Suits | Partial; an origin exists without suit records or equip behavior. |
| Alternate forms | Partial; a tag exists without linked-form transitions. |
| Headquarters | Supported by generic reusable Headquarters records; licensed profiles remain out of scope. |
| Team and stunt rules | Team maneuvers have a generic executable workflow; other stunt rules require verification. |
| Henchmen and large fights | Supported by generic group counts, battle state, Scene links, and bounded objectives; exact mechanics require verification. |
| Powers, conditions, traits, tags, and origins | Book verification required. |

### Secret Wars Expansion

Marvel's official preview identifies Rank X, powers, traits and tags, Iconic Items, Battle Suits, Team Maneuvers, equipment, headquarters, vehicles, and other mechanics. Public table-of-contents listings also identify Narrative Items, starships, hero and villain Team Maneuvers, Narrative Limitations, and Battleworld campaign frameworks.

| Area | Status |
|---|---|
| Rank X | Missing and structurally incompatible with the current numeric-only rank field. |
| Narrative and Omniversal content | Partial; both power sets exist, but exact Secret Wars coverage requires book verification. |
| Iconic Items, Battle Suits, and Narrative Items | Missing or partial; no dedicated item frameworks exist. |
| Hero and villain Team Maneuvers | Supported through aligned generic definitions, shared eligibility and spending, transaction records, and safe undo. |
| Equipment and headquarters | Generic structured Gear and Headquarters records are supported. |
| Vehicles and starships | Vehicles are partial; starships are missing. |
| Battleworld events, domains, and licensed setting content | Out of scope for the distributable system. Generic event support can live in companion modules. |

## Recommended Implementation Order

1. **Structured gear foundation (complete)**: registered a real Gear Item type with reusable equipment, Iconic Item, Battle Suit, Narrative Item, gadget, and vehicle-mount metadata.
2. **Alternate forms (complete)**: reversible Cosmetic Change, Power Down, and Power Swap records use explicit whitelisted overrides and exact snapshots.
3. **Rank X (complete)**: rank identity is separate from numerical scaling, with explicit author control and a backward-compatible fallback.
4. **Vehicle and starship foundation (complete)**: NPC-backed profiles retain attackable durability while adding operation, capacity, crew, station, cargo, and mount data.
5. **Headquarters (complete)**: reusable records provide ownership, team, Scene and Actor links, scale, location, resources, defenses, facilities, and upgrades.
6. **Team resources and maneuvers (complete)**: aligned generic definitions support participant UUIDs, pooled or individual costs, eligibility, declarative duration/effects, transaction records, and safe undo.
7. **Campaign frameworks**: completed with reusable Items, bounded state, transactions, safe undo, and Actor/Scene linkage.
8. **Book-by-book record reconciliation**: compare the owned indexes against compendium names after the supporting models are stable.

The **campaign frameworks** milestone is complete at the generic system-support layer. Final book-by-book record reconciliation and licensed content authoring remain intentionally separate.

## Verification Checklist Requiring Owned Books

Do not infer these lists from marketing copy:

- Every new power and its power-set assignment
- Complete origin, occupation, trait, tag, and condition lists
- Named Spider-Verse gadgets and vehicles
- Avengers and Secret Wars Iconic Items and Battle Suits
- Secret Wars headquarters, vehicles, and starships
- Exact costs, prerequisites, scaling, durations, and mechanical outcomes

Record only original summaries and structured metadata that the project is authorized to distribute. Do not copy sourcebook prose, maps, character profiles, or stat blocks.

## Public Sources

- [X-Men Expansion developer update](https://www.marvel.com/articles/culture-lifestyle/marvel-multiverse-role-playing-game-developer-update-6-gen-con-x-men-expansion-deadpool)
- [X-Men Expansion listing](https://app.demiplane.com/nexus/marvelrpg/sources/x-men-expansion)
- [Spider-Verse Expansion developer update](https://www.marvel.com/articles/culture-lifestyle/marvel-rpg-developer-update-8-spider-verse-expansion-map-designer-brian-patterson-interview)
- [Spider-Verse Expansion listing](https://app.demiplane.com/nexus/marvelrpg/sources/spider-verse-expansion)
- [Avengers Expansion developer update](https://www.marvel.com/articles/culture-lifestyle/marvel-multiverse-role-playing-game-developer-update-10-avengers-expansion-sneak-peek-free-quick-start-thunderbolts-adventure)
- [Avengers Expansion listing](https://app.demiplane.com/nexus/marvelrpg/sources/avengers-expansion)
- [Secret Wars Expansion developer update](https://www.marvel.com/articles/culture-lifestyle/marvel-multiverse-role-playing-game-developer-update-11-secret-wars-expansion-midtown-mayhem-gen-con-2026)
- [Secret Wars Expansion listing](https://app.demiplane.com/nexus/marvelrpg/sources/secret-wars-expansion)
