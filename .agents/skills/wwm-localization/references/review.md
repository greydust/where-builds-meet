# Language review

## Pilot coverage

For a first translation run, select a small representative set per requested
language: short controls, a parameterized validation message, a stat label,
an official game name, and a mechanics description with timing or stacks.
Avoid selecting only easy names. Reuse findings as concrete style decisions
for remaining batches; a successful pilot is not approval of unseen messages.

## Independent reviewer brief

Give the reviewer the target locale/region, candidate JSON, source text,
glossary evidence, and relevant component/data context. Request:

> Review these translations for Where Builds Meet. Compare each message to its
> English source and actual UI or game context. Check official terminology,
> native phrasing and register, ambiguous short labels, placeholders, numbers,
> units, conditions, negation, timing, triggers, stacking, caps, and technical
> tokens. Do not rewrite verified official names merely for stylistic preference.
> Return findings with locale, key, severity, source meaning, proposed correction,
> and evidence or explanation. Identify uncertain terminology and unchanged
> English that needs a deliberate decision. State which messages you reviewed.
> Passing structural checks or back-translation alone does not prove accuracy.

Translate and review in separate agent contexts where available. A reviewer
should review one language with shared context rather than mixing languages in
one large batch. Reviewers do not modify the live catalog; the integrating agent
reconciles concrete findings and preserves unrelated work. An AI reviewer is
not a native-speaker human reviewer, even when asked to adopt a native voice.

## Findings and completion

- Critical: changed mechanics, missing negation or condition, wrong concept,
  corrupted placeholders or numbers. Correct before integrating that message.
- Major: incorrect terminology, misleading label, wrong region/script, or
  wording that obscures an action. Correct before integrating that message.
- Minor: stylistic or length improvement that does not change meaning. Resolve
  using UI context and the locale's established style.
- Uncertain: evidence is insufficient. Record the uncertainty; leave the cell
  empty when filling it would require an unsupported game name or meaning.

Record accepted corrections and unresolved findings by key. Run structural
validation again after revision. Human review is valuable for uncertain game
terms, but do not add an unsolicited approval gate to otherwise authorized work.

Report completion as separate facts: populated catalog coverage, datamine
evidence, AI language review, actual UI inspection, and human review where
performed. Never describe populated-cell coverage as linguistic accuracy.
