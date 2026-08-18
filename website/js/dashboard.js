(function () {
  'use strict';
  const { PANEL_DEFS } = window.PanelRegistry;
  const LD = window.LiveData;

  const PANEL_CONFIG_KEY = 'vt-panel-config';

  const FIXED_PANELS = [
    { containerId: 'panelChart', defId: 'chart', key: 'chart', defaultConfig: { ticker: 'ES=F', tf: '1h' } },
    { containerId: 'panelMood', defId: 'market-mood', key: 'market-mood' },
    { containerId: 'panelSocial', defId: 'social-volume', key: 'social-volume' },
    { containerId: 'panelHeatmap', defId: 'heatmap', key: 'heatmap' },
    { containerId: 'panelNews', defId: 'live-news', key: 'live-news' },
    { containerId: 'panelCalendar', defId: 'economic-calendar', key: 'economic-calendar' },
    { containerId: 'panelTradeEntry', defId: 'trade-entry', key: 'trade-entry' },
    { containerId: 'panelTradeLog', defId: 'trade-log', key: 'trade-log' }
  ];

  function findDef(defId) { return PANEL_DEFS.find((d) => d.id === defId); }

  function loadPanelConfigs() {
    try {
      const raw = localStorage.getItem(PANEL_CONFIG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  const panelConfigs = loadPanelConfigs();
  function savePanelConfigs() {
    try { localStorage.setItem(PANEL_CONFIG_KEY, JSON.stringify(panelConfigs)); } catch (e) { /* storage unavailable */ }
  }

  function mountPanel(spec) {
    const def = findDef(spec.defId);
    const container = document.getElementById(spec.containerId);
    if (!def || !container) return;
    const config = panelConfigs[spec.key] || spec.defaultConfig || {};
    panelConfigs[spec.key] = config;

    container.innerHTML = `
      <div class="panel__head">
        <span class="panel__title">${def.title}</span>
        <span class="panel__subtitle">${def.desc}</span>
        <span class="data-badge" style="display:none;"></span>
      </div>
      <div class="panel__body"></div>`;
    const body = container.querySelector('.panel__body');
    const badgeEl = container.querySelector('.data-badge');

    const ctx = {
      uid: spec.key,
      config,
      setConfig(patch) {
        Object.assign(config, patch);
        savePanelConfigs();
        window.dispatchEvent(new CustomEvent('vt-panel-config-changed', { detail: { key: spec.key } }));
      },
      setBadge(status, reason) {
        if (!status) { badgeEl.style.display = 'none'; return; }
        badgeEl.style.display = '';
        badgeEl.textContent = status.toUpperCase();
        badgeEl.title = status === 'sim' && reason ? 'Simulated because: ' + reason : '';
        badgeEl.className = 'data-badge ' + (status === 'live' ? 'live' : 'sim');
      }
    };

    try {
      def.render(body, ctx);
    } catch (err) {
      body.innerHTML = `<div style="color:var(--red);font-size:11px;">Panel failed to load: ${err.message}</div>`;
      console.error(err);
    }
  }

  // ---------- tabs ----------
  const boards = {
    markets: document.getElementById('boardMarkets'),
    news: document.getElementById('boardNews'),
    journal: document.getElementById('boardJournal')
  };
  document.querySelectorAll('.tab').forEach((tabEl) => {
    tabEl.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tabEl.classList.add('active');
      Object.entries(boards).forEach(([key, el]) => el.classList.toggle('hidden', key !== tabEl.dataset.tab));
    });
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !settingsOverlay.classList.contains('hidden')) closeSettings();
  });

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
  FIXED_PANELS.forEach(mountPanel);
})();
