/* Vintage Terminal — live data layer.
   Every function here either resolves with real data or throws; callers
   are expected to catch and fall back to js/mock-data.js. No keys are
   ever hardcoded — the Finnhub key lives only in this browser's
   localStorage (see Settings). */
(function (global) {
  'use strict';

  const SETTINGS_KEY = 'vt-settings';
  const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSettings(patch) {
    const s = Object.assign(getSettings(), patch);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return s;
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
  }

  async function fetchJSON(url, { proxyOnFail = true, timeout = 8000 } = {}) {
    try {
      const res = await withTimeout(fetch(url), timeout);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      if (!proxyOnFail) throw err;
      const res = await withTimeout(fetch(CORS_PROXY + encodeURIComponent(url)), timeout);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    }
  }

  const memCache = {};
  async function cached(key, ttlMs, fn) {
    const now = Date.now();
    if (memCache[key] && now - memCache[key].t < ttlMs) return memCache[key].v;
    try {
      const raw = localStorage.getItem('vt-cache-' + key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (now - parsed.t < ttlMs) { memCache[key] = parsed; return parsed.v; }
      }
    } catch (e) { /* ignore corrupt cache entries */ }
    const v = await fn();
    const entry = { t: now, v };
    memCache[key] = entry;
    try { localStorage.setItem('vt-cache-' + key, JSON.stringify(entry)); } catch (e) { /* storage full/unavailable */ }
    return v;
  }

  // ---------- Yahoo Finance (quotes + history), no key ----------
  async function getQuote(symbol) {
    return cached('yq-' + symbol, 15000, async () => {
      const data = await fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`);
      const result = data.chart.result && data.chart.result[0];
      if (!result) throw new Error('no data');
      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose || meta.chartPreviousClose;
      return { symbol, price, prevClose, chgPct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0 };
    });
  }

  async function getHistory(symbol, range, interval) {
    return cached(`yh-${symbol}-${range}-${interval}`, 60000, async () => {
      const data = await fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`);
      const result = data.chart.result && data.chart.result[0];
      if (!result || !result.timestamp) throw new Error('no data');
      const q = result.indicators.quote[0];
      return result.timestamp
        .map((t, i) => ({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] }))
        .filter((d) => d.c != null && d.o != null);
    });
  }

  // ---------- CFTC Commitments of Traders, no key ----------
  async function getCOT(contractNameFragment) {
    return cached('cot-' + contractNameFragment, 12 * 3600000, async () => {
      const where = `contract_market_name like '%25${contractNameFragment.toUpperCase()}%25'`;
      const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?$limit=1&$order=report_date_as_yyyy_mm_dd DESC&$where=${encodeURIComponent(where)}`;
      const rows = await fetchJSON(url);
      if (!rows || !rows[0]) throw new Error('no COT row');
      const r = rows[0];
      return {
        date: r.report_date_as_yyyy_mm_dd,
        commercialNet: (+r.comm_positions_long_all || 0) - (+r.comm_positions_short_all || 0),
        nonCommercialNet: (+r.noncomm_positions_long_all || 0) - (+r.noncomm_positions_short_all || 0)
      };
    });
  }

  // ---------- SEC EDGAR 13F filing metadata, no key ----------
  async function get13FMeta(cik) {
    return cached('sec-' + cik, 3600000, async () => {
      const padded = String(cik).padStart(10, '0');
      const data = await fetchJSON(`https://data.sec.gov/submissions/CIK${padded}.json`);
      const recent = data.filings && data.filings.recent;
      if (!recent) throw new Error('no filings');
      const idx = recent.form.findIndex((f) => f.startsWith('13F'));
      if (idx === -1) throw new Error('no 13F on file');
      return { form: recent.form[idx], filed: recent.filingDate[idx], accession: recent.accessionNumber[idx] };
    });
  }

  // ---------- ApeWisdom social mentions, no key ----------
  async function getSocialVolume() {
    return cached('apewisdom', 5 * 60000, async () => {
      const data = await fetchJSON('https://apewisdom.io/api/v1.0/filter/all-stocks/page/1');
      const rows = data.results || data;
      if (!Array.isArray(rows) || !rows.length) throw new Error('no rows');
      return rows.slice(0, 15).map((r) => ({
        t: r.ticker, name: r.name, mentions: +r.mentions, chg: +r.mentions_24h_ago ? (( +r.mentions - +r.mentions_24h_ago) / +r.mentions_24h_ago) * 100 : 0
      }));
    });
  }

  // ---------- Finnhub news + economic calendar, needs user key ----------
  async function getNews() {
    const { finnhubKey } = getSettings();
    if (!finnhubKey) throw new Error('no finnhub key');
    return cached('fh-news', 2 * 60000, async () => {
      const arr = await fetchJSON(`https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(finnhubKey)}`, { proxyOnFail: false });
      if (!Array.isArray(arr) || !arr.length) throw new Error('empty news');
      return arr.slice(0, 25).map((n) => ({
        cat: n.category ? n.category[0].toUpperCase() + n.category.slice(1) : 'Markets',
        region: n.source || 'Wire',
        text: n.headline,
        url: n.url,
        time: n.datetime * 1000
      }));
    });
  }

  function weekRange() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const iso = (d) => d.toISOString().slice(0, 10);
    return { from: iso(monday), to: iso(sunday) };
  }

  const MAJOR_ECON_COUNTRIES = ['US', 'EU', 'GB', 'JP', 'CN', 'DE'];

  async function getEconCalendar() {
    const { finnhubKey } = getSettings();
    if (!finnhubKey) throw new Error('no finnhub key');
    const { from, to } = weekRange();
    return cached('fh-cal-' + from, 3600000, async () => {
      const data = await fetchJSON(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${encodeURIComponent(finnhubKey)}`, { proxyOnFail: false });
      const rows = data.economicCalendar || data.result || [];
      if (!rows.length) throw new Error('empty calendar');
      return rows
        .filter((e) => !e.country || MAJOR_ECON_COUNTRIES.includes(e.country))
        .slice(0, 80)
        .map((e) => ({
          date: e.time ? e.time.split(' ')[0] : from,
          time: e.time ? (e.time.split(' ')[1] || '--:--') : '--:--',
          name: e.event,
          impact: e.impact === 3 ? 'high' : e.impact === 2 ? 'medium' : 'low',
          actual: e.actual != null ? String(e.actual) : '—',
          forecast: e.estimate != null ? String(e.estimate) : '—',
          prev: e.prev != null ? String(e.prev) : '—'
        }))
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    });
  }

  global.LiveData = {
    getSettings, saveSettings,
    getQuote, getHistory, getCOT, get13FMeta, getSocialVolume, getNews, getEconCalendar
  };
})(window);
