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

- `manifest.json` lists the locales currently published in the selector and
  the English fallback. Translation columns may remain in the CSV while their
  locale is unpublished.
- `<locale>.json` contains the non-empty messages for one locale.

Generated locale JSON must not be edited directly. Add a locale by adding its
column to the CSV, filling translations, and running the extractor.

## Runtime selection

The application resolves the locale once before React mounts:

1. the locale explicitly saved under `localStorage["wwm-locale"]`;
2. the first exact or base-language match in `navigator.languages`;
3. English.

Browser detection is not written to storage. Only a user selection is saved.
The selected locale and English fallback JSON are loaded together, and missing
messages fall back per key. The `<html lang>` attribute is updated after load.

Traditional Chinese (`zh-Hant`) is currently the only work-in-progress locale.
It is shown in the selector but disabled until Dev mode is enabled. Locale
resolution applies the same gate to saved and browser-detected locales so the
selector cannot be bypassed through storage or browser preferences. Locale
selector names are fixed autonyms in `src/i18n.ts` rather than translated
messages, so every language is always named in its own language.

Locale state belongs to the UI. Calculation bundles, worker messages, cache
keys, IDs, formulas, and persisted game data remain language-neutral.

## Message conventions

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
