import json
import os
from datetime import datetime

# (date DD/MM/YYYY, freq_mhz, overclocker, gpu)
records_raw = [
    ("05/09/2025", 4250, "Massman / SkatterBencher", "Intel Graphics (Arrow Lake)"),
    ("06/07/2023", 4020, "Splave",                   "NVIDIA GeForce RTX 4090"),
    ("06/07/2023", 4005, "Splave",                   "NVIDIA GeForce RTX 4090"),
    ("05/07/2023", 3975, "CENS",                     "NVIDIA GeForce RTX 4090"),
    ("28/06/2023", 3945, "Splave",                   "NVIDIA GeForce RTX 4090"),
    ("17/06/2023", 3930, "CENS",                     "NVIDIA GeForce RTX 4090"),
    ("22/02/2023", 3840, "OGS",                      "NVIDIA GeForce RTX 4090"),
    ("19/11/2022", 3825, "OGS",                      "NVIDIA GeForce RTX 4090"),
    ("03/11/2022", 3705, "OGS",                      "NVIDIA GeForce RTX 4090"),
    ("24/10/2022", 3345, "OGS",                      "NVIDIA GeForce RTX 4090"),
    ("12/05/2021", 3319, "OGS",                      "AMD Radeon RX 6900 XT"),
    ("21/04/2021", 3225, "Der8auer",                 "AMD Radeon RX 6900 XT"),
    ("22/03/2017", 3025, "K|ngp|n",                  "NVIDIA GeForce GTX 1080 Ti"),
    ("18/12/2016", 3012, "Vivi",                     "NVIDIA GeForce GTX 1060"),
    ("04/11/2016", 2885, "OGS",                      "NVIDIA GeForce GTX 1060"),
    ("04/11/2016", 2860, "OGS",                      "NVIDIA GeForce GTX 1060"),
    ("30/10/2016", 2822, "Shimizu",                  "NVIDIA GeForce GTX 1060"),
    ("05/08/2016", 2784, "Rsannino",                 "NVIDIA GeForce GTX 1080"),
    ("24/07/2016", 2750, "Xtreme Addict",            "NVIDIA GeForce GTX 1080"),
    ("24/07/2016", 2700, "Xtreme Addict",            "NVIDIA GeForce GTX 1080"),
    ("06/07/2016", 2645, "Dancop",                   "NVIDIA GeForce GTX 1080"),
    ("22/06/2016", 2450, "Xtreme Addict",            "NVIDIA GeForce GTX 1080"),
    ("05/06/2016", 2420, "Vivi",                     "NVIDIA GeForce GTX 1080"),
    ("24/08/2011", 2400, "Lucky_n00b",               "Intel HD Graphics 3000 (Sandy Bridge)"),
    ("19/07/2011", 2300, "Samba",                    "Intel HD Graphics 3000 (Sandy Bridge)"),
    ("16/01/2011", 2234, "Matose",                   "Intel HD Graphics 3000 (Sandy Bridge)"),
    ("15/01/2011", 2170, "Matose",                   "Intel HD Graphics 3000 (Sandy Bridge)"),
    ("13/01/2011", 2000, "Stummerwinter",            "Intel HD Graphics 3000 (Sandy Bridge)"),
    ("06/01/2011", 1950, "[Wanted]",                 "Intel HD Graphics 2000 (Sandy Bridge)"),
    ("03/01/2011", 1700, "Matose",                   "Intel HD Graphics 3000 (Sandy Bridge)"),
    ("11/04/2010", 1525, "Elmor & Kinc",             "AMD Radeon HD 5870"),
    ("11/03/2010", 1485, "NickShih",                 "AMD Radeon HD 5870"),
    ("20/02/2010", 1450, "Massman",                  "AMD Radeon HD 5870"),
    ("12/01/2010", 1420, "NickShih",                 "AMD Radeon HD 5870"),
    ("12/01/2010", 1410, "NickShih",                 "AMD Radeon HD 5870"),
    ("19/12/2009", 1400, "Massman",                  "NVIDIA GeForce GTX 275"),
    ("29/11/2009", 1380, "Deanzo",                   "AMD Radeon HD 5870"),
    ("20/01/2008", 1360, "Hipro5",                   "AMD Radeon HD 2900 XT"),
    ("30/12/2007", 1193, "Gautam",                   "AMD Radeon HD 2900 XT"),
    ("08/12/2007", 1180, "GPRHellas",                "AMD Radeon HD 2900 XT"),
    ("30/06/2007", 1168, "marcin88",                 "NVIDIA GeForce 7900 GTO"),
    ("05/06/2007", 1120, "Macci",                    "Ati Radeon HD 2900 XT"),
    ("06/05/2007", 1048, "Achill3us",                "NVIDIA GeForce 8600 GT"),
    ("11/06/2006", 1045, "K|ngp|n",                  "NVIDIA GeForce 7900 GTX"),
    ("17/10/2005", 1006, "Sampsa",                   "ATi Radeon X1800 XT"),
    ("11/10/2005",  878, "Macci",                    "ATi Radeon X1800 XT"),
    ("03/06/2005",  860, "Macci",                    "Ati Radeon X850 XT PE"),
    ("18/11/2004",  824, "OPPainter",                "Ati Radeon X800 XT"),
    ("01/10/2004",  810, "Macci",                    "Ati Radeon X800 XT Platinum"),
    ("15/09/2004",  807, "Macci",                    "Ati Radeon X800 Pro"),
    ("07/05/2004",  715, None,                       "Ati Radeon X800 XT Platinum"),
    ("25/10/2003",  711, "Kamu",                     "GeForce FX 5900 Ultra"),
    ("11/09/2003",  702, "Donebalp",                 "GeForce FX 5900 Ultra"),
    ("08/07/2003",  689, "Macci",                    "GeForce FX 5900 Ultra"),
    ("11/06/2003",  594, "FUGGER",                   "Ati Radeon 9800 XT"),
    ("30/05/2003",  567, "OPPainter",                "Ati Radeon 9800 Pro"),
    ("11/05/2003",  558, "Macci",                    "Ati Radeon 9800 Pro"),
    ("10/05/2003",  540, "DigitalJesus",             "Ati Radeon 9800 Pro"),
    ("04/02/2003",  513, "Holicho",                  "Ati Radeon 9700 Pro"),
    ("27/09/2002",  508, "OPPainter",                "Ati Radeon 9700 Pro"),
    ("11/09/2002",  479, "Holicho",                  "Ati Radeon 9700 Pro"),
    ("20/07/2002",  409, "Kamu",                     "NVIDIA GeForce 4 Ti 4600"),
    ("29/06/2002",  405, "JCViggen",                 "NVIDIA GeForce 4 Ti 4600"),
    ("05/06/2002",  391, "Doc",                      "NVIDIA GeForce 4 Ti 4600"),
    ("06/05/2002",  378, "Sampsa",                   "NVIDIA GeForce 4 Ti 4600"),
    ("07/04/2002",  365, "Gjwild",                   "NVIDIA GeForce 4 Ti 4600"),
    ("23/11/2001",  305, "Macci",                    "NVIDIA GeForce3"),
    ("28/05/2001",  256, "Macci",                    "NVIDIA GeForce3"),
    ("12/11/1999",  195, None,                       "NVIDIA Riva TNT2 Ultra"),
    ("21/04/1999",  175, "iXBT Labs",                "3DFX Voodoo3-2000"),
    ("13/09/1998",  135, "AnandTech",                "NVIDIA Riva TNT"),
    ("19/01/1998",  118, "Liaor",                    "Rendition Verite V2x00"),
]

def parse_date(date_str):
    """Parse DD/MM/YYYY format."""
    return datetime.strptime(date_str.strip(), "%d/%m/%Y").strftime("%Y-%m-%d")

def make_uid(date_iso, value_mhz):
    return f"{date_iso.replace('-','')}_{int(value_mhz)}"

def make_overclockers(handle):
    if not handle:
        return [{"handle": "Unknown", "real_name": None, "aliases": [], "country": None, "profile_url": None}]
    # Handle duo like "Massman / SkatterBencher" or "Elmor & Kinc"
    for sep in [" / ", " & "]:
        if sep in handle:
            parts = [p.strip() for p in handle.split(sep)]
            return [{"handle": p, "real_name": None, "aliases": [], "country": None, "profile_url": None} for p in parts]
    return [{"handle": handle, "real_name": None, "aliases": [], "country": None, "profile_url": None}]

base = os.path.join(os.getcwd(), "gpu")

uid_counts = {}
generated = 0

for row in records_raw:
    date_str, value_mhz, handle, gpu = row
    date_iso = parse_date(date_str)
    uid = make_uid(date_iso, value_mhz)

    # Deduplicate UIDs
    base_uid = uid
    if uid in uid_counts:
        uid_counts[uid] += 1
        uid = f"{base_uid}_{uid_counts[uid]:02d}"
    else:
        uid_counts[uid] = 0

    folder = os.path.join(base, uid)
    os.makedirs(folder, exist_ok=True)

    record = {
        "uid": uid,
        "category": "gpu",
        "subcategory": None,
        "achieved_at": date_iso,
        "achieved_at_approximate": False,
        "value_mhz": float(value_mhz),
        "hardware": {
            "primary": gpu,
            "motherboard": None,
            "memory": None,
            "cooling": None
        },
        "overclockers": make_overclockers(handle),
        "sources": [],
        "assets": [],
        "tags": [],
        "notes": None,
        "verified": True,
        "submitted_by": "skatterbencher"
    }

    with open(os.path.join(folder, "record.json"), "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)

    generated += 1

print(f"Generated {generated} GPU records")
dupes = {k: v for k, v in uid_counts.items() if v > 0}
if dupes:
    print(f"Deduplicated UIDs: {dupes}")