# Localization translation review

On November 11, 2026, 14,531 previously empty cells were filled across nine
languages using the repository `wwm-localization` skill. Each language received
a separate-author AI review of its entire new batch. The integrating agent also
checked substantive corrections against component/data context and the source.
This is AI review, not native-speaker human approval. Previously populated cells,
English sources, semantic IDs, formulas, and stored user data were preserved.

| Language                       | New messages reviewed | Corrected during review | Entries retaining Chinese names |
| ------------------------------ | --------------------: | ----------------------: | ------------------------------: |
| Simplified Chinese (`zh-Hans`) |                  1432 |                      21 |                               0 |
| Japanese (`ja`)                |                  1481 |                       2 |                              96 |
| Korean (`ko`)                  |                     0 |                       0 |                              96 |
| Latin American Spanish (`es`)  |                  1692 |                     213 |                              96 |
| French (`fr`)                  |                  1763 |                     114 |                              96 |
| German (`de`)                  |                  1662 |                      64 |                              96 |
| Brazilian Portuguese (`pt`)    |                  1616 |                     303 |                              96 |
| Vietnamese (`vi`)              |                  1695 |                     113 |                              96 |
| Thai (`th`)                    |                  1625 |                      71 |                              96 |
| Russian (`ru`)                 |                  1565 |                     285 |                              96 |

The last column counts messages containing retained source-script names, including
descriptions and variants that reference them; it is not a count of unique names.
Korean had no missing messages in the original translation run. Its row records
the subsequent Bolt terminology verification, rather than a new translation or
full-language review: all 88 terminology entries match the Chinese policy in
both the catalog and generated Korean runtime asset, and all 96 retained-name
messages preserve their Chinese terms. No Korean translation changes were needed.
These are principally CN-only Bolt previews, such as 撥山取月槍, 決獄懸鋒槍,
神斷青鋒, and 歲星竊桃. Surrounding prose and general UI are translated;
retained spellings are not claimed to be official target-language names.

The user subsequently specified that Bolt terminology should intentionally
remain Chinese outside `zh-Hant` and `zh-Hans`. Japanese character adaptations
and Korean readings were aligned to the Chinese source names, including terms
embedded in descriptions. The user clarified that only the Bolt path name is
confirmed: complete skill names, short labels, effect/state labels, resource
names, and attunements remain Chinese, including their modifiers. The resource
`槍勢` is also preserved consistently. Before that alignment, German had one
extra retained-name entry because it alone among the seven non-CJK locales kept
`system.resource.spearMomentum` in Chinese. With the complete-label policy,
their current counts now agree at 96.
Japanese also retains these 96 message entries. Its count uses the explicitly
retained Bolt message identities, including descriptions referencing the names,
rather than an unrestricted Han-character count that would include ordinary
Japanese kanji. An earlier report incorrectly excluded Japanese and showed zero;
the catalog already contained the retained Chinese terminology. The policy
changes, including authorized changes to previously
populated cells, are recorded separately in `locales/translation-review.json`.

## Terminology and semantic checks

Shared-reference recovery verifies effective English and target-language base/diff
records from snapshot `2026-11-09_05-54-00-540_+0000-FVu9ar`. Existing reviewed
catalog terms seed each language glossary. Unambiguous official base names are
reused when composing simulator stages, cancel routes, and effect descriptions.
Datamined base terms and authored simulator text have distinct provenance.

Review rejected misleading short-label matches: identical Chinese abbreviations
can refer to unrelated concepts. Examples included Soul Return versus Star Reacher,
light as illumination versus a light attack, and unrelated names matched by `Cad`.
Other corrections preserved charged-attack meaning, cancel modifiers, timing,
resource distinctions, stack caps, and negation. Preset `PC` means Perfect Catch;
Jade preset `TB` means Thunderous Bloom. The `QingyisCharm` semantic IDs display
Bitter Seasons, so new short labels use that concept rather than guessing from IDs.

`locales/glossary.json` records the new canonical `system.*` and `stat.*` terms.
`locales/translation-review.json` contains exact reviewed scope, correction keys,
findings, uncertainties, retained-name keys, and compact reference/layer evidence.
Neither file is loaded by the runtime.

## Limits and follow-up

This run fills missing cells; it does not re-audit every pre-existing translation.
Existing inconsistencies include `system.affinity` in Simplified Chinese, Japanese,
and Vietnamese using generic/social affinity wording while rate labels use combat
affinity. Some pre-existing Traditional Chinese descriptions also predate current
English mechanics. Existing unusual equipment names are preserved and identified
in the machine-readable review notes rather than silently replaced.

The Skill Editor still constructs a few sentences from separate labels and fragments.
New translations account for this context, but a future whole-message placeholder
would allow better inflection and punctuation in languages such as German and Russian.
This run does not change component structure or calculation behavior.

## Verification

All twelve language selections were exercised in the browser, including the
document language, native picker names, and translated character-stat heading.
Japanese, Vietnamese, Cyrillic, and Thai text rendered in the inspected views.
Thai was checked at a 390 × 844 viewport without page-wide horizontal overflow.
Long priority headers and setup comparison labels now wrap inside their columns;
the Vietnamese option check found no overflowing labels among 60 inspected spans.

The browser check also exposed a cached default-rotation name retaining a previous
language. Shared rotation results now retain the source name and localize it only
at display time. A regression test switches the display language without another
baseline calculation; Russian-to-Thai preset-label switching was also verified
in the browser. The preview reported no browser console errors.

Validation passed: localization extraction/check, formatting, lint, TypeScript,
production build, and all 2,083 tests across 324 test files. Lint retains existing
array-index-key warnings, and the production build retains its existing large-chunk
warning. The first test attempt lost sandbox temporary cache files; rerunning
with the test temporary directory under ignored `local/` completed successfully.

Structural validation checks source identity, placeholder occurrence counts, empty
values, and glossary agreement. Numeric-format warnings require semantic inspection:
decimal commas, grouping spaces, and number words can differ without changing values.
The published-locale test enforces the complete English key set, and the runtime
fallback test explicitly removes a message from a locale asset.
