# Localization

## Files and ownership

`locales/translations.csv` is the only hand-edited translation catalog. Its
first column is `key`; every other column is a locale code such as `en`, `zh`,
or `ja`. English is required and is the source language.

Rows whose keys start with `system.*` assign one stable owner to shared game
terms. Weapon types, martial arts, Inner Ways, attunements, set-piece counts,
damage/attribute types, and calculation labels belong there. Stat names are
owned by `stat.<statKey>` and are derived from
`src/data/statDefinitions.ts`. When the same display value appears in other
game data, extraction routes it to its canonical key instead of creating
another translation entry.

Attunement names are derived from `data/attunement.json` and owned by
`system.attunement.<attunementId>`. UI controls should resolve those keys
directly when the attunement ID is available; `gameText()` provides the same
translation for calculation results and other records that already carry the
English display name.

`npm run i18n:extract` updates the catalog and generates runtime assets under
`public/locales/`:

- `manifest.json` lists the locales currently published in the selector, the
  English fallback, and each non-English locale's whole-number completion
  percentage. Completion is generated from its non-empty catalog rows, so it
  must not be maintained by hand. Translation columns may remain in the CSV
  while their locale is unpublished.
- `<locale>.json` contains the non-empty messages for one locale.

Generated locale JSON must not be edited directly. Add a locale by adding its
column to the CSV, filling translations, and running the extractor.

Martial-art talents contain calculation effects only. They have no display names
or localization rows; their rank and position remain part of the data layout.

## Runtime selection

The application resolves the locale once before React mounts:

1. the locale explicitly saved under `localStorage["wwm-locale"]`;
2. the first exact or base-language match in `navigator.languages`;
3. English.

Browser detection is not written to storage. Only a user selection is saved.
The selected locale and English fallback JSON are loaded together, and missing
messages fall back per key. The `<html lang>` attribute is updated after load.

Traditional Chinese (`zh-Hant`) and Korean (`ko`) are published locales
available without development mode. Locale selector names are fixed autonyms
in `src/i18n.ts` rather than translated messages, so every language is always
named in its own language. Incomplete non-English locales show their generated
catalog completion percentage; fully translated locales and English show only
their names.

The selector also publishes Simplified Chinese (`zh-Hans`), Japanese (`ja`),
Latin American Spanish (`es`), French (`fr`), German (`de`), Brazilian
Portuguese (`pt`), Vietnamese (`vi`), Thai (`th`), and Russian (`ru`). These
locales combine datamined game terms with separately translated site copy and
simulator labels. See [the coverage report](localization-coverage.md) for current
catalog coverage and [translation review](localization-review.md) for review
scope, retained names, and terminology limitations. Missing messages continue
to use English fallback.
The unused Arabic catalog column is not published: Arabic is not in the
requested game's language list or the current datamine.

Import additional game translations with
`python script/i18n/import-datamine.py <path-to-wwm-translations.sqlite>`, then
run `npm run i18n:extract`. The importer opens the source read-only, fills only
empty cells, and preserves manually reviewed translations. It joins exact
English text to shared references, using existing Traditional Chinese and
Korean translations to disambiguate where possible. It never chooses between
conflicting target translations. `--missing local/localization-missing.csv`
exports every remaining missing key for translation review. The source
datamine stays under ignored `local/`; deployment requires only the generated
locale assets. Browser Chinese region tags map to the corresponding script;
Spanish and Portuguese region tags use their published base-language locale.

Traditional Chinese and Korean cover the complete catalog. Game terminology uses
the datamined localization's shared-reference translations; ambiguous English
names are resolved in their skill, effect, or equipment context. Site-specific
copy and simulator-only variants are translated separately. Chinese-only Bolt
preview names use Korean readings when no decoded Korean localization exists.
Technical abbreviations, file formats, service names, keyboard bindings, and
schema identifiers remain unchanged. `tests/locale-completeness.test.ts` guards
catalog coverage and unexpected English words in these two locales.

Localization applies to editor display fields without rewriting the underlying
draft until the user edits that field. Custom build, rotation, and profile names
are preserved. Skill category labels resolve through the martial-art registry;
damage rows emitted by effects resolve through the existing effect registries.

Locale state belongs to the UI. Calculation bundles, worker messages, cache
keys, IDs, formulas, and persisted game data remain language-neutral.
The shared active-rotation result retains the source name; the UI translates
default preset names when rendering. Caching a translated name would leave the
previous language visible after a switch or require unnecessary recalculation.

Wings uses the English IDs `museflowWaistDrum` and `willowbendFan` for martial
arts, and `HarmonySong`, `ZephyrWhispers`, `BladesWill`, and `InkAndStrings`
for Inner Ways. Definition filenames and localization keys follow those IDs.
The former Wings IDs have no compatibility migration; saved builds, rotations,
and editor overrides referring to them must be recreated.

Wings display text follows the normal-variant names in the October 15, 2026
local datamine: Plumage Sweep, Sleeve Dance, Boreal Sweep, Boundless Bloom,
Ripple: Toneflux, and Tangled Gauze. Simulator-only stage numbers, combinations,
sound-field labels, and damage-reduction labels append descriptive English to
those terms. Updating display text preserves the current skill and effect IDs.

## Message conventions

Chinese event labels use an ASCII colon followed by a space (`事件: 名稱`),
not a full-width colon.

- Use `t("ui.area.meaningfulKey")` for interface copy.
- Use named placeholders such as `{count}` instead of assembling translated
  sentences from fragments.
- Reuse `system.*` only for invariant game terminology. These rows are the
  canonical-term registry, so each English value must be unique. Component
  messages that contain a canonical term receive it through a named
  placeholder.
- Keep punctuation outside a system term. For example, render
  `t("system.dps")` followed by `:` instead of defining a second `DPS:` message.
- Keep semantic IDs, CSS classes, HTML roles, storage keys, and enum values as
  literals. They are not language. Data-editor options must use an explicit
  `value` and render schema enums such as `self`, `target`, `segment`, `T0`, or
  `Gold` verbatim rather than passing them through `t()`.
- JSON `name`, `shortName`, and `description` values are extracted under stable
  `data.*` keys unless their value is a registered canonical term. `gameText()`
  localizes these existing display values at the UI boundary without altering
  their calculator-facing records.
- Stat labels are extracted as `stat.<statKey>` and use the same UI-boundary
  adapter because calculator priority rows already carry those labels.

The extractor rejects duplicate keys, missing messages referenced by `t()`,
translated messages whose placeholders differ from English, and new static JSX
text or text-bearing literal attributes that have not been migrated. `npm run
build` runs this check before TypeScript and Vite.

## Commands

```text
npm run i18n:extract
npm run i18n:check
```

Run the extractor after adding or changing UI messages or translatable game
data, then run the normal formatting and build gates.

## Translation workflow and evidence

Only the Bolt path name has a confirmed localization. Every other Bolt term
remains Chinese in locales other than `zh-Hant` and `zh-Hans`, which use their
respective scripts. This includes complete skill names and short labels,
effects, states, resources such as `槍勢`, and attunements. Do not translate
their modifiers, convert them to Japanese character variants, or use Korean
readings. Keep Chinese terminology inside otherwise localized descriptions;
surrounding prose and general interface controls remain localized. This is an
explicit user terminology preference, not missing translation work.

The repository skill `.agents/skills/wwm-localization/SKILL.md` defines the
terminology recovery, translation, independent AI review, and UI checks used for
new translations. It preserves already populated cells unless a correction is
explicitly in scope. English remains the authority for current simulator
mechanics; older translations can contain obsolete values or omit modifiers.

`locales/glossary.json` records newly reviewed canonical terms using the existing
`system.*` and `stat.*` keys, with locale, English source, target text, and review
evidence. Use these entries alongside existing catalog terms when translating
embedded terminology. `locales/translation-review.json` records review scope,
corrections, uncertainties, retained Chinese-name keys, and shared-reference
evidence for recovered base terms. These files support translation work and are
not runtime assets. Keep them aligned when changing a term they describe.

Coverage counts non-empty messages. Retained input notation, brands, borrowed
proper names, and Chinese-only preview names can be intentional non-empty
entries; 100% catalog coverage does not establish that every name has an
official localization or that a native speaker approved the text. New reviewed
messages have independent AI language review, not human approval. The coverage
test checks every published locale against the English key set, while runtime
English fallback remains available for future catalog additions or missing
messages in a loaded asset.
