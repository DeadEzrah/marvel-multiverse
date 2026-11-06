# Headquarters Authoring

Headquarters are first-class Item documents. They can live in the world or a compendium, be embedded on an Actor, and be exported without requiring licensed maps, profiles, or rules text.

## Core Fields

- **Ownership** records whether the headquarters belongs to an individual, team, organization, or shared group. Owner and team names are descriptive metadata.
- **Scale and location** describe the headquarters in setting-neutral terms.
- **Scene UUID** optionally opens the Foundry Scene used for play. A UUID is a link, so no map content is copied into the Item.
- **Resources** provide an editable current/maximum pool. The sheet controls clamp changes between zero and the authored maximum.
- **Defenses** provide generic physical and electronic ratings plus free-form notes. Their interpretation remains with the Narrator.
- **Facilities and upgrades** are reusable named entries with an active state and original description.
- **Linked Actor UUIDs** connect owners, residents, staff, or other relevant Actors without duplicating their data.

## Workflow

Create a **Headquarters** Item from the Items directory. Complete the Overview and Operations tabs, then add facilities and upgrades. Paste a Scene UUID or Actor UUID into the Links tab; linked documents can be opened directly from the sheet.

Headquarters records deliberately do not automate team maneuvers or campaign systems. Keep book-specific prose, maps, named profiles, and licensed statistics outside distributable records unless the project has explicit permission to include them.
