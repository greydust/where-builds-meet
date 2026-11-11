# Official terminology recovery

## Source discovery and identity

Locate current exports beneath `local/datamine/` and inspect available snapshot
metadata. Prefer the relevant current edition and variant, not simply the newest
filename. `local/datamine.md` is useful orientation but can describe older exports.
Keep source exports unchanged. Open SQLite with a read-only URI and preserve
reference IDs as strings; some exceed JavaScript's safe integer range.

The current translation database uses:

- `sources(id, path, language, layer, ...)` for language and base/diff provenance.
- `records(reference, source, text, status, ...)` for shared-reference translations.
- `english(reference, text, layer)` with indexes by text and reference.

Inspect the actual schema before querying a different export. Source language
mapping is `zh_cn` → `zh-Hans`, `zh_tw` → `zh-Hant`, `pt_br` → `pt`;
`ja`, `ko`, `es`, `fr`, `de`, `vi`, `th`, and `ru` use their catalog codes.

Within one edition and snapshot, an existing diff record supersedes the base
record, including when the diff cannot be decoded. Do not silently replace an
undecodable current record with obsolete text. Verify effective English as well
as target text; an index hit on old English can refer to a changed concept.

## Candidate resolution

1. Resolve the site's semantic key to the skill, effect, equipment, or stat
   record, including variant and edition. Prefer that record's explicit
   localization reference when supplied by processed or raw exports.
2. Otherwise search exact English text. For discovery only, try whitespace,
   punctuation, or known markup normalization and search the base name of a
   simulator variant. Normalized or fuzzy matches need context verification.
3. Join candidates through their shared reference to the target language.
   Existing Traditional Chinese and Korean translations can disambiguate, but
   those translations include independently authored site copy and are not
   proof of official identity on their own. Conflicting anchors require
   investigation, not selecting whichever anchor was processed first.
4. Check source status, edition, variant, effective layers, and surrounding
   records. Reject unresolved markers, replacement characters, incorrect
   placeholders, and raw game markup that has not been interpreted. Do not
   broadly strip markup if it can encode parameter values or semantics.
5. Record the match and its evidence in the glossary. If equally plausible
   references yield different translations, leave it unresolved and report it.

Use parameterized queries. `script/i18n/import-datamine.py` can fill empty exact
matches but is not a complete terminology resolver: it does not establish
semantic identity for every homonym, resolve all non-exact matches, or attach
per-cell provenance. Its coverage report counts non-empty cells, not reviewed
translation quality. Running it writes the catalog and report, so use it only
within an authorized import/translation task, not for a read-only audit.

## Authored wording and provenance

For site prose, translate from English with an official-term glossary. Consult
Chinese or Korean for context only; do not mechanically convert Traditional
Chinese to Simplified Chinese where the game's regional terminology differs.
Do not translate English abbreviations into arbitrary local acronyms. A native
short label or unchanged technical notation should be an explicit review choice.

A glossary record can use this structure:

```json
{
  "locale": "ja",
  "key": "<canonical catalog key>",
  "source": "<current English text>",
  "translation": "<verified target text>",
  "context": "<skill, stat, control, or other concept>",
  "origin": "official",
  "evidence": {
    "snapshot": "<snapshot directory or ID>",
    "reference": "<decimal string>",
    "language": "ja",
    "layer": "diff"
  }
}
```

For reviewed site copy, use `origin: reviewed` and cite the review artifact.
For unresolved authored names, use `origin: provisional` and state the reason.
Do not fabricate source references to satisfy this structure. If retaining a
glossary, put it under `locales/` and keep raw exported material under `local/`.
