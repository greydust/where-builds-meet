"""Read-only checks for candidate WWM translations; no external dependencies."""

import argparse
from collections import Counter
import csv
import json
from pathlib import Path
import re
import sys

LOCALES = {"zh-Hans", "zh-Hant", "ja", "ko", "es", "fr", "de", "pt", "vi", "th", "ru"}
PLACEHOLDER = re.compile(r"\{[A-Za-z][A-Za-z0-9]*\}")
NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def read_array(path):
    value = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not isinstance(value, list):
        raise ValueError(f"{path}: expected a JSON array")
    return value


def check(catalog_path, candidates, glossary):
    errors, warnings = [], []

    def issue(target, key, message):
        target.append({"entry": key, "message": message})

    with Path(catalog_path).open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        headers = reader.fieldnames or []
        if "key" not in headers or "en" not in headers:
            raise ValueError("Catalog requires key and en columns")
        catalog = {}
        for row in reader:
            if row["key"] in catalog:
                raise ValueError(f"Duplicate catalog key: {row['key']}")
            catalog[row["key"]] = row

    terms = {}
    for index, term in enumerate(glossary):
        if not isinstance(term, dict) or not all(
            isinstance(term.get(field), str) and term[field].strip()
            for field in ("locale", "key", "source", "translation")
        ):
            raise ValueError(f"Glossary entry {index} requires locale, key, source, translation strings")
        identity = (term["locale"], term["key"])
        if identity in terms:
            raise ValueError(f"Duplicate glossary entry: {identity}")
        if term["locale"] not in LOCALES or term["locale"] not in headers:
            raise ValueError(f"Unsupported glossary locale: {term['locale']}")
        if term["key"] not in catalog or term["source"] != catalog[term["key"]]["en"]:
            raise ValueError(f"Unknown or stale glossary key: {term['key']}")
        terms[identity] = term["translation"]

    seen = set()
    for index, candidate in enumerate(candidates):
        if not isinstance(candidate, dict) or not all(
            isinstance(candidate.get(field), str) and candidate[field].strip()
            for field in ("locale", "key", "source", "translation")
        ):
            issue(errors, str(index), "Requires non-empty locale, key, source, translation strings")
            continue
        locale, key = candidate["locale"], candidate["key"]
        identity = (locale, key)
        label = f"{locale}:{key}"
        if identity in seen:
            issue(errors, label, "Duplicate candidate")
        seen.add(identity)
        if locale not in LOCALES or locale not in headers:
            issue(errors, label, "Unsupported locale or missing catalog column")
            continue
        if key not in catalog:
            issue(errors, label, "Unknown catalog key")
            continue
        source = catalog[key]["en"]
        text = candidate["translation"]
        if candidate["source"] != source:
            issue(errors, label, "English source has changed; recheck context")
        if Counter(PLACEHOLDER.findall(source)) != Counter(PLACEHOLDER.findall(text)):
            issue(errors, label, "Placeholder names or occurrence counts differ")
        if "\ufffd" in text or any(ord(char) < 32 and char not in "\n\t\r" for char in text):
            issue(errors, label, "Replacement character or unexpected control character")
        if identity in terms and text != terms[identity]:
            issue(errors, label, "Translation conflicts with glossary-owned message")
        existing = catalog[key].get(locale)
        if existing and existing != text:
            issue(warnings, label, "Would replace a populated cell; verify correction scope and evidence")
        if text == source and re.search(r"[A-Za-z]{2,}", source):
            issue(warnings, label, "Unchanged English; verify proper-name or technical-token exception")
        source_numbers = Counter(NUMBER.findall(PLACEHOLDER.sub("", source)))
        target_numbers = Counter(NUMBER.findall(PLACEHOLDER.sub("", text)))
        if source_numbers != target_numbers:
            issue(warnings, label, "Numeric tokens differ; verify values and intentional locale formatting")
        if source.count("\n") != text.count("\n"):
            issue(warnings, label, "Line-break count differs; inspect intentional formatting")
        if text != text.strip():
            issue(warnings, label, "Leading or trailing whitespace")

    return {"checked": len(candidates), "errors": errors, "warnings": warnings}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--batch", required=True)
    parser.add_argument("--glossary")
    args = parser.parse_args()
    try:
        report = check(args.catalog, read_array(args.batch), read_array(args.glossary) if args.glossary else [])
    except (OSError, ValueError, csv.Error) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
