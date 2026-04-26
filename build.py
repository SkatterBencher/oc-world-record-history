#!/usr/bin/env python3
"""
Build script: walks all category folders, validates record.json files,
and generates site/data/index.json and site/data/tags.json
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CATEGORIES = ["cpu", "gpu", "memory"]
OUTPUT_DIR = ROOT / "site" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

records = []
errors = []
tag_index = {}  # tag -> list of uids

for category in CATEGORIES:
    cat_dir = ROOT / category
    if not cat_dir.exists():
        continue
    for record_dir in sorted(cat_dir.iterdir()):
        record_file = record_dir / "record.json"
        if not record_file.exists():
            continue
        try:
            with open(record_file, encoding="utf-8") as f:
                record = json.load(f)

            # Basic validation
            required = ["uid", "category", "achieved_at", "value_mhz", "hardware", "overclockers"]
            for field in required:
                if field not in record:
                    raise ValueError(f"Missing required field: {field}")

            # Add asset paths relative to repo root
            record["_asset_base"] = f"{category}/{record_dir.name}/"

            records.append(record)

            # Build tag index
            for tag in record.get("tags", []):
                tag_index.setdefault(tag, []).append(record["uid"])

        except Exception as e:
            errors.append(f"{record_file}: {e}")

if errors:
    print("VALIDATION ERRORS:")
    for e in errors:
        print(f"  {e}")
    sys.exit(1)

# Sort by date ascending
records.sort(key=lambda r: r["achieved_at"])

# Write outputs
with open(OUTPUT_DIR / "index.json", "w", encoding="utf-8") as f:
    json.dump(records, f, indent=2, ensure_ascii=False)

with open(OUTPUT_DIR / "tags.json", "w", encoding="utf-8") as f:
    json.dump(tag_index, f, indent=2, ensure_ascii=False)

print(f"Built {len(records)} records across {len(CATEGORIES)} categories")
print(f"Tags found: {sorted(tag_index.keys())}")
print(f"Output: {OUTPUT_DIR}")