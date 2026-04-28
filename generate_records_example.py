import json
import os
from datetime import datetime

records_raw = [
    ("August 23, 2025",    9130.33, "Wytiwx",           None,       [],                                "Intel Core i9-14900KF"),
    ("January 11, 2025",   9121.61, "Wytiwx",           None,       [],                                "Intel Core i9-14900KF"),
    ("March 7, 2024",      9117.75, "Elmor",             None,       [],                                "Intel Core i9-14900KS"),
    ("October 16, 2023",   9043.92, "Elmor",             None,       [],                                "Intel Core i9-14900KF"),
    ("December 9, 2022",   9008.82, "Elmor",             None,       [],                                "Intel Core i9-13900K"),
    ("October 14, 2022",   8812.85, "Elmor",             None,       [],                                "Intel Core i9-13900K"),
    ("November 19, 2012",  8794.33, "AndreYang",         None,       [],                                "AMD FX-8350"),
    ("November 1, 2011",   8709.06, "AndreYang",         None,       [],                                "AMD FX-8150"),
    ("November 1, 2011",   8585.05, "AndreYang",         None,       [],                                "AMD FX-8150"),
    ("October 31, 2011",   8491.70, "Chew*",             None,       [],                                "AMD FX-8150"),
    ("October 27, 2011",   8461.51, "AndreYang",         None,       [],                                "AMD FX-8150"),
    ("September 2, 2011",  8429.38, "Macci",             None,       [],                                "AMD FX-8150"),
    ("August 19, 2011",    8308.94, "TaPaKaH",           None,       [],                                "Intel Celeron D 352"),
    ("September 23, 2010", 8242.45, "Duck",              None,       [],                                "Intel Celeron D 360"),
    ("July 20, 2007",      8220.10, "Duck",              None,       [],                                "Intel Pentium 4 631"),
    ("July 20, 2007",      8180.40, "Duck",              None,       [],                                "Intel Pentium 4 631"),
    ("March 30, 2007",     8179.89, "ThuG",              None,       [],                                "Intel Celeron D 360"),
    ("January 22, 2007",   8000.10, "ThuG",              None,       [],                                "Intel Pentium 4 631"),
    ("January 21, 2007",   7791.79, "ThuG",              None,       [],                                "Intel Pentium 4 631"),
    ("February 6, 2006",   7657.60, "Duck",              None,       [],                                "Intel Pentium 4 670"),
    ("December 29, 2005",  7638.60, "Duck",              None,       [],                                "Intel Pentium 4 670"),
    ("December 28, 2005",  7625.10, "Duck",              None,       [],                                "Intel Pentium 4 670"),
    ("December 13, 2005",  7608.50, "Duck",              None,       [],                                "Intel Pentium 4 670"),
    ("December 13, 2005",  7532.80, "Duck",              None,       [],                                "Intel Pentium 4 670"),
    ("November 13, 2005",  7473.75, "Kyosen",            None,       [],                                "Intel Pentium 4 670"),
    ("September 16, 2005", 7418.40, "Memesama",          None,       [],                                "Intel Pentium 4 670"),
    ("August 13, 2005",    7323.70, "Memesama",          None,       [],                                "Intel Pentium 4 670"),
    ("August 9, 2005",     7133.50, "Memesama",          None,       [],                                "Intel Pentium 4 670"),
    ("July 29, 2005",      6925.20, "TAM",               None,       [],                                "Intel Pentium 4 670"),
    ("June 7, 2005",       6578.85, "The Stilt",         None,       [],                                "Intel Pentium 4 660"),
    ("January 18, 2005",   6495.20, "Futto-kun",         None,       [],                                "Intel Pentium 4 570J"),
    ("November 29, 2004",  6315.20, "Fugger",            None,       [],                                "Intel Pentium 4 560J"),
    ("November 1, 2004",   6302.30, "Fugger",            None,       [],                                "Intel Pentium 4 560J"),
    ("November 1, 2004",   6212.10, "Fugger",            None,       [],                                "Intel Pentium 4 560J"),
    ("October 28, 2004",   6114.00, "Memesama",          None,       [],                                "Intel Pentium 4 560"),
    ("October 16, 2004",   6042.50, "Memesama",          None,       [],                                "Intel Pentium 4 560"),
    ("May 25, 2004",       6009.80, ["Macci", "The Stilt"], None,    [],                                "Intel Pentium 4 560"),
    ("Jun 22, 2004",       5574.90, "Memesama",          None,       [],                                "Intel Pentium 4 2.8 GHz"),
    ("May 9, 2004",        5387.20, "Memesama",          None,       [],                                "Intel Pentium 4 2.8 GHz"),
    ("January 2, 2004",    5326.36, "Memesama",          None,       [],                                "Intel Pentium 4 XE 3.20G"),
    ("December 30, 2003",  5255.00, "Frank Volkel",      None,       [],                                None),
    ("December 2, 2003",   5154.54, "Memesama",          None,       [],                                "Intel Pentium 4 XE 3.20G"),
    ("July 3, 2003",       5125.91, "TAM",               None,       [],                                "Intel Pentium 4 3.2 GHz"),
    ("June 29, 2003",      4872.65, "TAM",               None,       [],                                "Intel Pentium 4 3.2 GHz"),
    ("May 24, 2003",       4762.40, "OMEGA",             None,       [],                                "Intel Pentium 4 3.0 GHz"),
    ("February 23, 2003",  4623.21, "Holicho",           None,       [],                                "Intel Pentium 4 3.06 GHz"),
    ("February 14, 2003",  4599.85, "Holicho",           None,       [],                                "Intel Pentium 4 3.06 GHz"),
    ("December 8, 2002",   4588.49, "Holicho",           None,       [],                                "Intel Pentium 4 2.5 GHz"),
    ("December 1, 2002",   4456.58, "Tamozyouri",        None,       [],                                "Intel Pentium 4 3.06 GHz"),
    ("November 17, 2002",  4438.35, "Ja0hxv",            None,       [],                                "Intel Pentium 4 3.06 GHz"),
    ("September 15, 2002", 4424.99, "Holicho",           None,       [],                                "Intel Pentium 4 2.5 GHz"),
    ("September 1, 2002",  4418.38, "Holicho",           None,       [],                                "Intel Pentium 4 2.5 GHz"),
    ("August 29, 2002",    4339.00, "Muropaketti",       None,       [],                                "Intel Pentium 4 2.8 GHz"),
    ("August 19, 2002",    4309.62, None,                None,       [],                                "Intel Pentium 4 2.4 GHz"),
    ("July 10, 2002",      4244.70, "Son",               None,       [],                                "Intel Pentium 4 2.53 GHz"),
    ("September 1, 2002",  4130.39, "Holicho",           None,       [],                                "Intel Pentium 4 2.4 GHz"),
    ("April 14, 2002",     4110.00, "Holicho",           None,       [],                                "Intel Pentium 4 2.4 GHz"),
    ("March 27, 2002",     4010.88, "Holicho",           None,       [],                                "Intel Pentium 4 2.4 GHz"),
    ("March 22, 2002",     3890.79, "Tatumiya",          None,       [],                                "Intel Pentium 4 2.2 GHz"),
    ("January 23, 2002",   3808.91, "Holicho",           None,       [],                                "Intel Pentium 4 2.2 GHz"),
    ("January 19, 2002",   3702.55, "Tatumiya",          None,       [],                                "Intel Pentium 4 2.2 GHz"),
    ("January 17, 2002",   3674.99, "Sampsa",            None,       [],                                "Intel Pentium 4 2.2 GHz"),
    ("January 9, 2002",    3541.87, "Holicho",           None,       [],                                "Intel Pentium 4 2.2 GHz"),
    ("November 7, 2001",   3391.12, "Eric",              None,       [],                                "Intel Xeon 1.7 GHz"),
    ("October 9, 2001",    3027.41, "Holicho",           None,       [],                                "Intel Pentium 4 2.0 GHz"),
    ("September 5, 2001",  3023.98, "Anpanman",          None,       [],                                "Intel Pentium 4 2.0 GHz"),
    ("April 2, 2001",      2864.48, "Holicho",           None,       [],                                "Intel Pentium 4 1.7 GHz"),
    ("March 29, 2001",     2804.99, "Holicho",           None,       [],                                "Intel Pentium 4 1.7 GHz"),
    ("March 15, 2001",     2600.37, "Holicho",           None,       [],                                "Intel Pentium 4 1.7 GHz"),
    ("March 8, 2001",      2250.00, "Anpanman",          None,       [],                                "Intel Pentium 4 1.7 GHz"),
    ("December 13, 2000",  2205.56, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Pentium 4 1.4 GHz"),
    ("December 3, 2000",   2144.52, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Pentium 4 1.4 GHz"),
    ("December 1, 2000",   1653.02, "Anpanman",          None,       [],                                "Intel Pentium III 933 MHz"),
    ("November 5, 2000",   1613.45, "Mr. Yu",            None,       [],                                "AMD Athlon 1100 MHz"),
    ("September 3, 2000",  1612.66, "HIDE",              None,       [],                                "Intel Pentium III 850 MHz"),
    ("April 13, 2000",     1522.71, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Pentium III 800 MHz"),
    ("April 9, 2000",      1500.00, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Pentium III 800 MHz"),
    ("April 2, 2000",      1370.00, "Mr. amt",           None,       [],                                "Intel Pentium III 800 MHz"),
    ("December 28, 1999",  1286.30, "Mr. amt",           None,       [],                                "Intel Pentium III 750"),
    ("November 21, 1999",  1264.92, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Pentium III 733ES"),
    ("November 16, 1999",  1238.92, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Pentium III 733ES"),
    ("November 1, 1999",   1151.51, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "AMD Athlon 700 MHz"),
    ("October 7, 1999",    1082.11, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "AMD Athlon 650 MHz"),
    ("June 19, 1999",       921.16, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Celeron 466"),
    ("March 21, 1999",      849.85, "Mr. Funano",        None,       [],                                "Intel Celeron 366"),
    ("March 6, 1999",       822.00, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Celeron 333"),
    ("February 20, 1999",   811.92, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Celeron 333"),
    ("February 17, 1999",   808.49, "Mr. Funano",        None,       [],                                "Intel Celeron 366"),
    ("January 10, 1999",    759.16, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Celeron 300A"),
    ("December 30, 1998",   743.40, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Celeron 300A"),
    ("December 13, 1998",   724.50, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Celeron 300A"),
    ("November 21, 1998",   716.00, "Katsuya",           None,       [],                                "Intel Celeron 300A"),
    ("November 9, 1998",    715.95, "Mr. Kondo",         "近藤さん", ["ja0hxv"],                        "Intel Celeron 300A"),
    ("October 7, 1998",     698.88, "KAZ",               None,       [],                                "Intel Celeron 300A"),
    ("September 12, 1998",  675.00, "Takach",            None,       [],                                None),
    ("August 1, 1998",      661.50, "RYK",               None,       [],                                "Intel Pentium II 450 MHz"),
    ("July 1, 1998",        610.00, None,                None,       [],                                None),
    ("April 1, 1998",       590.00, None,                None,       [],                                None),
    ("March 1, 1998",       530.00, "Mega Pi",           None,       [],                                "Intel Pentium II 400"),
    ("January 11, 1998",    416.50, "Masashi",           None,       [],                                "Intel Pentium II 333 MHz"),
    ("December 5, 1997",    400.00, "Kryotech",          None,       [],                                "Intel Pentium II"),
    ("November 17, 1997",   375.00, "Kryotech",          None,       [],                                "AMD K6 266"),
    ("November 1, 1997",    337.50, "Masashi",           None,       [],                                "Intel Pentium II 300 Mhz"),
    ("November 18, 1996",   266.00, "Kryotech",          None,       [],                                "Intel Pentium Pro 200 MHz"),
    ("August 1, 1996",      233.00, "Masashi",           None,       [],                                "Intel Pentium Pro 200"),
]

def parse_date(date_str):
    date_str = date_str.strip()
    formats = [
        "%B %d, %Y", "%b %d, %Y",
        "%B %Y",     "%b %Y",
    ]
    for fmt in formats:
        try:
            d = datetime.strptime(date_str, fmt)
            if "%d" not in fmt:
                return d.strftime("%Y-%m-01"), True  # approximate
            return d.strftime("%Y-%m-%d"), False
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {date_str}")

def make_uid(date_iso, value_mhz):
    date_part = date_iso.replace("-", "")
    value_part = str(int(value_mhz))
    return f"{date_part}_{value_part}"

def make_overclocker(handle, real_name, aliases):
    if handle is None:
        return [{"handle": "Unknown", "real_name": None, "aliases": [], "country": None, "profile_url": None}]
    if isinstance(handle, list):
        return [{"handle": h, "real_name": None, "aliases": [], "country": None, "profile_url": None} for h in handle]
    return [{
        "handle": handle,
        "real_name": real_name,
        "aliases": aliases,
        "country": None,
        "profile_url": None
    }]

base = os.path.join(os.getcwd(), "cpu")
uid_counts = {}

for row in records_raw:
    date_str, value_mhz, handle, real_name, aliases, cpu = row
    date_iso, approximate = parse_date(date_str)
    uid = make_uid(date_iso, value_mhz)

    # Handle duplicate UIDs (same date + same floor MHz)
    if uid in uid_counts:
        uid_counts[uid] += 1
        uid = f"{uid}_{uid_counts[uid]:02d}"
    else:
        uid_counts[uid] = 0

    folder = os.path.join(base, uid)
    os.makedirs(folder, exist_ok=True)

    record = {
        "uid": uid,
        "category": "cpu",
        "subcategory": None,
        "achieved_at": date_iso,
        "achieved_at_approximate": approximate,
        "value_mhz": value_mhz,
        "hardware": {
            "primary": cpu if cpu else "Unknown",
            "motherboard": None,
            "memory": None,
            "cooling": None
        },
        "overclockers": make_overclocker(handle, real_name, aliases),
        "sources": [],
        "assets": [],
        "tags": [],
        "notes": None,
        "verified": True,
        "submitted_by": "skatterbencher"
    }

    with open(os.path.join(folder, "record.json"), "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)

print(f"Generated {len(records_raw)} records")
print("UIDs with duplicates:", {k: v for k, v in uid_counts.items() if v > 0})