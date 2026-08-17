/* Vintage Terminal — panel registry & renderers.
   Every panel tries LiveData first and falls back to MockData on any
   failure (missing key, CORS, network, rate limit) — see live-data.js. */
(function (global) {
  'use strict';
  const M = window.MockData;
  const LD = window.LiveData;

  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function pctSpan(pct) {
    const cls = pct >= 0 ? 'up' : 'down';
    return `<span class="${cls}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>`;
  }
  function money(n) {
    if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    return '$' + n.toFixed(2);
  }
  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    return { ctx, w: rect.width, h: rect.height };
  }

  // ---------- live/mock data helpers ----------
  async function liveQuote(sym) {
    try {
      const q = await LD.getQuote(sym.t);
      if (typeof q.price !== 'number' || Number.isNaN(q.price)) throw new Error('bad quote');
      return { price: q.price, chgPct: q.chgPct, live: true };
    } catch (e) {
      const l = M.getLive(sym);
      return { price: l.price, chgPct: l.chgPct, live: false };
    }
  }
  async function batchQuotes(symbols) {
    const results = await Promise.all(symbols.map(liveQuote));
    const anyLive = results.some((r) => r.live);
    return { results, anyLive };
  }

  const TF_MAP = {
    '1m': { range: '1d', interval: '1m' },
    '30m': { range: '5d', interval: '30m' },
    '1h': { range: '1mo', interval: '60m' },
    D: { range: '3mo', interval: '1d' },
    W: { range: '2y', interval: '1wk' }
  };
  const TF_FALLBACK = {
    '1m': { points: 90, vol: 0.003 }, '30m': { points: 80, vol: 0.006 },
    '1h': { points: 70, vol: 0.009 }, D: { points: 60, vol: 0.018 }, W: { points: 52, vol: 0.035 }
  };
  async function getSeries(symbolStr, tf, fallbackBase) {
    const map = TF_MAP[tf] || TF_MAP.D;
    try {
      const hist = await LD.getHistory(symbolStr, map.range, map.interval);
      if (!hist.length || hist.length < 5) throw new Error('too few points');
      return { data: hist, live: true };
    } catch (e) {
      const fb = TF_FALLBACK[tf] || TF_FALLBACK.D;
      return { data: M.generateOHLC(fallbackBase, fb.points, fb.vol), live: false };
    }
  }

  function tickerOptions(selected) {
    return M.ALL_SYMBOLS.map((s) => `<option value="${s.t}" ${s.t === selected ? 'selected' : ''}>${s.t} — ${s.name}</option>`).join('');
  }

  // ---------- canvas drawing primitives ----------
  function drawLines(canvas, series) {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const all = series.flatMap((s) => s.data);
    if (!all.length) return;
    const lo = Math.min(...all), hi = Math.max(...all);
    const padT = 10, padB = 16, padL = 4, padR = 4;
    const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (h - padT - padB);
    ctx.strokeStyle = 'rgba(255,149,0,0.08)';
    for (let i = 0; i < 4; i++) {
      const gy = padT + (i / 3) * (h - padT - padB);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }
    series.forEach((s) => {
      const n = s.data.length;
      if (n < 2) return;
      const stepX = (w - padL - padR) / (n - 1);
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.beginPath();
      s.data.forEach((v, i) => {
        const x = padL + i * stepX;
        i === 0 ? ctx.moveTo(x, y(v)) : ctx.lineTo(x, y(v));
      });
      ctx.stroke();
    });
  }

  function drawDonut(canvas, slices) {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (w < 8 || h < 8) return;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 4, ir = r * 0.58;
    let start = -Math.PI / 2;
    const colors = ['#ff9500', '#21c675', '#ff4d4f', '#4d9fff', '#c17dff', '#ffd24d', '#5c5a54'];
    slices.forEach((s, i) => {
      const angle = (s.weight / 100) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      start += angle;
    });
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawGauge(canvas, value01, label) {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (w < 40 || h < 40) return;
    const cx = w / 2, cy = h - 14, r = Math.min(w / 2, h) - 20;
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#1a1a1c';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.stroke();
    const grad = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    grad.addColorStop(0, '#ff4d4f'); grad.addColorStop(0.5, '#ffd24d'); grad.addColorStop(1, '#21c675');
    ctx.strokeStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + value01 * Math.PI); ctx.stroke();
    const angle = Math.PI + value01 * Math.PI;
    const nx = cx + Math.cos(angle) * (r - 18), ny = cy + Math.sin(angle) * (r - 18);
    ctx.strokeStyle = '#eae6df'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
    ctx.fillStyle = '#eae6df';
    ctx.font = '600 20px IBM Plex Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy - 16);
    ctx.textAlign = 'left';
  }

  // ---------- individual panel renderers ----------

  function renderQuoteMonitor(body, ctx) {
    const wrap = h(`<div><table class="dtable"><thead><tr><th>Ticker</th><th>Last</th><th>Chg %</th></tr></thead><tbody id="qmBody"></tbody></table></div>`);
    body.appendChild(wrap);
    const tbody = wrap.querySelector('#qmBody');
    const list = M.FUTURES.concat(M.STOCKS.slice(0, 8));
    let alive = true;
    async function paint() {
      const { results, anyLive } = await batchQuotes(list);
      if (!alive) return;
      ctx.setBadge(anyLive ? 'live' : 'sim');
      tbody.innerHTML = list.map((s, i) => `<tr><td>${s.t}</td><td>${results[i].price.toFixed(2)}</td><td>${pctSpan(results[i].chgPct)}</td></tr>`).join('');
    }
    paint();
    const iv = setInterval(paint, 15000);
    return () => { alive = false; clearInterval(iv); };
  }

  function renderOverview(body, ctx) {
    const initial = ctx.config.ticker || 'AAPL';
    const wrap = h(`
      <div>
        <select id="ovSel" style="width:100%;padding:6px;margin-bottom:10px;">${tickerOptions(initial)}</select>
        <div id="ovPrice" style="font-size:22px;margin-bottom:2px;"></div>
        <div id="ovChg" style="margin-bottom:12px;font-size:12px;"></div>
        <canvas id="ovSpark" style="width:100%;height:70px;display:block;margin-bottom:12px;"></canvas>
        <div id="ovStats" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;color:var(--text-secondary);margin-bottom:10px;"></div>
        <p id="ovBlurb" style="font-size:11px;color:var(--text-secondary);line-height:1.5;margin:0;"></p>
      </div>`);
    body.appendChild(wrap);
    const sel = wrap.querySelector('#ovSel');
    let alive = true;
    async function paint() {
      const sym = M.ALL_SYMBOLS.find((s) => s.t === sel.value);
      const q = await liveQuote(sym);
      if (!alive) return;
      ctx.setBadge(q.live ? 'live' : 'sim');
      wrap.querySelector('#ovPrice').innerHTML = `${q.price.toFixed(2)} <span style="font-size:12px;color:var(--text-dim)">USD</span>`;
      wrap.querySelector('#ovChg').innerHTML = pctSpan(q.chgPct) + ` <span style="color:var(--text-dim)">today</span>`;
      const rnd = M.seededRandom(M.hashStr(sym.t + 'stats'));
      const shares = Math.round(rnd() * 8e9 + 1e8);
      wrap.querySelector('#ovStats').innerHTML = `
        <div>Mkt Cap<br><b style="color:var(--text-primary)">${money(q.price * shares)}</b></div>
        <div>P/E<br><b style="color:var(--text-primary)">${(rnd() * 40 + 8).toFixed(1)}</b></div>
        <div>52w Range<br><b style="color:var(--text-primary)">${(q.price * 0.7).toFixed(0)}–${(q.price * 1.25).toFixed(0)}</b></div>
        <div>Avg Vol<br><b style="color:var(--text-primary)">${(rnd() * 40 + 2).toFixed(1)}M</b></div>`;
      wrap.querySelector('#ovBlurb').textContent = `${sym.name} — ${sym.sector}.`;
      const series = await getSeries(sym.t, 'D', q.price);
      if (!alive) return;
      drawLines(wrap.querySelector('#ovSpark'), [{ data: series.data.map((d) => d.c), color: q.chgPct >= 0 ? '#21c675' : '#ff4d4f' }]);
    }
    sel.addEventListener('change', () => { ctx.setConfig({ ticker: sel.value }); paint(); });
    paint();
    const iv = setInterval(paint, 20000);
    return () => { alive = false; clearInterval(iv); };
  }

  function renderChart(body, ctx) {
    const initTicker = ctx.config.ticker || 'NVDA';
    const initTf = ctx.config.tf || 'D';
    const wrap = h(`
      <div style="display:flex;flex-direction:column;height:100%;">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-shrink:0;flex-wrap:wrap;">
          <select id="chSel" style="padding:4px;">${tickerOptions(initTicker)}</select>
          <div style="display:flex;gap:4px;" id="chTf">
            ${['1m', '30m', '1h', 'D', 'W'].map((tf) => `<button data-tf="${tf}" class="btn" style="padding:4px 8px;${tf === initTf ? 'border-color:var(--accent);color:var(--accent)' : ''}">${tf}</button>`).join('')}
          </div>
          <button class="btn" id="chReset" style="padding:4px 8px;margin-left:auto;" title="Reset zoom/pan">⤢ Fit</button>
        </div>
        <div style="position:relative;flex:1;min-height:180px;">
          <div id="chLegend" style="position:absolute;top:2px;left:4px;z-index:5;font-size:11px;line-height:1.6;pointer-events:none;color:var(--text-secondary);white-space:nowrap;"></div>
          <div id="chHost" style="width:100%;height:100%;"></div>
        </div>
      </div>`);
    body.classList.add('no-pad');
    body.style.padding = '10px';
    body.appendChild(wrap);
    const sel = wrap.querySelector('#chSel');
    const host = wrap.querySelector('#chHost');
    const legendEl = wrap.querySelector('#chLegend');
    let tf = initTf;
    let alive = true;
    let chart = null, series = null, lastSym = '', lastBar = null;

    function showLegendBar(bar) {
      if (!bar) { legendEl.innerHTML = ''; return; }
      const chg = bar.close - bar.open;
      const chgPct = bar.open ? (chg / bar.open) * 100 : 0;
      const cls = chg >= 0 ? 'up' : 'down';
      legendEl.innerHTML = `<b style="color:var(--text-primary)">${lastSym}</b> &nbsp;`
        + `O <span style="color:var(--text-primary)">${bar.open.toFixed(2)}</span> `
        + `H <span style="color:var(--text-primary)">${bar.high.toFixed(2)}</span> `
        + `L <span style="color:var(--text-primary)">${bar.low.toFixed(2)}</span> `
        + `C <span style="color:var(--text-primary)">${bar.close.toFixed(2)}</span> `
        + `<span class="${cls}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)</span>`;
    }

    function ensureChart() {
      if (chart) return;
      chart = LightweightCharts.createChart(host, {
        layout: { background: { color: 'transparent' }, textColor: '#9a978f', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 },
        grid: { vertLines: { color: 'rgba(255,149,0,0.07)' }, horzLines: { color: 'rgba(255,149,0,0.07)' } },
        rightPriceScale: { borderColor: '#262119' },
        timeScale: { borderColor: '#262119', timeVisible: true, secondsVisible: false },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: { color: 'rgba(255,149,0,0.5)', labelBackgroundColor: '#ff9500' },
          horzLine: { color: 'rgba(255,149,0,0.5)', labelBackgroundColor: '#ff9500' }
        },
        handleScroll: true,
        handleScale: true
      });
      series = chart.addCandlestickSeries({
        upColor: '#21c675', downColor: '#ff4d4f', borderVisible: false,
        wickUpColor: '#21c675', wickDownColor: '#ff4d4f'
      });
      chart.subscribeCrosshairMove((param) => {
        const bar = param && param.seriesData && series ? param.seriesData.get(series) : null;
        showLegendBar(bar || lastBar);
      });
    }

    async function paint(preserveRange) {
      const sym = M.ALL_SYMBOLS.find((s) => s.t === sel.value);
      const result = await getSeries(sym.t, tf, sym.base);
      if (!alive) return;
      ctx.setBadge(result.live ? 'live' : 'sim');
      ensureChart();
      const range = preserveRange ? chart.timeScale().getVisibleLogicalRange() : null;
      const bars = result.data.map((d) => ({ time: Math.floor(d.t / 1000), open: d.o, high: d.h, low: d.l, close: d.c }));
      series.setData(bars);
      if (range) chart.timeScale().setVisibleLogicalRange(range);
      else chart.timeScale().fitContent();
      lastSym = sym.t;
      lastBar = bars[bars.length - 1];
      showLegendBar(lastBar);
    }

    sel.addEventListener('change', () => { ctx.setConfig({ ticker: sel.value }); paint(false); });
    wrap.querySelectorAll('[data-tf]').forEach((btn) => {
      btn.addEventListener('click', () => {
        tf = btn.dataset.tf;
        ctx.setConfig({ tf });
        wrap.querySelectorAll('[data-tf]').forEach((b) => { b.style.borderColor = ''; b.style.color = ''; });
        btn.style.borderColor = 'var(--accent)'; btn.style.color = 'var(--accent)';
        paint(false);
      });
    });
    wrap.querySelector('#chReset').addEventListener('click', () => { if (chart) chart.timeScale().fitContent(); });

    paint(false);
    const iv = setInterval(() => paint(true), 20000);
    const ro = new ResizeObserver(() => { if (chart) chart.resize(host.clientWidth, host.clientHeight); });
    ro.observe(host);
    return () => { alive = false; clearInterval(iv); ro.disconnect(); if (chart) chart.remove(); };
  }

  function renderCompareChart(body, ctx) {
    const tA = ctx.config.a || 'AAPL', tB = ctx.config.b || 'MSFT';
    const wrap = h(`
      <div style="display:flex;flex-direction:column;height:100%;">
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-shrink:0;">
          <select id="ccA" style="flex:1;padding:4px;">${tickerOptions(tA)}</select>
          <select id="ccB" style="flex:1;padding:4px;">${tickerOptions(tB)}</select>
        </div>
        <canvas id="ccCanvas" style="flex:1;width:100%;min-height:180px;"></canvas>
        <div style="display:flex;gap:14px;margin-top:6px;font-size:11px;flex-shrink:0;">
          <span style="color:#ff9500">■ <span id="ccALabel"></span></span>
          <span style="color:#4d9fff">■ <span id="ccBLabel"></span></span>
        </div>
      </div>`);
    body.appendChild(wrap);
    const selA = wrap.querySelector('#ccA'), selB = wrap.querySelector('#ccB');
    const canvas = wrap.querySelector('#ccCanvas');
    let alive = true;
    function normalize(data) {
      const base = data[0].c;
      return data.map((d) => ((d.c - base) / base) * 100);
    }
    async function paint() {
      const symA = M.ALL_SYMBOLS.find((s) => s.t === selA.value);
      const symB = M.ALL_SYMBOLS.find((s) => s.t === selB.value);
      const [sa, sb] = await Promise.all([getSeries(symA.t, 'D', symA.base), getSeries(symB.t, 'D', symB.base)]);
      if (!alive) return;
      ctx.setBadge(sa.live && sb.live ? 'live' : (sa.live || sb.live) ? 'live' : 'sim');
      const a = normalize(sa.data), b = normalize(sb.data);
      drawLines(canvas, [{ data: a, color: '#ff9500' }, { data: b, color: '#4d9fff' }]);
      wrap.querySelector('#ccALabel').textContent = `${symA.t} ${a[a.length - 1] >= 0 ? '+' : ''}${a[a.length - 1].toFixed(2)}%`;
      wrap.querySelector('#ccBLabel').textContent = `${symB.t} ${b[b.length - 1] >= 0 ? '+' : ''}${b[b.length - 1].toFixed(2)}%`;
    }
    selA.addEventListener('change', () => { ctx.setConfig({ a: selA.value }); paint(); });
    selB.addEventListener('change', () => { ctx.setConfig({ b: selB.value }); paint(); });
    paint();
    const ro = new ResizeObserver(paint); ro.observe(canvas);
    return () => { alive = false; ro.disconnect(); };
  }

  function heatColor(pct) {
    const t = Math.max(-1, Math.min(1, pct / 3));
    if (t >= 0) return `rgba(33, ${Math.round(80 + t * 140)}, 117, ${0.3 + t * 0.55})`;
    return `rgba(${Math.round(90 + -t * 140)}, 40, 55, ${0.3 + -t * 0.55})`;
  }

  function renderHeatmap(body, ctx) {
    const wrap = h(`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:5px;height:100%;align-content:start;" id="hmGrid"></div>`);
    body.appendChild(wrap);
    let alive = true;
    async function paint() {
      const { results, anyLive } = await batchQuotes(M.ALL_SYMBOLS);
      if (!alive) return;
      ctx.setBadge(anyLive ? 'live' : 'sim');
      wrap.innerHTML = M.ALL_SYMBOLS.map((s, i) => `<div style="background:${heatColor(results[i].chgPct)};border-radius:2px;padding:8px 6px;font-size:10px;">
          <b style="display:block;font-size:12px;color:var(--text-primary)">${s.t}</b>
          ${results[i].chgPct >= 0 ? '+' : ''}${results[i].chgPct.toFixed(2)}%
        </div>`).join('');
    }
    paint();
    const iv = setInterval(paint, 20000);
    return () => { alive = false; clearInterval(iv); };
  }

  function renderSectorPerformance(body, ctx) {
    const wrap = h(`<div id="spList"></div>`);
    body.appendChild(wrap);
    let alive = true;
    async function paint() {
      const { results, anyLive } = await batchQuotes(M.STOCKS);
      if (!alive) return;
      ctx.setBadge(anyLive ? 'live' : 'sim');
      const bySector = {};
      M.STOCKS.forEach((s, i) => (bySector[s.sector] = bySector[s.sector] || []).push(results[i].chgPct));
      const rows = Object.entries(bySector).map(([sec, arr]) => ({ sec, avg: arr.reduce((a, b) => a + b, 0) / arr.length }));
      rows.sort((a, b) => b.avg - a.avg);
      const maxAbs = Math.max(...rows.map((r) => Math.abs(r.avg)), 1);
      wrap.innerHTML = rows.map((r) => `
        <div class="bar-row">
          <div class="bar-row__label">${r.sec}</div>
          <div class="bar-row__track"><div class="bar-row__fill" style="width:${(Math.abs(r.avg) / maxAbs) * 100}%;background:${r.avg >= 0 ? 'var(--green)' : 'var(--red)'};margin-left:${r.avg < 0 ? 'auto' : 0}"></div></div>
          <div class="bar-row__value">${pctSpan(r.avg)}</div>
        </div>`).join('');
    }
    paint();
    const iv = setInterval(paint, 20000);
    return () => { alive = false; clearInterval(iv); };
  }

  function renderTopMovers(body, ctx) {
    const wrap = h(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;height:100%;">
      <div><div class="mono-label" style="margin-bottom:6px;color:var(--green)">Gainers</div><div id="tmUp"></div></div>
      <div><div class="mono-label" style="margin-bottom:6px;color:var(--red)">Losers</div><div id="tmDown"></div></div>
    </div>`);
    body.appendChild(wrap);
    let alive = true;
    function row(sym, r) { return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--hairline);font-size:11px;"><span>${sym.t}</span>${pctSpan(r.chgPct)}</div>`; }
    async function paint() {
      const { results, anyLive } = await batchQuotes(M.ALL_SYMBOLS);
      if (!alive) return;
      ctx.setBadge(anyLive ? 'live' : 'sim');
      const paired = M.ALL_SYMBOLS.map((s, i) => ({ s, r: results[i] })).sort((a, b) => b.r.chgPct - a.r.chgPct);
      wrap.querySelector('#tmUp').innerHTML = paired.slice(0, 6).map((p) => row(p.s, p.r)).join('');
      wrap.querySelector('#tmDown').innerHTML = paired.slice(-6).reverse().map((p) => row(p.s, p.r)).join('');
    }
    paint();
    const iv = setInterval(paint, 20000);
    return () => { alive = false; clearInterval(iv); };
  }

  const COT_FRAGMENTS = {
    'ES=F': 'S%26P 500', 'NQ=F': 'NASDAQ', 'CL=F': 'CRUDE OIL', 'GC=F': 'GOLD',
    'SI=F': 'SILVER', 'ZC=F': 'CORN', 'ZN=F': 'TREASURY NOTES', 'NG=F': 'NATURAL GAS', '6E=F': 'EURO FX'
  };
  function renderCOT(body, ctx) {
    const wrap = h(`<div id="cotList"></div>`);
    body.appendChild(wrap);
    let alive = true;
    async function paint() {
      let anyLive = false;
      const rowsHtml = [];
      for (const f of M.FUTURES) {
        let comm, nonComm;
        try {
          const real = await LD.getCOT(COT_FRAGMENTS[f.t] || f.name);
          comm = real.commercialNet; nonComm = real.nonCommercialNet;
          anyLive = true;
        } catch (e) {
          const rnd = M.seededRandom(M.hashStr(f.t + 'cot'));
          comm = Math.round((rnd() - 0.5) * 200000);
          nonComm = Math.round((rnd() - 0.4) * 180000);
        }
        const total = Math.abs(comm) + Math.abs(nonComm) || 1;
        rowsHtml.push(`
          <div style="margin-bottom:12px;">
            <div style="font-size:11px;margin-bottom:4px;"><b>${f.t} — ${f.name}</b></div>
            <div style="display:flex;height:8px;border-radius:3px;overflow:hidden;">
              <div style="width:${(Math.abs(comm) / total) * 100}%;background:var(--accent);"></div>
              <div style="width:${(Math.abs(nonComm) / total) * 100}%;background:#4d9fff;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim);margin-top:3px;">
              <span>Commercial ${comm >= 0 ? '+' : ''}${comm.toLocaleString()}</span>
              <span>Non-Comm ${nonComm >= 0 ? '+' : ''}${nonComm.toLocaleString()}</span>
            </div>
          </div>`);
      }
      if (!alive) return;
      ctx.setBadge(anyLive ? 'live' : 'sim');
      wrap.innerHTML = rowsHtml.join('');
    }
    paint();
    const iv = setInterval(paint, 12 * 3600000);
    return () => { alive = false; clearInterval(iv); };
  }

  function renderSocialVolume(body, ctx) {
    const wrap = h(`<table class="dtable"><thead><tr><th>#</th><th>Ticker</th><th>Name</th><th>Mentions</th><th>Chg</th></tr></thead><tbody></tbody></table>`);
    body.appendChild(wrap);
    const tbody = wrap.querySelector('tbody');
    let alive = true;
    async function paint() {
      let rows, live = true;
      try {
        rows = await LD.getSocialVolume();
        if (!rows.length) throw new Error('empty');
      } catch (e) {
        rows = M.SOCIAL_VOLUME.map((r) => ({ t: r.t, name: (M.ALL_SYMBOLS.find((s) => s.t === r.t) || {}).name || '', mentions: r.mentions, chg: r.chg * 100 }));
        live = false;
      }
      if (!alive) return;
      ctx.setBadge(live ? 'live' : 'sim');
      tbody.innerHTML = rows.map((row, i) => `<tr><td>${i + 1}</td><td><b>${row.t}</b></td><td style="color:var(--text-dim)">${row.name || ''}</td><td>${row.mentions}</td><td>${pctSpan(row.chg)}</td></tr>`).join('');
    }
    paint();
    const iv = setInterval(paint, 5 * 60000);
    return () => { alive = false; clearInterval(iv); };
  }

  function renderPredictionMarkets(body) {
    const wrap = h(`<div></div>`);
    body.appendChild(wrap);
    wrap.innerHTML = M.PREDICTION_MARKETS.map((p) => `
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;margin-bottom:5px;">${p.q}</div>
        <div class="bar-row" style="margin-bottom:2px;">
          <div class="bar-row__track"><div class="bar-row__fill" style="width:${p.odds * 100}%;background:var(--accent);"></div></div>
          <div class="bar-row__value">${Math.round(p.odds * 100)}%</div>
        </div>
        <div style="font-size:10px;color:var(--text-dim);">Vol ${p.vol}</div>
      </div>`).join('');
  }

  function renderSeasonality(body, ctx) {
    const initial = ctx.config.ticker || 'SPY';
    const wrap = h(`<div><select id="seSel" style="width:100%;padding:6px;margin-bottom:10px;">${tickerOptions(initial)}</select><canvas id="seCanvas" style="width:100%;height:170px;"></canvas></div>`);
    body.appendChild(wrap);
    const sel = wrap.querySelector('#seSel');
    const canvas = wrap.querySelector('#seCanvas');
    const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    let alive = true;
    async function paint() {
      const symTicker = sel.value;
      let vals, live = true;
      try {
        const hist = await LD.getHistory(symTicker, '10y', '1mo');
        if (hist.length < 24) throw new Error('too little history');
        const byMonth = Array.from({ length: 12 }, () => []);
        for (let i = 1; i < hist.length; i++) {
          const ret = ((hist[i].c - hist[i - 1].c) / hist[i - 1].c) * 100;
          byMonth[new Date(hist[i].t).getMonth()].push(ret);
        }
        vals = byMonth.map((arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0));
      } catch (e) {
        const rnd = M.seededRandom(M.hashStr(symTicker + 'season'));
        vals = months.map(() => (rnd() - 0.42) * 6);
        live = false;
      }
      if (!alive) return;
      ctx.setBadge(live ? 'live' : 'sim');
      const { ctx: c2, w, h: hh } = fitCanvas(canvas);
      c2.clearRect(0, 0, w, hh);
      const max = Math.max(...vals.map(Math.abs), 1);
      const bw = w / vals.length;
      const zero = hh / 2;
      vals.forEach((v, i) => {
        const bh = (Math.abs(v) / max) * (hh / 2 - 16);
        c2.fillStyle = v >= 0 ? '#21c675' : '#ff4d4f';
        c2.fillRect(i * bw + bw * 0.2, v >= 0 ? zero - bh : zero, bw * 0.6, bh);
        c2.fillStyle = '#5c5a54';
        c2.font = '10px IBM Plex Mono, monospace';
        c2.fillText(months[i], i * bw + bw * 0.4, hh - 4);
      });
      c2.strokeStyle = 'rgba(255,149,0,0.2)';
      c2.beginPath(); c2.moveTo(0, zero); c2.lineTo(w, zero); c2.stroke();
    }
    sel.addEventListener('change', () => { ctx.setConfig({ ticker: sel.value }); paint(); });
    paint();
    const ro = new ResizeObserver(paint); ro.observe(canvas);
    return () => { alive = false; ro.disconnect(); };
  }

  function renderCustomIndex(body, ctx) {
    const wrap = h(`
      <div style="display:flex;flex-direction:column;height:100%;">
        <div id="ciRows" style="margin-bottom:8px;flex-shrink:0;"></div>
        <button class="btn" id="ciAdd" style="align-self:flex-start;margin-bottom:8px;padding:4px 10px;font-size:11px;">+ Add ticker</button>
        <canvas id="ciCanvas" style="flex:1;width:100%;min-height:120px;"></canvas>
      </div>`);
    body.appendChild(wrap);
    const rowsEl = wrap.querySelector('#ciRows');
    const canvas = wrap.querySelector('#ciCanvas');
    let rows = ctx.config.rows || [{ t: 'AAPL', w: 40 }, { t: 'MSFT', w: 35 }, { t: 'NVDA', w: 25 }];
    let alive = true;
    function paintRows() {
      rowsEl.innerHTML = '';
      rows.forEach((r) => {
        const rowEl = h(`<div style="display:flex;gap:6px;margin-bottom:5px;">
          <select style="flex:1;padding:3px;font-size:11px;">${tickerOptions(r.t)}</select>
          <input type="number" value="${r.w}" style="width:56px;padding:3px;font-size:11px;" min="0" max="100">
        </div>`);
        rowEl.querySelector('select').addEventListener('change', (e) => { r.t = e.target.value; ctx.setConfig({ rows }); paintChart(); });
        rowEl.querySelector('input').addEventListener('input', (e) => { r.w = +e.target.value; ctx.setConfig({ rows }); paintChart(); });
        rowsEl.appendChild(rowEl);
      });
    }
    async function paintChart() {
      const totalW = rows.reduce((a, r) => a + r.w, 0) || 1;
      const series = await Promise.all(rows.map(async (r) => {
        const sym = M.ALL_SYMBOLS.find((s) => s.t === r.t);
        const s = await getSeries(sym.t, 'D', sym.base);
        return s.data.map((d) => d.c);
      }));
      if (!alive) return;
      const n = Math.min(...series.map((s) => s.length));
      const combined = [];
      for (let i = 0; i < n; i++) {
        let val = 0;
        rows.forEach((r, idx) => { val += (series[idx][i] / series[idx][0]) * (r.w / totalW); });
        combined.push((val - 1) * 100);
      }
      drawLines(canvas, [{ data: combined, color: '#ff9500' }]);
    }
    wrap.querySelector('#ciAdd').addEventListener('click', () => {
      if (rows.length >= 6) return;
      rows.push({ t: 'GOOGL', w: 10 });
      ctx.setConfig({ rows });
      paintRows(); paintChart();
    });
    paintRows(); paintChart();
    const ro = new ResizeObserver(paintChart); ro.observe(canvas);
    return () => { alive = false; ro.disconnect(); };
  }

  function renderLiveNews(body, ctx) {
    const wrap = h(`<div id="lnList" style="display:flex;flex-direction:column;gap:12px;"></div>`);
    body.appendChild(wrap);
    let alive = true;
    async function paint() {
      let items, live = true;
      try {
        items = await LD.getNews();
        if (!items.length) throw new Error('empty');
      } catch (e) {
        items = M.NEWS_HEADLINES;
        live = false;
      }
      if (!alive) return;
      ctx.setBadge(live ? 'live' : 'sim');
      wrap.innerHTML = items.slice(0, 24).map((n) => {
        const url = n.url || 'https://news.google.com/search?q=' + encodeURIComponent(n.text);
        return `
        <a href="${url}" target="_blank" rel="noopener" class="news-link" style="display:block;border-left:2px solid var(--accent-dim);padding-left:8px;color:inherit;">
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;">${n.cat} · ${n.region}</div>
          <div style="font-size:13px;">${n.text}</div>
        </a>`;
      }).join('');
    }
    paint();
    const iv = setInterval(paint, 2 * 60000);
    return () => { alive = false; clearInterval(iv); };
  }

  function impactDot(impact) {
    const color = impact === 'high' ? 'var(--red)' : impact === 'medium' ? 'var(--accent)' : 'var(--text-dim)';
    return `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:5px;"></span>`;
  }

  function renderEconCalendar(body, ctx) {
    const wrap = h(`<table class="dtable"><thead><tr><th>Time</th><th>Event</th><th>Actual</th><th>Fcst</th><th>Prev</th></tr></thead><tbody></tbody></table>`);
    body.appendChild(wrap);
    let alive = true;
    async function paint() {
      let rows, live = true;
      try {
        rows = await LD.getEconCalendar();
        if (!rows.length) throw new Error('empty');
      } catch (e) {
        rows = M.ECON_EVENTS; live = false;
      }
      if (!alive) return;
      ctx.setBadge(live ? 'live' : 'sim');
      wrap.querySelector('tbody').innerHTML = rows.map((e) => `
        <tr><td>${e.time}</td><td>${impactDot(e.impact)}${e.name}</td><td>${e.actual}</td><td>${e.forecast}</td><td>${e.prev}</td></tr>`).join('');
    }
    paint();
    const iv = setInterval(paint, 3600000);
    return () => { alive = false; clearInterval(iv); };
  }

  function render13F(body) {
    const wrap = h(`
      <div style="display:flex;flex-direction:column;height:100%;">
        <input id="whSearch" placeholder="Search fund by name or CIK" style="width:100%;padding:6px;margin-bottom:8px;flex-shrink:0;">
        <div id="whTags" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;flex-shrink:0;max-height:90px;overflow:auto;"></div>
        <div id="whDetail" style="flex:1;overflow:auto;"></div>
      </div>`);
    body.appendChild(wrap);
    const tagsEl = wrap.querySelector('#whTags');
    const detailEl = wrap.querySelector('#whDetail');
    const searchEl = wrap.querySelector('#whSearch');

    function paintTags(filter) {
      const funds = M.FUNDS_13F.filter((f) => !filter || f.toLowerCase().includes(filter.toLowerCase()));
      tagsEl.innerHTML = funds.map((f) => `<button class="pill" data-fund="${f}" style="cursor:pointer;background:none;">${f.toUpperCase()}</button>`).join('');
      tagsEl.querySelectorAll('[data-fund]').forEach((btn) => btn.addEventListener('click', () => selectFund(btn.dataset.fund)));
    }
    function selectFund(name) {
      const data = M.fundHoldings(name);
      detailEl.innerHTML = `
        <div style="font-weight:600;color:var(--accent);margin-bottom:2px;">${name} <span class="pill" style="border-color:var(--text-dim);color:var(--text-dim);margin-left:4px;">SIM</span></div>
        <div style="font-size:10px;color:var(--text-dim);margin-bottom:10px;">Period ${data.period} · Filed ${data.filed} · ${data.positions} positions · $${data.aum}B AUM</div>
        <div style="display:flex;gap:14px;align-items:center;">
          <canvas id="whDonut" width="120" height="120" style="width:120px;height:120px;flex-shrink:0;"></canvas>
          <div style="flex:1;font-size:11px;">
            ${data.picks.map((p) => `<div style="display:flex;justify-content:space-between;padding:2px 0;">
              <span>${p.t} ${p.action ? `<span class="pill" style="color:var(--red);border-color:var(--red-dim);margin-left:4px;">${p.action}</span>` : ''}</span>
              <span>${p.weight}%</span>
            </div>`).join('')}
          </div>
        </div>`;
      drawDonut(detailEl.querySelector('#whDonut'), data.picks);
    }
    searchEl.addEventListener('input', (e) => paintTags(e.target.value));
    paintTags('');
    selectFund('Berkshire Hathaway');
  }

  function renderRiskCalc(body) {
    const wrap = h(`
      <div style="display:flex;flex-direction:column;gap:8px;font-size:11px;">
        <label>Account Size<input id="rcAcct" type="number" value="10000" style="width:100%;padding:5px;margin-top:3px;"></label>
        <label>Risk %<input id="rcRisk" type="number" value="1" style="width:100%;padding:5px;margin-top:3px;"></label>
        <label>Entry<input id="rcEntry" type="number" value="100" style="width:100%;padding:5px;margin-top:3px;"></label>
        <label>Stop<input id="rcStop" type="number" value="97" style="width:100%;padding:5px;margin-top:3px;"></label>
        <div style="margin-top:8px;border-top:1px solid var(--hairline);padding-top:10px;">
          <div>$ at Risk: <b id="rcDollar" style="color:var(--accent)"></b></div>
          <div>Position Size: <b id="rcShares" style="color:var(--accent)"></b> shares/contracts</div>
        </div>
      </div>`);
    body.appendChild(wrap);
    function paint() {
      const acct = +wrap.querySelector('#rcAcct').value || 0;
      const risk = (+wrap.querySelector('#rcRisk').value || 0) / 100;
      const entry = +wrap.querySelector('#rcEntry').value || 0;
      const stop = +wrap.querySelector('#rcStop').value || 0;
      const dollarRisk = acct * risk;
      const perShare = Math.abs(entry - stop) || 1;
      wrap.querySelector('#rcDollar').textContent = '$' + dollarRisk.toFixed(2);
      wrap.querySelector('#rcShares').textContent = Math.floor(dollarRisk / perShare).toLocaleString();
    }
    wrap.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', paint));
    paint();
  }

  function renderMarketMood(body, ctx) {
    const wrap = h(`<div style="text-align:center;"><canvas id="mmGauge" style="width:100%;height:120px;"></canvas><div class="mono-label" style="margin-top:6px;">Market Breadth</div></div>`);
    body.appendChild(wrap);
    const canvas = wrap.querySelector('#mmGauge');
    let alive = true;
    async function paint() {
      const { results, anyLive } = await batchQuotes(M.ALL_SYMBOLS);
      if (!alive) return;
      ctx.setBadge(anyLive ? 'live' : 'sim');
      const up = results.filter((r) => r.chgPct >= 0).length;
      const value = up / results.length;
      const label = value < 0.35 ? 'Risk-Off' : value < 0.65 ? 'Neutral' : 'Risk-On';
      drawGauge(canvas, value, label);
    }
    paint();
    const iv = setInterval(paint, 20000);
    const ro = new ResizeObserver(paint); ro.observe(canvas);
    return () => { alive = false; clearInterval(iv); ro.disconnect(); };
  }

  function renderNotes(body, ctx) {
    const wrap = h(`<textarea id="ntArea" placeholder="Scratchpad… saved locally" style="width:100%;height:100%;resize:none;padding:8px;font-size:12px;line-height:1.5;"></textarea>`);
    body.appendChild(wrap);
    const ta = wrap.querySelector('#ntArea');
    const key = 'vt-notes-' + ctx.uid;
    ta.value = localStorage.getItem(key) || '';
    ta.addEventListener('input', () => localStorage.setItem(key, ta.value));
  }

  const PANEL_DEFS = [
    { id: 'quote-monitor', code: 'QM', category: 'Markets', title: 'Quote Monitor', desc: 'Live watchlist', size: 'md', render: renderQuoteMonitor },
    { id: 'overview', code: 'OV', category: 'Markets', title: 'Overview', desc: 'Company at a glance', size: 'md', render: renderOverview },
    { id: 'chart', code: 'CH', category: 'Markets', title: 'Chart', desc: 'Price chart', size: 'lg', render: renderChart },
    { id: 'compare-chart', code: 'CC', category: 'Markets', title: 'Compare Chart', desc: 'Two-ticker overlay', size: 'lg', render: renderCompareChart },
    { id: 'heatmap', code: 'HM', category: 'Markets', title: 'Heatmap', desc: 'Market map', size: 'lg', render: renderHeatmap },
    { id: 'sector-performance', code: 'SP', category: 'Markets', title: 'Sector Performance', desc: 'Sector moves', size: 'md', render: renderSectorPerformance },
    { id: 'top-movers', code: 'TM', category: 'Markets', title: 'Top Movers', desc: 'Gainers, losers', size: 'md', render: renderTopMovers },
    { id: 'cot-positioning', code: 'CT', category: 'Markets', title: 'COT Positioning', desc: 'Futures CoT', size: 'md', render: renderCOT },
    { id: 'social-volume', code: 'SV', category: 'Markets', title: 'Social Volume', desc: 'Reddit mentions', size: 'md', render: renderSocialVolume },
    { id: 'prediction-markets', code: 'PM', category: 'Markets', title: 'Prediction Markets', desc: 'Polymarket / Kalshi odds', size: 'md', render: renderPredictionMarkets },
    { id: 'seasonality', code: 'SE', category: 'Markets', title: 'Seasonality', desc: 'Monthly return pattern', size: 'md', render: renderSeasonality },
    { id: 'custom-index', code: 'CI', category: 'Markets', title: 'Custom Index', desc: 'Weighted basket', size: 'md', render: renderCustomIndex },
    { id: 'live-news', code: 'LN', category: 'News', title: 'Live News', desc: 'Wire headlines', size: 'md', render: renderLiveNews },
    { id: 'economic-calendar', code: 'EC', category: 'News', title: 'Economic Calendar', desc: 'Macro data drops', size: 'md', render: renderEconCalendar },
    { id: 'whales-13f', code: 'WH', category: 'Community', title: '13F Whales', desc: 'Institutional filings', size: 'lg', render: render13F },
    { id: 'risk-calculator', code: 'RC', category: 'Community', title: 'Risk Calculator', desc: 'Position sizing', size: 'sm', render: renderRiskCalc },
    { id: 'market-mood', code: 'MM', category: 'Community', title: 'Market Mood', desc: 'Sentiment gauge', size: 'sm', render: renderMarketMood },
    { id: 'notes', code: 'NO', category: 'Community', title: 'Notes', desc: 'Scratchpad', size: 'sm', render: renderNotes }
  ];

  global.PanelRegistry = { PANEL_DEFS };
})(window);
