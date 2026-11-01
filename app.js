(function () {
  'use strict';

  var S = window.Solar;
  var DAY = S.DAY_MS;
  var $ = function (s) { return document.querySelector(s); };

  var CITIES = [
    { n: 'Reykjavík',    lat: 64.15,  lon: -21.94,  tz: 'Atlantic/Reykjavik' },
    { n: 'London',       lat: 51.51,  lon: -0.13,   tz: 'Europe/London' },
    { n: 'Madrid',       lat: 40.42,  lon: -3.70,   tz: 'Europe/Madrid' },
    { n: 'Istanbul',     lat: 41.01,  lon: 28.98,   tz: 'Europe/Istanbul' },
    { n: 'Mumbai',       lat: 19.08,  lon: 72.88,   tz: 'Asia/Kolkata' },
    { n: 'Ürümqi',       lat: 43.83,  lon: 87.62,   tz: 'Asia/Urumqi' },
    { n: 'Beijing',      lat: 39.90,  lon: 116.41,  tz: 'Asia/Shanghai' },
    { n: 'Tokyo',        lat: 35.68,  lon: 139.69,  tz: 'Asia/Tokyo' },
    { n: 'Sydney',       lat: -33.87, lon: 151.21,  tz: 'Australia/Sydney' },
    { n: 'Honolulu',     lat: 21.31,  lon: -157.86, tz: 'Pacific/Honolulu' },
    { n: 'Los Angeles',  lat: 34.05,  lon: -118.24, tz: 'America/Los_Angeles' },
    { n: 'Denver',       lat: 39.74,  lon: -104.99, tz: 'America/Denver' },
    { n: 'Chicago',      lat: 41.88,  lon: -87.63,  tz: 'America/Chicago' },
    { n: 'New York',     lat: 40.71,  lon: -74.01,  tz: 'America/New_York' },
    { n: 'São Paulo',    lat: -23.55, lon: -46.63,  tz: 'America/Sao_Paulo' }
  ];

  var state = { lat: 51.51, lon: -0.13, place: 'London', mode: 'mean', gps: false };

  /* ---------- formatting ---------- */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function hmsParts(ms) {
    var d = new Date(ms);
    return [p2(d.getUTCHours()), p2(d.getUTCMinutes()), p2(d.getUTCSeconds())];
  }
  function hm(ms) { var a = hmsParts(ms); return a[0] + ':' + a[1]; }
  function hmsStr(ms) { return hmsParts(ms).join(':'); }
  function hoursToHM(h) {
    var tot = Math.round(h * 60), hh = Math.floor(tot / 60), mm = tot % 60;
    return hh + 'h ' + p2(mm) + 'm';
  }
  function fmtDelta(ms) {
    var sign = ms < 0 ? '−' : '+';
    var t = Math.round(Math.abs(ms) / 1000);
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    if (h) return sign + h + 'h ' + p2(m) + 'm';
    return sign + m + 'm ' + p2(s) + 's';
  }
  function fmtCoord(v, pos, neg) { return Math.abs(v).toFixed(2) + '° ' + (v >= 0 ? pos : neg); }
  function modMs(x) { return ((x % DAY) + DAY) % DAY; }

  /* ---------- device / zone clocks ---------- */
  var deviceTz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
  var fmtCache = {};
  function zoneFmt(tz) {
    if (!fmtCache[tz]) {
      fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
      });
    }
    return fmtCache[tz];
  }
  // "Wall-clock ms": the zone's local time encoded as if it were UTC, so hmsStr() works on it.
  function zoneWallMs(tz, utcMs) {
    var o = {};
    zoneFmt(tz).formatToParts(new Date(utcMs)).forEach(function (p) { o[p.type] = +p.value; });
    return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) + (utcMs % 1000);
  }
  function zoneAbbrev(tz, utcMs) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(utcMs));
      var z = parts.filter(function (p) { return p.type === 'timeZoneName'; })[0];
      return z ? z.value : tz;
    } catch (e) { return tz; }
  }

  /* ---------- sky colour from sun altitude ---------- */
  var SKY = [ // alt, top, bottom
    [-18, [7, 11, 26],   [13, 19, 48]],
    [-8,  [24, 24, 62],  [58, 36, 84]],
    [-1,  [58, 40, 86],  [190, 98, 66]],
    [6,   [44, 78, 118], [214, 140, 82]],
    [20,  [34, 86, 128], [62, 124, 160]],
    [90,  [30, 82, 124], [52, 114, 152]]
  ];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function skyAt(alt) {
    var i = 0;
    while (i < SKY.length - 2 && alt > SKY[i + 1][0]) i++;
    var a = SKY[i], b = SKY[i + 1];
    var t = Math.max(0, Math.min(1, (alt - a[0]) / (b[0] - a[0])));
    function mix(k) { return 'rgb(' + [0, 1, 2].map(function (c) { return Math.round(lerp(a[k][c], b[k][c], t)); }).join(',') + ')'; }
    return { top: mix(1), bot: mix(2) };
  }

  /* ---------- location + url hash ---------- */
  function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function readHash() {
    var p = new URLSearchParams(location.hash.replace(/^#/, ''));
    var lat = parseFloat(p.get('lat')), lon = parseFloat(p.get('lon'));
    if (isFinite(lat) && isFinite(lon)) {
      state.lat = clampNum(lat, -90, 90);
      state.lon = clampNum(lon, -180, 180);
      state.place = p.get('n') || 'Custom spot';
      if (p.get('m') === 'apparent') state.mode = 'apparent';
      return true;
    }
    return false;
  }
  function writeHash() {
    var p = new URLSearchParams();
    p.set('lat', state.lat.toFixed(4));
    p.set('lon', state.lon.toFixed(4));
    if (state.place) p.set('n', state.place);
    if (state.mode === 'apparent') p.set('m', 'apparent');
    try { history.replaceState(null, '', '#' + p.toString()); } catch (e) { /* file:// or sandbox */ }
  }

  function chooseDefaultCity() {
    var match = CITIES.filter(function (c) { return c.tz === deviceTz; })[0];
    var c = match || CITIES[1];
    state.lat = c.lat; state.lon = c.lon; state.place = c.n;
  }

  function setLocation(lat, lon, place, gps) {
    state.lat = clampNum(lat, -90, 90);
    state.lon = clampNum(lon, -180, 180);
    state.place = place;
    state.gps = !!gps;
    writeHash();
    syncInputs();
    chartKey = '';
    tick();
  }

  function syncInputs() {
    $('#lat').value = state.lat.toFixed(4);
    $('#lon').value = state.lon.toFixed(4);
    $('#lat').removeAttribute('aria-invalid');
    $('#lon').removeAttribute('aria-invalid');
  }

  function setStatus(msg) { $('#loc-status').textContent = msg; }

  function locate() {
    var btn = $('#locate');
    if (!navigator.geolocation) { setStatus('This browser has no geolocation. Type a latitude and longitude instead.'); return; }
    btn.disabled = true; setStatus('Asking your device where you are…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      btn.disabled = false;
      setLocation(pos.coords.latitude, pos.coords.longitude, 'Your location', true);
      var a = pos.coords.altitude;
      var msg = 'Located. ';
      msg += (a != null && isFinite(a)) ? 'Your device reports ' + Math.round(a) + ' m of elevation, which this clock ignores on purpose.' : 'Elevation is not needed.';
      setStatus(msg);
      $('#alt-note').textContent = '';
    }, function (err) {
      btn.disabled = false;
      setStatus(err.code === 1 ? 'Location permission was declined. Type coordinates or tap a city below.' : 'Could not get a fix. Type coordinates or tap a city below.');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  }

  function onManualInput() {
    var lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
    var okLat = isFinite(lat) && lat >= -90 && lat <= 90;
    var okLon = isFinite(lon) && lon >= -180 && lon <= 180;
    $('#lat').setAttribute('aria-invalid', okLat ? 'false' : 'true');
    $('#lon').setAttribute('aria-invalid', okLon ? 'false' : 'true');
    if (!okLat || !okLon) { setStatus('Latitude runs −90 to 90, longitude −180 to 180.'); return; }
    state.lat = lat; state.lon = lon; state.place = 'Custom spot'; state.gps = false;
    writeHash(); chartKey = ''; setStatus('Longitude sets the clock. Latitude only shapes the sun chart and sunrise/sunset.'); tick();
  }

  /* ---------- sun chart ---------- */
  var chartKey = '';
  var chartGeom = null;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, text) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  function buildChart(st, eot, W) {
    var H = W < 520 ? 190 : 230, padL = 14, padR = 14, padT = 26, padB = 26;
    var plotW = W - padL - padR;
    var mean = state.mode === 'mean';
    var shift = mean ? eot / 60 : 0; // apparent hour = clock hour + shift

    var pts = [], peak = -90, peakT = 12;
    for (var i = 0; i <= 288; i++) {
      var t = i / 12;
      var alt = S.altitude(state.lat, st.dec, t + shift);
      pts.push([t, alt]);
      if (alt > peak) { peak = alt; peakT = t; }
    }
    var top = Math.max(45, Math.ceil((peak + 6) / 5) * 5), bot = -30;
    function X(t) { return padL + t / 24 * plotW; }
    function Y(a) { return padT + (top - Math.max(bot, a)) / (top - bot) * (H - padT - padB); }

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' });
    var defs = el('defs', {});
    var grad = el('linearGradient', { id: 'sunfill', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el('stop', { offset: '0', 'stop-color': '#d9a441', 'stop-opacity': '0.5' }));
    grad.appendChild(el('stop', { offset: '1', 'stop-color': '#d9a441', 'stop-opacity': '0.02' }));
    defs.appendChild(grad);
    var clip = el('clipPath', { id: 'above' });
    clip.appendChild(el('rect', { x: 0, y: 0, width: W, height: Y(0) }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    // night band
    svg.appendChild(el('rect', { x: padL, y: Y(0), width: plotW, height: H - padB - Y(0), fill: 'rgba(0,0,10,0.28)' }));

    // hour grid + labels
    for (var h = 0; h <= 24; h += 3) {
      svg.appendChild(el('line', { x1: X(h), x2: X(h), y1: padT, y2: H - padB, 'class': 'ax' }));
      svg.appendChild(el('text', { x: X(h), y: H - 8, 'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle', 'class': 'tick-label' + (h === 12 ? ' hot' : '') }, p2(h % 24)));
    }
    svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0), 'class': 'horizon' }));
    svg.appendChild(el('text', { x: W - padR - 2, y: Y(0) - 6, 'text-anchor': 'end', 'class': 'tick-label' }, 'HORIZON'));

    // curve + lit area
    var d = '', area = '';
    pts.forEach(function (p, idx) { d += (idx ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); });
    area = d + 'L' + X(24) + ' ' + (H - padB) + 'L' + X(0) + ' ' + (H - padB) + 'Z';
    var lit = el('path', { d: area, fill: 'url(#sunfill)', 'clip-path': 'url(#above)' });
    svg.appendChild(lit);
    svg.appendChild(el('path', { d: d, 'class': 'curve' }));

    // noon line
    if (peak > 0) {
      svg.appendChild(el('line', { x1: X(peakT), x2: X(peakT), y1: padT - 4, y2: Y(peak), 'class': 'noon-line' }));
      var anchor = peakT > 20 ? 'end' : peakT < 4 ? 'start' : 'middle';
      svg.appendChild(el('text', { x: X(peakT), y: padT - 10, 'text-anchor': anchor, 'class': 'noon-tag' }, 'SOLAR NOON ' + hm(peakT * 3600000)));
    }

    // marker
    var g = el('g', {});
    g.appendChild(el('circle', { r: 7, fill: 'none', 'class': 'marker-ring' }));
    g.appendChild(el('circle', { r: 6, fill: '#e5703a', stroke: '#f3ead7', 'stroke-width': 2 }));
    svg.appendChild(g);

    var host = $('#chart');
    host.textContent = '';
    host.appendChild(svg);
    chartGeom = { g: g, X: X, Y: Y, shift: shift, dec: st.dec };
  }

  function updateMarker(solarMs) {
    if (!chartGeom) return;
    var t = modMs(solarMs) / 3600000;
    var alt = S.altitude(state.lat, chartGeom.dec, t + chartGeom.shift);
    chartGeom.g.setAttribute('transform', 'translate(' + chartGeom.X(t).toFixed(1) + ' ' + chartGeom.Y(alt).toFixed(1) + ')');
  }

  /* ---------- equation-of-time chart ---------- */
  var eotKey = '';
  function buildEot(N, W) {
    var H = 190, padL = 34, padR = 12, padT = 16, padB = 24, plotW = W - padL - padR;
    var lo = -18, hi = 18;
    function X(d) { return padL + (d - 1) / 365 * plotW; }
    function Y(v) { return padT + (hi - v) / (hi - lo) * (H - padT - padB); }
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' });
    [-15, -10, -5, 0, 5, 10, 15].forEach(function (v) {
      svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: Y(v), y2: Y(v), 'class': v === 0 ? 'horizon' : 'ax' }));
      if (v % 5 === 0 && (v % 10 === 0 || v === 0 || W > 480)) svg.appendChild(el('text', { x: padL - 6, y: Y(v) + 3.5, 'text-anchor': 'end', 'class': 'tick-label' }, (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v)));
    });
    var months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    months.forEach(function (m, i) {
      var d = S.dayOfYear(Date.UTC(2026, i, 15));
      svg.appendChild(el('text', { x: X(d), y: H - 7, 'text-anchor': 'middle', 'class': 'tick-label' }, m));
    });
    var path = '';
    for (var d = 1; d <= 365; d += 2) path += (d === 1 ? 'M' : 'L') + X(d).toFixed(1) + ' ' + Y(S.equationOfTime(d)).toFixed(1);
    svg.appendChild(el('path', { d: path, 'class': 'eot-curve' }));
    var Nn = Math.min(365, Math.max(1, N)), v = S.equationOfTime(Nn);
    svg.appendChild(el('line', { x1: X(Nn), x2: X(Nn), y1: padT, y2: H - padB, 'class': 'noon-line' }));
    svg.appendChild(el('circle', { cx: X(Nn), cy: Y(v), r: 5.5, 'class': 'eot-dot', stroke: '#f3ead7', 'stroke-width': 2 }));
    var onRight = X(Nn) > W * 0.6;
    svg.appendChild(el('text', { x: X(Nn) + (onRight ? -10 : 10), y: Y(v) + (v > 0 ? -10 : 18), 'text-anchor': onRight ? 'end' : 'start', 'class': 'eot-label' }, 'today ' + (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + ' min'));
    var host = $('#eot'); host.textContent = ''; host.appendChild(svg);
  }

  /* ---------- cities table ---------- */
  var cityEls = [];
  function buildCities() {
    var host = $('#cities');
    CITIES.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'city'; b.setAttribute('role', 'listitem');
      b.innerHTML =
        '<span class="n">' + c.n + '<small>' + fmtCoord(c.lon, 'E', 'W') + '</small></span>' +
        '<span class="t"><em>Zone clock</em><span data-z></span></span>' +
        '<span class="t"><em>Sun clock</em><span data-s></span></span>' +
        '<span class="d"><span data-d></span><span class="bar"><b></b><i data-bar></i></span></span>';
      b.addEventListener('click', function () {
        setLocation(c.lat, c.lon, c.n, false);
        setStatus('Moved to ' + c.n + '.');
        window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
      host.appendChild(b);
      cityEls.push({ c: c, b: b, z: b.querySelector('[data-z]'), s: b.querySelector('[data-s]'), d: b.querySelector('[data-d]'), bar: b.querySelector('[data-bar]') });
    });
  }
  function updateCities(now) {
    cityEls.forEach(function (r) {
      var st = S.solarState(now, r.c.lat, r.c.lon);
      var solar = state.mode === 'mean' ? st.meanMs : st.apparentMs;
      var zone = zoneWallMs(r.c.tz, now);
      var diff = solar - zone;
      r.z.textContent = hmsStr(zone);
      r.s.textContent = hmsStr(solar);
      r.d.textContent = fmtDelta(diff) + ' off';
      var frac = clampNum(diff / (3 * 3600000), -1, 1) * 50; // ±3h spans the bar
      r.bar.style.left = (frac < 0 ? 50 + frac : 50) + '%';
      r.bar.style.width = Math.abs(frac) + '%';
      var here = Math.abs(r.c.lat - state.lat) < 0.01 && Math.abs(r.c.lon - state.lon) < 0.01;
      if (here) r.b.setAttribute('aria-current', 'true'); else r.b.removeAttribute('aria-current');
    });
  }

  /* ---------- main loop ---------- */
  var lastSkyAlt = null;
  var prev = {};
  function set(id, v) { if (prev[id] !== v) { prev[id] = v; $(id).textContent = v; } }

  function tick() {
    var now = Date.now();
    var st = S.solarState(now, state.lat, state.lon);
    var mean = state.mode === 'mean';
    var solarMs = mean ? st.meanMs : st.apparentMs;
    var parts = hmsParts(solarMs);

    set('#c-h', parts[0]); set('#c-m', parts[1]); set('#c-s', parts[2]);
    set('#place', state.place);
    set('#coords', fmtCoord(state.lat, 'N', 'S') + '  ·  ' + fmtCoord(state.lon, 'E', 'W'));
    set('#solar-date', new Date(solarMs).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + (mean ? 'mean solar time' : 'true solar time'));

    var devWall = zoneWallMs(deviceTz, now);
    set('#dev-clock', hmsStr(devWall));
    set('#dev-zone', zoneAbbrev(deviceTz, now) + ' · ' + deviceTz.replace(/_/g, ' '));
    var diff = solarMs - devWall;
    set('#delta', fmtDelta(diff));
    set('#delta-note', diff < 0 ? 'sun is behind your clock' : 'sun is ahead of your clock');

    // sun-driven sky
    var a = Math.round(st.altitude * 4) / 4;
    if (a !== lastSkyAlt) {
      lastSkyAlt = a;
      var sky = skyAt(st.altitude), hero = $('#hero');
      hero.style.setProperty('--sky-top', sky.top);
      hero.style.setProperty('--sky-bot', sky.bot);
    }

    // charts (rebuilt when inputs, mode, day, or width change)
    var W = Math.floor($('#chart').clientWidth) || 800;
    var key = [state.lat, state.lon, state.mode, Math.floor(st.N), W].join('|');
    if (key !== chartKey) { chartKey = key; buildChart(st, st.eot, W); }
    updateMarker(solarMs);
    var ek = Math.floor(st.N) + '|' + (Math.floor($('#eot').clientWidth) || 800);
    if (ek !== eotKey) { eotKey = ek; buildEot(Math.floor(st.N), Math.floor($('#eot').clientWidth) || 800); }

    // stats, expressed in the chosen solar time, with the device-clock equivalent underneath
    var dayStart = Math.floor(solarMs / DAY) * DAY;
    var shift = mean ? st.eot / 60 : 0;
    function toDev(clockHours) {
      var utc = dayStart + clockHours * 3600000 - state.lon * S.MS_PER_DEGREE - (mean ? 0 : st.eot * 60000);
      return hm(zoneWallMs(deviceTz, utc));
    }
    var noonH = 12 - shift;
    set('#s-noon', hm(noonH * 3600000));
    set('#s-noon-dev', toDev(noonH) + ' on your clock');

    if (st.rise.polar) {
      var night = st.rise.polar === 'night';
      set('#s-rise', night ? 'none' : 'sun up'); set('#s-set', night ? 'none' : 'sun up');
      set('#s-rise-dev', night ? 'polar night' : 'midnight sun'); set('#s-set-dev', night ? 'polar night' : 'midnight sun');
      set('#s-len', night ? '0h 00m' : '24h 00m');
    } else {
      var half = st.rise.angle / 15;
      var rise = 12 - half - shift, set_ = 12 + half - shift;
      set('#s-rise', hm(rise * 3600000)); set('#s-rise-dev', toDev(rise) + ' on your clock');
      set('#s-set', hm(set_ * 3600000)); set('#s-set-dev', toDev(set_) + ' on your clock');
      set('#s-len', hoursToHM(half * 2));
    }
    set('#s-alt', 'sun now ' + (st.altitude >= 0 ? '' : '−') + Math.abs(st.altitude).toFixed(1) + '° ' + (st.altitude >= 0 ? 'above' : 'below') + ' horizon');

    updateCities(now);
  }

  function setMode(m) {
    state.mode = m;
    $('#mode-mean').setAttribute('aria-pressed', String(m === 'mean'));
    $('#mode-apparent').setAttribute('aria-pressed', String(m === 'apparent'));
    writeHash(); chartKey = ''; tick();
  }

  /* ---------- boot ---------- */
  function init() {
    if (!readHash()) chooseDefaultCity();
    buildCities();
    syncInputs();
    $('#locate').addEventListener('click', locate);
    $('#lat').addEventListener('change', onManualInput);
    $('#lon').addEventListener('change', onManualInput);
    $('#mode-mean').addEventListener('click', function () { setMode('mean'); });
    $('#mode-apparent').addEventListener('click', function () { setMode('apparent'); });
    setMode(state.mode); // also paints the first frame
    setInterval(tick, 250);
    window.addEventListener('resize', function () { chartKey = ''; eotKey = ''; });
  }

  init();
})();
