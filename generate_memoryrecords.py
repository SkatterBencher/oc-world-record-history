import json
import os
from datetime import datetime

records_raw = [
    # (date, freq_mhz, subcategory, overclocker, memory_brand)
    ("November 17, 2025",  6765.2, "DDR5", "Sergmann",            "Corsair"),
    ("November 16, 2025",  6703.9, "DDR5", "Saltycroissant",      "Corsair"),
    ("November 3, 2025",   6605.7, "DDR5", "AiMax",               "Patriot"),
    ("October 27, 2025",   6517.4, "DDR5", "Hicookie",            "A-Data"),
    ("October 15, 2025",   6504.9, "DDR5", "Sergmann",            "Corsair"),
    ("September 21, 2025", 6460.1, "DDR5", "Saltycroissant",      "Corsair"),
    ("August 1, 2025",     6443.1, "DDR5", "Saltycroissant",      "Corsair"),
    ("July 10, 2025",      6436.1, "DDR5", "Bl4ckdot",            "G.SKILL"),
    ("May 19, 2025",       6421.5, "DDR5", "Saltycroissant",      "Corsair"),
    ("May 17, 2025",       6416.3, "DDR5", "Saltycroissant",      "Corsair"),
    ("May 4, 2025",        6411.2, "DDR5", "Bl4ckdot",            "G.SKILL"),
    ("May 3, 2025",        6402.7, "DDR5", "Saltycroissant",      "Corsair"),
    ("May 3, 2025",        6386.8, "DDR5", "Bl4ckdot",            "G.SKILL"),
    ("April 13, 2025",     6386.2, "DDR5", "Seby",                "G.SKILL"),
    ("March 29, 2025",     6381.2, "DDR5", "Hicookie",            "A-Data"),
    ("February 20, 2025",  6375.8, "DDR5", "Hicookie",            "V-Color"),
    ("February 2, 2025",   6367.5, "DDR5", "Splave",              "G.SKILL"),
    ("January 24, 2025",   6363.0, "DDR5", "Hicookie",            "V-Color"),
    ("December 5, 2024",   6348.9, "DDR5", "Splave",              "G.SKILL"),
    ("December 3, 2024",   6333.0, "DDR5", "Splave",              "G.SKILL"),
    ("November 27, 2024",  6317.5, "DDR5", "Snakeeyes",           "Patriot"),
    ("November 25, 2024",  6305.8, "DDR5", "Snakeeyes",           "Patriot"),
    ("November 15, 2024",  6263.9, "DDR5", "AKM",                 "V-Color"),
    ("November 13, 2024",  6175.4, "DDR5", "Saltycroissant",      "V-Color"),
    ("November 13, 2024",  6131.9, "DDR5", "AKM",                 "V-Color"),
    ("October 24, 2024",   6097.6, "DDR5", "Kovan",               "Kingston"),
    ("October 24, 2024",   6053.7, "DDR5", "Kovan",               "Kingston"),
    ("September 27, 2024", 6032.7, "DDR5", "BenchMarc",           "G.SKILL"),
    ("September 26, 2024", 6020.6, "DDR5", "CENS",                "G.SKILL"),
    ("February 5, 2024",   5844.3, "DDR5", "Chew*",               "Patriot"),
    ("November 13, 2023",  5824.2, "DDR5", "Hicookie",            "GIGABYTE"),
    ("October 31, 2023",   5824.1, "DDR5", "lupin_no_musume",     "SK Hynix"),
    ("October 20, 2023",   5809.2, "DDR5", "Hicookie",            "GIGABYTE"),
    ("October 2, 2023",    5806.5, "DDR5", "lupin_no_musume",     "SK Hynix"),
    ("June 7, 2023",       5627.3, "DDR5", "Hicookie",            "GIGABYTE"),
    ("June 6, 2023",       5626.6, "DDR5", "Seby9123",            "G.Skill"),
    ("June 6, 2023",       5616.4, "DDR5", "Hicookie",            "GIGABYTE"),
    ("June 5, 2023",       5613.6, "DDR5", "Seby9123",            "G.Skill"),
    ("January 17, 2023",   5612.3, "DDR5", "Hicookie",            "GIGABYTE"),
    ("January 10, 2023",   5567.5, "DDR5", "Hicookie",            "GIGABYTE"),
    ("October 20, 2022",   5564.8, "DDR5", "lupin_no_musume",     "Intel"),
    ("July 13, 2022",      5300.3, "DDR5", "lupin_no_musume",     "Intel"),
    ("July 5, 2022",       5275.9, "DDR5", "lupin_no_musume",     "ASUSTeK x R.O.G"),
    ("July 5, 2022",       5254.1, "DDR5", "Kovan Yang",          "Intel"),
    ("June 24, 2022",      5111.7, "DDR5", "Hicookie",            "Intel"),
    ("May 24, 2022",       5050.0, "DDR5", "lupin_no_musume",     "G.SKILL"),
    ("April 27, 2022",     5011.0, "DDR5", "Hicookie",            "GIGABYTE"),
    ("April 26, 2022",     5001.8, "DDR5", "Kovan Yang",          "Kingston Fury"),
    ("January 12, 2022",   4779.7, "DDR5", "Lupin_no_musume",     "G.SKILL"),
    ("November 3, 2021",   4352.3, "DDR5", "Hocayu",              "G.SKILL"),
    ("October 29, 2021",   4335.4, "DDR5", "Kovan Yang",          "Kingston Fury"),
    ("October 28, 2021",   4124.2, "DDR5", "Splave",              "Kingston Fury"),
    ("October 8, 2021",    4058.8, "DDR5", "XPG Overclocking Lab","ADATA"),
    ("October 1, 2021",    4004.1, "DDR5", "Unknown",             "GIGABYTE"),
    # DDR4
    ("April 16, 2021",     3600.2, "DDR4", "Kovan",               "Kingston"),
    ("March 30, 2021",     3578.2, "DDR4", "Kovan",               "Kingston"),
    ("March 29, 2021",     3536.2, "DDR4", "Toppc",               "V-Color"),
    ("February 6, 2021",   3453.1, "DDR4", "Hocayu",              "V-Color"),
    ("August 17, 2020",    3333.3, "DDR4", "Bianbao XE",          "Crucial"),
    ("May 14, 2020",       3332.7, "DDR4", "Bianbao",             "G.SKILL"),
    ("October 25, 2019",   3027.2, "DDR4", "OGS",                 "Crucial"),
    ("October 24, 2019",   3018.0, "DDR4", "OGS",                 "Crucial"),
    ("October 24, 2019",   3012.2, "DDR4", "Bianbao",             "Crucial"),
    ("September 10, 2019", 3008.4, "DDR4", "Toppc",               "G.SKILL"),
    ("August 6, 2019",     2950.7, "DDR4", "Kovan Yang",          "Kingston"),
    ("May 29, 2019",       2943.2, "DDR4", "Toppc",               "G.SKILL"),
    ("May 28, 2019",       2901.4, "DDR4", "Kovan Yang",          "G.SKILL"),
    ("May 27, 2019",       2879.4, "DDR4", "OGS",                 "Crucial"),
    ("May 19, 2019",       2868.8, "DDR4", "Adata_XPG",           "ADATA"),
    ("May 16, 2019",       2863.0, "DDR4", "OGS",                 "Crucial"),
    ("May 13, 2019",       2817.1, "DDR4", "Adata_XPG",           "ADATA"),
    ("January 14, 2019",   2804.4, "DDR4", "Toppc",               "Kingston"),
    ("January 8, 2019",    2791.6, "DDR4", "Adata_XPG",           "ADATA"),
    ("October 19, 2018",   2782.9, "DDR4", "Hocayu",              "G.SKILL"),
    ("May 30, 2018",       2771.5, "DDR4", "Toppc",               "G.SKILL"),
    ("May 30, 2018",       2770.7, "DDR4", "Kovan Yang",          "G.SKILL"),
    ("May 30, 2018",       2765.6, "DDR4", "Kovan Yang",          "Adata"),
    ("October 5, 2017",    2764.6, "DDR4", "Hocayu",              "G.SKILL"),
    ("June 6, 2017",       2750.0, "DDR4", "Toppc",               "G.SKILL"),
    ("June 3, 2017",       2734.3, "DDR4", "Toppc",               "G.SKILL"),
    ("June 3, 2017",       2731.8, "DDR4", "NickShih",            "G.SKILL"),
    ("May 30, 2017",       2700.0, "DDR4", "Toppc",               "G.SKILL"),
    ("May 30, 2017",       2699.0, "DDR4", "Toppc",               "G.SKILL"),
    ("May 29, 2017",       2644.0, "DDR4", "Splave",              "G.SKILL"),
    ("March 30, 2017",     2640.0, "DDR4", "Audigy",              "Teamgroup"),
    ("February 27, 2017",  2631.4, "DDR4", "Splave",              "Teamgroup"),
    ("January 13, 2017",   2630.4, "DDR4", "Audigy",              "Teamgroup"),
    ("June 4, 2016",       2594.6, "DDR4", "Splave",              "G.SKILL"),
    ("June 3, 2016",       2515.9, "DDR4", "racoon",              "Zadak511"),
    ("May 25, 2016",       2501.2, "DDR4", "Toppc",               "G.SKILL"),
    ("May 24, 2016",       2451.8, "DDR4", "Toppc",               "G.SKILL"),
    ("August 18, 2015",    2450.8, "DDR4", "Chi-Kui Lam",         "G.SKILL"),
    ("August 11, 2015",    2419.0, "DDR4", "Hicookie",            "G.SKILL"),
    ("August 5, 2015",     2397.7, "DDR4", "Chi-Kui Lam",         "G.SKILL"),
    # DDR3
    ("June 30, 2014",      2310.1, "DDR3", "sofos1990",           "HyperX"),
    ("June 5, 2014",       2282.8, "DDR3", "Hicookie",            "HyperX"),
    ("August 9, 2013",     2202.0, "DDR3", "TeamAU",              "G.SKILL"),
    ("June 12, 2013",      2145.2, "DDR3", "NickShih",            "Corsair"),
    ("June 11, 2013",      2144.6, "DDR3", "Hiwa",                "G.SKILL"),
    ("June 10, 2013",      2142.8, "DDR3", "NickShih",            "Teamgroup"),
    ("June 9, 2013",       2141.6, "DDR3", "Hiwa",                "G.SKILL"),
    ("June 5, 2013",       2115.6, "DDR3", "Christian Ney",       "G.SKILL"),
    ("November 12, 2012",  1950.3, "DDR3", "Christian Ney",       "G.SKILL"),
    ("August 31, 2012",    1937.9, "DDR3", "Christian Ney",       "Avexir"),
    ("August 19, 2012",    1922.9, "DDR3", "Christian Ney",       "G.SKILL"),
    ("June 25, 2012",      1921.8, "DDR3", "John Lam",            "G.SKILL"),
    ("June 20, 2012",      1919.6, "DDR3", "Christian Ney",       "G.SKILL"),
    ("May 29, 2012",       1918.5, "DDR3", "TK-OC",               "G.SKILL"),
    ("February 28, 2012",  1868.3, "DDR3", "Christian Ney",       "G.SKILL"),
    ("December 3, 2011",   1800.1, "DDR3", "matose",              "Kingston"),
    ("November 22, 2011",  1733.8, "DDR3", "Planet",              "Corsair"),
    ("November 22, 2011",  1661.5, "DDR3", "Planet",              "Corsair"),
    ("November 9, 2011",   1655.6, "DDR3", "_mat_",               "ADATA"),
    ("March 21, 2011",     1625.6, "DDR3", "_mat_",               "Corsair"),
    ("March 21, 2011",     1614.2, "DDR3", "splmann",             "Corsair"),
    ("March 19, 2011",     1577.1, "DDR3", "splmann",             "Corsair"),
    ("February 28, 2011",  1575.1, "DDR3", "SF3D",                "Corsair"),
    ("September 28, 2010", 1553.4, "DDR3", "_mat_",               "Corsair"),
    ("September 3, 2010",  1539.2, "DDR3", "_mat_",               "Corsair"),
    ("August 21, 2010",    1534.0, "DDR3", "Marmott",             "Corsair"),
    ("February 9, 2009",   1352.2, "DDR3", "TBD",                 "A-Data"),
    ("December 19, 2008",  1346.2, "DDR3", "Xenic",               "Samsung"),
    ("October 5, 2008",    1341.2, "DDR3", "Over@locker886",      "Kingmax"),
    ("September 28, 2007", 1304.1, "DDR3", "JtChen2002",          "Micron"),
    ("September 28, 2007", 1178.9, "DDR3", "JtChen2002",          "Micron"),
    ("July 18, 2007",      1156.0, "DDR3", "Dav",                 "Micron"),
    ("July 2, 2007",       1150.2, "DDR3", "JtChen2002",          "Micron"),
    ("June 4, 2007",       1146.0, "DDR3", "P35TDQ6",             "Micron"),
    ("June 1, 2007",       1144.2, "DDR3", "X-965",               "Micron"),
    ("May 31, 2007",       1140.0, "DDR3", "David",               "Micron"),
    # DDR2
    ("January 27, 2007",    716.1, "DDR2", "Jmax_oc",             "Crucial"),
    ("September 8, 2006",   697.0, "DDR2", "光弘",                "G.SKILL"),
    ("May 18, 2006",        645.0, "DDR2", "Funa",                "A-Data"),
    ("May 7, 2006",         628.9, "DDR2", "Vigor",               "Crucial"),
    ("January 22, 2006",    626.8, "DDR2", "Wwwww",               "Corsair"),
    ("January 11, 2005",    614.9, "DDR2", "Cal930",              "Corsair"),
    ("December 2, 2004",    449.7, "DDR2", "Maiko",               None),
    ("November 17, 2004",   430.1, "DDR2", "Maiko",               None),
    ("October 31, 2004",    417.1, "DDR2", "Kaz-n",               "Corsair"),
    ("September 22, 2004",  368.0, "DDR2", "Maiko",               "Corsair"),
    ("July 29, 2004",       359.0, "DDR2", "VFD",                 None),
    # DDR
    ("July 28, 2004",       349.88,"DDR",  "いいさん",             "A-Data"),
    ("July 27, 2004",       347.63,"DDR",  "Tanuki",               "A-Data"),
    ("April 12, 2004",      325.1, "DDR",  "CIMA",                "Twinmos"),
    ("July 12, 2003",       314.1, "DDR",  "TAM",                 "A-Data"),
    ("July 1, 2003",        296.2, "DDR",  "光弘",                "Transcend"),
    ("May 11, 2003",        291.7, "DDR",  "TAM",                 "A-Data"),
    ("November 3, 2002",    286.8, "DDR",  "Vigor",               "V-Data"),
    ("October 27, 2002",    285.7, "DDR",  "ほりっちょ",           "A-Data"),
    ("July 19, 2002",       258.7, "DDR",  "Kaz-n",               None),
    ("June 29, 2002",       257.3, "DDR",  "だんな",               "Samsung"),
    ("June 23, 2002",       240.0, "DDR",  "Aguri",               "Samsung"),
    ("May 30, 2002",        235.5, "DDR",  "Neuro",               "Kingmax"),
    # SDR
    ("November 22, 2000",   217.32,"SDR",  "OptArc",              None),
    ("November 14, 2000",   216.24,"SDR",  "OptArc",              None),
    ("September 15, 2000",  215.85,"SDR",  "Hide",                None),
    ("September 14, 2000",  214.52,"SDR",  "モミゴン",             None),
    ("August 28, 2000",     211.98,"SDR",  "アンパンマン Tatumiya", None),
    ("August 19, 2000",     210.05,"SDR",  "ほりっちょ Holicho",   None),
    ("August 14, 2000",     190.43,"SDR",  "Juntake",             None),
    ("August 13, 2000",     187.03,"SDR",  "ほりっちょ Holicho",   None),
]

def parse_date(date_str):
    date_str = date_str.strip()
    for fmt in ["%B %d, %Y", "%b %d, %Y", "%B %Y", "%b %Y"]:
        try:
            d = datetime.strptime(date_str, fmt)
            approx = "%d" not in fmt
            return d.strftime("%Y-%m-%d") if not approx else d.strftime("%Y-%m-01"), approx
        except ValueError:
            continue
    raise ValueError(f"Cannot parse: {date_str}")

def make_uid(date_iso, value_mhz):
    return f"{date_iso.replace('-','')}_{int(value_mhz)}"

base = os.path.join(os.getcwd(), "memory")

uid_counts = {}
generated  = 0

for row in records_raw:
    date_str, value_mhz, subcategory, handle, memory_brand = row
    date_iso, approx = parse_date(date_str)
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

    is_unknown = handle in (None, "?", "Unknown")

    record = {
        "uid": uid,
        "category": "memory",
        "subcategory": subcategory,
        "achieved_at": date_iso,
        "achieved_at_approximate": approx,
        "value_mhz": value_mhz,
        "hardware": {
            "primary": memory_brand if memory_brand else "Unknown",
            "motherboard": None,
            "memory": None,
            "cooling": None
        },
        "overclockers": [{
            "handle": "Unknown" if is_unknown else handle,
            "real_name": None,
            "aliases": [],
            "country": None,
            "profile_url": None
        }],
        "sources": [],
        "assets": [],
        "tags": [subcategory] if subcategory else [],
        "notes": None,
        "verified": True,
        "submitted_by": "skatterbencher"
    }

    with open(os.path.join(folder, "record.json"), "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)

    generated += 1

print(f"Generated {generated} memory records")
dupes = {k: v for k, v in uid_counts.items() if v > 0}
if dupes:
    print(f"Deduplicated UIDs: {dupes}")