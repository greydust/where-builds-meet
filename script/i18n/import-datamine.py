"""Fill empty catalog cells from exact, shared-reference datamined translations.

Usage: python script/i18n/import-datamine.py PATH/wwm-translations.sqlite
Optional --missing PATH writes every remaining gap as CSV (use local/ for probes).
Existing translations are never overwritten. Run npm run i18n:extract afterward.
"""

import argparse
import csv
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANGUAGES = {
    "zh-Hans": "zh_cn", "ja": "ja", "es": "es", "fr": "fr", "de": "de",
    "pt": "pt_br", "vi": "vi", "th": "th", "ru": "ru",
}


def placeholders(text):
    return sorted(re.findall(r"\{([A-Za-z][A-Za-z0-9]*)\}", text))


def usable(text):
    return bool(text and text.strip() and "\ufffd" not in text and "<" not in text and ">" not in text)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    parser.add_argument("--missing", type=Path)
    args = parser.parse_args()
    database = sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True)
    with (ROOT / "locales/translations.csv").open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        headers = list(reader.fieldnames)
        rows = list(reader)
    if "th" not in headers:
        headers.insert(headers.index("ru"), "th")
    sources = {language: {} for language in [*LANGUAGES.values(), "zh_tw", "ko"]}
    for source, language, layer in database.execute("SELECT id, language, layer FROM sources"):
        if language in sources:
            sources[language][layer] = source
    cache = {}

    def translation(reference, language):
        cache_key = (reference, language)
        if cache_key not in cache:
            # A diff supersedes base, including when the new record is undecodable.
            value = None
            for layer in ["diff", "base"]:
                source = sources[language].get(layer)
                record = database.execute(
                    "SELECT text, status FROM records WHERE reference = ? AND source = ?",
                    (reference, source),
                ).fetchone()
                if record:
                    if record[1] == "decoded" and usable(record[0]):
                        value = record[0]
                    break
            cache[cache_key] = value
        return cache[cache_key]

    counts = {locale: 0 for locale in LANGUAGES}
    for row in rows:
        # UI sentences are authored by the site, not owned by the game's catalog.
        if not row["key"].startswith(("data.", "stat.", "system.", "game.event.")):
            continue
        references = {reference for (reference,) in database.execute(
            "SELECT reference FROM english WHERE text = ?", (row["en"],)
        )}
        # Known translations identify context when an English name has homonyms.
        for anchor, language in [("zh-Hant", "zh_tw"), ("ko", "ko")]:
            matching = {ref for ref in references if translation(ref, language) == row.get(anchor)}
            if matching:
                references = matching
        for locale, language in LANGUAGES.items():
            if row.get(locale):
                continue
            candidates = {translation(ref, language) for ref in references}
            candidates.discard(None)
            if len(candidates) == 1:
                value = candidates.pop()
                if placeholders(value) == placeholders(row["en"]):
                    row[locale] = value
                    counts[locale] += 1
    with (ROOT / "locales/translations.csv").open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=headers, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    if args.missing:
        with args.missing.open("w", encoding="utf-8", newline="") as output:
            writer = csv.writer(output, lineterminator="\n")
            writer.writerow(["locale", "key", "english"])
            for locale in LANGUAGES:
                writer.writerows((locale, row["key"], row["en"]) for row in rows if not row.get(locale))
    report = [
        "# Localization catalog coverage", "",
        f"Source snapshot: `{args.database.parent.name}`. Catalog messages: {len(rows)}.", "",
        "Existing Traditional Chinese and Korean translations are complete and preserved.",
        "Catalog cells include datamined terms, separately authored translations, and retained",
        "technical notation or proper names. The importer fills only unambiguous empty cells;",
        "it preserves existing translations. Coverage measures populated catalog cells, not",
        "linguistic accuracy or availability of official localized names. Missing messages fall",
        "back to English. See [translation review](localization-review.md) for review scope and limits.", "",
        "| Locale | Populated | Missing game terms/text | Missing site copy | Coverage |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for locale in LANGUAGES:
        missing = [row for row in rows if not row.get(locale)]
        game = sum(row["key"].startswith(("data.", "stat.", "system.", "game.event.")) for row in missing)
        translated = len(rows) - len(missing)
        report.append(f"| {locale} | {translated} | {game} | {len(missing) - game} | {translated / len(rows):.0%} |")
    report += ["", "Missing game text includes simulator variants and descriptions without an exact safe",
               "datamine match. Site copy requires separate translation; it is not supplied by the game.", "",
               "To list every missing key, rerun the importer with `--missing local/localization-missing.csv`.",
               "The importer only fills empty cells. Run `npm run i18n:extract` after importing.", ""]
    (ROOT / "doc/localization-coverage.md").write_text("\n".join(report), encoding="utf-8")
    print("Imported empty cells:", counts)


if __name__ == "__main__":
    main()
