#!/usr/bin/env python3
"""
OC World Record Museum — Local Admin Server
Run: python3 admin_server.py
Opens: http://localhost:7373
"""

import json
import os
import shutil
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import cgi
import io

ROOT = Path(__file__).parent
CATEGORIES = ["cpu", "gpu", "memory"]
PORT = 7373


def get_record(category, uid):
    path = ROOT / category / uid / "record.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_record(category, uid, data, old_uid=None):
    """Save record.json. If old_uid differs from uid, rename the folder."""
    data.pop("_asset_base", None)
    data.pop("_assets", None)
    data.pop("_isNew", None)

    folder = ROOT / category / uid

    # Rename folder if UID changed (date or frequency was edited)
    if old_uid and old_uid != uid:
        old_folder = ROOT / category / old_uid
        if old_folder.exists():
            if folder.exists():
                # Merge: move files from old into new, keep new if conflict
                for f in old_folder.iterdir():
                    dest = folder / f.name
                    if not dest.exists():
                        shutil.move(str(f), str(dest))
                old_folder.rmdir()
            else:
                old_folder.rename(folder)

    folder.mkdir(parents=True, exist_ok=True)
    with open(folder / "record.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def list_records(category=None):
    records = []
    cats = [category] if category else CATEGORIES
    for cat in cats:
        cat_dir = ROOT / cat
        if not cat_dir.exists():
            continue
        for uid_dir in sorted(cat_dir.iterdir(), reverse=True):
            rfile = uid_dir / "record.json"
            if rfile.exists():
                with open(rfile, encoding="utf-8") as f:
                    r = json.load(f)
                r["_asset_base"] = f"{cat}/{uid_dir.name}/"
                records.append(r)
    return records


def list_assets(category, uid):
    folder = ROOT / category / uid
    if not folder.exists():
        return []
    exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    return [f.name for f in sorted(folder.iterdir())
            if f.suffix.lower() in exts]


def make_uid(date_iso, value_mhz):
    date_part = date_iso.replace("-", "")
    return f"{date_part}_{int(float(value_mhz))}"


def rebuild_index():
    os.system(f"python3 {ROOT / 'build.py'}")


class AdminHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"  {args[0]} {args[1]}")

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, html):
        body = html.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def serve_file(self, path):
        path = Path(path)
        if not path.exists():
            self.send_response(404)
            self.end_headers()
            return
        ext = path.suffix.lower()
        types = {".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",
                 ".webp":"image/webp",".gif":"image/gif",".css":"text/css",
                 ".js":"application/javascript"}
        ct = types.get(ext, "application/octet-stream")
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", len(data))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        # Serve admin UI
        if path in ("/", "/admin", "/admin/"):
            self.send_html(ADMIN_HTML)
            return

        # Bulk editor
        if path in ("/bulk", "/bulk/"):
            self.send_html(BULK_HTML)
            return

        # API routes
        if path == "/api/records":
            cat = qs.get("category", [None])[0]
            self.send_json(list_records(cat))
            return

        if path == "/api/record":
            cat = qs.get("category", [""])[0]
            uid = qs.get("uid", [""])[0]
            r = get_record(cat, uid)
            if r:
                r["_asset_base"] = f"{cat}/{uid}/"
                r["_assets"] = list_assets(cat, uid)
                self.send_json(r)
            else:
                self.send_json({"error": "not found"}, 404)
            return

        if path == "/api/assets":
            cat = qs.get("category", [""])[0]
            uid = qs.get("uid", [""])[0]
            self.send_json(list_assets(cat, uid))
            return

        # Serve asset images from record folders
        if path.startswith("/asset/"):
            parts = path[7:].split("/", 2)  # category/uid/filename
            if len(parts) == 3:
                cat, uid, filename = parts
                file_path = ROOT / cat / uid / filename
                self.serve_file(file_path)
                return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        length = int(self.headers.get("Content-Length", 0))

        # Save record
        if path == "/api/record":
            body = self.rfile.read(length)
            data = json.loads(body)
            cat     = data.get("category", "")
            old_uid = data.get("_old_uid", "")  # original UID before edits
            # Recompute UID from current date + MHz in case they changed
            date    = data.get("achieved_at", "")
            mhz     = data.get("value_mhz", 0)
            uid     = make_uid(date, mhz)
            # Handle collision with a different existing record
            if uid != old_uid:
                base_uid = uid
                i = 1
                while (ROOT / cat / uid).exists() and uid != old_uid:
                    uid = f"{base_uid}_{i:02d}"
                    i += 1
            data["uid"] = uid
            if not cat or not uid:
                self.send_json({"error": "missing category or uid"}, 400)
                return
            save_record(cat, uid, data, old_uid=old_uid or uid)
            rebuild_index()
            self.send_json({"ok": True, "uid": uid})
            return

        # Create new record
        if path == "/api/record/new":
            body = self.rfile.read(length)
            data = json.loads(body)
            cat = data.get("category", "")
            date = data.get("achieved_at", "")
            mhz = data.get("value_mhz", 0)
            uid = make_uid(date, mhz)
            # Handle duplicate UIDs
            base_uid = uid
            i = 1
            while (ROOT / cat / uid).exists():
                uid = f"{base_uid}_{i:02d}"
                i += 1
            data["uid"] = uid
            save_record(cat, uid, data)
            rebuild_index()
            self.send_json({"ok": True, "uid": uid})
            return

        # Upload image
        if path == "/api/upload":
            ct = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in ct:
                self.send_json({"error": "expected multipart"}, 400)
                return
            # Parse multipart manually
            boundary = ct.split("boundary=")[-1].encode()
            body = self.rfile.read(length)
            # Simple multipart parser
            parts = body.split(b"--" + boundary)
            cat = uid = filename = file_data = None
            for part in parts:
                if b"Content-Disposition" not in part:
                    continue
                header, _, content = part.partition(b"\r\n\r\n")
                content = content.rstrip(b"\r\n")
                header_str = header.decode("utf-8", errors="ignore")
                if 'name="category"' in header_str:
                    cat = content.decode().strip()
                elif 'name="uid"' in header_str:
                    uid = content.decode().strip()
                elif 'name="file"' in header_str:
                    fn_match = 'filename="'
                    if fn_match in header_str:
                        start = header_str.index(fn_match) + len(fn_match)
                        end = header_str.index('"', start)
                        filename = header_str[start:end]
                    file_data = content

            if not all([cat, uid, filename, file_data]):
                self.send_json({"error": "missing fields"}, 400)
                return

            dest_folder = ROOT / cat / uid
            dest_folder.mkdir(parents=True, exist_ok=True)
            dest_path = dest_folder / filename
            dest_path.write_bytes(file_data)

            # Update record.json assets array
            r = get_record(cat, uid)
            if r:
                ext = Path(filename).suffix.lower()
                asset_type = "cpuz" if "cpuz" in filename.lower() else \
                             "gpuz" if "gpuz" in filename.lower() else \
                             "validation" if "valid" in filename.lower() else "other"
                existing = [a["file"] for a in r.get("assets", [])]
                if filename not in existing:
                    r.setdefault("assets", []).append({
                        "file": filename,
                        "type": asset_type,
                        "caption": None
                    })
                    save_record(cat, uid, r)

            self.send_json({"ok": True, "filename": filename})
            return

        # Bulk save — patch specific fields across multiple records
        if path == "/api/records/bulk-save":
            body = self.rfile.read(length)
            changes = json.loads(body)  # [{category, uid, fields: {k:v,...}}, ...]
            saved = 0
            errors = []
            for change in changes:
                cat = change.get("category","")
                uid = change.get("uid","")
                fields = change.get("fields",{})
                r = get_record(cat, uid)
                if not r:
                    errors.append(f"{uid}: not found")
                    continue
                # Deep merge only changed fields
                for k, v in fields.items():
                    if k == "overclockers" and isinstance(v, list):
                        # Merge country/profile into existing overclockers by index
                        for i, oc_patch in enumerate(v):
                            if i < len(r.get("overclockers", [])):
                                r["overclockers"][i].update(oc_patch)
                    elif k == "hardware" and isinstance(v, dict):
                        r.setdefault("hardware", {}).update(v)
                    else:
                        r[k] = v
                save_record(cat, uid, r)
                saved += 1
            rebuild_index()
            self.send_json({"ok": True, "saved": saved, "errors": errors})
            return

        # Rebuild index
        if path == "/api/rebuild":
            rebuild_index()
            self.send_json({"ok": True})
            return

        self.send_json({"error": "not found"}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/api/asset":
            cat = qs.get("category", [""])[0]
            uid = qs.get("uid", [""])[0]
            filename = qs.get("filename", [""])[0]
            if not all([cat, uid, filename]):
                self.send_json({"error": "missing params"}, 400)
                return
            file_path = ROOT / cat / uid / filename
            if file_path.exists():
                file_path.unlink()
                # Remove from assets array
                r = get_record(cat, uid)
                if r:
                    r["assets"] = [a for a in r.get("assets", [])
                                   if a["file"] != filename]
                    save_record(cat, uid, r)
            self.send_json({"ok": True})
            return

        self.send_json({"error": "not found"}, 404)


ADMIN_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OC Museum Admin</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap');
:root {
  --bg: #0f0f13; --bg2: #16161f; --bg3: #1c1c28;
  --border: #2a2a3d; --border-hi: #3a3a5a;
  --accent: #e8490f; --accent-glow: rgba(232,73,15,0.15);
  --green: #00c875; --red: #ff4466; --blue: #4488ff;
  --text: #e8e8f0; --muted: #7070a0; --dim: #3a3a5a;
  --mono: 'IBM Plex Mono', monospace;
  --sans: 'Inter', sans-serif;
  --radius: 6px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: var(--sans);
  font-size: 13px; display: flex; height: 100vh; overflow: hidden; }

/* SIDEBAR */
.sidebar { width: 280px; flex-shrink: 0; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; background: var(--bg2); }
.sidebar-header { padding: 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; }
.sidebar-title { font-family: var(--mono); font-size: 12px; color: var(--accent);
  font-weight: 600; letter-spacing: 0.05em; }
.btn-new { padding: 5px 12px; border-radius: var(--radius); border: none;
  background: var(--accent); color: #fff; font-family: var(--mono); font-size: 11px;
  font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
.btn-new:hover { opacity: 0.85; }

.cat-tabs { display: flex; gap: 2px; padding: 8px; border-bottom: 1px solid var(--border); }
.cat-tab { flex: 1; padding: 5px; border: 1px solid var(--border); border-radius: var(--radius);
  background: transparent; color: var(--muted); font-family: var(--mono); font-size: 10px;
  cursor: pointer; text-align: center; transition: all 0.15s; font-weight: 600; letter-spacing: 0.05em; }
.cat-tab:hover { color: var(--text); border-color: var(--border-hi); }
.cat-tab.active { color: var(--accent); border-color: var(--accent); background: var(--accent-glow); }

.search-wrap { padding: 8px; border-bottom: 1px solid var(--border); }
.search-input { width: 100%; padding: 6px 10px; border-radius: var(--radius);
  border: 1px solid var(--border); background: var(--bg3); color: var(--text);
  font-family: var(--mono); font-size: 11px; outline: none; }
.search-input:focus { border-color: var(--accent); }

.record-list { flex: 1; overflow-y: auto; }
.record-item { padding: 10px 16px; border-bottom: 1px solid var(--border);
  cursor: pointer; transition: background 0.1s; }
.record-item:hover { background: var(--bg3); }
.record-item.active { background: var(--accent-glow); border-left: 2px solid var(--accent); }
.record-item .r-freq { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--text); }
.record-item .r-meta { font-size: 11px; color: var(--muted); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.record-item .r-date { font-family: var(--mono); font-size: 10px; color: var(--dim); margin-top: 1px; }

/* EDITOR */
.editor { flex: 1; overflow-y: auto; padding: 32px; }
.editor-empty { display: flex; align-items: center; justify-content: center;
  height: 100%; color: var(--dim); font-family: var(--mono); font-size: 13px; }

.editor-header { display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 28px; }
.editor-title { font-family: var(--mono); font-size: 18px; color: var(--text); font-weight: 600; }
.editor-uid { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-top: 3px; }
.editor-actions { display: flex; gap: 8px; }

.btn { padding: 7px 16px; border-radius: var(--radius); border: 1px solid var(--border);
  background: var(--bg3); color: var(--text); font-family: var(--mono); font-size: 11px;
  cursor: pointer; transition: all 0.15s; font-weight: 600; }
.btn:hover { border-color: var(--border-hi); color: var(--text); }
.btn-save { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-save:hover { opacity: 0.85; }
.btn-danger { border-color: var(--red); color: var(--red); }
.btn-danger:hover { background: rgba(255,68,102,0.1); }

.section { margin-bottom: 28px; }
.section-title { font-family: var(--mono); font-size: 10px; font-weight: 600;
  color: var(--dim); letter-spacing: 0.1em; text-transform: uppercase;
  margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }

.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field.span2 { grid-column: span 2; }
.field label { font-family: var(--mono); font-size: 10px; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.08em; }
.field input, .field select, .field textarea {
  padding: 7px 10px; border-radius: var(--radius); border: 1px solid var(--border);
  background: var(--bg3); color: var(--text); font-family: var(--mono); font-size: 12px;
  outline: none; transition: border-color 0.15s; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--accent); }
.field select option { background: var(--bg3); }
.field textarea { resize: vertical; min-height: 60px; }

/* OVERCLOCKERS */
.oc-list { display: flex; flex-direction: column; gap: 8px; }
.oc-card { padding: 12px; border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg3); position: relative; }
.oc-card .oc-remove { position: absolute; top: 8px; right: 8px; background: none;
  border: none; color: var(--dim); cursor: pointer; font-size: 16px; line-height: 1; }
.oc-card .oc-remove:hover { color: var(--red); }
.btn-add { padding: 6px 12px; border: 1px dashed var(--border); border-radius: var(--radius);
  background: transparent; color: var(--muted); font-family: var(--mono); font-size: 11px;
  cursor: pointer; width: 100%; transition: all 0.15s; margin-top: 4px; }
.btn-add:hover { border-color: var(--accent); color: var(--accent); }

/* SOURCES */
.source-list { display: flex; flex-direction: column; gap: 8px; }
.source-row { display: grid; grid-template-columns: 140px 1fr auto; gap: 8px; align-items: center; }
.source-row input { padding: 6px 10px; border-radius: var(--radius); border: 1px solid var(--border);
  background: var(--bg3); color: var(--text); font-family: var(--mono); font-size: 11px; outline: none; }
.source-row input:focus { border-color: var(--accent); }
.source-row .btn-remove { background: none; border: none; color: var(--dim);
  cursor: pointer; font-size: 16px; padding: 4px; }
.source-row .btn-remove:hover { color: var(--red); }

/* TAGS */
.tag-input-wrap { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px;
  border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg3);
  min-height: 38px; cursor: text; }
.tag-input-wrap:focus-within { border-color: var(--accent); }
.tag-chip { display: flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: 3px; background: var(--accent-glow); border: 1px solid var(--accent);
  font-family: var(--mono); font-size: 11px; color: var(--accent); }
.tag-chip button { background: none; border: none; color: var(--accent);
  cursor: pointer; font-size: 14px; line-height: 1; padding: 0; }
.tag-input { border: none; background: transparent; outline: none; color: var(--text);
  font-family: var(--mono); font-size: 11px; min-width: 80px; }

/* ASSETS */
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.asset-card { border: 1px solid var(--border); border-radius: var(--radius);
  overflow: hidden; background: var(--bg3); position: relative; }
.asset-card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
.asset-card .asset-name { padding: 6px 8px; font-family: var(--mono); font-size: 10px;
  color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asset-card .asset-remove { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px;
  border-radius: 3px; background: rgba(0,0,0,0.7); border: none; color: var(--red);
  cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; }

.upload-zone { border: 2px dashed var(--border); border-radius: var(--radius);
  padding: 24px; text-align: center; cursor: pointer; transition: all 0.15s;
  color: var(--muted); font-family: var(--mono); font-size: 11px; }
.upload-zone:hover, .upload-zone.drag { border-color: var(--accent); color: var(--accent); }
.upload-zone input { display: none; }

/* TOAST */
.toast { position: fixed; bottom: 24px; right: 24px; padding: 10px 18px;
  border-radius: var(--radius); font-family: var(--mono); font-size: 12px;
  font-weight: 600; z-index: 999; transform: translateY(80px); opacity: 0;
  transition: all 0.25s; pointer-events: none; }
.toast.show { transform: translateY(0); opacity: 1; }
.toast.ok { background: var(--green); color: #000; }
.toast.err { background: var(--red); color: #fff; }

/* SCROLLBAR */
::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-hi); border-radius: 3px; }

.verified-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.verified-row input[type=checkbox] { width: 14px; height: 14px; accent-color: var(--green); }
.verified-row label { font-family: var(--mono); font-size: 11px; color: var(--muted); }
</style>
</head>
<body>

<div class="sidebar">
  <div class="sidebar-header">
    <div class="sidebar-title">OC / ADMIN</div>
    <button class="btn-new" onclick="newRecord()">+ New</button>
  </div>
  <div class="cat-tabs">
    <button class="cat-tab active" data-cat="cpu" onclick="setCat('cpu',this)">CPU</button>
    <button class="cat-tab" data-cat="gpu" onclick="setCat('gpu',this)">GPU</button>
    <button class="cat-tab" data-cat="memory" onclick="setCat('memory',this)">MEM</button>
  </div>
  <div class="search-wrap">
    <input class="search-input" type="text" placeholder="Search records…" oninput="filterList(this.value)">
  </div>
  <div class="record-list" id="record-list"></div>
</div>

<div class="editor" id="editor">
  <div class="editor-empty">← Select a record or click + New</div>
</div>

<div class="toast" id="toast"></div>

<script>
let allRecords = [];
let currentCat = 'cpu';
let currentRecord = null;
let searchQuery = '';

// ── INIT ──────────────────────────────────────────────
async function init() {
  await loadRecords();
}

async function loadRecords() {
  const res = await fetch(`/api/records?category=${currentCat}`);
  allRecords = await res.json();
  renderList();
}

// ── CATEGORY ──────────────────────────────────────────
function setCat(cat, el) {
  currentCat = cat;
  currentRecord = null;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('editor').innerHTML = '<div class="editor-empty">← Select a record or click + New</div>';
  loadRecords();
}

// ── LIST ──────────────────────────────────────────────
function filterList(q) { searchQuery = q.toLowerCase(); renderList(); }

function renderList() {
  const filtered = allRecords.filter(r => {
    if (!searchQuery) return true;
    const hay = [r.value_mhz, r.achieved_at,
      (r.hardware?.primary || ''),
      (r.overclockers || []).map(o => o.handle).join(' ')
    ].join(' ').toLowerCase();
    return hay.includes(searchQuery);
  });

  const el = document.getElementById('record-list');
  el.innerHTML = filtered.map(r => {
    const ocs = (r.overclockers || []).map(o => o.handle).join(' & ');
    const active = currentRecord?.uid === r.uid ? ' active' : '';
    return `<div class="record-item${active}" onclick="loadRecord('${r.category}','${r.uid}')">
      <div class="r-freq">${r.value_mhz.toFixed(2)} MHz</div>
      <div class="r-meta">${r.hardware?.primary || 'Unknown'} · ${ocs || '—'}</div>
      <div class="r-date">${r.achieved_at}</div>
    </div>`;
  }).join('');
}

// ── LOAD RECORD ───────────────────────────────────────
async function loadRecord(cat, uid) {
  const res = await fetch(`/api/record?category=${cat}&uid=${uid}`);
  currentRecord = await res.json();
  renderEditor();
  // highlight
  document.querySelectorAll('.record-item').forEach(el => {
    el.classList.toggle('active', el.onclick.toString().includes(uid));
  });
}

// ── NEW RECORD ────────────────────────────────────────
function newRecord() {
  currentRecord = {
    uid: '',
    category: currentCat,
    subcategory: null,
    achieved_at: new Date().toISOString().slice(0,10),
    achieved_at_approximate: false,
    value_mhz: 0,
    hardware: { primary: null, motherboard: null, memory: null, cooling: null },
    overclockers: [{ handle: '', real_name: null, aliases: [], country: null, profile_url: null }],
    sources: [],
    assets: [],
    tags: [],
    notes: null,
    verified: false,
    submitted_by: 'skatterbencher',
    _isNew: true,
    _assets: []
  };
  renderEditor();
}

// ── EDITOR ────────────────────────────────────────────
function renderEditor() {
  const r = currentRecord;
  const isNew = r._isNew;
  const assets = r._assets || [];

  document.getElementById('editor').innerHTML = `
    <div class="editor-header">
      <div>
        <div class="editor-title">${isNew ? 'New Record' : r.value_mhz.toFixed(2) + ' MHz'}</div>
        <div class="editor-uid">${isNew ? 'UID will be generated' : r.uid}</div>
      </div>
      <div class="editor-actions">
        ${!isNew ? `<button class="btn" onclick="reloadRecord()">↺ Reload</button>` : ''}
        <button class="btn btn-save" onclick="saveRecord()">Save ↗</button>
      </div>
    </div>

    <!-- CORE -->
    <div class="section">
      <div class="section-title">Core</div>
      <div class="field-grid">
        <div class="field">
          <label>Category</label>
          <select id="f-category" onchange="onCatChange(this.value)">
            <option value="cpu" ${r.category==='cpu'?'selected':''}>CPU</option>
            <option value="gpu" ${r.category==='gpu'?'selected':''}>GPU</option>
            <option value="memory" ${r.category==='memory'?'selected':''}>Memory</option>
          </select>
        </div>
        <div class="field">
          <label>Subcategory</label>
          <input id="f-subcategory" value="${r.subcategory||''}" placeholder="e.g. DDR5">
        </div>
        <div class="field">
          <label>Date</label>
          <input id="f-date" type="date" value="${r.achieved_at}">
        </div>
        <div class="field">
          <label>Frequency (MHz)</label>
          <input id="f-mhz" type="number" step="0.01" value="${r.value_mhz}">
        </div>
      </div>
      <div class="verified-row" style="margin-top:12px">
        <input type="checkbox" id="f-approximate" ${r.achieved_at_approximate?'checked':''}>
        <label for="f-approximate">Date is approximate</label>
        <input type="checkbox" id="f-verified" ${r.verified?'checked':''} style="margin-left:16px">
        <label for="f-verified">Verified</label>
        <input type="checkbox" id="f-not-a-record" ${r.not_a_record?'checked':''} style="margin-left:16px">
        <label for="f-not-a-record" style="color:var(--red)">Not a record</label>
      </div>
    </div>

    <!-- HARDWARE -->
    <div class="section">
      <div class="section-title">Hardware</div>
      <div class="field-grid">
        <div class="field span2">
          <label>Primary Component</label>
          <input id="f-primary" value="${r.hardware?.primary||''}" placeholder="e.g. Intel Core i9-14900KF">
        </div>
        <div class="field">
          <label>Motherboard</label>
          <input id="f-mobo" value="${r.hardware?.motherboard||''}" placeholder="optional">
        </div>
        <div class="field">
          <label>Memory</label>
          <input id="f-memory" value="${r.hardware?.memory||''}" placeholder="optional">
        </div>
        <div class="field span2">
          <label>Cooling</label>
          <input id="f-cooling" value="${r.hardware?.cooling||''}" placeholder="e.g. Liquid Nitrogen">
        </div>
      </div>
    </div>

    <!-- OVERCLOCKERS -->
    <div class="section">
      <div class="section-title">Overclockers</div>
      <div class="oc-list" id="oc-list">
        ${(r.overclockers||[]).map((oc,i) => ocCard(oc,i)).join('')}
      </div>
      <button class="btn-add" onclick="addOC()">+ Add overclocker</button>
    </div>

    <!-- SOURCES -->
    <div class="section">
      <div class="section-title">Sources & Links</div>
      <div class="source-list" id="source-list">
        ${(r.sources||[]).map((s,i) => sourceRow(s,i)).join('')}
      </div>
      <button class="btn-add" onclick="addSource()">+ Add source</button>
    </div>

    <!-- TAGS -->
    <div class="section">
      <div class="section-title">Tags</div>
      <div class="tag-input-wrap" id="tag-wrap" onclick="document.getElementById('tag-input').focus()">
        ${(r.tags||[]).map(t => tagChip(t)).join('')}
        <input class="tag-input" id="tag-input" placeholder="Add tag…"
          onkeydown="tagKeydown(event)">
      </div>
    </div>

    <!-- NOTES -->
    <div class="section">
      <div class="section-title">Notes</div>
      <div class="field">
        <textarea id="f-notes" placeholder="Curator notes, context, caveats…">${r.notes||''}</textarea>
      </div>
    </div>

    ${!isNew ? `
    <!-- ASSETS -->
    <div class="section">
      <div class="section-title">Assets</div>
      ${assets.length ? `
        <div class="field" style="margin-bottom:12px">
          <label>Hero Image</label>
          <select id="f-hero" style="font-family:var(--mono);font-size:12px">
            <option value="">— none —</option>
            ${assets.map(fn => `<option value="${fn}" ${r.hero === fn ? 'selected' : ''}>${fn}</option>`).join('')}
          </select>
        </div>
      ` : ''}
      <div class="asset-grid" id="asset-grid">
        ${assets.map(fn => assetCard(fn)).join('')}
      </div>
      <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()"
        ondragover="event.preventDefault();this.classList.add('drag')"
        ondragleave="this.classList.remove('drag')"
        ondrop="handleDrop(event)">
        <input type="file" id="file-input" accept="image/*" multiple onchange="uploadFiles(this.files)">
        Drop images here or click to upload
      </div>
    </div>
    ` : ''}
  `;
}

function ocCard(oc, i) {
  return `<div class="oc-card" id="oc-${i}">
    <button class="oc-remove" onclick="removeOC(${i})">×</button>
    <div class="field-grid">
      <div class="field">
        <label>Handle</label>
        <input class="oc-handle" data-i="${i}" value="${oc.handle||''}">
      </div>
      <div class="field">
        <label>Real Name</label>
        <input class="oc-realname" data-i="${i}" value="${oc.real_name||''}">
      </div>
      <div class="field">
        <label>Country (ISO)</label>
        <input class="oc-country" data-i="${i}" value="${oc.country||''}" placeholder="e.g. TW">
      </div>
      <div class="field">
        <label>Profile URL</label>
        <input class="oc-profile" data-i="${i}" value="${oc.profile_url||''}">
      </div>
      <div class="field span2">
        <label>Aliases (comma-separated)</label>
        <input class="oc-aliases" data-i="${i}" value="${(oc.aliases||[]).join(', ')}">
      </div>
    </div>
  </div>`;
}

function sourceRow(s, i) {
  return `<div class="source-row" id="src-${i}">
    <input class="src-label" data-i="${i}" value="${s.label||''}" placeholder="Label">
    <input class="src-url" data-i="${i}" value="${s.url||''}" placeholder="https://…">
    <button class="btn-remove" onclick="removeSource(${i})">×</button>
  </div>`;
}

function tagChip(t) {
  return `<span class="tag-chip">${t}<button onclick="removeTag('${t}')">×</button></span>`;
}

function assetCard(filename) {
  const r = currentRecord;
  return `<div class="asset-card">
    <img src="/asset/${r.category}/${r.uid}/${filename}" alt="${filename}">
    <div class="asset-name">${filename}</div>
    <button class="asset-remove" onclick="deleteAsset('${filename}')">×</button>
  </div>`;
}

// ── OC ACTIONS ────────────────────────────────────────
function addOC() {
  const list = document.getElementById('oc-list');
  const i = list.children.length;
  list.insertAdjacentHTML('beforeend', ocCard({},i));
}
function removeOC(i) {
  document.getElementById(`oc-${i}`)?.remove();
  // Re-index remaining
  document.querySelectorAll('.oc-card').forEach((el,j) => {
    el.id = `oc-${j}`;
    el.querySelectorAll('[data-i]').forEach(inp => inp.dataset.i = j);
    el.querySelector('.oc-remove').setAttribute('onclick', `removeOC(${j})`);
  });
}

// ── SOURCE ACTIONS ────────────────────────────────────
function addSource() {
  const list = document.getElementById('source-list');
  const i = list.children.length;
  list.insertAdjacentHTML('beforeend', sourceRow({},i));
}
function removeSource(i) {
  document.getElementById(`src-${i}`)?.remove();
  document.querySelectorAll('.source-row').forEach((el,j) => {
    el.id = `src-${j}`;
    el.querySelectorAll('[data-i]').forEach(inp => inp.dataset.i = j);
    el.querySelector('.btn-remove').setAttribute('onclick', `removeSource(${j})`);
  });
}

// ── TAG ACTIONS ───────────────────────────────────────
function tagKeydown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,$/, '');
    if (val) addTag(val);
    e.target.value = '';
  } else if (e.key === 'Backspace' && !e.target.value) {
    const chips = document.querySelectorAll('.tag-chip');
    if (chips.length) {
      const last = chips[chips.length-1].textContent.replace('×','').trim();
      removeTag(last);
    }
  }
}
function addTag(t) {
  const wrap = document.getElementById('tag-wrap');
  const input = document.getElementById('tag-input');
  wrap.insertBefore(Object.assign(document.createElement('span'), {
    className: 'tag-chip',
    innerHTML: `${t}<button onclick="removeTag('${t}')">×</button>`
  }), input);
}
function removeTag(t) {
  document.querySelectorAll('.tag-chip').forEach(chip => {
    if (chip.textContent.replace('×','').trim() === t) chip.remove();
  });
}
function getTags() {
  return [...document.querySelectorAll('.tag-chip')]
    .map(c => c.textContent.replace('×','').trim()).filter(Boolean);
}

// ── BUILD RECORD ──────────────────────────────────────
function buildRecord() {
  const r = currentRecord;
  const overclockers = [...document.querySelectorAll('.oc-card')].map(card => ({
    handle: card.querySelector('.oc-handle')?.value || '',
    real_name: card.querySelector('.oc-realname')?.value || null,
    aliases: (card.querySelector('.oc-aliases')?.value || '').split(',').map(s=>s.trim()).filter(Boolean),
    country: card.querySelector('.oc-country')?.value || null,
    profile_url: card.querySelector('.oc-profile')?.value || null,
  }));
  const sources = [...document.querySelectorAll('.source-row')].map(row => ({
    label: row.querySelector('.src-label')?.value || '',
    url: row.querySelector('.src-url')?.value || '',
    archived_url: null,
  })).filter(s => s.label || s.url);

  return {
    uid: r._isNew ? '' : r.uid,
    _old_uid: r._isNew ? '' : r.uid,  // so server knows the original folder name
    category: document.getElementById('f-category').value,
    subcategory: document.getElementById('f-subcategory').value || null,
    achieved_at: document.getElementById('f-date').value,
    achieved_at_approximate: document.getElementById('f-approximate').checked,
    value_mhz: parseFloat(document.getElementById('f-mhz').value),
    hardware: {
      primary: document.getElementById('f-primary').value || null,
      motherboard: document.getElementById('f-mobo').value || null,
      memory: document.getElementById('f-memory').value || null,
      cooling: document.getElementById('f-cooling').value || null,
    },
    hero: document.getElementById('f-hero')?.value || null,
    not_a_record: document.getElementById('f-not-a-record')?.checked || null,
    overclockers,
    sources,
    assets: r.assets || [],
    tags: getTags(),
    notes: document.getElementById('f-notes').value || null,
    verified: document.getElementById('f-verified').checked,
    submitted_by: 'skatterbencher',
  };
}

// ── SAVE ──────────────────────────────────────────────
async function saveRecord() {
  const data = buildRecord();
  const endpoint = currentRecord._isNew ? '/api/record/new' : '/api/record';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (json.ok) {
      toast('Saved ✓', 'ok');
      await loadRecords();
      await loadRecord(data.category || currentCat, json.uid);
    } else {
      toast('Error: ' + (json.error || 'unknown'), 'err');
    }
  } catch(e) {
    toast('Save failed: ' + e.message, 'err');
  }
}

async function reloadRecord() {
  await loadRecord(currentRecord.category, currentRecord.uid);
}

function onCatChange(val) { /* category changed in form */ }

// ── UPLOAD ────────────────────────────────────────────
async function uploadFiles(files) {
  for (const file of files) {
    const fd = new FormData();
    fd.append('category', currentRecord.category);
    fd.append('uid', currentRecord.uid);
    fd.append('file', file, file.name);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const json = await res.json();
    if (json.ok) {
      toast(`Uploaded ${file.name}`, 'ok');
    } else {
      toast(`Upload failed: ${file.name}`, 'err');
    }
  }
  // Refresh assets
  const res = await fetch(`/api/assets?category=${currentRecord.category}&uid=${currentRecord.uid}`);
  const assets = await res.json();
  document.getElementById('asset-grid').innerHTML = assets.map(fn => assetCard(fn)).join('');
  document.getElementById('upload-zone').classList.remove('drag');
  // Refresh hero dropdown
  const heroSel = document.getElementById('f-hero');
  if (heroSel) {
    const curHero = heroSel.value;
    heroSel.innerHTML = '<option value="">— none —</option>' +
      assets.map(fn => `<option value="${fn}" ${curHero === fn ? 'selected' : ''}>${fn}</option>`).join('');
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag');
  uploadFiles(e.dataTransfer.files);
}

async function deleteAsset(filename) {
  if (!confirm(`Delete ${filename}?`)) return;
  const r = currentRecord;
  await fetch(`/api/asset?category=${r.category}&uid=${r.uid}&filename=${filename}`, { method: 'DELETE' });
  const res = await fetch(`/api/assets?category=${r.category}&uid=${r.uid}`);
  const assets = await res.json();
  document.getElementById('asset-grid').innerHTML = assets.map(fn => assetCard(fn)).join('');
  toast('Deleted', 'ok');
}

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type='ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

init();
</script>
</body>
</html>"""


BULK_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OC Museum — Bulk Editor</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap');
:root {
  --bg: #0f0f13; --bg2: #16161f; --bg3: #1c1c28;
  --border: #2a2a3d; --border-hi: #3a3a5a;
  --accent: #e8490f; --accent-glow: rgba(232,73,15,0.12);
  --green: #00c875; --red: #ff4466; --yellow: #ffaa00;
  --text: #e8e8f0; --muted: #7070a0; --dim: #3a3a5a;
  --mono: 'IBM Plex Mono', monospace;
  --sans: 'Inter', sans-serif;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: var(--sans);
  font-size: 13px; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* TOOLBAR */
.toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 20px;
  background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.toolbar-title { font-family: var(--mono); font-size: 12px; color: var(--accent);
  font-weight: 600; letter-spacing: 0.05em; margin-right: 8px; }
.cat-tabs { display: flex; gap: 4px; }
.cat-tab { padding: 5px 14px; border: 1px solid var(--border); border-radius: 4px;
  background: transparent; color: var(--muted); font-family: var(--mono); font-size: 11px;
  cursor: pointer; transition: all 0.15s; font-weight: 600; }
.cat-tab:hover { color: var(--text); border-color: var(--border-hi); }
.cat-tab.active { color: var(--accent); border-color: var(--accent); background: var(--accent-glow); }
.spacer { flex: 1; }
.col-toggle-wrap { display: flex; align-items: center; gap: 6px; }
.col-toggle-label { font-family: var(--mono); font-size: 10px; color: var(--muted); }
.col-toggle { padding: 4px 10px; border: 1px solid var(--border); border-radius: 3px;
  background: transparent; color: var(--muted); font-family: var(--mono); font-size: 10px;
  cursor: pointer; transition: all 0.15s; }
.col-toggle.active { border-color: var(--accent); color: var(--accent); background: var(--accent-glow); }
.status { font-family: var(--mono); font-size: 11px; color: var(--muted); min-width: 120px; text-align: right; }
.btn { padding: 6px 16px; border-radius: 4px; border: 1px solid var(--border);
  background: var(--bg3); color: var(--text); font-family: var(--mono); font-size: 11px;
  cursor: pointer; font-weight: 600; transition: all 0.15s; }
.btn:hover { border-color: var(--border-hi); }
.btn-save { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-save:hover { opacity: 0.85; }
.btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-link { color: var(--muted); text-decoration: none; font-family: var(--mono);
  font-size: 11px; padding: 6px 10px; border-radius: 4px; transition: color 0.15s; }
.btn-link:hover { color: var(--accent); }

/* GRID WRAPPER */
.grid-wrap { flex: 1; overflow: auto; }

/* TABLE */
table { border-collapse: collapse; width: max-content; min-width: 100%; }
thead { position: sticky; top: 0; z-index: 10; }
th { background: var(--bg2); border-bottom: 2px solid var(--border);
  border-right: 1px solid var(--border); padding: 7px 10px;
  font-family: var(--mono); font-size: 10px; font-weight: 600;
  color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em;
  white-space: nowrap; text-align: left; user-select: none; }
th.col-fixed { position: sticky; left: 0; z-index: 11; background: var(--bg2); }
th:last-child { border-right: none; }

tbody tr { border-bottom: 1px solid var(--border); transition: background 0.08s; }
tbody tr:hover { background: var(--bg2); }
tbody tr.dirty { background: rgba(232,73,15,0.06); }
tbody tr.dirty td.col-fixed { background: #1a1208; }

td { border-right: 1px solid var(--border); padding: 0; vertical-align: middle; }
td.col-fixed { position: sticky; left: 0; z-index: 5; background: var(--bg); }
tbody tr:hover td.col-fixed { background: var(--bg2); }
td:last-child { border-right: none; }

/* CELLS */
.cell-static { padding: 6px 10px; font-family: var(--mono); font-size: 12px;
  color: var(--text); white-space: nowrap; }
.cell-static.muted { color: var(--muted); }
.cell-static.freq { color: var(--accent); font-weight: 600; }

.cell-edit { padding: 0; }
.cell-input { width: 100%; padding: 6px 10px; background: transparent; border: none;
  outline: none; color: var(--text); font-family: var(--mono); font-size: 12px;
  min-width: 80px; }
.cell-input:focus { background: var(--bg3); box-shadow: inset 0 0 0 2px var(--accent); }
.cell-input.changed { color: var(--yellow); }

/* dirty indicator dot */
.dirty-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent); margin-right: 6px; flex-shrink: 0; }

/* TOAST */
.toast { position: fixed; bottom: 20px; right: 20px; padding: 10px 18px;
  border-radius: 4px; font-family: var(--mono); font-size: 12px; font-weight: 600;
  z-index: 999; transform: translateY(60px); opacity: 0; transition: all 0.2s; }
.toast.show { transform: translateY(0); opacity: 1; }
.toast.ok { background: var(--green); color: #000; }
.toast.err { background: var(--red); color: #fff; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-hi); border-radius: 3px; }
</style>
</head>
<body>

<div class="toolbar">
  <a class="btn-link" href="/">← Record Editor</a>
  <div class="toolbar-title">BULK EDITOR</div>
  <div class="cat-tabs">
    <button class="cat-tab active" onclick="setCat('cpu',this)">CPU</button>
    <button class="cat-tab" onclick="setCat('gpu',this)">GPU</button>
    <button class="cat-tab" onclick="setCat('memory',this)">Memory</button>
  </div>
  <div class="spacer"></div>
  <div class="col-toggle-wrap">
    <span class="col-toggle-label">Columns:</span>
    <button class="col-toggle active" data-col="country" onclick="toggleCol('country',this)">Country</button>
    <button class="col-toggle active" data-col="cooling" onclick="toggleCol('cooling',this)">Cooling</button>
    <button class="col-toggle" data-col="mobo" onclick="toggleCol('mobo',this)">Mobo</button>
    <button class="col-toggle" data-col="memory" onclick="toggleCol('memory',this)">Memory</button>
    <button class="col-toggle" data-col="tags" onclick="toggleCol('tags',this)">Tags</button>
    <button class="col-toggle" data-col="notes" onclick="toggleCol('notes',this)">Notes</button>
    <button class="col-toggle" data-col="subcategory" onclick="toggleCol('subcategory',this)">Subcat</button>
  </div>
  <div class="status" id="status">Loading…</div>
  <button class="btn btn-save" id="btn-save" onclick="saveAll()" disabled>Save Changes</button>
</div>

<div class="grid-wrap">
  <table id="grid">
    <thead id="grid-head"></thead>
    <tbody id="grid-body"></tbody>
  </table>
</div>

<div class="toast" id="toast"></div>

<script>
let records = [];
let currentCat = 'cpu';
let dirty = {};  // uid -> {fields}
let visibleCols = new Set(['country', 'cooling']);

const ALL_COLS = [
  { key: 'country',     label: 'Country',    editable: true,  path: 'oc.0.country',   width: 80 },
  { key: 'cooling',     label: 'Cooling',    editable: true,  path: 'hw.cooling',     width: 160 },
  { key: 'mobo',        label: 'Motherboard',editable: true,  path: 'hw.motherboard', width: 200 },
  { key: 'memory',      label: 'Memory',     editable: true,  path: 'hw.memory',      width: 160 },
  { key: 'tags',        label: 'Tags',       editable: true,  path: 'tags',           width: 160 },
  { key: 'notes',       label: 'Notes',      editable: true,  path: 'notes',          width: 220 },
  { key: 'subcategory', label: 'Subcat',     editable: true,  path: 'subcategory',    width: 100 },
];

async function init() {
  await load();
}

async function load() {
  document.getElementById('status').textContent = 'Loading…';
  const res = await fetch(`/api/records?category=${currentCat}`);
  records = await res.json();
  records.sort((a,b) => new Date(b.achieved_at) - new Date(a.achieved_at));
  dirty = {};
  updateSaveBtn();
  render();
  document.getElementById('status').textContent = `${records.length} records`;
}

function setCat(cat, el) {
  if (Object.keys(dirty).length > 0) {
    if (!confirm('You have unsaved changes. Discard and switch category?')) return;
  }
  currentCat = cat;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  load();
}

function toggleCol(key, el) {
  el.classList.toggle('active');
  visibleCols.has(key) ? visibleCols.delete(key) : visibleCols.add(key);
  render();
}

function getVal(r, path) {
  if (path === 'oc.0.country') return (r.overclockers?.[0]?.country) || '';
  if (path === 'hw.cooling')     return r.hardware?.cooling || '';
  if (path === 'hw.motherboard') return r.hardware?.motherboard || '';
  if (path === 'hw.memory')      return r.hardware?.memory || '';
  if (path === 'tags')           return (r.tags || []).join(', ');
  if (path === 'notes')          return r.notes || '';
  if (path === 'subcategory')    return r.subcategory || '';
  return '';
}

function render() {
  const cols = ALL_COLS.filter(c => visibleCols.has(c.key));

  // Header
  document.getElementById('grid-head').innerHTML = `<tr>
    <th class="col-fixed" style="min-width:30px"></th>
    <th class="col-fixed" style="min-width:100px;left:30px">Date</th>
    <th style="min-width:110px">Frequency</th>
    <th style="min-width:200px">Hardware</th>
    <th style="min-width:140px">Overclocker</th>
    ${cols.map(c => `<th style="min-width:${c.width}px">${c.label}</th>`).join('')}
  </tr>`;

  // Body
  document.getElementById('grid-body').innerHTML = records.map(r => {
    const isDirty = !!dirty[r.uid];
    const oc = (r.overclockers || []).map(o => o.handle).join(' & ');
    return `<tr class="${isDirty ? 'dirty' : ''}" data-uid="${r.uid}">
      <td class="col-fixed" style="left:0;width:30px;text-align:center">
        ${isDirty ? '<span class="dirty-dot"></span>' : ''}
      </td>
      <td class="col-fixed" style="left:30px">
        <div class="cell-static muted">${r.achieved_at}</div>
      </td>
      <td><div class="cell-static freq">${r.value_mhz.toFixed(2)}</div></td>
      <td><div class="cell-static">${r.hardware?.primary || ''}</div></td>
      <td><div class="cell-static muted">${oc}</div></td>
      ${cols.map(c => {
        const val = (dirty[r.uid]?.display?.[c.key] !== undefined)
          ? dirty[r.uid].display[c.key]
          : getVal(r, c.path);
        const isChanged = dirty[r.uid]?.display?.[c.key] !== undefined;
        return `<td class="cell-edit">
          <input class="cell-input ${isChanged ? 'changed' : ''}"
            data-uid="${r.uid}" data-col="${c.key}" data-path="${c.path}"
            value="${escHtml(val)}"
            onchange="onCellChange(this)"
            onkeydown="onKeyDown(event,this)">
        </td>`;
      }).join('')}
    </tr>`;
  }).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function onCellChange(input) {
  const uid = input.dataset.uid;
  const col = input.dataset.col;
  const path = input.dataset.path;
  const val = input.value.trim();

  // Find original value
  const r = records.find(r => r.uid === uid);
  const orig = getVal(r, path);

  if (!dirty[uid]) dirty[uid] = { fields: {}, display: {} };

  if (val === orig) {
    // Reverted to original
    delete dirty[uid].display[col];
    delete dirty[uid].fields[col];
    input.classList.remove('changed');
    if (!Object.keys(dirty[uid].display).length) {
      delete dirty[uid];
    }
  } else {
    dirty[uid].display[col] = val;
    dirty[uid].fields[col] = { path, value: val };
    input.classList.add('changed');
  }

  // Update dirty row indicator
  const row = input.closest('tr');
  const dotCell = row.querySelector('td:first-child');
  const isDirty = !!dirty[uid];
  row.classList.toggle('dirty', isDirty);
  dotCell.innerHTML = isDirty ? '<span class="dirty-dot"></span>' : '';

  updateSaveBtn();
}

// Tab navigation between editable cells
function onKeyDown(e, input) {
  if (e.key === 'Tab') {
    // Default tab behavior is fine — let it move to next input
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    // Move to same column, next row
    const col = input.dataset.col;
    const allInputs = [...document.querySelectorAll(`[data-col="${col}"]`)];
    const idx = allInputs.indexOf(input);
    if (idx < allInputs.length - 1) allInputs[idx + 1].focus();
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const col = input.dataset.col;
    const allInputs = [...document.querySelectorAll(`[data-col="${col}"]`)];
    const idx = allInputs.indexOf(input);
    const next = e.key === 'ArrowDown' ? allInputs[idx+1] : allInputs[idx-1];
    if (next) next.focus();
  }
}

function updateSaveBtn() {
  const count = Object.keys(dirty).length;
  const btn = document.getElementById('btn-save');
  btn.disabled = count === 0;
  btn.textContent = count > 0 ? `Save ${count} Record${count>1?'s':''}` : 'Save Changes';
  document.getElementById('status').textContent =
    count > 0 ? `${count} unsaved` : `${records.length} records`;
}

async function saveAll() {
  const changes = Object.entries(dirty).map(([uid, d]) => {
    const r = records.find(r => r.uid === uid);
    const fields = {};
    for (const [col, {path, value}] of Object.entries(d.fields)) {
      if (path === 'oc.0.country') {
        fields.overclockers = [{ country: value || null }];
      } else if (path.startsWith('hw.')) {
        const hw_key = path.replace('hw.', '');
        if (!fields.hardware) fields.hardware = {};
        fields.hardware[hw_key] = value || null;
      } else if (path === 'tags') {
        fields.tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];
      } else if (path === 'notes') {
        fields.notes = value || null;
      } else if (path === 'subcategory') {
        fields.subcategory = value || null;
      }
    }
    return { category: currentCat, uid, fields };
  });

  try {
    const res = await fetch('/api/records/bulk-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    const json = await res.json();
    if (json.ok) {
      toast(`Saved ${json.saved} records ✓`, 'ok');
      await load();
    } else {
      toast('Save failed', 'err');
    }
  } catch(e) {
    toast('Error: ' + e.message, 'err');
  }
}

function toast(msg, type='ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

// Warn on unload if dirty
window.addEventListener('beforeunload', e => {
  if (Object.keys(dirty).length) e.preventDefault();
});

init();
</script>
</body>
</html>"""


if __name__ == "__main__":
    server = HTTPServer(("localhost", PORT), AdminHandler)
    print(f"\n  OC Museum Admin Server")
    print(f"  ─────────────────────────────")
    print(f"  → http://localhost:{PORT}")
    print(f"  → Serving repo at: {ROOT}")
    print(f"  → Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")