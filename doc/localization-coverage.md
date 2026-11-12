# Localization catalog coverage

Catalog: 2,087 English messages. Updated November 12, 2026.

All twelve published locales have a populated value for every English catalog key.
English, Traditional Chinese, and Korean were already complete; the other nine
locales now combine datamined terminology with separately translated site copy
and simulator labels. Existing populated translations were preserved.

| Locale  | Populated | Missing game text | Missing site copy | Coverage |
| ------- | --------: | ----------------: | ----------------: | -------: |
| zh-Hans |      2087 |                 0 |                 0 |     100% |
| ja      |      2087 |                 0 |                 0 |     100% |
| es      |      2087 |                 0 |                 0 |     100% |
| fr      |      2087 |                 0 |                 0 |     100% |
| de      |      2087 |                 0 |                 0 |     100% |
| pt      |      2087 |                 0 |                 0 |     100% |
| vi      |      2087 |                 0 |                 0 |     100% |
| th      |      2087 |                 0 |                 0 |     100% |
| ru      |      2087 |                 0 |                 0 |     100% |

Coverage counts non-empty cells, not linguistic accuracy or official-name availability.
Technical input notation, service names, and some proper names deliberately remain
unchanged. Bolt names intentionally retain their Chinese source spelling outside
the two Chinese locales, following the user's terminology preference. Only the
Bolt path name is confirmed; other Bolt terms and their complete labels remain
Chinese, while surrounding prose and general UI are localized. See the
[review report](localization-review.md) and `locales/translation-review.json` for details.
Future missing messages still fall back to English.

The datamine importer fills only empty cells and does not establish human approval.
Use the repository localization skill for translation/review and run
`npm run i18n:extract` to regenerate runtime assets and selector percentages.
