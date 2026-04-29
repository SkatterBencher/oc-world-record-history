// OC World Record Museum — main.js

const CATEGORIES = {
  cpu:    { label: 'CPU',    unit: 'MHz' },
  gpu:    { label: 'GPU',    unit: 'MHz' },
  memory: { label: 'Memory', unit: 'MHz' },
};

// Human-readable labels for subcategory slugs
// Add entries here as you create new subcategories
const SUBCAT_LABELS = {
  'dgpu':          'Discrete GPU',
  'igp':           'Integrated GPU',
  'igp-cpu':       'IGP (CPU)',
  'igp-chipset':   'IGP (Chipset)',
  'ddr':           'DDR',
  'ddr2':          'DDR2',
  'ddr3':          'DDR3',
  'ddr4':          'DDR4',
  'ddr5':          'DDR5',
  'sdr':           'SDR',
};

function subcatLabel(slug) {
  return SUBCAT_LABELS[slug] || slug;
}

// Normalize a subcategory string to a URL-safe slug
function subcatSlug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

const PAGE_TITLES = {
  home:   'OC World Record Museum — Overclocking History Since 1996',
  cpu:    'CPU Overclocking World Record History — OC Museum',
  gpu:    'GPU Overclocking World Record History — OC Museum',
  memory: 'Memory Overclocking World Record History — OC Museum',
  statistics: 'Statistics & Insights — OC World Record Museum',
  about:  'About — OC World Record Museum',
};

// ── HELPERS (shared) ──────────────────────────────────
function toWebFilename(filename) {
  if (!filename) return null;
  return filename.replace(/\.[^.]+$/, '.webp');
}

let allRecords      = [];
let subcategories   = {};  // category -> [subcategory names]
let currentCategory = 'cpu';
let currentSubcat   = null;  // null = overall
let activeTags      = new Set();
let selectedUid     = null;
let panelOpen       = false;

// ── INIT ──────────────────────────────────────────────
async function init() {
  try {
    const [indexRes, subcatRes] = await Promise.all([
      fetch('data/index.json'),
      fetch('data/subcategories.json'),
    ]);
    allRecords    = await indexRes.json();
    subcategories = await subcatRes.json();
  } catch (e) {
    console.error('Failed to load data', e);
    allRecords = [];
  }
  setupNav();
  routeFromHash();
  window.addEventListener('hashchange', routeFromHash);
}

// ── ROUTING ───────────────────────────────────────────
function routeFromHash() {
  const hash  = location.hash.replace('#', '') || 'home';
  const parts = hash.split('/');
  const page  = parts[0];

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page)
  );

  // Update page title
  document.title = PAGE_TITLES[page] || PAGE_TITLES.home;

  if (page === 'home' || page === '') {
    closePanelSilent();
    document.getElementById('page-home').classList.add('active');
    renderHome();
  } else if (page === 'statistics') {
    closePanelSilent();
    document.getElementById('page-statistics').classList.add('active');
    renderStatisticsPage();
  } else if (CATEGORIES[page]) {
    currentCategory = page;
    // Hash can be: #cat  /  #cat/uid  /  #cat/subcat  /  #cat/subcat/uid
    const p1 = parts[1] ? decodeURIComponent(parts[1]) : null;
    const p2 = parts[2] ? decodeURIComponent(parts[2]) : null;
    const isUid = uid => !!allRecords.find(r => r.uid === uid);

    if (p2) {
      // #cat/subcat/uid
      currentSubcat = p1;
    } else if (p1 && !isUid(p1)) {
      // #cat/subcat
      currentSubcat = p1;
    } else {
      // #cat or #cat/uid
      currentSubcat = null;
    }

    const recordUid = p2 || (p1 && isUid(p1) ? p1 : null);

    activeTags.clear();
    closePanelSilent();
    document.getElementById('page-timeline').classList.add('active');
    renderTimeline();
    if (recordUid) openRecord(recordUid);
  } else if (page === 'about') {
    closePanelSilent();
    document.getElementById('page-about').classList.add('active');
  }
}

function setupNav() {
  document.querySelectorAll('nav a[data-page]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      location.hash = a.dataset.page;
    });
  });
}

// ── FILTER ────────────────────────────────────────────
function getFilteredRecords() {
  return allRecords.filter(r => {
    if (r.category !== currentCategory) return false;

    if (currentSubcat) {
      // Subcategory view — only records in this subcategory that are genuine within it
      const inSubcat = (r.subcategory || []).includes(currentSubcat);
      if (!inSubcat) return false;
      const genuineIn = r._genuine_in || [];
      if (!genuineIn.includes(currentSubcat) && !r._genuine_overall) return false;
    } else {
      // Overall view — only overall genuine records
      if (r._genuine_overall === false) return false;
    }

    // Tag filter (informational, within the current view)
    if (activeTags.size === 0) return true;
    const tags = r.tags || [];
    return [...activeTags].every(t => tags.includes(t));
  });
}

function getYearRange(records) {
  if (!records.length) return '';
  const years = records.map(r => parseInt(r.achieved_at.slice(0, 4)));
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `${min}` : `${min}–${max}`;
}

// ── HOME PAGE ─────────────────────────────────────────
function renderHome() {
  if (!allRecords.length) return;

  // Current records — highest value_mhz per category
  const grid = document.getElementById('current-records-grid');
  if (grid) {
    grid.innerHTML = ['cpu','gpu','memory'].map(cat => {
      const catRecords = allRecords.filter(r => r.category === cat);
      if (!catRecords.length) return '';
      const top = catRecords.reduce((a,b) => a.value_mhz > b.value_mhz ? a : b);
      const oc  = top.overclockers?.[0] || {};
      const flag = getFlagEmoji(oc.country);
      const label = CATEGORIES[cat].label;
      return `
        <a class="current-record-card" href="#${cat}/${top.uid}">
          <div class="cr-category">${label} World Record</div>
          <div class="cr-freq">${top.value_mhz.toFixed(2)}<span class="cr-unit">MHz</span></div>
          <div class="cr-hardware">${top.hardware?.primary || 'Unknown'}</div>
          <div class="cr-overclocker">
            ${flag ? `<span class="cr-flag">${flag}</span>` : ''}
            <span>${oc.handle || 'Unknown'}</span>
          </div>
          <div class="cr-date">${formatDateLong(top.achieved_at, top.achieved_at_approximate)}</div>
          <div class="cr-view-all">View full ${label} timeline →</div>
        </a>
      `;
    }).join('');
  }

  // Stats strip
  const stats = document.getElementById('home-stats');
  if (stats) {
    const years = allRecords.map(r => parseInt(r.achieved_at.slice(0,4)));
    const span  = Math.max(...years) - Math.min(...years);
    const uniqueOCs = new Set(allRecords.flatMap(r => r.overclockers.map(o => o.handle))).size;
    stats.innerHTML = `
      <div class="stat-item">
        <div class="stat-value">${allRecords.length}</div>
        <div class="stat-label">Total Records</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">3</div>
        <div class="stat-label">Categories</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${span}+</div>
        <div class="stat-label">Years of History</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${uniqueOCs}</div>
        <div class="stat-label">Overclockers</div>
      </div>
    `;
  }

  // Statistics section (top 5 for home page preview)
  renderStatistics(5);

  // Record of the Day
  renderRecordOfTheDay();
}

function renderRecordOfTheDay() {
  const el = document.getElementById('record-of-the-day');
  if (!el || !allRecords.length) return;

  // Pick deterministically by day-of-year so it changes daily but is consistent
  const now   = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const r = allRecords[dayOfYear % allRecords.length];

  const cat   = CATEGORIES[r.category] || { label: r.category };
  const oc    = r.overclockers?.[0] || {};
  const flag  = getFlagEmoji(oc.country);
  const assetBase = r._asset_base || '';
  const heroImg = r.hero ? `${assetBase}${r._hero_web || toWebFilename(r.hero)}` : null;

  // Auto-generate description
  const parts = [];
  if (r.hardware?.primary) parts.push(`on a ${r.hardware.primary}`);
  if (r.hardware?.cooling)  parts.push(`cooled with ${r.hardware.cooling}`);
  const ocNames = (r.overclockers || []).map(o => o.handle).join(' and ');
  const country = oc.country ? ` from ${oc.country}` : '';
  const desc = `${ocNames}${country} set this ${cat.label} world record of ${r.value_mhz.toFixed(2)} MHz ${parts.join(', ')} on ${formatDateLong(r.achieved_at, r.achieved_at_approximate)}.${r.notes ? ' ' + r.notes : ''}`;

  el.innerHTML = `
    <div class="rotd-inner">
      ${heroImg ? `
        <a href="#${r.category}/${r.uid}" class="rotd-img-wrap">
          <img src="${heroImg}" alt="Record screenshot" loading="lazy">
        </a>
      ` : ''}
      <div class="rotd-body">
        <div class="rotd-kicker">${cat.label} · ${formatDateLong(r.achieved_at, r.achieved_at_approximate)}</div>
        <div class="rotd-freq">${r.value_mhz.toFixed(2)}<span class="rotd-unit">MHz</span></div>
        <div class="rotd-hardware">${r.hardware?.primary || ''}</div>
        <div class="rotd-oc">
          ${flag ? `<span>${flag}</span>` : ''}
          <span>${ocNames}</span>
        </div>
        <p class="rotd-desc">${desc}</p>
        <a href="#${r.category}/${r.uid}" class="rotd-link">View full record →</a>
      </div>
    </div>
  `;
}

// ── SUB-NAV ───────────────────────────────────────────
function renderSubNav() {
  const el = document.getElementById('subnav');
  if (!el) return;
  const subcats = subcategories[currentCategory] || [];
  if (!subcats.length) { el.innerHTML = ''; el.style.display = 'none'; return; }

  el.style.display = 'flex';
  el.innerHTML = `
    <a class="subnav-item ${!currentSubcat ? 'active' : ''}"
       href="#${currentCategory}">All</a>
    ${subcats.map(s => `
      <a class="subnav-item ${currentSubcat === s ? 'active' : ''}"
         href="#${currentCategory}/${encodeURIComponent(s)}">${subcatLabel(s)}</a>
    `).join('')}
  `;

  // Wire clicks to set currentSubcat without full re-route
  el.querySelectorAll('.subnav-item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const href = a.getAttribute('href').replace('#','');
      const parts = href.split('/');
      currentSubcat = parts[1] ? decodeURIComponent(parts[1]) : null;
      activeTags.clear();
      closePanelSilent();
      history.pushState(null, '', '#' + href);
      renderTimeline();
    });
  });
}

// ── TIMELINE RENDER ───────────────────────────────────
function renderTimeline() {
  const cat     = CATEGORIES[currentCategory];
  const records = getFilteredRecords();

  const subcatSuffix = currentSubcat ? ` — ${subcatLabel(currentSubcat)}` : '';
  document.getElementById('timeline-title').innerHTML =
    `<span class="cat-label">${cat.label}</span> Overclocking World Record History${subcatSuffix}`;
  document.getElementById('timeline-subtitle').textContent =
    `${records.length} records · ${getYearRange(records)}`;
  document.getElementById('header-record-count').textContent =
    `${records.length} records`;

  renderSubNav();
  renderTagSidebar(records);
  try { renderChart(records); } catch(e) { console.warn('Chart render failed:', e); }

  const maxMhz = Math.max(...records.map(r => r.value_mhz), 1);

  // Group by decade, newest decade first
  const byDecade = {};
  records.forEach(r => {
    const decade = Math.floor(parseInt(r.achieved_at.slice(0, 4)) / 10) * 10;
    const key = `${decade}s`;
    (byDecade[key] = byDecade[key] || []).push(r);
  });

  const container = document.getElementById('timeline-records');
  container.innerHTML = '';

  Object.keys(byDecade)
    .sort((a, b) => parseInt(b) - parseInt(a))
    .forEach(decade => {
      const group = document.createElement('div');
      group.className = 'decade-group';

      const label = document.createElement('div');
      label.className = 'decade-label';
      label.textContent = decade;
      group.appendChild(label);

      byDecade[decade]
        .sort((a, b) => new Date(b.achieved_at) - new Date(a.achieved_at))
        .forEach(r => {
          const pct = ((r.value_mhz / maxMhz) * 100).toFixed(1);
          const row = document.createElement('div');
          row.className = 'record-row' + (r.uid === selectedUid ? ' selected' : '');
          row.style.setProperty('--bar-pct', pct + '%');
          row.dataset.uid = r.uid;

          const primary = r.hardware?.primary || 'Unknown';
          const ocs     = (r.overclockers || []).map(o => o.handle).join(' & ');
          const dateStr = formatDate(r.achieved_at, r.achieved_at_approximate);

          const flags = (r.overclockers || [])
            .map(o => getFlagEmoji(o.country)).filter(Boolean).join('');
          row.innerHTML = `
            <div class="rec-date">${dateStr}</div>
            <div class="rec-freq">${r.value_mhz.toFixed(2)}<span class="unit">MHz</span></div>
            <div class="rec-cpu">${primary}</div>
            <div class="rec-oc">${ocs}</div>
            <div class="rec-flag">${flags}</div>
          `;
          row.addEventListener('click', () => {
            const base = currentSubcat ? `${currentCategory}/${encodeURIComponent(currentSubcat)}` : currentCategory;
            location.hash = `${base}/${r.uid}`;
          });
          group.appendChild(row);
        });

      container.appendChild(group);
    });
}

// ── LINE CHART ────────────────────────────────────────
function renderChart(records) {
  const canvas = document.getElementById('record-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const sorted = [...records].sort(
    (a, b) => new Date(a.achieved_at) - new Date(b.achieved_at)
  );

  if (sorted.length < 2) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';

  // DPI-aware sizing
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width > 0 ? rect.width : (canvas.parentElement?.offsetWidth || 800);
  const H = rect.height > 0 ? rect.height : 220;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const PAD = { top: 20, right: 20, bottom: 36, left: 64 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top  - PAD.bottom;

  // Scales
  const dates   = sorted.map(r => new Date(r.achieved_at).getTime());
  const freqs   = sorted.map(r => r.value_mhz);
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const maxFreq = Math.max(...freqs) * 1.10;

  const xScale = d => PAD.left + ((d - minDate) / (maxDate - minDate || 1)) * plotW;
  const yScale = v => PAD.top  + plotH - (v / maxFreq) * plotH;

  // CSS vars
  const cs       = getComputedStyle(document.documentElement);
  const accent   = cs.getPropertyValue('--accent').trim()   || '#e8490f';
  const border   = cs.getPropertyValue('--border').trim()   || '#e5e5df';
  const textDim  = cs.getPropertyValue('--text-dim').trim() || '#b0b0a0';
  const bgOff    = cs.getPropertyValue('--bg-off').trim()   || '#f7f7f5';

  ctx.clearRect(0, 0, W, H);

  // Y grid + labels
  const yTicks = 4;
  ctx.font      = '10px IBM Plex Mono, monospace';
  ctx.textAlign = 'right';
  for (let i = 0; i <= yTicks; i++) {
    const v = maxFreq * (i / yTicks);
    const y = yScale(v);
    ctx.strokeStyle = border;
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = textDim;
    ctx.fillText(
      v >= 1000 ? (v / 1000).toFixed(1) + ' GHz' : Math.round(v) + '',
      PAD.left - 6, y + 3
    );
  }

  // X year ticks
  ctx.textAlign = 'center';
  const minYear = new Date(minDate).getFullYear();
  const maxYear = new Date(maxDate).getFullYear();
  const yearStep = (maxYear - minYear) > 15 ? 5 : 2;
  for (let yr = Math.ceil(minYear / yearStep) * yearStep; yr <= maxYear; yr += yearStep) {
    const x = xScale(new Date(`${yr}-06-01`).getTime());
    if (x < PAD.left || x > PAD.left + plotW) continue;
    ctx.fillStyle = textDim;
    ctx.fillText(yr, x, H - PAD.bottom + 14);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, PAD.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Area fill
  ctx.beginPath();
  sorted.forEach((r, i) => {
    const x = xScale(dates[i]);
    const y = yScale(r.value_mhz);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(xScale(dates[dates.length - 1]), PAD.top + plotH);
  ctx.lineTo(xScale(dates[0]), PAD.top + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
  grad.addColorStop(0, 'rgba(232,73,15,0.15)');
  grad.addColorStop(1, 'rgba(232,73,15,0.0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Step line (horizontal then vertical — record progression style)
  ctx.beginPath();
  sorted.forEach((r, i) => {
    const x = xScale(dates[i]);
    const y = yScale(r.value_mhz);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      // horizontal to this x, then up to this y
      ctx.lineTo(x, yScale(sorted[i-1].value_mhz));
      ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // Bubbles — every record
  const points = [];
  sorted.forEach((r, i) => {
    const x = xScale(dates[i]);
    const y = yScale(r.value_mhz);
    const isSelected = r.uid === selectedUid;
    const isHovered  = canvas._hovered === r.uid;
    const R = isSelected ? 6 : isHovered ? 5 : 3.5;

    // Shadow for hover/selected
    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(x, y, R + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,73,15,0.15)';
      ctx.fill();
    }

    // Bubble
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fillStyle   = isSelected ? accent : (isHovered ? accent : '#fff');
    ctx.strokeStyle = accent;
    ctx.lineWidth   = isSelected ? 0 : 2;
    ctx.fill();
    if (!isSelected) ctx.stroke();

    points.push({ x, y, uid: r.uid, record: r });
  });

  canvas._points = points;
}

// ── CHART TOOLTIP ─────────────────────────────────────
(function setupChartEvents() {
  // Create tooltip element
  const tip = document.createElement('div');
  tip.id = 'chart-tooltip';
  tip.style.cssText = `
    position: fixed; pointer-events: none; z-index: 200;
    background: #1a1a18; color: #e8e8f0; border: 1px solid #e8490f;
    border-radius: 5px; padding: 7px 11px; font-family: IBM Plex Mono, monospace;
    font-size: 11px; line-height: 1.5; display: none; white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  `;
  document.body.appendChild(tip);

  function findNearest(canvas, e) {
    if (!canvas._points?.length) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let closest = null, minDist = Infinity;
    canvas._points.forEach(p => {
      const d = Math.sqrt((p.x - mx) ** 2 + (p.y - my) ** 2);
      if (d < minDist) { minDist = d; closest = p; }
    });
    return minDist < 20 ? closest : null;
  }

  // Attach events after DOM ready
  function attach() {
    const canvas = document.getElementById('record-chart');
    if (!canvas) { setTimeout(attach, 200); return; }

    canvas.addEventListener('mousemove', function(e) {
      const p = findNearest(this, e);
      if (p) {
        this.style.cursor = 'pointer';
        this._hovered = p.uid;
        const r = p.record;
        const ocs = (r.overclockers || []).map(o => o.handle).join(' & ');
        tip.innerHTML = `<strong>${r.value_mhz.toFixed(2)} MHz</strong><br>${r.hardware?.primary || ''}<br>${ocs} · ${r.achieved_at}`;
        tip.style.display = 'block';
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top  = (e.clientY - 10) + 'px';
        // Redraw to show hover state
        try { renderChart(getFilteredRecords()); } catch(e) {}
      } else {
        this.style.cursor = 'default';
        if (this._hovered) {
          this._hovered = null;
          try { renderChart(getFilteredRecords()); } catch(e) {}
        }
        tip.style.display = 'none';
      }
    });

    canvas.addEventListener('mouseleave', function() {
      tip.style.display = 'none';
      this._hovered = null;
      this.style.cursor = 'default';
      try { renderChart(getFilteredRecords()); } catch(e) {}
    });

    canvas.addEventListener('click', function(e) {
      const p = findNearest(this, e);
      if (p) { const base = currentSubcat ? `${currentCategory}/${encodeURIComponent(currentSubcat)}` : currentCategory; location.hash = `${base}/${p.uid}`; }
    });
  }
  attach();
})();

// Redraw chart on resize
window.addEventListener('resize', () => {
  try { renderChart(getFilteredRecords()); } catch(e) {}
});

// ── TAG SIDEBAR ───────────────────────────────────────
function renderTagSidebar(records) {
  const tagCounts = {};
  records.forEach(r =>
    (r.tags || []).forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1)
  );

  const container = document.getElementById('sidebar-tags');
  container.innerHTML = '';

  if (!Object.keys(tagCounts).length) {
    container.innerHTML =
      '<span style="font-family:var(--mono);font-size:11px;color:var(--text-dim)">No tags yet</span>';
    return;
  }

  Object.entries(tagCounts).sort().forEach(([tag, count]) => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn' + (activeTags.has(tag) ? ' active' : '');
    btn.textContent = `${tag} (${count})`;
    btn.onclick = () => {
      activeTags.has(tag) ? activeTags.delete(tag) : activeTags.add(tag);
      renderTimeline();
    };
    container.appendChild(btn);
  });
}

// ── DETAIL PANEL ──────────────────────────────────────
function openRecord(uid) {
  const record = allRecords.find(r => r.uid === uid);
  if (!record) return;

  selectedUid = uid;
  panelOpen   = true;

  document.querySelectorAll('.record-row').forEach(row =>
    row.classList.toggle('selected', row.dataset.uid === uid)
  );

  document.getElementById('timeline-main').classList.add('panel-open');
  document.getElementById('detail-panel').classList.add('open');

  renderPanel(record);
  // Redraw immediately for selected dot, then again after CSS transition (0.3s) for correct width
  try { renderChart(getFilteredRecords()); } catch(e) {}
  setTimeout(() => { try { renderChart(getFilteredRecords()); } catch(e) {} }, 320);

  const row = document.querySelector(`.record-row[data-uid="${uid}"]`);
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closePanel() {
  // Stay on current page (preserving subcategory if active)
  const page = location.hash.replace('#','').split('/')[0];
  if (CATEGORIES[page]) {
    const target = currentSubcat
      ? `${currentCategory}/${encodeURIComponent(currentSubcat)}`
      : currentCategory;
    location.hash = target;
  } else {
    closePanelSilent();
  }
}

function closePanelSilent() {
  panelOpen   = false;
  selectedUid = null;
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('timeline-main').classList.remove('panel-open');
  document.querySelectorAll('.record-row').forEach(r => r.classList.remove('selected'));
  setTimeout(() => { try { renderChart(getFilteredRecords()); } catch(e) {} }, 320);
}

function renderPanel(record) {
  const records = getFilteredRecords().sort(
    (a, b) => new Date(a.achieved_at) - new Date(b.achieved_at)
  );
  const idx  = records.findIndex(r => r.uid === record.uid);

  const cat          = CATEGORIES[record.category];
  const recordDate   = formatDateLong(record.achieved_at, record.achieved_at_approximate);

  // Determine if this was a category record or subcategory record
  let recordContext = '';
  if (record._genuine_overall) {
    recordContext = `${cat.label} World Record on ${recordDate}`;
  } else if (record._genuine_in && record._genuine_in.length > 0) {
    // Just show subcategory, not "category subcategory"
    const subcatLabels = record._genuine_in.map(s => subcatLabel(s)).join(', ');
    recordContext = `${subcatLabels} Record on ${recordDate}`;
  } else {
    recordContext = `${cat.label} Record on ${recordDate}`;
  }

  const overclockers = record.overclockers || [];
  const hardware     = record.hardware     || {};
  const sources      = record.sources      || [];
  const tags         = record.tags         || [];
  const assetBase    = record._asset_base  || '';
  const assets       = record.assets       || [];
  const heroFile     = record._hero_web || (record.hero ? toWebFilename(record.hero) : null);
  const heroOrig     = record.hero || null;
  // Gallery = all assets except the hero
  const galleryAssets = assets.filter(a => a.file !== record.hero);

  document.getElementById('panel-content').innerHTML = `
    <div class="panel-rank">${recordContext}</div>

    <div class="panel-freq">
      ${record.value_mhz.toFixed(2)}<span class="unit">MHz</span>
    </div>
    <div class="panel-date">
      ${formatDateLong(record.achieved_at, record.achieved_at_approximate)}
    </div>

    ${heroFile ? `
      <div class="panel-hero">
        <img src="${assetBase}${heroFile}" alt="Hero image" loading="lazy"
          onclick="openLightbox('${assetBase}${heroFile}')" style="cursor:zoom-in">
      </div>
    ` : '<div class="panel-divider"></div>'}

    <div class="panel-section-label">Overclocker${overclockers.length > 1 ? 's' : ''}</div>
    <div class="panel-overclockers">
      ${overclockers.map(oc => {
        const flag = getFlagEmoji(oc.country);
        return `
          <div class="oc-card">
            ${oc.country ? `
              <div class="oc-country">
                <span class="oc-flag">${flag}</span>
                <span class="oc-country-code">${oc.country}</span>
              </div>
            ` : ''}
            <div class="oc-handle">${oc.handle}</div>
            ${oc.real_name ? `<div class="oc-real-name">${oc.real_name}</div>` : ''}
            ${oc.aliases?.length ? `<div class="oc-aliases">aka ${oc.aliases.join(', ')}</div>` : ''}
            ${oc.profile_url ? `
              <a href="${oc.profile_url}" target="_blank" rel="noopener" class="oc-profile-link">
                View profile ↗
              </a>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>

    <div class="panel-divider"></div>

    <div class="panel-section-label">Hardware</div>
    <div class="panel-hardware-grid">
      ${hwRow('Processor',   hardware.primary)}
      ${hwRow('Motherboard', hardware.motherboard)}
      ${hwRow('Memory',      hardware.memory)}
      ${hwRow('Cooling',     hardware.cooling)}
    </div>

    ${sources.length ? `
      <div class="panel-divider"></div>
      <div class="panel-section-label">Sources</div>
      <div class="panel-sources">
        ${sources.map(s => `
          <a href="${s.url}" target="_blank" rel="noopener" class="source-link">
            <span class="source-icon">↗</span>${s.label}
          </a>
          ${s.archived_url ? `
            <a href="${s.archived_url}" target="_blank" rel="noopener" class="source-link source-archived">
              <span class="source-icon">◉</span>${s.label} (archived)
            </a>
          ` : ''}
        `).join('')}
      </div>
    ` : ''}

    ${tags.length ? `
      <div class="panel-divider"></div>
      <div class="panel-section-label">Tags</div>
      <div class="panel-tags-list">
        ${tags.map(t => `<span class="panel-tag">${t}</span>`).join('')}
      </div>
    ` : ''}

    ${record.notes ? `
      <div class="panel-divider"></div>
      <div class="panel-section-label">Notes</div>
      <div class="panel-notes">${record.notes}</div>
    ` : ''}

    ${galleryAssets.length ? `
      <div class="panel-divider"></div>
      <div class="panel-section-label">Images</div>
      <div class="panel-gallery">
        ${galleryAssets.map(a => {
          const webFile = a._web_file || toWebFilename(a.file);
          return `
            <div class="gallery-thumb" title="${a.caption || a.type}"
                 onclick="openLightbox('${assetBase}${webFile}')" style="cursor:zoom-in">
              <img src="${assetBase}${webFile}" alt="${a.caption || a.type}" loading="lazy">
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    <div class="panel-divider"></div>
    <div class="panel-nav">
      <button class="panel-nav-btn" id="btn-prev" ${idx <= 0 ? 'disabled' : ''}>← Older</button>
      <button class="panel-nav-btn" id="btn-next" ${idx >= records.length - 1 ? 'disabled' : ''}>Newer →</button>
    </div>

    <div class="panel-discuss">
      <a href="https://github.com/SkatterBencher/oc-world-record-history/issues/new?title=Record+${record.uid}&body=Record+UID:+${record.uid}%0A%0AYour+comment:"
         target="_blank" rel="noopener">
        💬 Discuss this record on GitHub
      </a>
    </div>
  `;

  document.getElementById('btn-prev')?.addEventListener('click', () => {
    const basePrev = currentSubcat ? `${currentCategory}/${encodeURIComponent(currentSubcat)}` : currentCategory;
    location.hash = `${basePrev}/${records[idx - 1].uid}`;
  });
  document.getElementById('btn-next')?.addEventListener('click', () => {
    const baseNext = currentSubcat ? `${currentCategory}/${encodeURIComponent(currentSubcat)}` : currentCategory;
    location.hash = `${baseNext}/${records[idx + 1].uid}`;
  });
}

// ── STATISTICS ────────────────────────────────────────
function renderStatistics(limitTo) {
  // limitTo: optional number to limit list items (for home page preview)
  const container = document.getElementById('home-statistics');
  if (!container || !allRecords.length) return;

  // ── Compute: Records per Country ──
  const countryCounts = {};
  allRecords.forEach(r => {
    (r.overclockers || []).forEach(oc => {
      if (oc.country) {
        countryCounts[oc.country] = (countryCounts[oc.country] || 0) + 1;
      }
    });
  });
  const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
  const topCountries = limitTo ? sortedCountries.slice(0, limitTo) : sortedCountries;
  const maxCountryCount = sortedCountries.length ? sortedCountries[0][1] : 1;

  // ── Compute: Records per Overclocker ──
  const ocCounts = {};
  const ocCountries = {};
  allRecords.forEach(r => {
    (r.overclockers || []).forEach(oc => {
      ocCounts[oc.handle] = (ocCounts[oc.handle] || 0) + 1;
      if (oc.country) {
        if (!ocCountries[oc.handle]) ocCountries[oc.handle] = {};
        ocCountries[oc.handle][oc.country] = (ocCountries[oc.handle][oc.country] || 0) + 1;
      }
    });
  });
  const sortedOCs = Object.entries(ocCounts).sort((a, b) => b[1] - a[1]);
  const topOCs = limitTo ? sortedOCs.slice(0, limitTo) : sortedOCs;
  const maxOCCount = sortedOCs.length ? sortedOCs[0][1] : 1;

  // ── Compute: Records per Decade ──
  const decadeCounts = {};
  allRecords.forEach(r => {
    const year = parseInt(r.achieved_at.slice(0, 4));
    const decade = Math.floor(year / 10) * 10;
    decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
  });
  const decades = Object.entries(decadeCounts)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const maxDecadeCount = Math.max(...Object.values(decadeCounts), 1);

  // ── Compute: Most Recordful Year ──
  const yearCounts = {};
  allRecords.forEach(r => {
    const year = parseInt(r.achieved_at.slice(0, 4));
    yearCounts[year] = (yearCounts[year] || 0) + 1;
  });
  const sortedYears = Object.entries(yearCounts).sort((a, b) => b[1] - a[1]);
  const topYear = sortedYears[0];

  // ── Compute: Records per Category ──
  const catCounts = {};
  allRecords.forEach(r => {
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
  });

  // ── Render ──
  container.innerHTML = `
    <h2 class="statistics-section-title">Statistics & Insights</h2>
    <div class="statistics-grid">

      <!-- Records per Country -->
      <div class="stat-card">
        <div class="stat-card-title">Records per Country</div>
        <div class="stat-list">
          ${topCountries.map(([country, count], i) => `
            <div class="stat-list-item">
              <span class="stat-list-rank">${i + 1}</span>
              <span class="stat-list-flag">${getFlagEmoji(country)}</span>
              <span class="stat-list-name">${country}</span>
              <div class="stat-list-bar">
                <div class="stat-list-bar-fill" style="width:${(count / maxCountryCount * 100).toFixed(1)}%"></div>
              </div>
              <span class="stat-list-count">${count}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Records per Overclocker -->
      <div class="stat-card">
        <div class="stat-card-title">Records per Overclocker</div>
        <div class="stat-list">
          ${topOCs.map(([handle, count], i) => {
            // Find most common country for this overclocker
            let topCountry = '';
            if (ocCountries[handle]) {
              topCountry = Object.entries(ocCountries[handle])
                .sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            }
            return `
              <div class="stat-list-item">
                <span class="stat-list-rank">${i + 1}</span>
                ${topCountry ? `<span class="stat-list-flag">${getFlagEmoji(topCountry)}</span>` : ''}
                <span class="stat-list-name">${handle}</span>
                <div class="stat-list-bar">
                  <div class="stat-list-bar-fill" style="width:${(count / maxOCCount * 100).toFixed(1)}%"></div>
                </div>
                <span class="stat-list-count">${count}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Records per Decade -->
      <div class="stat-card">
        <div class="stat-card-title">Records per Decade</div>
        <div class="decade-breakdown">
          ${decades.map(([decade, count]) => `
            <div class="decade-item">
              <span class="decade-label">${decade}s</span>
              <div class="decade-bar-wrap">
                <div class="decade-bar" style="width:${(count / maxDecadeCount * 100).toFixed(1)}%"></div>
              </div>
              <span class="decade-count">${count}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Most Recordful Year + Category Breakdown -->
      <div class="stat-card">
        <div class="stat-card-title">Highlights</div>
        <div class="highlight-stat">
          <div class="highlight-value">${topYear ? topYear[0] : '—'}</div>
          <div class="highlight-label">Most Recordful Year</div>
          <div class="highlight-sub">${topYear ? topYear[1] : 0} world records set</div>
        </div>
        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);">
          <div class="stat-card-title" style="margin-bottom: 12px; padding-bottom: 6px;">Records by Category</div>
          ${['cpu', 'gpu', 'memory'].map(cat => {
            const count = catCounts[cat] || 0;
            const maxCat = Math.max(...Object.values(catCounts), 1);
            const label = CATEGORIES[cat].label;
            return `
              <div class="decade-item" style="margin-bottom: 8px;">
                <span class="decade-label" style="width: 52px;">${label}</span>
                <div class="decade-bar-wrap">
                  <div class="decade-bar" style="width:${(count / maxCat * 100).toFixed(1)}%"></div>
                </div>
                <span class="decade-count">${count}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

    </div>
    ${limitTo ? `
      <div style="text-align: center; margin-top: 24px;">
        <a href="#statistics" class="cta-btn">View Full Statistics →</a>
      </div>
    ` : ''}
  `;
}

// ── STATISTICS PAGE ───────────────────────────────────
const STATS_PAGE_SIZE = 20; // Items per page for paginated lists

function renderStatisticsPage() {
  const container = document.getElementById('statistics-full-content');
  const sidebar = document.getElementById('stat-nav-items');
  if (!container || !allRecords.length) return;

  // ── Compute all stats ──
  const countryCounts = {}, countryRecords = {};
  const ocCounts = {}, ocRecords = {};
  const yearCounts = {}, yearRecords = {};
  const decadeCounts = {};
  const catCounts = {};

  allRecords.forEach(r => {
    (r.overclockers || []).forEach(oc => {
      if (oc.country) {
        countryCounts[oc.country] = (countryCounts[oc.country] || 0) + 1;
        if (!countryRecords[oc.country]) countryRecords[oc.country] = [];
        countryRecords[oc.country].push(r.uid);
      }
      ocCounts[oc.handle] = (ocCounts[oc.handle] || 0) + 1;
      if (!ocRecords[oc.handle]) ocRecords[oc.handle] = [];
      ocRecords[oc.handle].push(r.uid);
    });
    const year = parseInt(r.achieved_at.slice(0, 4));
    yearCounts[year] = (yearCounts[year] || 0) + 1;
    if (!yearRecords[year]) yearRecords[year] = [];
    yearRecords[year].push(r.uid);
    const decade = Math.floor(year / 10) * 10;
    decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
    catCounts[r.category] = (catCounts[r.category] || 0) + 1;
  });

  const sortedCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
  const sortedOCs = Object.entries(ocCounts).sort((a, b) => b[1] - a[1]);
  const sortedYears = Object.entries(yearCounts).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const decades = Object.entries(decadeCounts).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  const maxCountryCount = sortedCountries[0]?.[1] || 1;
  const maxOCCount = sortedOCs[0]?.[1] || 1;
  const maxYearCount = Math.max(...Object.values(yearCounts), 1);
  const maxDecadeCount = Math.max(...Object.values(decadeCounts), 1);

  // Populate sidebar
  sidebar.innerHTML = `
    <div class="stat-nav-item active" data-target="stat-countries">Countries</div>
    <div class="stat-nav-item" data-target="stat-overclockers">Overclockers</div>
    <div class="stat-nav-item" data-target="stat-years">Years</div>
    <div class="stat-nav-item" data-target="stat-decades">Decades</div>
    <div class="stat-nav-item" data-target="stat-categories">Categories</div>
  `;

  // Click handlers for sidebar navigation
  sidebar.querySelectorAll('.stat-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      sidebar.querySelectorAll('.stat-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const target = document.getElementById(item.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Scroll-based highlighting for sidebar
  const statSections = ['stat-countries', 'stat-overclockers', 'stat-years', 'stat-decades', 'stat-categories'];
  const mainEl = document.getElementById('statistics-main');
  if (mainEl) {
    mainEl.addEventListener('scroll', () => {
      const scrollTop = mainEl.scrollTop;
      let currentSection = 'stat-countries';

      for (const sectionId of statSections) {
        const section = document.getElementById(sectionId);
        if (section) {
          const sectionTop = section.offsetTop - 120;
          if (scrollTop >= sectionTop) {
            currentSection = sectionId;
          }
        }
      }

      sidebar.querySelectorAll('.stat-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.target === currentSection);
      });
    });
  }

  // Render paginated sections
  function renderPaginatedSection(data, pageSize, renderFn, sectionId) {
    const total = Math.ceil(data.length / pageSize);
    if (total <= 1) {
      return data.map(renderFn).join('');
    }
    let html = '';
    for (let page = 0; page < total; page++) {
      const pageData = data.slice(page * pageSize, (page + 1) * pageSize);
      const pageId = `${sectionId}-page-${page + 1}`;
      html += `<div class="stat-page" id="${pageId}" style="display:${page === 0 ? 'block' : 'none'}">`;
      html += pageData.map(renderFn).join('');
      html += '</div>';
    }
    // Add pagination controls
    html += `<div class="stat-pagination" data-section="${sectionId}">`;
    for (let p = 0; p < total; p++) {
      html += `<button class="stat-page-btn ${p === 0 ? 'active' : ''}" data-page="${p}" data-section="${sectionId}">${p + 1}</button>`;
    }
    html += '</div>';
    return html;
  }

  container.innerHTML = `
    <div class="stat-section" id="stat-countries">
      <div class="stat-section-title">Records per Country (${sortedCountries.length})</div>
      ${renderPaginatedSection(sortedCountries, STATS_PAGE_SIZE, ([country, count], i) => {
        const globalIndex = i;
        const uids = countryRecords[country] || [];
        const links = uids.slice(0, 5).map(uid => {
          const rec = allRecords.find(r => r.uid === uid);
          return rec ? `<a href="#${rec.category}/${uid}" class="stat-record-link" data-stat-page="true">${rec.value_mhz.toFixed(0)} MHz</a>` : '';
        }).join('');
        const extra = uids.length - 5;
        return `
          <div class="stat-list-item">
            <span class="stat-list-rank">${globalIndex + 1}</span>
            <span class="stat-list-flag">${getFlagEmoji(country)}</span>
            <span class="stat-list-name">${country}</span>
            <div class="stat-list-bar"><div class="stat-list-bar-fill" style="width:${(count/maxCountryCount*100).toFixed(1)}%"></div></div>
            <span class="stat-list-count">${count}</span>
          </div>
          <div class="stat-record-links">${links}${extra > 0 ? `<span class="stat-record-more" data-uids="${uids.slice(5).join(',')}">+${extra} more</span>` : ''}</div>
        `;
      }, 'countries')}
    </div>

    <div class="stat-section" id="stat-overclockers">
      <div class="stat-section-title">Records per Overclocker (${sortedOCs.length})</div>
      ${renderPaginatedSection(sortedOCs, STATS_PAGE_SIZE, ([handle, count], i) => {
        const globalIndex = i;
        const uids = ocRecords[handle] || [];
        // Find most common country for this overclocker
        let topCountry = '';
        const countryMap = {};
        uids.forEach(uid => {
          const rec = allRecords.find(r => r.uid === uid);
          if (rec && rec.overclockers) {
            rec.overclockers.forEach(oc => {
              if (oc.handle === handle && oc.country) {
                countryMap[oc.country] = (countryMap[oc.country] || 0) + 1;
              }
            });
          }
        });
        if (Object.keys(countryMap).length) {
          topCountry = Object.entries(countryMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        }
        const links = uids.slice(0, 5).map(uid => {
          const rec = allRecords.find(r => r.uid === uid);
          return rec ? `<a href="#${rec.category}/${uid}" class="stat-record-link" data-stat-page="true">${rec.value_mhz.toFixed(0)} MHz</a>` : '';
        }).join('');
        const extra = uids.length - 5;
        return `
          <div class="stat-list-item">
            <span class="stat-list-rank">${globalIndex + 1}</span>
            ${topCountry ? `<span class="stat-list-flag">${getFlagEmoji(topCountry)}</span>` : ''}
            <span class="stat-list-name">${handle}</span>
            <div class="stat-list-bar"><div class="stat-list-bar-fill" style="width:${(count/maxOCCount*100).toFixed(1)}%"></div></div>
            <span class="stat-list-count">${count}</span>
          </div>
          <div class="stat-record-links">${links}${extra > 0 ? `<span class="stat-record-more" data-uids="${uids.slice(5).join(',')}">+${extra} more</span>` : ''}</div>
        `;
      }, 'overclockers')}
    </div>

    <div class="stat-section" id="stat-years">
      <div class="stat-section-title">Records per Year</div>
      <div class="decade-breakdown">
        ${sortedYears.map(([year, count]) => {
          const uids = yearRecords[year] || [];
          const links = uids.slice(0, 3).map(uid => {
            const rec = allRecords.find(r => r.uid === uid);
            return rec ? `<a href="#${rec.category}/${uid}" class="stat-record-link" data-stat-page="true">${rec.value_mhz.toFixed(0)} MHz</a>` : '';
          }).join('');
          const extra = uids.length - 3;
          return `
            <div class="decade-item">
              <span class="decade-label" style="width:52px;">${year}</span>
              <div class="decade-bar-wrap"><div class="decade-bar" style="width:${(count/maxYearCount*100).toFixed(1)}%"></div></div>
              <span class="decade-count">${count}</span>
            </div>
            <div class="stat-record-links">${links}${extra > 0 ? `<span class="stat-record-more" data-uids="${uids.slice(3).join(',')}">+${extra} more</span>` : ''}</div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="stat-section" id="stat-decades">
      <div class="stat-section-title">Records per Decade</div>
      <div class="decade-breakdown">
        ${decades.map(([decade, count]) => `
          <div class="decade-item">
            <span class="decade-label">${decade}s</span>
            <div class="decade-bar-wrap"><div class="decade-bar" style="width:${(count/maxDecadeCount*100).toFixed(1)}%"></div></div>
            <span class="decade-count">${count}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="stat-section" id="stat-categories">
      <div class="stat-section-title">Records by Category</div>
      <div class="decade-breakdown">
        ${['cpu','gpu','memory'].map(cat => {
          const count = catCounts[cat] || 0;
          const maxCat = Math.max(...Object.values(catCounts), 1);
          return `
            <div class="decade-item">
              <span class="decade-label" style="width:52px;">${CATEGORIES[cat].label}</span>
              <div class="decade-bar-wrap"><div class="decade-bar" style="width:${(count/maxCat*100).toFixed(1)}%"></div></div>
              <span class="decade-count">${count}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Add pagination click handlers
  container.querySelectorAll('.stat-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      const page = parseInt(btn.dataset.page);
      // Hide all pages in this section
      container.querySelectorAll(`#${section}-page-1, [id^="${section}-page-"]`).forEach(p => p.style.display = 'none');
      // Show selected page
      const targetPage = document.getElementById(`${section}-page-${page + 1}`);
      if (targetPage) targetPage.style.display = 'block';
      // Update active button
      container.querySelectorAll(`.stat-pagination[data-section="${section}"] .stat-page-btn`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Add click handlers for record links to open panel
  container.querySelectorAll('.stat-record-link[data-stat-page="true"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const href = link.getAttribute('href').replace('#', '');
      const uid = href.split('/').pop();
      openRecordFromStats(uid);
    });
  });

  // Add click handlers for "+more" expand
  container.querySelectorAll('.stat-record-more').forEach(more => {
    more.addEventListener('click', () => {
      const uids = more.dataset.uids.split(',');
      const parent = more.closest('.stat-record-links');
      const extraLinks = uids.map(uid => {
        const rec = allRecords.find(r => r.uid === uid);
        if (!rec) return '';
        return `<a href="#${rec.category}/${uid}" class="stat-record-link" data-stat-page="true">${rec.value_mhz.toFixed(0)} MHz</a>`;
      }).join('');
      parent.innerHTML += extraLinks;
      more.remove();

      // Re-attach click handlers to new links
      parent.querySelectorAll('.stat-record-link[data-stat-page="true"]').forEach(link => {
        link.addEventListener('click', e => {
          e.preventDefault();
          const href = link.getAttribute('href').replace('#', '');
          const uid = href.split('/').pop();
          openRecordFromStats(uid);
        });
      });
    });
  });
}

// Open record from statistics page (stays on statistics page)
function openRecordFromStats(uid) {
  const record = allRecords.find(r => r.uid === uid);
  if (!record) return;

  selectedUid = uid;
  panelOpen   = true;

  document.getElementById('detail-panel').classList.add('open');
  renderPanel(record);
}

// ── HELPERS ───────────────────────────────────────────
function hwRow(label, value) {
  const missing = !value || value === 'Unknown';
  return `
    <div class="hw-row">
      <span class="hw-label">${label}</span>
      <span class="hw-value ${missing ? 'unknown' : ''}">${missing ? 'Unknown' : value}</span>
    </div>
  `;
}

function getFlagEmoji(countryCode) {
  if (!countryCode) return '';
  return countryCode.toUpperCase()
    .replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function formatDate(iso, approx) {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return approx
    ? `${months[+m - 1]} ${y}`
    : `${parseInt(d)} ${months[+m - 1]} ${y}`;
}

function formatDateLong(iso, approx) {
  const d = new Date(iso + 'T12:00:00Z');
  return approx
    ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) + ' (approx.)'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── EVENTS ────────────────────────────────────────────

document.getElementById('panel-close-btn')?.addEventListener('click', () => {
  closePanel();
});

// ── LIGHTBOX ──────────────────────────────────────────
function openLightbox(src) {
  let box = document.getElementById('lightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'lightbox';
    box.innerHTML = `
      <div class="lb-backdrop"></div>
      <div class="lb-content">
        <img class="lb-img" src="" alt="">
        <button class="lb-close" title="Close (Esc)">×</button>
      </div>
    `;
    box.querySelector('.lb-backdrop').addEventListener('click', closeLightbox);
    box.querySelector('.lb-close').addEventListener('click', closeLightbox);
    document.body.appendChild(box);
  }
  box.querySelector('.lb-img').src = src;
  box.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const box = document.getElementById('lightbox');
  if (box) box.classList.remove('open');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('lightbox')?.classList.contains('open')) {
      closeLightbox();
    } else if (panelOpen) {
      closePanel();
    }
  }
});

// ── START ─────────────────────────────────────────────
init();