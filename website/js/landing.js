(function () {
  'use strict';
  const M = window.MockData;

  document.getElementById('year').textContent = new Date().getFullYear();

  // Ticker tape
  const track = document.getElementById('tickerTrack');
  function buildTicker() {
    const items = M.ALL_SYMBOLS.map((s) => {
      const live = M.getLive(s);
      const cls = live.chgPct >= 0 ? 'up' : 'down';
      const arrow = live.chgPct >= 0 ? '▲' : '▼';
      return `<span><b>${s.t}</b>${live.price.toFixed(2)} <span class="${cls}">${arrow} ${Math.abs(live.chgPct).toFixed(2)}%</span></span>`;
    }).join('');
    track.innerHTML = items + items; // duplicate for seamless loop
  }
  buildTicker();
  setInterval(() => { M.tickAll(); }, 2000);

  // Mini candlestick chart preview
  const canvas = document.getElementById('pvChart');
  function drawChart() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const data = M.generateOHLC(138.2, 60, 0.012);
    const lo = Math.min(...data.map((d) => d.l));
    const hi = Math.max(...data.map((d) => d.h));
    const pad = 6;
    const cw = w / data.length;
    const y = (p) => pad + (1 - (p - lo) / (hi - lo)) * (h - pad * 2);

    ctx.strokeStyle = 'rgba(255,149,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const gy = pad + (i / 3) * (h - pad * 2);
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    data.forEach((d, i) => {
      const x = i * cw + cw / 2;
      const up = d.c >= d.o;
      ctx.strokeStyle = up ? '#21c675' : '#ff4d4f';
      ctx.fillStyle = up ? '#21c675' : '#ff4d4f';
      ctx.beginPath();
      ctx.moveTo(x, y(d.h)); ctx.lineTo(x, y(d.l));
      ctx.stroke();
      const bodyTop = y(Math.max(d.o, d.c));
      const bodyH = Math.max(1.5, Math.abs(y(d.o) - y(d.c)));
      ctx.fillRect(x - cw * 0.32, bodyTop, cw * 0.64, bodyH);
    });
  }
  drawChart();
  window.addEventListener('resize', drawChart);

  // Heatmap preview
  const heatmapEl = document.getElementById('pvHeatmap');
  function colorFor(pct) {
    const t = Math.max(-1, Math.min(1, pct / 3));
    if (t >= 0) {
      const g = Math.round(40 + t * 150);
      return `rgba(33, ${g}, 117, ${0.35 + t * 0.5})`;
    }
    const r = Math.round(80 + -t * 150);
    return `rgba(${r}, 40, 50, ${0.35 + -t * 0.5})`;
  }
  function buildHeatmap() {
    const picks = M.STOCKS.slice(0, 8);
    heatmapEl.innerHTML = picks.map((s) => {
      const live = M.getLive(s);
      return `<div class="pv-tile" style="background:${colorFor(live.chgPct)}"><b>${s.t}</b>${live.chgPct >= 0 ? '+' : ''}${live.chgPct.toFixed(2)}%</div>`;
    }).join('');
  }
  buildHeatmap();

  // Quote monitor preview
  const quotesEl = document.getElementById('pvQuotes');
  function buildQuotes() {
    const picks = M.STOCKS.slice(2, 8);
    quotesEl.innerHTML = picks.map((s) => {
      const live = M.getLive(s);
      const cls = live.chgPct >= 0 ? 'up' : 'down';
      return `<tr><td>${s.t}</td><td>${live.price.toFixed(2)}</td><td class="${cls}">${live.chgPct >= 0 ? '+' : ''}${live.chgPct.toFixed(2)}%</td></tr>`;
    }).join('');
  }
  buildQuotes();

  // News preview
  const newsEl = document.getElementById('pvNews');
  function buildNews() {
    const picks = M.NEWS_HEADLINES.slice(0, 5);
    newsEl.innerHTML = picks.map((n) => `<li><b>${n.cat} · ${n.region}</b>${n.text}</li>`).join('');
  }
  buildNews();

  setInterval(() => {
    buildTicker();
    drawChart();
    buildHeatmap();
    buildQuotes();
  }, 2200);
})();
