/* Vintage Terminal — shared mock market data & generators
   All data below is synthetic/simulated for demo purposes. */

(function (global) {
  'use strict';

  const SECTORS = [
    'Technology', 'Healthcare', 'Financials', 'Energy', 'Industrials',
    'Consumer Disc.', 'Consumer Staples', 'Materials', 'Real Estate',
    'Utilities', 'Communication'
  ];

  const STOCKS = [
    { t: 'AAPL', name: 'Apple Inc.', sector: 'Technology', base: 231.4 },
    { t: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', base: 421.8 },
    { t: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology', base: 138.2 },
    { t: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication', base: 178.9 },
    { t: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Disc.', base: 197.3 },
    { t: 'META', name: 'Meta Platforms', sector: 'Communication', base: 587.1 },
    { t: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Disc.', base: 251.6 },
    { t: 'AVGO', name: 'Broadcom Inc.', sector: 'Technology', base: 172.4 },
    { t: 'ORCL', name: 'Oracle Corp.', sector: 'Technology', base: 149.2 },
    { t: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology', base: 141.0 },
    { t: 'INTC', name: 'Intel Corp.', sector: 'Technology', base: 23.7 },
    { t: 'JPM', name: 'JPMorgan Chase', sector: 'Financials', base: 231.9 },
    { t: 'XOM', name: 'Exxon Mobil', sector: 'Energy', base: 114.8 },
    { t: 'DTE', name: 'DTE Energy Co.', sector: 'Utilities', base: 149.4 },
    { t: 'SPY', name: 'SPDR S&P 500 ETF', sector: 'Financials', base: 583.2 },
    { t: 'QQQ', name: 'Invesco QQQ ETF', sector: 'Technology', base: 505.6 },
    { t: 'MU', name: 'Micron Technology', sector: 'Technology', base: 108.3 },
    { t: 'GOOG', name: 'Alphabet Inc. Cl C', sector: 'Communication', base: 180.1 }
  ];

  const FUTURES = [
    { t: 'ES=F', name: 'E-mini S&P 500', sector: 'Index', base: 5920.5 },
    { t: 'NQ=F', name: 'E-mini Nasdaq 100', sector: 'Index', base: 21340.0 },
    { t: 'CL=F', name: 'WTI Crude Oil', sector: 'Energy', base: 68.4 },
    { t: 'GC=F', name: 'Gold', sector: 'Metals', base: 2645.3 },
    { t: 'SI=F', name: 'Silver', sector: 'Metals', base: 30.9 },
    { t: 'ZC=F', name: 'Corn', sector: 'Agriculture', base: 428.5 },
    { t: 'ZN=F', name: '10-Year T-Note', sector: 'Rates', base: 110.7 },
    { t: 'NG=F', name: 'Natural Gas', sector: 'Energy', base: 3.21 },
    { t: '6E=F', name: 'Euro FX', sector: 'FX', base: 1.048 }
  ];

  const ALL_SYMBOLS = STOCKS.concat(FUTURES);

  function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  }

  const _liveState = {};
  function getLive(sym) {
    if (!_liveState[sym.t]) {
      const rnd = seededRandom(hashStr(sym.t));
      const drift = (rnd() - 0.48) * 0.04;
      _liveState[sym.t] = { price: sym.base, chgPct: drift * 100, rnd };
    }
    return _liveState[sym.t];
  }

  function tickAll() {
    ALL_SYMBOLS.forEach((sym) => {
      const st = getLive(sym);
      const vol = sym.t.includes('=F') ? 0.0009 : 0.0006;
      const move = (st.rnd() - 0.5) * vol;
      st.price = Math.max(0.01, st.price * (1 + move));
      st.chgPct = ((st.price - sym.base) / sym.base) * 100;
    });
  }

  function generateOHLC(base, points, volatility) {
    const rnd = seededRandom(Math.round(base * 1000) + points);
    let price = base;
    const out = [];
    const now = Date.now();
    for (let i = points; i >= 0; i--) {
      const open = price;
      const drift = (rnd() - 0.5) * volatility;
      const close = Math.max(0.01, open * (1 + drift));
      const high = Math.max(open, close) * (1 + rnd() * volatility * 0.6);
      const low = Math.min(open, close) * (1 - rnd() * volatility * 0.6);
      out.push({
        t: now - i * 60000,
        o: open, h: high, l: low, c: close,
        v: Math.round(rnd() * 900000 + 100000)
      });
      price = close;
    }
    return out;
  }

  const NEWS_HEADLINES = [
    { cat: 'Markets', region: 'US', text: 'Fed officials signal patience on rate path as core inflation cools', lat: 38.9, lon: -77.0 },
    { cat: 'Technology', region: 'US', text: 'Chipmakers rally after strong AI infrastructure capex guidance', lat: 37.4, lon: -122.1 },
    { cat: 'Energy', region: 'Global', text: 'OPEC+ weighs output policy as crude holds near three-month range', lat: 24.7, lon: 46.7 },
    { cat: 'Markets', region: 'UK', text: 'Gilts steady ahead of BoE rate decision, sterling little changed', lat: 51.5, lon: -0.1 },
    { cat: 'Technology', region: 'Asia', text: 'Foundry order backlog extends into next year on AI accelerator demand', lat: 25.0, lon: 121.5 },
    { cat: 'Financials', region: 'US', text: 'Regional banks post better-than-feared credit metrics in latest filings', lat: 40.7, lon: -74.0 },
    { cat: 'Energy', region: 'Middle East', text: 'Shipping insurers reassess Strait of Hormuz risk premiums', lat: 26.2, lon: 56.2 },
    { cat: 'Macro', region: 'EU', text: 'Eurozone PMI edges above 50 for first time in six months', lat: 50.1, lon: 8.7 },
    { cat: 'Crypto', region: 'Global', text: 'Spot ETF flows turn positive after three-week outflow streak', lat: 1.35, lon: 103.8 },
    { cat: 'Materials', region: 'Asia', text: 'Rare earth export curbs prompt supply-chain diversification push', lat: 39.9, lon: 116.4 },
    { cat: 'Markets', region: 'Japan', text: 'Yen firms as traders trim carry trade exposure ahead of BoJ meeting', lat: 35.7, lon: 139.7 },
    { cat: 'Industrials', region: 'US', text: 'Freight volumes tick higher, a tentative signal for manufacturing demand', lat: 41.9, lon: -87.6 },
    { cat: 'Politics', region: 'Global', text: 'Trade negotiators extend tariff truce talks into next round', lat: -33.9, lon: 151.2 },
    { cat: 'Healthcare', region: 'US', text: 'Biotech M&A activity picks up as large-cap pipelines thin out', lat: 42.4, lon: -71.1 },
    { cat: 'Energy', region: 'Europe', text: 'European gas storage tracks above five-year seasonal average', lat: 52.5, lon: 13.4 },
    { cat: 'Markets', region: 'India', text: 'Foreign inflows return to domestic equities after two-month lull', lat: 19.1, lon: 72.9 }
  ];

  const SOCIAL_VOLUME = [
    { t: 'SPY', mentions: 337, chg: 0.12 }, { t: 'MU', mentions: 243, chg: -0.08 },
    { t: 'TSLA', mentions: 201, chg: 0.34 }, { t: 'NVDA', mentions: 195, chg: 0.19 },
    { t: 'QQQ', mentions: 160, chg: 0.05 }, { t: 'MSFT', mentions: 146, chg: -0.02 },
    { t: 'INTC', mentions: 130, chg: 0.41 }, { t: 'AAPL', mentions: 119, chg: 0.03 },
    { t: 'GOOGL', mentions: 92, chg: -0.11 }, { t: 'AMD', mentions: 88, chg: 0.22 },
    { t: 'GC=F', mentions: 61, chg: 0.15 }, { t: 'CL=F', mentions: 54, chg: -0.06 }
  ];

  const FUNDS_13F = [
    'Berkshire Hathaway', 'Michael Burry', 'Bridgewater', 'Renaissance', 'Third Point',
    'Pershing Square', 'Citadel', 'Appaloosa', 'Point72', 'Tiger Global', 'Coatue',
    'Duquesne', 'Soros', 'Icahn', 'Lone Pine', 'Viking Global', 'Baupost', 'Millennium',
    'Two Sigma', 'D1 Capital', 'Ark Invest', 'Tudor'
  ];

  function fundHoldings(fundName) {
    const rnd = seededRandom(hashStr(fundName));
    const pool = ALL_SYMBOLS.filter((s) => !s.t.includes('=F'));
    const n = 5 + Math.floor(rnd() * 3);
    const picks = [];
    const used = new Set();
    while (picks.length < n) {
      const idx = Math.floor(rnd() * pool.length);
      if (used.has(idx)) continue;
      used.add(idx);
      picks.push({
        t: pool[idx].t,
        weight: 8 + rnd() * 30,
        action: rnd() > 0.75 ? (rnd() > 0.5 ? 'CALL' : 'PUT') : null
      });
    }
    const total = picks.reduce((s, p) => s + p.weight, 0);
    picks.forEach((p) => (p.weight = +((p.weight / total) * 100).toFixed(1)));
    picks.sort((a, b) => b.weight - a.weight);
    return {
      positions: 30 + Math.floor(rnd() * 90),
      aum: (2 + rnd() * 80).toFixed(1),
      filed: '2026-05-18',
      period: '2026-03-31',
      picks
    };
  }

  function weekDates() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    const dates = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }

  function generateWeekEvents() {
    const [mon, tue, wed, thu, fri] = weekDates();
    const rnd = seededRandom(hashStr(mon + 'econ'));
    const pct = (base, spread) => (base + rnd() * spread).toFixed(1) + '%';
    const num = (base, spread, suffix) => (base + rnd() * spread).toFixed(1) + suffix;
    const events = [
      { date: mon, time: '10:00', name: 'ISM Manufacturing PMI', impact: 'medium', actual: '—', forecast: num(48, 3, ''), prev: num(47, 3, '') },
      { date: mon, time: '14:00', name: 'Fed Speaker: Williams', impact: 'low', actual: '—', forecast: '—', prev: '—' },
      { date: tue, time: '08:30', name: 'Trade Balance', impact: 'low', actual: '—', forecast: '-$' + num(58, 10, 'B'), prev: '-$' + num(56, 10, 'B') },
      { date: tue, time: '10:00', name: 'JOLTS Job Openings', impact: 'medium', actual: '—', forecast: num(7.4, 0.6, 'M'), prev: num(7.3, 0.6, 'M') },
      { date: wed, time: '08:15', name: 'ADP Employment Change', impact: 'medium', actual: '—', forecast: num(150, 50, 'K'), prev: num(140, 50, 'K') },
      { date: wed, time: '08:30', name: 'Core CPI m/m', impact: 'high', actual: '—', forecast: pct(0.2, 0.2), prev: pct(0.2, 0.2) },
      { date: wed, time: '10:30', name: 'EIA Crude Inventories', impact: 'medium', actual: '—', forecast: num(-2, 4, 'M'), prev: num(-2, 4, 'M') },
      { date: wed, time: '14:00', name: 'FOMC Rate Decision', impact: 'high', actual: '—', forecast: '4.25%', prev: '4.50%' },
      { date: thu, time: '08:30', name: 'Initial Jobless Claims', impact: 'medium', actual: '—', forecast: num(215, 20, 'K'), prev: num(212, 20, 'K') },
      { date: thu, time: '09:45', name: 'S&P Global Services PMI', impact: 'low', actual: '—', forecast: num(53, 2, ''), prev: num(52, 2, '') },
      { date: fri, time: '08:30', name: 'Nonfarm Payrolls', impact: 'high', actual: '—', forecast: num(150, 80, 'K'), prev: num(160, 80, 'K') },
      { date: fri, time: '08:30', name: 'Unemployment Rate', impact: 'high', actual: '—', forecast: pct(4.0, 0.4), prev: pct(4.0, 0.4) },
      { date: fri, time: '10:00', name: 'Michigan Consumer Sentiment', impact: 'medium', actual: '—', forecast: num(65, 10, ''), prev: num(64, 10, '') }
    ];
    return events.map((e) => Object.assign({ country: 'USD' }, e));
  }

  const PREDICTION_MARKETS = [
    { q: 'Fed cuts rates at next meeting', odds: 0.72, vol: '4.2M' },
    { q: 'US recession declared in 2026', odds: 0.14, vol: '2.8M' },
    { q: 'S&P 500 closes above 6,200 by year end', odds: 0.58, vol: '1.9M' },
    { q: 'Oil (WTI) closes above $80 this quarter', odds: 0.22, vol: '980K' },
    { q: 'Government shutdown before year end', odds: 0.31, vol: '1.1M' }
  ];

  global.MockData = {
    SECTORS, STOCKS, FUTURES, ALL_SYMBOLS,
    NEWS_HEADLINES, SOCIAL_VOLUME, FUNDS_13F, PREDICTION_MARKETS,
    getLive, tickAll, generateOHLC, seededRandom, hashStr, fundHoldings, weekDates, generateWeekEvents
  };
})(window);
