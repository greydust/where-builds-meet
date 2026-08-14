# Gear data and inventory

The Build tab is driven by `data/gear.json` and `data/attunement.json`. Gear
defines the eight gear slots, fixed base stats by level and rarity, selectable
affixes, and allowed attunement IDs. Attunement definitions contain their
display names, percentage units, source tags, stat targets, and skill-match
tags. UI code should not hard-code slot-specific option lists.

## Definitions

Every `affixes` object key is directly a `CharacterStats` key. Attunement IDs
are defined in `data/attunement.json`. Equipped values remain keyed by their
definition ID so multiple armor attunements retain their individual skill-match
tags. Each definition's `effect.stat` maps that value to Physical Penetration,
Formless Penetration, or the shared `attunementDMGBonus` formula input. Entries marked `percentage` are entered as percentage
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
and the second maps to Right Weapon. Weapon items are identified by this
definition ID and do not store a left/right slot, so the same saved weapon can
move between the two positions when the martial-art order changes.

## Builds and persisted inventory

Build data is stored in `localStorage` under `wwm-build-list-v1`, with the active
build ID in `wwm-active-build-v1`. The stored payload uses schema version 4 and
contains one shared `gearItems` array plus the build entries. Each custom build
stores an `equipped` map from its eight slots to shared item IDs plus its gear
sets, bow/ring set, and arsenal selection. The same
gear item can therefore be equipped by any number of builds, while changing one
build's loadout does not change another build's equipped choices. Only the
active build contributes to character and rotation calculations.

Each shared item stores its definition ID, level, rarity, optional `relayed`
status, one base affix, four additional affixes, and one attunement. Non-weapon items also store their armor
slot; weapon items leave positioning to the build's `equipped.leftWeapon` and
`equipped.rightWeapon` references. Editing an item updates it for every build
that equips it. Deleting an item removes it from the shared inventory and
unequips it from every build.

The loader migrates the previous array payload, where each build owned a full
inventory, into shared gear plus per-build loadouts. All items are retained;
colliding item IDs are remapped and their original build's equipped references
are updated. The older `wwm-gear-inventory-v1` single-inventory value is also
migration-only. When no build data exists and legacy gear is present, it becomes
shared gear equipped by an active custom build named `My Build`, without
changing or deleting the old value. Loading older slot-bound Heng Blade and Mo
Blade records removes their `slot` field while preserving their definition,
values, IDs, and build references. Builds from older schemas receive the former
session-wide setup selections when available, then persist those choices with
the build.

Load validation rejects malformed items, options that are not allowed by the
current definition, and duplicate additional affixes. Changing weapon settings
does not delete incompatible saved items; they become available again if the
matching martial art is selected later.

Saved gear can be equipped, edited in place, or deleted from the shared slot
inventory. Editing keeps the item's ID, so it remains equipped in every build
that uses it. Deletion is a two-step action: the first click arms a red `Confirm
Delete` button and the second click removes the item globally.

Relayed items display an upward arrow on equipped and inventory cards. The gear
editor's Max action fills every currently selected affix and attunement from
the gear level in `data/stat.json` without changing attribute selections. Normal affixes
use 100% of the saved max roll; relayed base and additional affixes use 94%.
Attunements always use 100%. Max writes those concrete values into the item, so
calculation never depends on an implicit multiplier. Manual value entry uses
the same values as hard upper limits. Turning Relayed on immediately clamps any
base or additional affix above its new 94% limit; turning it off preserves the
current rolls. Attunement values remain capped at 100% in either state. Save
also applies these limits defensively so non-UI imports cannot persist an
over-cap roll.

Weapon attunement caps use their definition IDs in the `attunement` priority
map. Every attunement definition tagged `Armor` instead shares the generic
`attunement.armor` cap, so new path-specific armor attunements do not require a
new priority key.

## Image import

The add-gear editor can populate a draft from a selected, dropped, or
clipboard-pasted gear details screenshot. OCR is
performed entirely in the browser with Tesseract; its worker, English language
model, and WebAssembly core are served from `public/ocr`, so the static GitHub
Pages build does not depend on an OCR service or upload user images. The bundled
Mo Blade screenshot is displayed only as a composition example.

Recognition is deliberately strict. The importer reads rarity from the Gold or
Purple color bar beside the item name, while OCR supplies the definition, tier,
relaying marker, five affix rows, attunement, and their displayed values. Labels
are normalized to the existing IDs in `data/gear.json` and
`data/attunement.json`; percentage points are converted to decimal ratios at
this UI boundary. Sparse-layout recognition is preferred; if it misses a row,
the importer validates the block-layout result already produced during the same
scan before rejecting the image. An import is rejected instead of partially applied when the
gear definition does not match the editor, rarity or tier is unclear, a row is
missing, an affix is duplicated or unavailable for that definition, or the
attunement is invalid. A successful import fills the ordinary gear draft and
still requires the user to press Save.

## Export and import

The Build sidebar can export the complete shared gear inventory and all custom
build records as a formatted JSON file. Export files use the
`where-builds-meet-builds` format identifier and schema version 3. Bundled
default builds are reconstructed from `data/build/*.json`, so they are omitted
from browser persistence and exports. Versions 1 and 2 remain importable, with
slot-bound weapons and missing setup
data migrated.

Import merges into the current browser state rather than replacing it. Valid
gear items are appended, custom builds are appended, and the current active
build is left unchanged. Gear and build ID collisions are remapped. All imported
build references use the remapped IDs, so a gear item shared by multiple builds
in the export remains shared after import. Bundled default builds are skipped to
avoid duplicating them. Importing the same file again therefore creates another
independent copy of its custom builds and gear.

## Default build presets

Default builds live in `data/build/*.json`. Vite eagerly discovers every JSON
file in that directory, so adding a preset does not require a TypeScript import.
The optional numeric `order` field controls display order. Presets marked with
`"test": true` are loaded only by the Vite development server and are omitted
from production builds. A preset contains
its `setup` selections and exact gear choices, not persisted `GearItem` records. Missing
slots are allowed for presets such as `Empty Build`; populated slots resolve to
synthetic items at runtime. The UI disables gear switching and prevents removal
of a default build. Its setup is also fixed by the preset. Its display name may
still be changed locally.

Preset gear records use the same value shape as editor-created gear: every base
affix, additional affix, and attunement stores an explicit `{ "key", "value" }`
object. A preset therefore records the exact build values and does not depend on
the matching level in `data/stat.json` or a roll multiplier. A preset-level `relayed: true`
marks all of its synthetic gear as relayed for display without altering those
explicit values. Preset weapon definitions are
fixed and are applied as authored rather than being replaced when the Settings
weapon order changes.

## Calculation behavior

Fixed base stats and all five affixes from the active build are summed directly
by their saved keys into one `CharacterStats` effect and passed through the
shared character/derived-stat pipeline. Equipped attunements are summed by
definition ID into the centralized `AttunementStats` input. Damage calculation
resolves each definition's stat target and requires every configured skill tag
before applying it. The active build's gear
sets, bow/ring set, and arsenal form the setup baseline. Main-tab changes to
those selections are session overrides and can be reset individually or with
the global Reset control. The Build tab does not
calculate effective stats, rates, or DPS.

The two Mystic affixes use existing skill tags:

- `singleTargetMysticDmgBoost` applies to `SingleTargetMystic`
- `areaMysticDmgBoost` applies to `AreaMystic`

Both are Category 1 damage bonuses and are stored as decimal ratios.
