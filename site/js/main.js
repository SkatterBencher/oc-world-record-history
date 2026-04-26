// OC World Record Museum — main.js

const CATEGORIES = {
  cpu: { label: 'CPU', unit: 'MHz', color: '#00ff88' },
  gpu: { label: 'GPU', unit: 'MHz', color: '#4488ff' },
  memory: { label: 'Memory', unit: 'MHz', color: '#ffaa00' },
};

const COUNTRY_MAP = {
  China: "CN",
  "United States": "US",
  Taiwan: "TW",
  Germany: "DE",
  Japan: "JP",
  Korea: "KR",
};

let allRecords = [];
let currentCategory = 'cpu';
let activeTags = new Set();
let selectedUid = null;
let panelOpen = false;

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
  const hash = location.hash.replace('#', '') || 'cpu';
  const parts = hash.split('/');
  const page = parts[0];

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

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

// ── TIMELINE ──────────────────────────────────────────
function renderTimeline() {
  const cat = CATEGORIES[currentCategory];
  const records = getFilteredRecords();

  document.getElementById('timeline-title').innerHTML =
    `<span class="cat-label">${cat.label}</span> Overclocking World Record History`;

  document.getElementById('timeline-subtitle').textContent =
    `${records.length} records · ${getYearRange(records)}`;

  document.getElementById('header-record-count').textContent =
    `${records.length} records`;

  renderTagSidebar(records);

  const sortedByValue = [...records].sort((a, b) =>
    b.value_mhz - a.value_mhz || new Date(a.achieved_at) - new Date(b.achieved_at)
  );

  const maxMhz = sortedByValue[0]?.value_mhz || 1;

  const byDecade = {};

  records.forEach(r => {
    const year = parseInt(r.achieved_at.slice(0, 4));
    const decade = Math.floor(year / 10) * 10;
    const key = `${decade}s`;

    if (!byDecade[key]) byDecade[key] = [];
    byDecade[key].push(r);
  });

  const container = document.getElementById('timeline-records');
  container.innerHTML = '';

  const decades = Object.keys(byDecade).sort((a, b) =>
    parseInt(a) - parseInt(b)
  );

  decades.forEach(decade => {
    const group = document.createElement('div');
    group.className = 'decade-group';

    const label = document.createElement('div');
    label.className = 'decade-label';
    label.textContent = decade;
    group.appendChild(label);

    const decadeRecords = byDecade[decade].sort(
      (a, b) => new Date(a.achieved_at) - new Date(b.achieved_at)
    );

    decadeRecords.forEach(r => {
      const pct = ((r.value_mhz / maxMhz) * 100).toFixed(1);

      const row = document.createElement('div');
      row.className = 'record-row' + (r.uid === selectedUid ? ' selected' : '');
      row.style.setProperty('--bar-pct', pct + '%');
      row.dataset.uid = r.uid;

      const primary = r.hardware?.primary || 'Unknown';
      const ocs = (r.overclockers || []).map(o => o.handle).join(' & ');
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
  return `${Math.min(...years)}–${Math.max(...years)}`;
}

// ── TAGS ──────────────────────────────────────────────
function renderTagSidebar(records) {
  const tagCounts = {};

  records.forEach(r => {
    (r.tags || []).forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });

  const container = document.getElementById('sidebar-tags');
  container.innerHTML = '';

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

// ── PANEL ─────────────────────────────────────────────
function openRecord(uid) {
  const record = allRecords.find(r => r.uid === uid);
  if (!record) return;

  selectedUid = uid;
  panelOpen = true;

  document.querySelectorAll('.record-row').forEach(row => {
    row.classList.toggle('selected', row.dataset.uid === uid);
  });

  document.getElementById('timeline-main').classList.add('panel-open');
  document.getElementById('detail-panel').classList.add('open');

  renderPanel(record);

  const row = document.querySelector(`.record-row[data-uid="${uid}"]`);
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closePanel() {
  panelOpen = false;
  selectedUid = null;

  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('timeline-main').classList.remove('panel-open');

  document.querySelectorAll('.record-row').forEach(r => r.classList.remove('selected'));
}

function renderPanel(record) {
  const cat = CATEGORIES[record.category];
  const records = getFilteredRecords().sort((a,b) =>
    new Date(a.achieved_at) - new Date(b.achieved_at)
  );

  const idx = records.findIndex(r => r.uid === record.uid);

  const rank = allRecords
    .filter(r => r.category === record.category)
    .sort((a,b) => b.value_mhz - a.value_mhz)
    .findIndex(r => r.uid === record.uid) + 1;

  const overclockers = record.overclockers || [];
  const hardware = record.hardware || {};
  const sources = record.sources || [];
  const tags = record.tags || [];
  const hero = record.assets?.find(a => a.type === 'validation')?.file;

  document.getElementById('panel-content').innerHTML = `
    ${hero ? `
      <div class="panel-hero">
        <img src="${hero}" alt="validation screenshot">
      </div>
    ` : ''}

    <div class="panel-rank">${cat.label} World Record #${rank}</div>

    <div class="panel-freq">
      ${record.value_mhz.toFixed(2)}<span class="unit">MHz</span>
    </div>

    <div class="panel-date">
      ${formatDateLong(record.achieved_at, record.achieved_at_approximate)}
    </div>

    <div class="panel-divider"></div>

    <div class="panel-section-label">Hardware</div>
    <div class="panel-hardware-grid">
      ${hwRow('Processor', hardware.primary)}
      ${hwRow('Motherboard', hardware.motherboard)}
      ${hwRow('Memory', hardware.memory)}
      ${hwRow('Cooling', hardware.cooling)}
    </div>

    <div class="panel-divider"></div>

    <div class="panel-section-label">Overclockers</div>
    <div class="panel-overclockers">
      ${overclockers.map(oc => {
        const code = COUNTRY_MAP[oc.country] || oc.country;
        return `
          <div class="oc-card">
            <div class="oc-handle">${getFlagEmoji(code)} ${oc.handle}</div>
            ${oc.real_name ? `<div class="oc-real-name">${oc.real_name}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>

    <div class="panel-divider"></div>

    <div class="panel-nav">
      <button class="panel-nav-btn" id="btn-prev" ${idx <= 0 ? 'disabled' : ''}>← Older</button>
      <button class="panel-nav-btn" id="btn-next" ${idx >= records.length - 1 ? 'disabled' : ''}>Newer →</button>
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
  return `
    <div class="hw-row">
      <span class="hw-label">${label}</span>
      <span class="hw-value ${!value ? 'unknown' : ''}">
        ${value || 'Unknown'}
      </span>
    </div>
  `;
}

function getFlagEmoji(countryCode) {
  if (!countryCode) return '';
  return countryCode
    .toUpperCase()
    .replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt()));
}

// ── DATE ──────────────────────────────────────────────
function formatDate(iso, approx) {
  const [y, m] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return approx
    ? `${months[+m - 1]} ${y}`
    : `${parseInt(iso.slice(8,10))} ${months[+m - 1]} ${y}`;
}

function formatDateLong(iso, approx) {
  const d = new Date(iso + 'T12:00:00Z');
  return approx
    ? d.toLocaleDateString('en-US', { year:'numeric', month:'long' }) + ' (approx.)'
    : d.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
}

// ── EVENTS ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && panelOpen) {
    location.hash = currentCategory;
  }
});

document.getElementById('panel-close-btn')?.addEventListener('click', () => {
  location.hash = currentCategory;
});

// ── START ─────────────────────────────────────────────
init();