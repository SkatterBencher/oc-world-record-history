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
try:
    from PIL import Image as PILImage
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False
    print('WARNING: Pillow not installed — images will be copied as-is. Run: pip install Pillow')

ROOT       = Path(__file__).parent
CATEGORIES = ["cpu", "gpu", "memory"]
OUTPUT_DIR = ROOT / "site" / "data"
ASSET_DIR  = ROOT / "site" / "assets"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── IMAGE PROCESSING ──────────────────────────────────
MAX_WIDTH    = 1200   # px — wider images get scaled down
MAX_SIZE_KB  = 400    # KB — files under this skip resize (just convert)
WEBP_QUALITY = 82     # 0-100

def to_web_filename(filename):
    """Return the web-served filename (always .webp)."""
    return Path(filename).stem + ".webp"

def process_image(src: Path, dest_dir: Path) -> Path | None:
    """
    Convert src image to a web-optimised WebP in dest_dir.
    - Scales down if wider than MAX_WIDTH
    - Always converts to WebP (handles GIF, PNG, JPEG, etc.)
    - Skips if dest is already newer than src
    Returns dest path if written, None if skipped.
    """
    dest = dest_dir / to_web_filename(src.name)

    # Skip if already up to date
    if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
        return None

    if not PILLOW_AVAILABLE:
        # Fallback: straight copy with original extension
        dest = dest_dir / src.name
        shutil.copy2(src, dest)
        return dest

    try:
        with PILImage.open(src) as im:
            # Flatten transparency for formats that don't support it in WebP lossily
            if im.mode in ("RGBA", "LA", "P"):
                background = PILImage.new("RGB", im.size, (255, 255, 255))
                if im.mode == "P":
                    im = im.convert("RGBA")
                if im.mode in ("RGBA", "LA"):
                    background.paste(im, mask=im.split()[-1])
                im = background
            elif im.mode != "RGB":
                im = im.convert("RGB")

            # Scale down if too wide
            w, h = im.size
            if w > MAX_WIDTH:
                new_h = int(h * MAX_WIDTH / w)
                im = im.resize((MAX_WIDTH, new_h), PILImage.LANCZOS)

            im.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)
        return dest
    except Exception as e:
        print(f"  WARNING: could not process {src.name}: {e}")
        # Fallback: copy original
        shutil.copy2(src, dest_dir / src.name)
        return dest_dir / src.name



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

            # Copy/convert images into site/assets/category/uid/
            if image_files:
                dest_dir = ASSET_DIR / category / record_dir.name
                dest_dir.mkdir(parents=True, exist_ok=True)
                for img in image_files:
                    web_copy = process_image(img, dest_dir)
                    if web_copy:
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


# Generate sitemap.xml
BASE_URL = "https://museum.skatterbencher.com"
sitemap_urls = [
    '  <url><loc>' + BASE_URL + '/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>',
    '  <url><loc>' + BASE_URL + '/#cpu</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>',
    '  <url><loc>' + BASE_URL + '/#gpu</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>',
    '  <url><loc>' + BASE_URL + '/#memory</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>',
    '  <url><loc>' + BASE_URL + '/#about</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>',
]
sitemap_lines = '\n'.join(sitemap_urls)
sitemap_xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + sitemap_lines + '\n</urlset>'
with open(ROOT / "site" / "sitemap.xml", "w", encoding="utf-8") as f:
    f.write(sitemap_xml)
print(f"Built {len(records)} records across {len(CATEGORIES)} categories")
print(f"Tags found: {sorted(tag_index.keys())}")
print(f"Assets copied: {assets_copied}, auto-synced to records: {assets_synced}")
print(f"Output: {OUTPUT_DIR}")