# Gear data and inventory

The Build tab is driven by `data/gear.json`. It defines the eight gear slots,
fixed base stats by level and rarity, selectable affixes, and selectable
attunements. UI code should not hard-code slot-specific option lists.

## Definitions

Every `affixes` object key is directly a `CharacterStats` key, and every
`attunements` object key is directly an `AttunementStats` key. There is no
second mapping field. Entries marked `percentage` are entered as percentage
points in the UI and stored as decimal ratios: an input of `6.2` is stored as
`0.062`.

Each record in `gear` contains:

- `name` and compatible `slots`
- optional `weapon` mapping for weapon definitions
- `baseStats` keyed by level and rarity
- `baseAffixes` keyed by level
- `additionalAffixes` keyed by level
- allowed `attunements`

The current level keys are `91` and `96`; rarities are `Purple` and `Gold`.
Snowparting Blade settings select Heng Blade gear, while Phalanxbane Blade
settings select Mo Blade gear. The first configured weapon maps to Left Weapon
and the second maps to Right Weapon.

## Builds and persisted inventory

Build entries are stored in `localStorage` under `wwm-build-list-v1`, with the
active build ID in `wwm-active-build-v1`. Each custom build owns an inventory;
each item stores its slot, definition ID, level, rarity, one base affix, four
additional affixes, and one attunement. Equipped state maps each slot to an item
ID. Only the active build contributes to character and rotation calculations.

The previous `wwm-gear-inventory-v1` value is migration-only. When no build list
exists and legacy gear is present, it is moved into an active custom build named
`My Build` without changing or deleting the old value.

Load validation rejects malformed items, options that are not allowed by the
current definition, and duplicate additional affixes. Changing weapon settings
does not delete incompatible saved items; they become available again if the
matching martial art is selected later.

Saved gear can be equipped, edited in place, or deleted from its slot inventory.
Editing keeps the item's ID, so an equipped item remains equipped after its
values change. Deletion is a two-step action: the first click arms a red
`Confirm Delete` button and the second click removes the item.

## Default build presets

Default builds live in `data/build/*.json`. Vite eagerly discovers every JSON
file in that directory, so adding a preset does not require a TypeScript import.
The optional numeric `order` field controls display order. A preset contains
gear choices and roll multipliers, not persisted `GearItem` records. Missing
slots are allowed for presets such as `Empty Build`; populated slots resolve to
synthetic items at runtime. The UI disables gear switching and prevents removal
of a default build. Its display name may still be changed locally.

Preset gear records use the same value shape as editor-created gear: every base
affix, additional affix, and attunement stores an explicit `{ "key", "value" }`
object. A preset therefore records the exact build values and does not depend on
`data/stat-priority.json` or a roll multiplier. Preset weapon definitions are
fixed and are applied as authored rather than being replaced when the Settings
weapon order changes.

## Calculation behavior

Fixed base stats and all five affixes from the active build are summed directly
by their saved keys into one `CharacterStats` effect and passed through the
shared character/derived-stat pipeline. Equipped attunements are summed directly
by key into the centralized `AttunementStats` input. The Build tab does not
calculate effective stats, rates, or DPS.

The two Mystic affixes use existing skill tags:

- `singleTargetMysticDmgBoost` applies to `SingleTargetMystic`
- `areaMysticDmgBoost` applies to `AreaMystic`

Both are Category 1 damage bonuses and are stored as decimal ratios.
