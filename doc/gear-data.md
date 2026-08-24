# Gear data and inventory

The Build tab is driven by `data/gear.json` and `data/attunement.json`. Gear
defines the eight gear slots, fixed base stats by level and rarity, selectable
affixes, and attunement source tags. Attunement definitions contain their
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

An attunement whose game effect is known but not simulated remains selectable
with `implemented: false` and an empty `effect.stat` object. This preserves the
gear data without silently applying an invented calculation.

Each record in `gear` contains:

- `name` and compatible `slots`
- optional `weapon` mapping for weapon definitions
- `baseStats` keyed by level and rarity
- `baseAffixes` keyed by level
- `additionalAffixes` keyed by level
- `attunements` selectors, currently `Weapon` or `Armor`

`universalAdditionalAffixes` holds rolls available to every gear definition at
a level. Body and Defense use this shared pool, avoiding repeated option lists
while keeping their availability explicit in data. Body, Defense, Max HP, and
Physical Defense are visible calculated fields in the Main stat grid. Equipped
values enter the shared derived-stat pipeline, so Body affects Max HP and any
mechanic that scales from it.

An attunement selector is matched against each definition's `tags` in
`data/attunement.json`. Weapons, Disc, and Pendant select `Weapon`; Helmet,
Chestpiece, Greaves, and Bracer select `Armor`. Path and martial-art filtering
is applied afterward by the UI, so adding a tagged attunement does not require
copying its ID into every compatible gear record.

The current level keys are `91` and `96`; rarities are `Purple` and `Gold`.
Helmet, Chestpiece, Greaves, and Bracer define fixed Max HP and Physical Defense
for every supported level and rarity. Chestpiece has the doubled HP profile;
Greaves uses the higher Physical Defense profile. These fixed values are shown
on gear cards and summed through the same equipped-stat effect as weapon and
accessory base attacks.
An optional `${level}Relayed` entry adds relay-only choices to the matching
level. A key listed there is excluded from non-relayed gear even if an older
level list also contains it, which keeps existing preset data compatible while
making the relay list authoritative for selection and validation. Tier 96
weapons use `96Relayed` for min/max Bellstrike, Stonesplit, Silkbind, and
Bamboocut Attack. These stats share the Tier 96 min/max Void Attack roll in
`data/stat.json`.
All weapon definitions share the same fixed base-stat and base-affix tables.
Their additional-affix pools also share the ordinary weapon affixes, with each
definition including only its own weapon-family damage boost. Both Rope Dart
definitions use `ropeDartDmgBoost`.
Snowparting Blade settings select Heng Blade gear, while Phalanxbane Blade
settings select Mo Blade gear. The first configured weapon maps to Left Weapon
and the second maps to Right Weapon. Weapon items are identified by this
definition ID and do not store a left/right slot, so the same saved weapon can
move between the two positions when the martial-art order changes.

## Builds and persisted inventory

Build data is stored in `localStorage` under `wwm-build-list-v1`, with the active
build ID in `wwm-active-build-v1`. The stored payload uses schema version 8 and
contains one shared `gearItems` array plus the build entries. Each custom build
stores a `martialArts` eligibility list, an `equipped` map from its eight slots
to shared item IDs, plus its gear
sets, bow/ring set, and arsenal selection. The same
gear item can therefore be equipped by any number of builds, while changing one
build's loadout does not change another build's equipped choices. Only the
active build contributes to character and rotation calculations.

Each shared item stores its definition ID, level, rarity, optional `relayed`
status, one required base affix, zero to four additional affixes, and an optional
attunement. Non-weapon items also store their armor
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
standalone setup selections when available, then persist those choices with
the build. Records using the former `weapons` eligibility field are normalized
to `martialArts`; new persistence never writes the legacy field.

Load validation rejects malformed items, options that are not allowed by the
current definition, more than four additional affixes, and duplicate additional
affixes. Missing additional affixes and attunement are preserved as empty rather
than filled with invented values. Changing weapon settings
does not delete incompatible saved items; they become available again if the
matching martial art is selected later.

Duplicating a custom build creates another editable build that references the
same shared equipped item IDs and copies its Inner Ways and setup selections.
Duplicating a preset converts its synthetic loadout into an editable build. For
each preset slot, an exactly matching shared item is reused when available;
otherwise, a concrete shared item is created from the preset values. A single
physical item is never equipped into two slots of the duplicate.

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
`where-builds-meet-builds` format identifier and schema version 7. Bundled
default builds are reconstructed from `data/build/**/*.json`, so they are omitted
from browser persistence and exports. Versions 1 through 6 remain importable,
with legacy `weapons` eligibility renamed to `martialArts`, slot-bound weapon
gear normalized, and missing setup data migrated.

Import merges into the current browser state rather than replacing it. Valid
gear items are appended, custom builds are appended, and the current active
build is left unchanged. Gear and build ID collisions are remapped. All imported
build references use the remapped IDs, so a gear item shared by multiple builds
in the export remains shared after import. Bundled default builds are skipped to
avoid duplicating them. Importing the same file again therefore creates another
independent copy of its custom builds and gear.

### Official dashboard import

`Import from Official` opens a modal containing a draggable bookmarklet and a
link to the official Where Winds Meet dashboard. The bookmarklet runs in the
dashboard origin, reads its cached `getAreaServer` role data or requests
`/role/roleInfo` with the dashboard's existing login token, and copies a small
`wwm-dashboard` JSON envelope. The login token is never included. The user
returns to Where Builds Meet and explicitly pastes that envelope for import.

`officialGearImport.ts` translates dashboard slot IDs and affix IDs before
passing the result through the ordinary versioned build-import validator. Slot
IDs 1, 2, 3, 4, 5, 8, 10, and 11 map to the site's eight gear slots; dashboard
bow and ring records are ignored. `exVo.baseAffixes` contains the base affix,
up to four additional affixes, and an optional final attunement. The final row
is treated as an attunement only when its mapped ID is allowed by that gear
definition. Percent values are converted to decimal ratios at this
boundary. `local/official-wwm-affix-map.json` preserves the reference site's
names, while generated `data/official/affix-map.json` maps each supported ID
directly to this project's canonical stat or attunement key. Base signatures
remain in `data/official/import-map.json`. Both data files are generated by
`script/extract-wwm-affix-map.mjs`. IDs observed in newer dashboard exports but
missing from the older reference map live as explicit generator overrides in
that script.

The Tier 96 Kite armor-attunement family uses IDs `279751` through `279755` in
charged/martial/third-type order for Heavenwill Gauntlets, followed by Heavy and
Special for Skygrasp Rope Dart. Dashboard Body and Defense IDs are mapped as
ordinary universal additional affixes rather than discarded as non-offensive data.
The Tier 96 Art of Gauntlet additional affix uses ID `9793031`.

The import creates a new `{character name} Import` build, adds its gear
to the shared inventory, and equips it without replacing existing data. Before
adding a piece, the importer compares its definition, level, rarity, relayed
state, base affix, available additional affixes, and optional attunement with shared gear.
Additional-affix order is ignored. An exact match is reused by the new build;
only unmatched gear creates a new inventory item. Weapon-specific affixes such
as Art of Mo or Art of Heng identify the imported weapon. When the imported and
current weapon pairs match, weapon gear is placed into the corresponding
current slot instead of changing the global left/right order. This keeps the
new build visible without hiding the user's other weapon-filtered builds. Gear
level and rarity are inferred from official base-attribute signatures when
possible. If the payload does not expose or identify rarity, the item defaults
to Gold and a non-blocking warning is written to the browser console. These
fallback details do not clutter the successful import message. Unmapped or
slot-invalid affixes are rejected rather than silently assigned to a different
stat. Level 96 armor signatures distinguish Gold and Purple using the
dashboard's fixed HP and Physical Defense values. Helmet and Bracer share one
signature, Chestpiece uses doubled HP, and Greaves uses the Helmet/Bracer HP
with its own higher Physical Defense value.

The official payload does not consistently expose a separate relayed flag. If
an imported piece contains an affix listed by its definition under
`${level}Relayed`, the importer treats the piece as relayed before validating
its affix pool. This preserves relay-only attribute attack rows such as official
ID `9793026` (`maxStonesplit`) instead of discarding them as unsupported normal
gear.

Current-season weapon attribute IDs `9793003` and `9793006` represent Defense
and Body respectively. Their order differs from the manually inferred mapping
used before dashboard payloads exposed both rolls, so the official-ID map must
not derive these meanings from numeric adjacency alone.

Version 2 of the bookmarklet envelope carries the complete dashboard `roleInfo`
object for inspecting additional profile fields. Known official martial-art and
Inner Way IDs are recorded in `data/official/profile-map.json`. `kongfuMain`
and `kongfuSub` provide ordered martial-art IDs and are preferred over affix
inference when both are supported. The observed Might pair maps `20401` to
Thundercry Blade and `20103` to Stormbreaker Spear, preserving their left/right
order even when neither weapon carries a unique damage-boost affix.
`passiveSlots` contains the four ordered Inner Way IDs. The payload does not
expose their tiers, so recognized complete four-slot selections import at T6 by
policy; an incomplete or unknown selection retains the application's default
Inner Ways. Bow slot 21 and ring slot 9 use suffix IDs `44`, `45`, and `46` for
Precision, Critical, and Affinity respectively. Matching known suffixes select
that bow/ring set; different suffixes explicitly select `None`. Missing or
unknown suffix data retains the application's default selection. Recognized suffix IDs on
Left Weapon, Right Weapon, Disc, and Pendant determine weapon-set piece counts:
two recognized matching pieces select the two-piece tier and four select the
four-piece tier. Official suffix `56` maps to Etherwrath. Unknown weapon-set,
armor-set and arsenal data continues using the application's default
setup values.

Tier 96 Stonesplit Might armor attunements use IDs `280201` through `280205`:
Thundercry Blade Shield, Charged Skill DMG, and Special Skill DMG Boost followed
by Stormbreaker Spear Charged Skill DMG and Special Skill DMG Boost. ID `280202`
is directly observed in a dashboard export; the remaining ordering follows the
confirmed category sequence. Stonesplit Might has no Stormbreaker Spear Martial
Art Skill DMG Boost attunement.

Tier 96 Bamboocut Dust armor attunement ID `280601` maps to Everspring Umbrella
Martial Art Skill DMG Boost. Together with the previously observed IDs `280602`
through `280605`, this completes the Dust category mapping.

The dashboard can report Physical Resistance as an accessory attunement. It is
preserved on imported gear and shown in the gear editor, but is marked
defensive and excluded from offensive character/priority controls because it
does not affect outgoing damage.

## Default build presets

Default builds live in path-grouped `data/build/**/*.json` files. Vite eagerly discovers every JSON
file beneath that root, so adding a preset does not require a TypeScript import. Presets
are grouped by path (for example, `stonesplit-strength/` and `stonesplit-might/`), while the
Empty Build remains at the root because it is eligible for every martial-art pair.
The optional numeric `order` field controls display order. Presets marked with
`"test": true` are bundled in every environment and shown only while the persisted
header-level Dev toggle is enabled. A preset contains
its `setup` selections and exact gear choices, not persisted `GearItem` records. Missing
slots are allowed for presets such as `Empty Build`; populated slots resolve to
synthetic items at runtime. The UI disables gear switching and prevents removal
of a default build. Its setup is also fixed by the preset. Its display name may
still be changed locally. Presets declare their eligible martial-art IDs in
`martialArts`.

Preset gear records use the same value shape as editor-created gear: every base
affix, additional affix, and attunement stores an explicit `{ "key", "value" }`
object. A preset therefore records the exact build values and does not depend on
the matching level in `data/stat.json` or a roll multiplier. A preset-level `relayed: true`
marks all of its synthetic gear as relayed for display without altering those
explicit values. Preset weapon definitions are
fixed, but build filtering treats the two-weapon combination as an unordered
pair. When the selected martial arts use the same pair in the opposite order,
the equipped weapon records are aligned to the matching left and right weapon
definitions before calculation.

Default presets for other weapon pairs remain hidden in the Build tab. Custom
builds remain listed in a dimmed state when they do not match the current pair.
Selecting one changes to the enabled locked path for that pair, or to Mixed with
the build's saved weapon pair when no enabled locked path is available.

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
