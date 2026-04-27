#!/usr/bin/env python3
"""
Build script: walks all category folders, validates record.json files,
generates site/data/index.json and site/data/tags.json,
and copies all record assets into site/assets/.

Asset sync: if image files exist in a record folder but are missing
from the assets[] array, they are added automatically.
"""

import json
import os
import shutil
import sys
from pathlib import Path

ROOT       = Path(__file__).parent
CATEGORIES = ["cpu", "gpu", "memory"]
OUTPUT_DIR = ROOT / "site" / "data"
ASSET_DIR  = ROOT / "site" / "assets"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

records       = []
errors        = []
tag_index     = {}
assets_copied = 0
assets_synced = 0

def guess_type(filename):
    name = filename.lower()
    if "cpuz" in name or "cpu-z" in name:   return "cpuz"
    if "gpuz" in name or "gpu-z" in name:   return "gpuz"
    if "valid" in name:                      return "validation"
    if "photo" in name or "event" in name:  return "photo"
    return "other"

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

            # Discover all image files in the record folder
            image_files = sorted([
                f for f in record_dir.iterdir()
                if f.is_file() and f.suffix.lower() in IMAGE_EXTS
            ])

            # Auto-sync: add any image files missing from assets[]
            existing_filenames = {a["file"] for a in record.get("assets", [])}
            new_assets = []
            for img in image_files:
                if img.name not in existing_filenames:
                    new_assets.append({
                        "file": img.name,
                        "type": guess_type(img.name),
                        "caption": None
                    })

            if new_assets:
                record.setdefault("assets", []).extend(new_assets)
                # Write back to record.json
                record_copy = {k: v for k, v in record.items() if not k.startswith("_")}
                with open(record_file, "w", encoding="utf-8") as f:
                    json.dump(record_copy, f, indent=2, ensure_ascii=False)
                assets_synced += len(new_assets)

            # Copy all images into site/assets/category/uid/
            if image_files:
                dest_dir = ASSET_DIR / category / record_dir.name
                dest_dir.mkdir(parents=True, exist_ok=True)
                for img in image_files:
                    dest = dest_dir / img.name
                    if not dest.exists() or img.stat().st_mtime > dest.stat().st_mtime:
                        shutil.copy2(img, dest)
                        assets_copied += 1

            # Set asset base path for frontend
            record["_asset_base"] = f"assets/{category}/{record_dir.name}/"

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

# Sort by date ascending, then by value descending (highest freq first on same day)
records.sort(key=lambda r: (r["achieved_at"], -r["value_mhz"]))

# Write outputs
with open(OUTPUT_DIR / "index.json", "w", encoding="utf-8") as f:
    json.dump(records, f, indent=2, ensure_ascii=False)

with open(OUTPUT_DIR / "tags.json", "w", encoding="utf-8") as f:
    json.dump(tag_index, f, indent=2, ensure_ascii=False)

print(f"Built {len(records)} records across {len(CATEGORIES)} categories")
print(f"Tags found: {sorted(tag_index.keys())}")
print(f"Assets copied: {assets_copied}, auto-synced to records: {assets_synced}")
print(f"Output: {OUTPUT_DIR}")