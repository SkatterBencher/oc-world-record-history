// OC World Record Museum — main.js

const CATEGORIES = {
  cpu:    { label: 'CPU',    unit: 'MHz' },
  gpu:    { label: 'GPU',    unit: 'MHz' },
  memory: { label: 'Memory', unit: 'MHz' },
};

let allRecords   = [];
let currentCategory = 'cpu';
let activeTags   = new Set();
let selectedUid  = null;
let panelOpen    = false;

// ── INIT ──────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('data/index.json');
    allRecords = await res.json();
  } catch (e) {
    console.error('Failed to load index.json', e);
    allRecords = [];
  }
  setupNav();
  routeFromHash();
  window.addEventListener('hashchange', routeFromHash);
}

// ── ROUTING ───────────────────────────────────────────
function routeFromHash() {
  const hash  = location.hash.replace('#', '') || 'cpu';
  const parts = hash.split('/');
  const page  = parts[0];

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page)
  );

  if (CATEGORIES[page]) {
    currentCategory = page;
    activeTags.clear();
    closePanel();
    document.getElementById('page-timeline').classList.add('active');
    renderTimeline();
    if (parts[1]) openRecord(parts[1]);
  } else if (page === 'about') {
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
    if (activeTags.size === 0) return true;
    return [...activeTags].every(t => (r.tags || []).includes(t));
  });
}

function getYearRange(records) {
  if (!records.length) return '';
  const years = records.map(r => parseInt(r.achieved_at.slice(0, 4)));
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `${min}` : `${min}–${max}`;
}

// ── TIMELINE RENDER ───────────────────────────────────
function renderTimeline() {
  const cat     = CATEGORIES[currentCategory];
  const records = getFilteredRecords();

  document.getElementById('timeline-title').innerHTML =
    `<span class="cat-label">${cat.label}</span> Overclocking World Record History`;
  document.getElementById('timeline-subtitle').textContent =
    `${records.length} records · ${getYearRange(records)}`;
  document.getElementById('header-record-count').textContent =
    `${records.length} records`;

  renderTagSidebar(records);
  renderChart(records);

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

          row.innerHTML = `
            <div class="rec-date">${dateStr}</div>
            <div class="rec-freq">${r.value_mhz.toFixed(2)}<span class="unit">MHz</span></div>
            <div class="rec-cpu">${primary}</div>
            <div class="rec-oc">${ocs}</div>
          `;
          row.addEventListener('click', () => {
            location.hash = `${currentCategory}/${r.uid}`;
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

  // Sort chronologically
  const sorted = [...records].sort(
    (a, b) => new Date(a.achieved_at) - new Date(b.achieved_at)
  );

  if (sorted.length < 2) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = 'block';

  // DPI-aware sizing
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const PAD = { top: 16, right: 24, bottom: 36, left: 64 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top  - PAD.bottom;

  // Scales
  const dates   = sorted.map(r => new Date(r.achieved_at).getTime());
  const freqs   = sorted.map(r => r.value_mhz);
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const minFreq = 0;
  const maxFreq = Math.max(...freqs) * 1.08;

  const xScale = d => PAD.left + ((d - minDate) / (maxDate - minDate)) * plotW;
  const yScale = v => PAD.top  + plotH - ((v - minFreq) / (maxFreq - minFreq)) * plotH;

  // Styles from CSS vars (read from body)
  const cs      = getComputedStyle(document.documentElement);
  const accent  = cs.getPropertyValue('--accent').trim()        || '#e8490f';
  const border  = cs.getPropertyValue('--border').trim()        || '#e5e5df';
  const textDim = cs.getPropertyValue('--text-dim').trim()      || '#b0b0a0';
  const textMuted = cs.getPropertyValue('--text-muted').trim()  || '#6b6b5e';
  const accentGlow = cs.getPropertyValue('--accent-glow').trim() || 'rgba(232,73,15,0.08)';

  ctx.clearRect(0, 0, W, H);

  // Grid lines (y-axis)
  const yTicks = 5;
  ctx.strokeStyle = border;
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 4]);
  ctx.fillStyle   = textDim;
  ctx.font        = '10px IBM Plex Mono, monospace';
  ctx.textAlign   = 'right';
  for (let i = 0; i <= yTicks; i++) {
    const v = minFreq + (maxFreq - minFreq) * (i / yTicks);
    const y = yScale(v);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();
    ctx.fillText(
      v >= 1000 ? (v / 1000).toFixed(1) + ' GHz' : Math.round(v) + ' MHz',
      PAD.left - 8, y + 3
    );
  }
  ctx.setLineDash([]);

  // x-axis decade ticks
  ctx.fillStyle  = textDim;
  ctx.textAlign  = 'center';
  ctx.font       = '10px IBM Plex Mono, monospace';
  const minYear  = new Date(minDate).getFullYear();
  const maxYear  = new Date(maxDate).getFullYear();
  for (let yr = Math.ceil(minYear / 5) * 5; yr <= maxYear; yr += 5) {
    const x = xScale(new Date(`${yr}-01-01`).getTime());
    if (x < PAD.left || x > PAD.left + plotW) continue;
    ctx.fillStyle = textDim;
    ctx.fillText(yr, x, H - PAD.bottom + 16);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, PAD.top);
    ctx.lineTo(x, PAD.top + plotH);
    ctx.setLineDash([2, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Area fill under the line
  ctx.beginPath();
  sorted.forEach((r, i) => {
    const x = xScale(dates[i]);
    const y = yScale(r.value_mhz);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(xScale(dates[dates.length - 1]), PAD.top + plotH);
  ctx.lineTo(xScale(dates[0]), PAD.top + plotH);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + plotH);
  gradient.addColorStop(0,   accentGlow.replace(')', ', 0.5)').replace('rgba(', 'rgba('));
  gradient.addColorStop(0,   'rgba(232,73,15,0.18)');
  gradient.addColorStop(1,   'rgba(232,73,15,0.0)');
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  sorted.forEach((r, i) => {
    const x = xScale(dates[i]);
    const y = yScale(r.value_mhz);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = 'round';
  ctx.stroke();

  // Dots for major jumps (>5% increase)
  sorted.forEach((r, i) => {
    const x = xScale(dates[i]);
    const y = yScale(r.value_mhz);
    const prev = sorted[i - 1];
    const isMajor = !prev || (r.value_mhz - prev.value_mhz) / prev.value_mhz > 0.05;
    const isSelected = r.uid === selectedUid;

    if (isMajor || isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle   = isSelected ? accent : '#fff';
      ctx.strokeStyle = accent;
      ctx.lineWidth   = isSelected ? 0 : 2;
      ctx.fill();
      if (!isSelected) ctx.stroke();
    }
  });

  // Clickable hit areas — store for mouse events
  canvas._points = sorted.map((r, i) => ({
    x: xScale(dates[i]),
    y: yScale(r.value_mhz),
    uid: r.uid,
  }));
}

// Chart mouse interaction
document.getElementById('record-chart')?.addEventListener('mousemove', function(e) {
  if (!this._points?.length) return;
  const rect = this.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  let closest = null, minDist = Infinity;
  this._points.forEach(p => {
    const d = Math.abs(p.x - mx);
    if (d < minDist) { minDist = d; closest = p; }
  });
  this.style.cursor = closest && minDist < 20 ? 'pointer' : 'default';
  this.title = closest && minDist < 20
    ? allRecords.find(r => r.uid === closest.uid)?.value_mhz.toFixed(2) + ' MHz'
    : '';
});

document.getElementById('record-chart')?.addEventListener('click', function(e) {
  if (!this._points?.length) return;
  const rect = this.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  let closest = null, minDist = Infinity;
  this._points.forEach(p => {
    const d = Math.abs(p.x - mx);
    if (d < minDist) { minDist = d; closest = p; }
  });
  if (closest && minDist < 20) {
    location.hash = `${currentCategory}/${closest.uid}`;
  }
});

// Redraw chart on resize
window.addEventListener('resize', () => {
  renderChart(getFilteredRecords());
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
  renderChart(getFilteredRecords()); // redraw to show selected dot

  const row = document.querySelector(`.record-row[data-uid="${uid}"]`);
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closePanel() {
  panelOpen   = false;
  selectedUid = null;
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('timeline-main').classList.remove('panel-open');
  document.querySelectorAll('.record-row').forEach(r => r.classList.remove('selected'));
}

function renderPanel(record) {
  const records = getFilteredRecords().sort(
    (a, b) => new Date(a.achieved_at) - new Date(b.achieved_at)
  );
  const idx  = records.findIndex(r => r.uid === record.uid);
  const rank = allRecords
    .filter(r => r.category === record.category)
    .sort((a, b) => b.value_mhz - a.value_mhz)
    .findIndex(r => r.uid === record.uid) + 1;

  const cat          = CATEGORIES[record.category];
  const overclockers = record.overclockers || [];
  const hardware     = record.hardware     || {};
  const sources      = record.sources      || [];
  const tags         = record.tags         || [];
  const hero         = record.assets?.find(a =>
    a.type === 'cpuz' || a.type === 'validation'
  )?.file;
  const assetBase    = record._asset_base  || '';

  document.getElementById('panel-content').innerHTML = `
    ${hero ? `
      <div class="panel-hero">
        <img src="${assetBase}${hero}" alt="Validation screenshot" loading="lazy">
      </div>
    ` : ''}

    <div class="panel-rank">${cat.label} All-Time Rank #${rank}</div>

    <div class="panel-freq">
      ${record.value_mhz.toFixed(2)}<span class="unit">MHz</span>
    </div>
    <div class="panel-date">
      ${formatDateLong(record.achieved_at, record.achieved_at_approximate)}
    </div>

    <div class="panel-divider"></div>

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
    location.hash = `${currentCategory}/${records[idx - 1].uid}`;
  });
  document.getElementById('btn-next')?.addEventListener('click', () => {
    location.hash = `${currentCategory}/${records[idx + 1].uid}`;
  });
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
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && panelOpen) location.hash = currentCategory;
});

document.getElementById('panel-close-btn')?.addEventListener('click', () => {
  location.hash = currentCategory;
});

// ── START ─────────────────────────────────────────────
init();