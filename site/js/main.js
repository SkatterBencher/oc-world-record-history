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
  'edo':           'EDO',
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

// FIX #7: Safe HTML escape to prevent XSS when injecting record data into innerHTML
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let allRecords      = [];
let allStats        = null;  // Pre-computed statistics
let subcategories   = {};  // category -> [subcategory names]
let currentCategory = 'cpu';
let currentSubcat   = null;  // null = overall
let activeTags      = new Set();
let selectedUid     = null;
let panelOpen       = false;

// ── INIT ──────────────────────────────────────────────
async function init() {
  try {
    const [indexRes, subcatRes, statsRes] = await Promise.all([
      fetch('data/index.json'),
      fetch('data/subcategories.json'),
      fetch('data/statistics.json'),
    ]);
    allRecords    = await indexRes.json();
    subcategories = await subcatRes.json();
    allStats      = await statsRes.json();
  } catch (e) {
    console.error('Failed to load data', e);
    allRecords = [];
  }
  setupNav();
  routeFromHash();
  window.addEventListener('hashchange', routeFromHash);
  // FIX #8: attach chart events once after data is loaded, not via polling IIFE
  setupChartEvents();
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
    // Scroll to top when navigating to statistics page
    const mainEl = document.getElementById('statistics-main');
    if (mainEl) mainEl.scrollTop = 0;
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

  // FIX #10: hamburger menu toggle for mobile
  const burger = document.getElementById('nav-burger');
  const navEl  = document.querySelector('nav');
  if (burger && navEl) {
    burger.addEventListener('click', () => {
      navEl.classList.toggle('nav-open');
      burger.setAttribute('aria-expanded', navEl.classList.contains('nav-open'));
    });
    // Close menu when a link is tapped
    navEl.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navEl.classList.remove('nav-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }
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
        <a class="current-record-card" href="#${cat}/${escapeHtml(top.uid)}">
          <div class="cr-category">${escapeHtml(label)} World Record</div>
          <div class="cr-freq">${top.value_mhz.toFixed(2)}<span class="cr-unit">MHz</span></div>
          <div class="cr-hardware">${escapeHtml(top.hardware?.primary || 'Unknown')}</div>
          <div class="cr-overclocker">
            ${flag ? `<span class="cr-flag">${flag}</span>` : ''}
            <span>${escapeHtml(oc.handle || 'Unknown')}</span>
          </div>
          <div class="cr-date">${formatDateLong(top.achieved_at, top.achieved_at_approximate)}</div>
          <div class="cr-view-all">View full ${escapeHtml(label)} timeline →</div>
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

  // On This Day in OC History
  renderOnThisDay();
}

function renderOnThisDay() {
  const el = document.getElementById('on-this-day');
  if (!el || !allRecords.length) return;

  const now = new Date();
  const todayMonth = now.getMonth() + 1; // 1-12
  const todayDay = now.getDate(); // 1-31

  // Filter records achieved on this month/day (any year)
  const matchingRecords = allRecords.filter(r => {
    const [year, month, day] = r.achieved_at.split('-').map(Number);
    return month === todayMonth && day === todayDay;
  });

  // Sort by year descending (most recent first)
  matchingRecords.sort((a, b) => {
    const yearA = parseInt(a.achieved_at.slice(0, 4));
    const yearB = parseInt(b.achieved_at.slice(0, 4));
    return yearB - yearA;
  });

  if (matchingRecords.length === 0) {
    el.innerHTML = `
      <div class="on-this-day-empty">
        No records achieved on this day yet. ${formatDateLong(now.toISOString().slice(0, 10))}
      </div>
    `;
    return;
  }

  // Show up to 6 records
  const displayRecords = matchingRecords.slice(0, 6);
  const moreCount = matchingRecords.length - 6;

  el.innerHTML = displayRecords.map(r => {
    const cat = CATEGORIES[r.category] || { label: r.category };
    const oc = r.overclockers?.[0] || {};
    const flag = getFlagEmoji(oc.country);

    return `
      <a class="on-this-day-card" href="#${r.category}/${escapeHtml(r.uid)}">
        <div class="otd-category">${escapeHtml(cat.label)}</div>
        <div class="otd-freq">${r.value_mhz.toFixed(2)}<span class="unit">MHz</span></div>
        <div class="otd-hardware">${escapeHtml(r.hardware?.primary || 'Unknown')}</div>
        <div class="otd-overclocker">
          ${flag ? `<span>${flag}</span>` : ''}
          <span>${escapeHtml(oc.handle || 'Unknown')}</span>
        </div>
        <div class="otd-date">${formatDateLong(r.achieved_at, r.achieved_at_approximate)}</div>
      </a>
    `;
  }).join('');

  if (moreCount > 0) {
    el.innerHTML += `
      <a class="on-this-day-card" href="#statistics" style="justify-content:center;align-items:center;text-align:center;">
        <div style="font-family:var(--mono);font-size:12px;color:var(--accent);">+${moreCount} more records</div>
      </a>
    `;
  }
}

function renderRecordOfTheDay() {
  const el = document.getElementById('record-of-the-day');
  if (!el || !allRecords.length) return;

  // FIX #4: use Jan 1 as base so index is 0-based (0–365) and all records can be picked
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - startOfYear) / 86400000);
  const r = allRecords[dayOfYear % allRecords.length];

  const cat   = CATEGORIES[r.category] || { label: r.category };
  const oc    = r.overclockers?.[0] || {};
  const flag  = getFlagEmoji(oc.country);
  const assetBase = r._asset_base || '';
  const heroImg = r.hero ? `${assetBase}${r._hero_web || toWebFilename(r.hero)}` : null;

  // Find previous record in same category and next record (if any)
  const catRecords = allRecords
    .filter(rec => rec.category === r.category)
    .sort((a, b) => new Date(a.achieved_at) - new Date(b.achieved_at));
  
  const currentIndex = catRecords.findIndex(rec => rec.uid === r.uid);
  const prevRecord = currentIndex > 0 ? catRecords[currentIndex - 1] : null;
  const nextRecord = currentIndex < catRecords.length - 1 ? catRecords[currentIndex + 1] : null;

  // Calculate how long this record stood
  const recordDate = new Date(r.achieved_at + 'T12:00:00Z');
  const endDate = nextRecord 
    ? new Date(nextRecord.achieved_at + 'T12:00:00Z')
    : now;
  const daysStanding = Math.floor((endDate - recordDate) / (1000 * 60 * 60 * 24));

  // Format standing duration
  let standingText = '';
  if (nextRecord) {
    if (daysStanding < 7) {
      standingText = `The record stood for ${daysStanding} day${daysStanding !== 1 ? 's' : ''}`;
    } else if (daysStanding < 30) {
      const weeks = Math.round(daysStanding / 7);
      standingText = `The record stood for ${weeks} week${weeks !== 1 ? 's' : ''}`;
    } else if (daysStanding < 365) {
      const months = Math.round(daysStanding / 30);
      standingText = `The record stood for ${months} month${months !== 1 ? 's' : ''}`;
    } else {
      const years = (daysStanding / 365).toFixed(1);
      standingText = `The record stood for ${years} year${parseFloat(years) !== 1 ? 's' : ''}`;
    }
  } else {
    standingText = 'This is the current record';
  }

  // Build extended description
  const parts = [];
  if (r.hardware?.primary) parts.push(`on a ${escapeHtml(r.hardware.primary)}`);
  if (r.hardware?.cooling)  parts.push(`cooled with ${escapeHtml(r.hardware.cooling)}`);
  const ocNames = (r.overclockers || []).map(o => escapeHtml(o.handle)).join(' and ');
  const country = oc.country ? ` from ${escapeHtml(oc.country)}` : '';
  
  let desc = `${ocNames}${country} set this ${escapeHtml(cat.label)} world record of ${r.value_mhz.toFixed(2)} MHz ${parts.join(', ')} on ${formatDateLong(r.achieved_at, r.achieved_at_approximate)}`;
  
  // Add previous record info
  if (prevRecord) {
    const prevOc = prevRecord.overclockers?.[0] || {};
    const prevOcName = prevOc.handle || 'Unknown';
    const diff = (r.value_mhz - prevRecord.value_mhz).toFixed(2);
    desc += `, beating the previous record of ${prevRecord.value_mhz.toFixed(2)} MHz held by ${escapeHtml(prevOcName)}`;
    if (diff > 0) {
      desc += ` by ${diff} MHz`;
    }
    desc += '. ' + standingText;
  } else {
    desc += '. ' + standingText;
  }
  
  if (r.notes) desc += '. ' + escapeHtml(r.notes);
  desc += '.';

  el.innerHTML = `
    <div class="rotd-inner">
      ${heroImg ? `
        <a href="#${r.category}/${escapeHtml(r.uid)}" class="rotd-img-wrap">
          <img src="${escapeHtml(heroImg)}" alt="Record screenshot" loading="lazy">
        </a>
      ` : ''}
      <div class="rotd-body">
        <div class="rotd-kicker">${escapeHtml(cat.label)} · ${formatDateLong(r.achieved_at, r.achieved_at_approximate)}</div>
        <div class="rotd-freq">${r.value_mhz.toFixed(2)}<span class="rotd-unit">MHz</span></div>
        <div class="rotd-hardware">${escapeHtml(r.hardware?.primary || '')}</div>
        <div class="rotd-oc">
          ${flag ? `<span>${flag}</span>` : ''}
          <span>${ocNames}</span>
        </div>
        <p class="rotd-desc">${desc}</p>
        <a href="#${r.category}/${escapeHtml(r.uid)}" class="rotd-link">View full record →</a>
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
         href="#${currentCategory}/${encodeURIComponent(s)}">${escapeHtml(subcatLabel(s))}</a>
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
    `<span class="cat-label">${escapeHtml(cat.label)}</span> Overclocking World Record History${escapeHtml(subcatSuffix)}`;
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

          // Use textContent for user-data fields to avoid XSS
          const dateDiv = document.createElement('div');
          dateDiv.className = 'rec-date';
          dateDiv.textContent = dateStr;

          const freqDiv = document.createElement('div');
          freqDiv.className = 'rec-freq';
          freqDiv.textContent = r.value_mhz.toFixed(2);
          const unitSpan = document.createElement('span');
          unitSpan.className = 'unit';
          unitSpan.textContent = 'MHz';
          freqDiv.appendChild(unitSpan);

          const cpuDiv = document.createElement('div');
          cpuDiv.className = 'rec-cpu';
          cpuDiv.textContent = primary;

          const ocDiv = document.createElement('div');
          ocDiv.className = 'rec-oc';
          ocDiv.textContent = ocs;

          const flagDiv = document.createElement('div');
          flagDiv.className = 'rec-flag';
          flagDiv.textContent = flags;

          row.appendChild(dateDiv);
          row.appendChild(freqDiv);
          row.appendChild(cpuDiv);
          row.appendChild(ocDiv);
          row.appendChild(flagDiv);

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

// ── CHART EVENTS ──────────────────────────────────────
// FIX #5: moved out of polling IIFE; called once from init() after data loads.
// FIX #5: chart is only redrawn when the hovered point actually changes.
function setupChartEvents() {
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

  // The canvas element is always present in the DOM (never removed/re-added),
  // so we can attach events directly once init() has run.
  const canvas = document.getElementById('record-chart');
  if (!canvas) return;

  canvas.addEventListener('mousemove', function(e) {
    const p = findNearest(this, e);
    if (p) {
      this.style.cursor = 'pointer';
      // FIX #5: only redraw when the hovered record actually changes
      if (this._hovered !== p.uid) {
        this._hovered = p.uid;
        try { renderChart(getFilteredRecords()); } catch(_) {}
      }
      const r = p.record;
      const ocs = (r.overclockers || []).map(o => o.handle).join(' & ');
      tip.textContent = '';
      // Build tooltip safely without innerHTML
      const strong = document.createElement('strong');
      strong.textContent = `${r.value_mhz.toFixed(2)} MHz`;
      tip.appendChild(strong);
      tip.appendChild(document.createTextNode(`\n${r.hardware?.primary || ''}\n${ocs} · ${r.achieved_at}`));
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top  = (e.clientY - 10) + 'px';
    } else {
      this.style.cursor = 'default';
      if (this._hovered) {
        this._hovered = null;
        try { renderChart(getFilteredRecords()); } catch(_) {}
      }
      tip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', function() {
    tip.style.display = 'none';
    if (this._hovered) {
      this._hovered = null;
      try { renderChart(getFilteredRecords()); } catch(_) {}
    }
    this.style.cursor = 'default';
  });

  canvas.addEventListener('click', function(e) {
    const p = findNearest(this, e);
    if (p) {
      const base = currentSubcat ? `${currentCategory}/${encodeURIComponent(currentSubcat)}` : currentCategory;
      location.hash = `${base}/${p.uid}`;
    }
  });
}

// Redraw chart on resize
window.addEventListener('resize', () => {
  try { renderChart(getFilteredRecords()); } catch(_) {}
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

  // Update URL hash for direct linking (before rendering for proper shareability)
  const base = currentSubcat ? `${currentCategory}/${encodeURIComponent(currentSubcat)}` : currentCategory;
  history.pushState(null, '', `#${base}/${record.uid}`);

  // Update page title and meta description for SEO
  updateRecordMeta(record);

  // Send GA4 event for record view
  trackRecordView(record);

  // Render panel content BEFORE making it visible to avoid layout flash
  renderPanel(record);

  document.getElementById('timeline-main').classList.add('panel-open');
  document.getElementById('detail-panel').classList.add('open');
  // Redraw immediately for selected dot, then again after CSS transition (0.3s) for correct width
  try { renderChart(getFilteredRecords()); } catch(_) {}
  setTimeout(() => { try { renderChart(getFilteredRecords()); } catch(_) {} }, 320);

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
  document.getElementById('timeline-main')?.classList.remove('panel-open');
  document.querySelectorAll('.record-row').forEach(r => r.classList.remove('selected'));
  setTimeout(() => { try { renderChart(getFilteredRecords()); } catch(_) {} }, 320);
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
  // Gallery = all assets except the hero
  const galleryAssets = assets.filter(a => a.file !== record.hero);

  // FIX #7: all record data injected via escapeHtml; image URLs via escapeHtml too.
  // openLightbox calls use data attributes rather than inline JS with raw URLs.
  document.getElementById('panel-content').innerHTML = `
    <div class="panel-rank">${escapeHtml(recordContext)}</div>

    <div class="panel-freq">
      ${record.value_mhz.toFixed(2)}<span class="unit">MHz</span>
    </div>
    <div class="panel-date">
      ${formatDateLong(record.achieved_at, record.achieved_at_approximate)}
    </div>

    ${heroFile ? `
      <div class="panel-hero">
        <img src="${escapeHtml(assetBase + heroFile)}" alt="Hero image" loading="lazy"
          class="js-lightbox" data-src="${escapeHtml(assetBase + heroFile)}" style="cursor:zoom-in">
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
                <span class="oc-country-code">${escapeHtml(oc.country)}</span>
              </div>
            ` : ''}
            <div class="oc-handle">${escapeHtml(oc.handle)}</div>
            ${oc.real_name ? `<div class="oc-real-name">${escapeHtml(oc.real_name)}</div>` : ''}
            ${oc.aliases?.length ? `<div class="oc-aliases">aka ${oc.aliases.map(escapeHtml).join(', ')}</div>` : ''}
            ${oc.profile_url ? `
              <a href="${escapeHtml(oc.profile_url)}" target="_blank" rel="noopener" class="oc-profile-link">
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
          <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="source-link">
            <span class="source-icon">↗</span>${escapeHtml(s.label)}
          </a>
          ${s.archived_url ? `
            <a href="${escapeHtml(s.archived_url)}" target="_blank" rel="noopener" class="source-link source-archived">
              <span class="source-icon">◉</span>${escapeHtml(s.label)} (archived)
            </a>
          ` : ''}
        `).join('')}
      </div>
    ` : ''}

    ${tags.length ? `
      <div class="panel-divider"></div>
      <div class="panel-section-label">Tags</div>
      <div class="panel-tags-list">
        ${tags.map(t => `<span class="panel-tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    ` : ''}

    ${record.notes ? `
      <div class="panel-divider"></div>
      <div class="panel-section-label">Notes</div>
      <div class="panel-notes">${escapeHtml(record.notes)}</div>
    ` : ''}

    ${galleryAssets.length ? `
      <div class="panel-divider"></div>
      <div class="panel-section-label">Images</div>
      <div class="panel-gallery">
        ${galleryAssets.map(a => {
          const webFile = a._web_file || toWebFilename(a.file);
          const fullSrc = escapeHtml(assetBase + webFile);
          return `
            <div class="gallery-thumb js-lightbox" title="${escapeHtml(a.caption || a.type)}"
                 data-src="${fullSrc}" style="cursor:zoom-in">
              <img src="${fullSrc}" alt="${escapeHtml(a.caption || a.type)}" loading="lazy">
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    <div class="panel-divider"></div>
    <div class="panel-nav">
      <button class="panel-nav-btn" id="btn-prev" ${idx <= 0 ? 'disabled' : ''}>← Older</button>
      <button class="panel-nav-btn" id="btn-copy-link" title="Copy link to this record">⊕ Copy</button>
      <button class="panel-nav-btn" id="btn-next" ${idx >= records.length - 1 ? 'disabled' : ''}>Newer →</button>
    </div>
    <span class="panel-share-copy-status" id="copy-status" style="display:none">Copied!</span>

    <div class="panel-discuss">
      <a href="https://github.com/SkatterBencher/oc-world-record-history/issues/new?title=Record+${encodeURIComponent(record.uid)}&body=Record+UID:+${encodeURIComponent(record.uid)}%0A%0AYour+comment:"
         target="_blank" rel="noopener">
        💬 Discuss this record on GitHub
      </a>
    </div>
  `;

  // FIX #7: wire lightbox via delegated data-src click, not inline onclick with raw URLs
  document.getElementById('panel-content').querySelectorAll('.js-lightbox').forEach(el => {
    el.addEventListener('click', () => openLightbox(el.dataset.src));
  });

  // FIX #6: guard against idx === -1 (record not in current filtered set)
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  prevBtn?.addEventListener('click', () => {
    if (idx > 0) {
      const basePrev = currentSubcat ? `${currentCategory}/${encodeURIComponent(currentSubcat)}` : currentCategory;
      location.hash = `${basePrev}/${records[idx - 1].uid}`;
    }
  });
  nextBtn?.addEventListener('click', () => {
    if (idx >= 0 && idx < records.length - 1) {
      const baseNext = currentSubcat ? `${currentCategory}/${encodeURIComponent(currentSubcat)}` : currentCategory;
      location.hash = `${baseNext}/${records[idx + 1].uid}`;
    }
  });

  // Copy link button
  const copyBtn = document.getElementById('btn-copy-link');
  const copyStatus = document.getElementById('copy-status');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        copyStatus.style.display = 'inline';
        setTimeout(() => { copyStatus.style.display = 'none'; }, 2000);
      }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        copyStatus.style.display = 'inline';
        setTimeout(() => { copyStatus.style.display = 'none'; }, 2000);
      });
    });
  }
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

  // ── Compute: Record Longevity (use pre-computed stats if available) ──
  let longestCurrentRecord = { days: 0 };
  let allTimeLongest = [];
  let allTimeShortest = [];

  if (allStats?.longevity?.current_longest) {
    const currentLongest = allStats.longevity.current_longest;
    const record = allRecords.find(r => r.uid === currentLongest.uid);
    if (record) {
      longestCurrentRecord = { ...currentLongest, ...record };
    }
    if (allStats.longevity.all_time_longest) {
      allTimeLongest = allStats.longevity.all_time_longest.slice(0, 5).map(entry => {
        const rec = allRecords.find(r => r.uid === entry.uid);
        return rec ? { ...entry, ...rec } : entry;
      });
    }
    if (allStats.longevity.all_time_shortest) {
      allTimeShortest = allStats.longevity.all_time_shortest.slice(0, 5).map(entry => {
        const rec = allRecords.find(r => r.uid === entry.uid);
        return rec ? { ...entry, ...rec } : entry;
      });
    }
  } else {
    // Fallback: compute on the fly (category only, no subcategory)
    const sortedByCatAndDate = {};
    allRecords.forEach(r => {
      if (!sortedByCatAndDate[r.category]) sortedByCatAndDate[r.category] = [];
      sortedByCatAndDate[r.category].push(r);
    });
    Object.keys(sortedByCatAndDate).forEach(cat => {
      sortedByCatAndDate[cat].sort((a, b) => new Date(a.achieved_at) - new Date(b.achieved_at));
    });

    const recordLongevity = [];
    Object.keys(sortedByCatAndDate).forEach(cat => {
      const catRecords = sortedByCatAndDate[cat];
      catRecords.forEach((r, i) => {
        let endDate;
        if (i < catRecords.length - 1) {
          endDate = new Date(catRecords[i + 1].achieved_at);
        } else {
          endDate = new Date();
        }
        const startDate = new Date(r.achieved_at + 'T12:00:00Z');
        const days = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
        recordLongevity.push({ ...r, days, isCurrent: i === catRecords.length - 1 });
      });
    });

    const currentRecords = recordLongevity.filter(r => r.isCurrent);
    longestCurrentRecord = currentRecords.reduce((a, b) => a.days > b.days ? a : b, { days: 0 });
    allTimeLongest = [...recordLongevity].sort((a, b) => b.days - a.days).slice(0, 5);
    allTimeShortest = [...recordLongevity].filter(r => r.days >= 1 && !r.isCurrent).sort((a, b) => a.days - b.days).slice(0, 5);
  }

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
              <span class="stat-list-name">${escapeHtml(country)}</span>
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
            let topCountry = '';
            if (ocCountries[handle]) {
              topCountry = Object.entries(ocCountries[handle])
                .sort((a, b) => b[1] - a[1])[0]?.[0] || '';
            }
            return `
              <div class="stat-list-item">
                <span class="stat-list-rank">${i + 1}</span>
                ${topCountry ? `<span class="stat-list-flag">${getFlagEmoji(topCountry)}</span>` : ''}
                <span class="stat-list-name">${escapeHtml(handle)}</span>
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
              <span class="decade-label">${escapeHtml(decade)}s</span>
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
          <div class="highlight-value">${topYear ? escapeHtml(topYear[0]) : '—'}</div>
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
                <span class="decade-label" style="width: 52px;">${escapeHtml(label)}</span>
                <div class="decade-bar-wrap">
                  <div class="decade-bar" style="width:${(count / maxCat * 100).toFixed(1)}%"></div>
                </div>
                <span class="decade-count">${count}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Current Longest-Standing Record -->
      <a class="current-record-card" href="#${escapeHtml(longestCurrentRecord.category || '')}/${escapeHtml(longestCurrentRecord.uid || '')}">
        <div class="cr-category">Current Longest-Standing</div>
        <div class="cr-freq">${longestCurrentRecord.value_mhz?.toFixed(2) ?? '—'}<span class="cr-unit">MHz</span></div>
        <div class="cr-hardware">${escapeHtml(longestCurrentRecord.hardware?.primary || 'Unknown')}</div>
        <div class="cr-overclocker">
          ${(longestCurrentRecord.overclockers?.[0]?.country) ? `<span class="cr-flag">${getFlagEmoji(longestCurrentRecord.overclockers[0].country)}</span>` : ''}
          <span>${escapeHtml(longestCurrentRecord.overclockers?.[0]?.handle || 'Unknown')}</span>
        </div>
        <div class="cr-date">
          Set ${formatDateLong(longestCurrentRecord.achieved_at, longestCurrentRecord.achieved_at_approximate)} · Standing for ${formatDays(longestCurrentRecord.days)}
        </div>
      </a>

      <!-- All-Time Longest-Standing Record -->
      <a class="current-record-card" href="#${escapeHtml(allTimeLongest[0]?.category || '')}/${escapeHtml(allTimeLongest[0]?.uid || '')}">
        <div class="cr-category">All-Time Longest-Standing</div>
        <div class="cr-freq">${allTimeLongest[0]?.value_mhz?.toFixed(2) ?? '—'}<span class="cr-unit">MHz</span></div>
        <div class="cr-hardware">${escapeHtml(allTimeLongest[0]?.hardware?.primary || 'Unknown')}</div>
        <div class="cr-overclocker">
          ${(allTimeLongest[0]?.overclockers?.[0]?.country) ? `<span class="cr-flag">${getFlagEmoji(allTimeLongest[0].overclockers[0].country)}</span>` : ''}
          <span>${escapeHtml(allTimeLongest[0]?.overclockers?.[0]?.handle || 'Unknown')}</span>
        </div>
        <div class="cr-date">
          Set ${formatDateLong(allTimeLongest[0]?.achieved_at, allTimeLongest[0]?.achieved_at_approximate)} · Stood for ${formatDays(allTimeLongest[0]?.days)}
        </div>
      </a>

    </div>
    ${limitTo ? `
      <div style="text-align: center; margin-top: 24px;">
        <a href="#statistics" class="cta-btn">View Full Statistics →</a>
      </div>
    ` : ''}
  `;
}

// ── STATISTICS PAGE ───────────────────────────────────
const STATS_PAGE_SIZE = 10;

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
    <div class="stat-nav-item active" data-target="stat-longevity">Longevity</div>
    <div class="stat-nav-item" data-target="stat-countries">Countries</div>
    <div class="stat-nav-item" data-target="stat-overclockers">Overclockers</div>
    <div class="stat-nav-item" data-target="stat-years">Years</div>
    <div class="stat-nav-item" data-target="stat-decades">Decades</div>
    <div class="stat-nav-item" data-target="stat-categories">Categories</div>
  `;

  sidebar.querySelectorAll('.stat-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      sidebar.querySelectorAll('.stat-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const target = document.getElementById(item.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const statSections = ['stat-longevity', 'stat-countries', 'stat-overclockers', 'stat-years', 'stat-decades', 'stat-categories'];
  const mainEl = document.getElementById('statistics-main');
  if (mainEl) {
    // Use requestAnimationFrame for better performance
    let ticking = false;
    mainEl.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollTop = mainEl.scrollTop;
          let currentSection = 'stat-longevity';
          for (const sectionId of statSections) {
            const section = document.getElementById(sectionId);
            if (section) {
              const sectionTop = section.offsetTop - 80;
              if (scrollTop >= sectionTop) currentSection = sectionId;
            }
          }
          sidebar.querySelectorAll('.stat-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.target === currentSection);
          });
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  function renderPaginatedSection(data, pageSize, renderFn, sectionId) {
    const total = Math.ceil(data.length / pageSize);
    if (total <= 1) return data.map(renderFn).join('');
    let html = '';
    for (let page = 0; page < total; page++) {
      const pageData = data.slice(page * pageSize, (page + 1) * pageSize);
      const pageId = `${sectionId}-page-${page + 1}`;
      html += `<div class="stat-page" id="${pageId}" style="display:${page === 0 ? 'block' : 'none'}">`;
      html += pageData.map((item, localIndex) => {
        const globalIndex = page * pageSize + localIndex;
        return renderFn(item, globalIndex);
      }).join('');
      html += '</div>';
    }
    html += `<div class="stat-pagination" data-section="${sectionId}">`;
    for (let p = 0; p < total; p++) {
      html += `<button class="stat-page-btn ${p === 0 ? 'active' : ''}" data-page="${p}" data-section="${sectionId}">${p + 1}</button>`;
    }
    html += '</div>';
    return html;
  }

  container.innerHTML = `
    <div class="stat-section" id="stat-longevity">
      <div class="stat-section-title" style="color:var(--accent);">All-Time Longest-Standing Records</div>
      <div class="stat-list" style="max-height:none;overflow-y:visible;">
        ${computeAllTimeLongest().map((r, i) => {
          const oc = r.overclockers?.[0] || {};
          const flag = getFlagEmoji(oc.country);
          return `
            <div class="stat-list-item" style="cursor:pointer;" data-uid="${escapeHtml(r.uid)}">
              <span class="stat-list-rank">${i + 1}</span>
              ${flag ? `<span class="stat-list-flag">${flag}</span>` : ''}
              <span class="stat-list-name" style="font-size:12px;">
                ${r.value_mhz.toFixed(2)} MHz · ${escapeHtml(r.hardware?.primary || 'Unknown')} · ${escapeHtml(oc.handle || 'Unknown')}
              </span>
              <span class="stat-list-count" style="color:var(--accent);font-size:11px;">
                ${formatDays(r.days)}
              </span>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="stat-section" id="stat-countries">
      <div class="stat-section-title" style="color:var(--accent);">Records per Country (${sortedCountries.length})</div>
      ${renderPaginatedSection(sortedCountries, STATS_PAGE_SIZE, ([country, count], i) => {
        const uids = countryRecords[country] || [];
        const links = uids.slice(0, 5).map(uid => {
          const rec = allRecords.find(r => r.uid === uid);
          return rec ? `<a href="#${rec.category}/${escapeHtml(uid)}" class="stat-record-link" data-stat-page="true">${rec.value_mhz.toFixed(0)} MHz</a>` : '';
        }).join('');
        const extra = uids.length - 5;
        return `
          <div class="stat-list-item">
            <span class="stat-list-rank">${i + 1}</span>
            <span class="stat-list-flag">${getFlagEmoji(country)}</span>
            <span class="stat-list-name">${escapeHtml(country)}</span>
            <div class="stat-list-bar"><div class="stat-list-bar-fill" style="width:${(count/maxCountryCount*100).toFixed(1)}%"></div></div>
            <span class="stat-list-count">${count}</span>
          </div>
          <div class="stat-record-links">${links}${extra > 0 ? `<span class="stat-record-more" data-uids="${uids.slice(5).map(escapeHtml).join(',')}">+${extra} more</span>` : ''}</div>
        `;
      }, 'countries')}
    </div>

    <div class="stat-section" id="stat-overclockers">
      <div class="stat-section-title" style="color:var(--accent);">Records per Overclocker (${sortedOCs.length})</div>
      ${renderPaginatedSection(sortedOCs, STATS_PAGE_SIZE, ([handle, count], i) => {
        const uids = ocRecords[handle] || [];
        let topCountry = '';
        const countryMap = {};
        uids.forEach(uid => {
          const rec = allRecords.find(r => r.uid === uid);
          if (rec?.overclockers) {
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
          return rec ? `<a href="#${rec.category}/${escapeHtml(uid)}" class="stat-record-link" data-stat-page="true">${rec.value_mhz.toFixed(0)} MHz</a>` : '';
        }).join('');
        const extra = uids.length - 5;
        return `
          <div class="stat-list-item">
            <span class="stat-list-rank">${i + 1}</span>
            ${topCountry ? `<span class="stat-list-flag">${getFlagEmoji(topCountry)}</span>` : ''}
            <span class="stat-list-name">${escapeHtml(handle)}</span>
            <div class="stat-list-bar"><div class="stat-list-bar-fill" style="width:${(count/maxOCCount*100).toFixed(1)}%"></div></div>
            <span class="stat-list-count">${count}</span>
          </div>
          <div class="stat-record-links">${links}${extra > 0 ? `<span class="stat-record-more" data-uids="${uids.slice(5).map(escapeHtml).join(',')}">+${extra} more</span>` : ''}</div>
        `;
      }, 'overclockers')}
    </div>

    <div class="stat-section" id="stat-years">
      <div class="stat-section-title" style="color:var(--accent);">Records per Year</div>
      <div class="decade-breakdown">
        ${sortedYears.map(([year, count]) => {
          const uids = yearRecords[year] || [];
          const links = uids.slice(0, 3).map(uid => {
            const rec = allRecords.find(r => r.uid === uid);
            return rec ? `<a href="#${rec.category}/${escapeHtml(uid)}" class="stat-record-link" data-stat-page="true">${rec.value_mhz.toFixed(0)} MHz</a>` : '';
          }).join('');
          const extra = uids.length - 3;
          return `
            <div class="decade-item">
              <span class="decade-label" style="width:52px;">${escapeHtml(year)}</span>
              <div class="decade-bar-wrap"><div class="decade-bar" style="width:${(count/maxYearCount*100).toFixed(1)}%"></div></div>
              <span class="decade-count">${count}</span>
            </div>
            <div class="stat-record-links">${links}${extra > 0 ? `<span class="stat-record-more" data-uids="${uids.slice(3).map(escapeHtml).join(',')}">+${extra} more</span>` : ''}</div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="stat-section" id="stat-decades">
      <div class="stat-section-title" style="color:var(--accent);">Records per Decade</div>
      <div class="decade-breakdown">
        ${decades.map(([decade, count]) => `
          <div class="decade-item">
            <span class="decade-label">${escapeHtml(decade)}s</span>
            <div class="decade-bar-wrap"><div class="decade-bar" style="width:${(count/maxDecadeCount*100).toFixed(1)}%"></div></div>
            <span class="decade-count">${count}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="stat-section" id="stat-categories">
      <div class="stat-section-title" style="color:var(--accent);">Records by Category</div>
      <div class="decade-breakdown">
        ${['cpu','gpu','memory'].map(cat => {
          const count = catCounts[cat] || 0;
          const maxCat = Math.max(...Object.values(catCounts), 1);
          return `
            <div class="decade-item">
              <span class="decade-label" style="width:52px;">${escapeHtml(CATEGORIES[cat].label)}</span>
              <div class="decade-bar-wrap"><div class="decade-bar" style="width:${(count/maxCat*100).toFixed(1)}%"></div></div>
              <span class="decade-count">${count}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Pagination click handlers
  container.querySelectorAll('.stat-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      const page = parseInt(btn.dataset.page);
      container.querySelectorAll(`[id^="${section}-page-"]`).forEach(p => p.style.display = 'none');
      const targetPage = document.getElementById(`${section}-page-${page + 1}`);
      if (targetPage) targetPage.style.display = 'block';
      container.querySelectorAll(`.stat-pagination[data-section="${section}"] .stat-page-btn`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Longevity row click handlers (using data-uid instead of inline onclick)
  container.querySelectorAll('.stat-list-item[data-uid]').forEach(row => {
    row.addEventListener('click', () => openRecordFromStats(row.dataset.uid));
  });

  // Record link click handlers
  container.querySelectorAll('.stat-record-link[data-stat-page="true"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const uid = link.getAttribute('href').replace('#', '').split('/').pop();
      openRecordFromStats(uid);
    });
  });

  // "+more" expand handlers
  container.querySelectorAll('.stat-record-more').forEach(more => {
    more.addEventListener('click', () => {
      const uids = more.dataset.uids.split(',');
      const parent = more.closest('.stat-record-links');
      uids.forEach(uid => {
        const rec = allRecords.find(r => r.uid === uid);
        if (!rec) return;
        const a = document.createElement('a');
        a.href = `#${rec.category}/${uid}`;
        a.className = 'stat-record-link';
        a.dataset.statPage = 'true';
        a.textContent = `${rec.value_mhz.toFixed(0)} MHz`;
        a.addEventListener('click', e => {
          e.preventDefault();
          openRecordFromStats(uid);
        });
        parent.insertBefore(a, more);
      });
      more.remove();
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

// Get all-time longest-standing records from pre-computed stats
function computeAllTimeLongest() {
  if (allStats?.longevity?.all_time_longest) {
    return allStats.longevity.all_time_longest.map(entry => {
      const record = allRecords.find(r => r.uid === entry.uid);
      if (record) {
        return {
          ...entry,
          overclockers: record.overclockers || [],
          hardware: record.hardware || entry.hardware,
          achieved_at: record.achieved_at || entry.achieved_at
        };
      }
      return entry;
    });
  }
  return [];
}

// Format days into human-readable string
function formatDays(days) {
  if (!days && days !== 0) return '—';
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

// ── SEO & ANALYTICS ───────────────────────────────────

/**
 * Update page title and meta description when viewing a specific record.
 * This helps with SEO when Google crawls the page with a record hash.
 */
function updateRecordMeta(record) {
  const cat = CATEGORIES[record.category] || { label: record.category };
  const oc = record.overclockers?.[0] || {};
  const dateStr = formatDateLong(record.achieved_at, record.achieved_at_approximate);

  // Update page title
  const title = `${record.value_mhz.toFixed(2)} MHz — ${cat.label} World Record by ${escapeHtml(oc.handle || 'Unknown')} (${dateStr}) — OC Museum`;
  document.title = title;

  // Update meta description
  let desc = `${cat.label} world record of ${record.value_mhz.toFixed(2)} MHz set by ${oc.handle || 'Unknown'}`;
  if (record.hardware?.primary) desc += ` with a ${record.hardware.primary}`;
  if (oc.country) desc += ` from ${oc.country}`;
  desc += ` on ${dateStr}.`;
  if (record.notes) desc += ` ${record.notes}`;

  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.name = 'description';
    document.head.appendChild(metaDesc);
  }
  metaDesc.content = desc;

  // Update canonical URL to include the record hash
  let canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    const baseUrl = canonical.href.replace(/#.*$/, '');
    canonical.href = baseUrl + location.hash;
  }

  // Add structured data for the record
  updateRecordStructuredData(record);
}

/**
 * Add/update structured data (schema.org) for the current record.
 * This helps Google understand the record content for better indexing.
 */
function updateRecordStructuredData(record) {
  const cat = CATEGORIES[record.category] || { label: record.category };
  const oc = record.overclockers?.[0] || {};
  const dateStr = record.achieved_at_approximate ? record.achieved_at.slice(0, 4) : record.achieved_at;

  // Remove existing record structured data
  const existing = document.getElementById('record-structured-data');
  if (existing) existing.remove();

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'record-structured-data';

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Achievement",
    "name": `${cat.label} Frequency World Record — ${record.value_mhz.toFixed(2)} MHz`,
    "description": `${cat.label} world record of ${record.value_mhz.toFixed(2)} MHz achieved on ${dateStr}`,
    "achievementCategory": {
      "@type": "Thing",
      "name": `${cat.label} Overclocking`,
      "description": `World record for ${cat.label} frequency`
    },
    "result": {
      "@type": "PropertyValue",
      "name": "Frequency",
      "value": record.value_mhz.toFixed(2),
      "unitCode": "MHZ"
    },
    "instrument": record.hardware?.primary ? {
      "@type": "Computer",
      "name": record.hardware.primary,
      "additionalProperty": record.hardware.cooling ? {
        "@type": "PropertyValue",
        "name": "Cooling",
        "value": record.hardware.cooling
      } : undefined
    } : undefined,
    "performer": oc.handle ? {
      "@type": "Person",
      "name": oc.handle,
      "nationality": oc.country || undefined,
      "url": oc.profile_url || undefined
    } : undefined,
    "dateAchieved": dateStr,
    "url": `https://museum.skatterbencher.com/${location.hash}`,
    "subjectOf": {
      "@type": "WebPage",
      "name": "OC World Record Museum",
      "url": "https://museum.skatterbencher.com"
    }
  };

  script.textContent = JSON.stringify(structuredData);
  document.head.appendChild(script);
}

/**
 * Send GA4 event when a record is viewed in the detail panel.
 * This allows tracking which records users are interested in.
 */
function trackRecordView(record) {
  if (typeof gtag !== 'function') return;

  const cat = CATEGORIES[record.category] || { label: record.category };
  const oc = record.overclockers?.[0] || {};

  gtag('event', 'view_record', {
    'event_category': 'Records',
    'event_label': record.uid,
    'record_uid': record.uid,
    'record_category': record.category,
    'record_category_label': cat.label,
    'record_frequency_mhz': record.value_mhz,
    'record_hardware': record.hardware?.primary || 'Unknown',
    'record_overclocker': oc.handle || 'Unknown',
    'record_country': oc.country || 'Unknown',
    'record_date': record.achieved_at,
    'record_subcategory': (record.subcategory || []).join(', ')
  });
}

// ── HELPERS ───────────────────────────────────────────
function hwRow(label, value) {
  const missing = !value || value === 'Unknown';
  return `
    <div class="hw-row">
      <span class="hw-label">${escapeHtml(label)}</span>
      <span class="hw-value ${missing ? 'unknown' : ''}">${missing ? 'Unknown' : escapeHtml(value)}</span>
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
  if (!iso) return '—';
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