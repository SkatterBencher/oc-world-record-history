#!/usr/bin/env python3
"""
One-time migration: convert subcategory from string/null to array in all record.json files.
Run from repo root: python3 migrate_subcategory.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent
CATEGORIES = ["cpu", "gpu", "memory"]
migrated = 0
already_ok = 0

for cat in CATEGORIES:
    cat_dir = ROOT / cat
    if not cat_dir.exists():
        continue
    for uid_dir in cat_dir.iterdir():
        rfile = uid_dir / "record.json"
        if not rfile.exists():
            continue
        with open(rfile, encoding="utf-8") as f:
            data = json.load(f)

        sub = data.get("subcategory")

        if isinstance(sub, list):
            already_ok += 1
            continue

        # Convert: None -> [], string -> [string] (skip empty string)
        if sub is None or sub == "":
            data["subcategory"] = []
        else:
            data["subcategory"] = [sub]

        with open(rfile, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        migrated += 1
        print(f"  Migrated: {cat}/{uid_dir.name} ({sub!r} → {data['subcategory']})")

print(f"\nDone. Migrated: {migrated}, already correct: {already_ok}")