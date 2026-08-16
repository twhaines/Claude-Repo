(function () {
  'use strict';
  const { PANEL_DEFS } = window.PanelRegistry;
  const M = window.MockData;
  const LD = window.LiveData;

  const board = document.getElementById('board');
  const tabbar = document.getElementById('tabbar');
  const paletteOverlay = document.getElementById('paletteOverlay');
  const paletteInput = document.getElementById('paletteInput');
  const paletteResults = document.getElementById('paletteResults');

  const LAYOUT_KEY = 'vt-layout';

  // A futures-trader's pre-market routine: macro calendar and news first,
  // then the instruments themselves, then positioning context.
  const DEFAULT_LAYOUT = [
    { defId: 'economic-calendar' },
    { defId: 'live-news' },
    { defId: 'news-globe' },
    { defId: 'chart', config: { ticker: 'ES=F', tf: '1h' } },
    { defId: 'quote-monitor' },
    { defId: 'cot-positioning' },
    { defId: 'heatmap' },
    { defId: 'market-mood' },
    { defId: 'social-volume' }
  ];

  let panels = []; // { uid, defId, destroy, config, sizeOverride }
  let uidSeq = 1;

  const TABS = [{ id: 't1', name: 'Tab 1' }];
  let activeTab = 't1';

  function findDef(defId) { return PANEL_DEFS.find((d) => d.id === defId); }

  function saveLayout() {
    const data = Array.from(board.children).map((el) => {
      const p = panels.find((x) => x.uid === el.dataset.uid);
      if (!p) return null;
      return { defId: p.defId, config: p.config || {}, sizeOverride: p.sizeOverride || null };
    }).filter(Boolean);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }
  function loadLayout() {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return Array.isArray(data) && data.length ? data : null;
    } catch (e) { return null; }
  }

  function addPanel(defId, savedConfig, savedSize) {
    const def = findDef(defId);
    if (!def) return;
    const uid = 'p' + uidSeq++;
    const panelEl = document.createElement('div');
    panelEl.className = `panel size-${savedSize || def.size}`;
    panelEl.draggable = true;
    panelEl.dataset.uid = uid;
    panelEl.innerHTML = `
      <div class="panel__head">
        <span class="panel__title">${def.title}</span>
        <span class="panel__subtitle">${def.desc}</span>
        <span class="data-badge" style="display:none;"></span>
        <div class="panel__controls">
          <span class="panel__help" title="${def.desc}">?</span>
          <span class="panel__close" title="Close">✕</span>
        </div>
      </div>
      <div class="panel__body"></div>
      <span class="panel__resize" draggable="false" title="Drag to resize">◢</span>`;
    board.appendChild(panelEl);

    const body = panelEl.querySelector('.panel__body');
    const badgeEl = panelEl.querySelector('.data-badge');
    const record = { uid, defId, destroy: null, config: savedConfig || {}, sizeOverride: savedSize || null };
    panels.push(record);

    const ctx = {
      uid,
      config: record.config,
      setConfig(patch) { Object.assign(record.config, patch); saveLayout(); },
      setBadge(status) {
        if (!status) { badgeEl.style.display = 'none'; return; }
        badgeEl.style.display = '';
        badgeEl.textContent = status.toUpperCase();
        badgeEl.className = 'data-badge ' + (status === 'live' ? 'live' : 'sim');
      }
    };

    try {
      const result = def.render(body, ctx);
      if (typeof result === 'function') record.destroy = result;
    } catch (err) {
      body.innerHTML = `<div style="color:var(--red);font-size:11px;">Panel failed to load: ${err.message}</div>`;
      console.error(err);
    }

    panelEl.querySelector('.panel__close').addEventListener('click', () => {
      if (record.destroy) record.destroy();
      panelEl.remove();
      panels = panels.filter((p) => p.uid !== uid);
      saveLayout();
    });

    attachDrag(panelEl);
    attachResize(panelEl, record);
    saveLayout();
  }

  // ---------- resize ----------
  const SIZE_COLS = { sm: 3, md: 4, lg: 6, xl: 8 };
  const SIZE_ROWS = { sm: 8, md: 12, lg: 18, xl: 18 };
  function attachResize(panelEl, record) {
    const handle = panelEl.querySelector('.panel__resize');
    let startX, startY, startCols, startRows;
    function onMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const colWidth = board.clientWidth / 12;
      const rowHeight = 26 + 10; // grid-auto-rows + gap
      const newCols = Math.max(2, Math.min(12, Math.round(startCols + dx / colWidth)));
      const newRows = Math.max(6, Math.round(startRows + dy / rowHeight));
      panelEl.style.gridColumn = `span ${newCols}`;
      panelEl.style.gridRow = `span ${newRows}`;
      record.sizeOverride = { cols: newCols, rows: newRows };
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      saveLayout();
    }
    handle.addEventListener('dragstart', (e) => e.preventDefault());
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const def = findDef(record.defId);
      const rect = panelEl.getBoundingClientRect();
      const colWidth = board.clientWidth / 12;
      startCols = record.sizeOverride ? record.sizeOverride.cols : SIZE_COLS[def.size];
      startRows = record.sizeOverride ? record.sizeOverride.rows : SIZE_ROWS[def.size];
      startX = e.clientX; startY = e.clientY;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    if (record.sizeOverride) {
      panelEl.style.gridColumn = `span ${record.sizeOverride.cols}`;
      panelEl.style.gridRow = `span ${record.sizeOverride.rows}`;
    }
  }

  // ---------- drag to reorder ----------
  let dragSrc = null;
  function attachDrag(panelEl) {
    panelEl.addEventListener('dragstart', (e) => {
      dragSrc = panelEl;
      panelEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    panelEl.addEventListener('dragend', () => {
      panelEl.classList.remove('dragging');
      board.querySelectorAll('.panel').forEach((p) => p.classList.remove('drag-over'));
      saveLayout();
    });
    panelEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (panelEl !== dragSrc) panelEl.classList.add('drag-over');
    });
    panelEl.addEventListener('dragleave', () => panelEl.classList.remove('drag-over'));
    panelEl.addEventListener('drop', (e) => {
      e.preventDefault();
      panelEl.classList.remove('drag-over');
      if (!dragSrc || dragSrc === panelEl) return;
      const children = Array.from(board.children);
      const srcIdx = children.indexOf(dragSrc);
      const tgtIdx = children.indexOf(panelEl);
      if (srcIdx < tgtIdx) board.insertBefore(dragSrc, panelEl.nextSibling);
      else board.insertBefore(dragSrc, panelEl);
    });
  }

  // ---------- command palette ----------
  let focusedIdx = 0;
  let currentResults = [];

  function openPalette() {
    paletteOverlay.classList.remove('hidden');
    paletteInput.value = '';
    paletteInput.focus();
    renderResults('');
  }
  function closePalette() {
    paletteOverlay.classList.add('hidden');
  }
  function renderResults(query) {
    const q = query.trim().toLowerCase();
    const q2 = q.startsWith('/') ? q.slice(1) : q;
    const filtered = PANEL_DEFS.filter((d) =>
      !q2 || d.title.toLowerCase().includes(q2) || d.code.toLowerCase() === q2 || d.desc.toLowerCase().includes(q2)
    );
    currentResults = filtered;
    focusedIdx = 0;

    if (!filtered.length) {
      paletteResults.innerHTML = `<div style="color:var(--text-dim);font-size:12px;padding:20px 0;text-align:center;">No panels match "${query}"</div>`;
      return;
    }
    const byCategory = {};
    filtered.forEach((d) => (byCategory[d.category] = byCategory[d.category] || []).push(d));
    paletteResults.innerHTML = Object.entries(byCategory).map(([cat, defs]) => `
      <div class="palette__category">${cat}</div>
      <div class="palette__grid">
        ${defs.map((d) => `
          <div class="palette__item" data-id="${d.id}">
            <b>${d.title}</b>
            <p>${d.desc}</p>
            <span class="pill">/${d.code}</span>
          </div>`).join('')}
      </div>`).join('');
    paletteResults.querySelectorAll('.palette__item').forEach((item, i) => {
      item.addEventListener('click', () => {
        addPanel(item.dataset.id);
        closePalette();
      });
      item.addEventListener('mouseenter', () => {
        focusedIdx = i;
        updateFocusHighlight();
      });
    });
    updateFocusHighlight();
  }
  function updateFocusHighlight() {
    const items = paletteResults.querySelectorAll('.palette__item');
    items.forEach((it, i) => it.classList.toggle('focused', i === focusedIdx));
    if (items[focusedIdx]) items[focusedIdx].scrollIntoView({ block: 'nearest' });
  }

  paletteInput.addEventListener('input', (e) => renderResults(e.target.value));
  paletteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePalette(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusedIdx = Math.min(focusedIdx + 1, currentResults.length - 1); updateFocusHighlight(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusedIdx = Math.max(focusedIdx - 1, 0); updateFocusHighlight(); return; }
    if (e.key === 'Enter') {
      const target = currentResults[focusedIdx];
      if (target) { addPanel(target.id); closePalette(); }
    }
  });
  document.getElementById('paletteClose').addEventListener('click', closePalette);
  document.getElementById('openPaletteBtn').addEventListener('click', openPalette);
  paletteOverlay.addEventListener('click', (e) => { if (e.target === paletteOverlay) closePalette(); });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (e.key === '/' && !typing && paletteOverlay.classList.contains('hidden') && settingsOverlay.classList.contains('hidden')) {
      e.preventDefault();
      openPalette();
    } else if (e.key === 'Escape') {
      if (!paletteOverlay.classList.contains('hidden')) closePalette();
      if (!settingsOverlay.classList.contains('hidden')) closeSettings();
    }
  });

  // ---------- settings ----------
  const settingsOverlay = document.getElementById('settingsOverlay');
  const finnhubKeyInput = document.getElementById('finnhubKeyInput');
  function openSettings() {
    finnhubKeyInput.value = (LD.getSettings().finnhubKey) || '';
    settingsOverlay.classList.remove('hidden');
  }
  function closeSettings() { settingsOverlay.classList.add('hidden'); }
  document.getElementById('openSettingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });
  document.getElementById('settingsSave').addEventListener('click', () => {
    LD.saveSettings({ finnhubKey: finnhubKeyInput.value.trim() });
    closeSettings();
  });

  // ---------- reset layout ----------
  document.getElementById('resetLayoutBtn').addEventListener('click', () => {
    if (!confirm('Reset to the default futures pre-market layout? This clears your current panels.')) return;
    panels.forEach((p) => { if (p.destroy) p.destroy(); });
    panels = [];
    board.innerHTML = '';
    localStorage.removeItem(LAYOUT_KEY);
    DEFAULT_LAYOUT.forEach((p) => addPanel(p.defId, p.config));
  });

  // ---------- tabs ----------
  function renderTabs() {
    tabbar.innerHTML = TABS.map((t) => `
      <div class="tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
        <span>${t.name}</span>
        ${TABS.length > 1 ? '<span class="tab__close">✕</span>' : ''}
      </div>`).join('') + `<div class="tab tab--add" id="tabAdd">+</div>`;

    tabbar.querySelectorAll('.tab[data-tab]').forEach((tabEl) => {
      tabEl.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab__close')) {
          TABS.splice(TABS.findIndex((t) => t.id === tabEl.dataset.tab), 1);
          if (activeTab === tabEl.dataset.tab) activeTab = TABS[0].id;
          renderTabs();
          return;
        }
        activeTab = tabEl.dataset.tab;
        renderTabs();
      });
    });
    document.getElementById('tabAdd').addEventListener('click', () => {
      const id = 't' + (TABS.length + 1) + '_' + Date.now();
      TABS.push({ id, name: 'Tab ' + (TABS.length + 1) });
      activeTab = id;
      renderTabs();
    });
  }
  renderTabs();

  // ---------- clocks & market status ----------
  function updateClocks() {
    const now = new Date();
    const zones = { LDN: 'Europe/London', NY: 'America/New_York', TYO: 'Asia/Tokyo' };
    Object.entries(zones).forEach(([key, tz]) => {
      const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
      const el = document.getElementById('clock' + key);
      if (el) el.textContent = fmt.format(now);
    });
    const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' });
    const parts = nyFmt.formatToParts(now);
    const weekday = parts.find((p) => p.type === 'weekday').value;
    const hour = +parts.find((p) => p.type === 'hour').value;
    const minute = +parts.find((p) => p.type === 'minute').value;
    const mins = hour * 60 + minute;
    const isWeekday = !['Sat', 'Sun'].includes(weekday);
    const isOpen = isWeekday && mins >= 570 && mins < 960; // 9:30–16:00 ET
    document.getElementById('marketDot').classList.toggle('open', isOpen);
    document.getElementById('marketStatus').textContent = isOpen ? 'Markets open' : 'Markets closed';
  }
  updateClocks();
  setInterval(updateClocks, 1000 * 15);

  // ---------- boot ----------
  const saved = loadLayout();
  (saved || DEFAULT_LAYOUT).forEach((p) => addPanel(p.defId, p.config, p.sizeOverride));
})();
