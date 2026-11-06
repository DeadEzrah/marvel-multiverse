# Structured Gear Authoring

The `gear` Item type is the reusable foundation for expansion equipment. It supports original or authorized records without requiring licensed sourcebook text.

Existing `item` records remain valid and continue to appear in actor inventories. New gear created from an actor sheet uses the structured `gear` type.

## Categories

- **Equipment**: ordinary non-weapon gear.
- **Iconic Item**: a unique or character-defining item.
- **Battle Suit**: wearable equipment that can grant protection or capabilities.
- **Narrative Item**: an item whose primary effects are resolved through narration.
- **Gadget**: specialized or configurable equipment.
- **Vehicle Mount**: equipment assigned to a vehicle or crew station.

## Structured Fields

Gear records provide:

- Equipped and unique state
- Reliance and requirement notes
- Ability, power, trait, tag, and movement grant metadata
- Health and Focus Damage Reduction
- Current and maximum durability
- Mount kind, station, and operator requirement
- Active Effects for deterministic Foundry modifiers

Grant fields are authoring metadata. They do not automatically create or delete embedded powers, traits, or tags. Use Active Effects for deterministic numeric modifiers and preserve choice-heavy or identity-changing behavior as explicit instructions until a safe transaction workflow exists.

Alternate identities and transformed statistics belong in dedicated Alternate Form records rather than Gear grants. Alternate Form activation snapshots only the fields it changes and restores those exact values when the form ends.

Do not copy sourcebook descriptions into public compendiums. Use original summaries and structured values that the project is authorized to distribute.
