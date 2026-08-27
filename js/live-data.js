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

  async function fetchText(url, { proxyOnFail = true, timeout = 15000 } = {}) {
    try {
      const res = await withTimeout(fetch(url), timeout);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (err) {
      if (!proxyOnFail) throw err;
      const res = await withTimeout(fetch(CORS_PROXY + encodeURIComponent(url)), timeout);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
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

  // ---------- ForexFactory economic calendar (via the FairEconomy JSON
  // mirror widely used by free trading tools), no key ----------
  const MAJOR_FF_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY'];

  async function getForexFactoryCalendar() {
    return cached('ff-cal', 3600000, async () => {
      const data = await fetchJSON('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
      if (!Array.isArray(data) || !data.length) throw new Error('empty calendar');
      return data
        .filter((e) => !e.country || MAJOR_FF_CURRENCIES.includes(e.country))
        .map((e) => {
          const d = new Date(e.date);
          const valid = !isNaN(d.getTime());
          const impactStr = (e.impact || '').toLowerCase();
          return {
            date: valid ? d.toISOString().slice(0, 10) : '',
            time: valid ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--',
            country: e.country || '',
            name: e.title || 'Event',
            impact: impactStr.includes('high') ? 'high' : impactStr.includes('med') ? 'medium' : 'low',
            actual: e.actual || '—',
            forecast: e.forecast || '—',
            prev: e.previous || '—'
          };
        })
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    });
  }

  // ---------- USGS earthquakes, no key (Globe tab, natural-disaster layer) ----------
  async function getEarthquakes() {
    return cached('usgs-quakes', 10 * 60000, async () => {
      const data = await fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson');
      const feats = data.features || [];
      if (!feats.length) throw new Error('no quakes');
      return feats
        .map((f) => ({
          id: f.id,
          name: f.properties.place || 'Unknown location',
          mag: f.properties.mag,
          time: f.properties.time,
          url: f.properties.url,
          lon: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1]
        }))
        .filter((q) => q.mag != null)
        .sort((a, b) => b.mag - a.mag);
    });
  }

  // ---------- OFAC Specially Designated Nationals list, no key
  // (Globe tab, sanctions layer). The SDN list has no coordinates — it's a
  // flat list of sanctioned people/entities/vessels tagged with program
  // codes — so this aggregates listing counts per program into the same
  // country buckets used by MockData.SANCTIONS_ZONES. ----------
  const SANCTIONS_PROGRAM_BUCKETS = [
    { key: 'Russia', match: /RUSSIA|UKRAINE-EO|BELARUS/i },
    { key: 'Iran', match: /\bIRAN\b/i },
    { key: 'Venezuela', match: /VENEZUELA/i },
    { key: 'North Korea', match: /DPRK|NORTH ?KOREA/i }
  ];

  function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  async function getSanctionsData() {
    return cached('ofac-sdn', 24 * 3600000, async () => {
      const csv = await fetchText('https://www.treasury.gov/ofac/downloads/sdn.csv');
      if (!csv || csv.length < 1000) throw new Error('empty SDN list');
      const counts = { Russia: 0, Iran: 0, Venezuela: 0, 'North Korea': 0 };
      const lines = csv.split('\n');
      const limit = Math.min(lines.length, 20000);
      for (let i = 0; i < limit; i++) {
        if (!lines[i]) continue;
        const program = parseCsvLine(lines[i])[3] || '';
        if (!program) continue;
        for (const bucket of SANCTIONS_PROGRAM_BUCKETS) {
          if (bucket.match.test(program)) counts[bucket.key]++;
        }
      }
      if (!Object.values(counts).some((n) => n > 0)) throw new Error('no matching sanctions programs found');
      return counts;
    });
  }

  // ---------- NWS severe weather alerts, no key (Globe tab, weather layer,
  // filtered to Gulf Coast/Permian energy-producing states relevant to
  // CL=F) ----------
  const ENERGY_STATES = ['Texas', 'Louisiana', 'Mississippi', 'Alabama', 'Oklahoma'];

  async function getWeatherAlerts() {
    return cached('nws-alerts', 15 * 60000, async () => {
      const data = await fetchJSON('https://api.weather.gov/alerts/active?severity=Severe,Extreme');
      const feats = data.features;
      if (!Array.isArray(feats)) throw new Error('malformed alert feed');
      return feats
        .filter((f) => f.geometry && f.geometry.type === 'Polygon' && ENERGY_STATES.some((s) => (f.properties.areaDesc || '').includes(s)))
        .map((f) => {
          const ring = f.geometry.coordinates[0];
          const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
          const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
          return {
            id: f.properties.id || f.id,
            event: f.properties.event,
            headline: f.properties.headline || f.properties.event,
            severity: f.properties.severity,
            areaDesc: f.properties.areaDesc,
            lat, lon
          };
        });
    });
  }

  global.LiveData = {
    getSettings, saveSettings,
    getQuote, getHistory, getCOT, get13FMeta, getSocialVolume, getNews, getForexFactoryCalendar,
    getEarthquakes, getSanctionsData, getWeatherAlerts
  };
})(window);
