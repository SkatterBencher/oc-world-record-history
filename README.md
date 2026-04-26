# OC World Record Museum

A curated, open archive of CPU, GPU, and memory overclocking world records
dating back to 1996. Every entry is sourced, verified, and preserved.

🌐 **[museum.skatterbencher.com](https://museum.skatterbencher.com)**

## Repository Structure

```
oc-world-record-history/
├── cpu/                    # CPU world record entries
│   └── YYYYMMDD_valueMHz/
│       ├── record.json     # Record metadata
│       └── *.png           # Curated screenshots
├── gpu/                    # GPU world record entries
├── memory/                 # Memory world record entries
├── _template/              # Copy this to create a new record
├── _schema/                # JSON schema for validation
├── site/                   # Static frontend (deployed to GitHub Pages)
├── build.py                # Generates site/data/index.json
└── CONTRIBUTING.md         # How to submit records
```

## Adding a Record

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Running Locally

```bash
python3 build.py
cd site && python3 -m http.server 8080
# Open http://localhost:8080
```

## License

Record data: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)  
Please attribute **museum.skatterbencher.com**.