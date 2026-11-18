/* Commish v1: everything runs in the visitor's browser. No file ever leaves the device. */
(function () {
  'use strict';

  // ---------- helpers ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var gbp = function (v) { return '£' + Math.round(v || 0).toLocaleString('en-GB'); };
  var gbp2 = function (v) { return '£' + (v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var num = function (n) { return Math.round(n || 0).toLocaleString('en-GB'); };
  var DAY = 864e5;
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var shortName = function (t) { t = String(t || ''); var c = t.split(/ [-–(]| \| |, /)[0]; if (c.length > 46) c = c.slice(0, 44).replace(/\s+\S*$/, '') + '…'; return c; };
  var range = function (a, b) { return (a.getFullYear() === b.getFullYear() ? fmtDs(a) : fmtD(a)) + ' to ' + fmtD(b); };
  var fmtD = function (d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var fmtDs = function (d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ICON = {
    home: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.4-1.5-2.5-1.5-1.7 0-2.5 1-2.5 2s1 1.6 2.5 2 2.5 1 2.5 2-1 2-2.5 2c-1.2 0-2.1-.5-2.6-1.5"/>',
    shops: '<path d="M4 9h16l-1.5 10h-13z"/><path d="M8 9a4 4 0 0 1 8 0"/>',
    videos: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M11 10l3 2-3 2z"/>',
    tax: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>'
  };
  var svg = function (name, size) { return '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>'; };

  // ---------- state ----------
  var S = { files: [], plan: 'free', sel: null, shopSort: 'earned', taxYear: null, revealed: false };
  try { S.plan = localStorage.getItem('commish-plan') || 'free'; } catch (e) {}

  // ---------- parsing ----------
  var COLS = {
    oid: ['order id'], sku: ['sku id'], product: ['product name'], pid: ['product id'], shop: ['shop name'], shopCode: ['shop code'],
    otype: ['order type'], status: ['order settlement status', 'settlement status'], ctype: ['content type'], cid: ['content id'],
    gmv: ['gmv'], items: ['items sold'], refunded: ['items refunded'], base: ['est. commission base'],
    estStd: ['est. standard commission'], estAds: ['est. shop ads commission'], estBonus: ['est. bonus'], estPartner: ['est. affiliate partner bonus'],
    actual: ['total final earned amount'], rateStd: ['standard'], rateAds: ['shop ads'],
    odate: ['order date'], sdate: ['commission settlement date']
  };
  var norm = function (s) { return String(s || '').trim().toLowerCase(); };
  function n(v) { if (v === null || v === undefined || v === '' || v === '/' || v === '--') return null; if (typeof v === 'number') return v; var x = parseFloat(String(v).replace(/[£,\s%]/g, '')); return isNaN(x) ? null : x; }
  function d(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') { var p = XLSX.SSF.parse_date_code(v); return p ? new Date(p.y, p.m - 1, p.d, p.H, p.M, Math.floor(p.S)) : null; }
    var s = String(v).trim(); if (!s || s === '/' || s === '--') return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    var x = new Date(s); return isNaN(x) ? null : x;
  }
  function id(v) { if (v === null || v === undefined) return ''; if (typeof v === 'number') return v.toLocaleString('fullwide', { useGrouping: false }); return String(v).trim(); }
  function postedAt(cid) {
    if (!cid) return null;
    try {
      var secs = /^\d+$/.test(cid) && typeof BigInt === 'function' ? Number(BigInt(cid) >> 32n) : Math.floor(Number(cid) / 4294967296);
      if (!secs || secs < 1.4e9 || secs > 2.2e9) return null;
      return new Date(secs * 1000);
    } catch (e) { return null; }
  }
  function rowsFromJson(json) {
    if (!json.length) return [];
    var headers = Object.keys(json[0]), map = {};
    Object.keys(COLS).forEach(function (k) { var h = headers.find(function (h) { return COLS[k].indexOf(norm(h)) >= 0; }); if (h) map[k] = h; });
    if (!map.oid || !map.status || !map.odate) throw new Error("This doesn't look like a TikTok affiliate orders export. Check you exported Affiliate orders.");
    return json.map(function (r) {
      var g = function (k) { return map[k] ? r[map[k]] : null; };
      var est = (n(g('estStd')) || 0) + (n(g('estAds')) || 0) + (n(g('estBonus')) || 0) + (n(g('estPartner')) || 0);
      var cid = id(g('cid'));
      return {
        oid: id(g('oid')), sku: id(g('sku')), product: String(g('product') || 'Unknown product'), pid: id(g('pid')),
        shop: String(g('shop') || 'Unknown shop'), shopCode: String(g('shopCode') || ''), otype: String(g('otype') || ''),
        status: String(g('status') || ''), ctype: String(g('ctype') || 'Video'), cid: cid, posted: postedAt(cid),
        gmv: n(g('gmv')) || 0, items: n(g('items')) || 0, refunded: n(g('refunded')) || 0, base: n(g('base')) || 0,
        est: Math.round(est * 100) / 100, actual: n(g('actual')), rate: String(g('rateStd') || g('rateAds') || '').trim(),
        odate: d(g('odate')), sdate: d(g('sdate'))
      };
    }).filter(function (r) { return r.oid && r.odate; });
  }
  function readFile(f) {
    return f.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = rowsFromJson(XLSX.utils.sheet_to_json(ws, { defval: null, raw: true }));
      if (!rows.length) throw new Error('No orders found in this file.');
      return fileObj(f.name, rows, false);
    });
  }
  function fileObj(name, rows, demo) {
    var t = rows.map(function (r) { return +r.odate; });
    return { name: name, rows: rows, demo: demo, min: new Date(Math.min.apply(null, t)), max: new Date(Math.max.apply(null, t)) };
  }
  var RANK = { Settled: 3, Ineligible: 3, Pending: 1 };
  function merge(files) {
    var by = new Map(), dupes = 0;
    files.slice().sort(function (a, b) { return a.max - b.max; }).forEach(function (f) {
      f.rows.forEach(function (r) {
        var k = r.oid + '|' + r.sku, prev = by.get(k);
        if (prev) { dupes++; if ((RANK[r.status] || 0) >= (RANK[prev.status] || 0)) by.set(k, r); } else by.set(k, r);
      });
    });
    return { rows: Array.from(by.values()), dupes: dupes };
  }

  // ---------- made-up demo data (never anyone's real numbers) ----------
  function makeDemo() {
    var seed = 7; var rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    var pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
    var shops = [
      ['Brightwell Home', 'GBLC1A2B3C', '8%', [['Electric heated throw', 59.99], ['Bamboo bath caddy', 24.99]]],
      ['Voltstack Power', 'CNGB4D5E6F', '5%', [['2000W portable power station', 499.99], ['Solar panel kit', 189.99]]],
      ['Pebble and Pine', 'GBGB7G8H9I', '12%', [['Linen throw', 34.99], ['Stoneware mug set', 22.99]]],
      ['Northgate Tools', 'GBLCJ1K2L3', '10%', [['Garage shelving unit', 89.99], ['Cordless drill set', 64.99]]],
      ['Honeycomb Kitchen', 'GBGBM4N5O6', '12.5%', [['Air fryer liners', 9.99], ['Knife block set', 44.99]]],
      ['Zenhaus Gadgets', 'HKGBP7Q8R9', '7%', [['Magnetic phone mount', 12.99], ['LED desk lamp', 27.99]]],
      ['Driftwood Outdoors', 'GBLCS1T2U3', '10%', [['Camping chair', 39.99], ['Insulated flask', 19.99]]],
      ['Lumo Lighting', 'CNGBV4W5X6', '15%', [['Smart bulb 4 pack', 29.99], ['Fairy light curtain', 14.99]]],
      ['Little Lark Toys', 'GBGBY7Z8A9', '12%', [['Wooden train set', 32.99], ['Sensory play mat', 26.99]]]
    ];
    var weights = [9, 6, 5, 5, 4, 3, 3, 2, 2];
    var now = new Date(); now.setHours(21, 0, 0, 0);
    var start = new Date(now - 360 * DAY);
    var content = [];
    for (var v = 0; v < 150; v++) {
      var pt = new Date(+start - 40 * DAY + rnd() * 395 * DAY);
      var hourPick = pick([8, 12, 13, 16, 16, 18, 19, 20, 21, 22]);
      pt.setHours(hourPick, Math.floor(rnd() * 60), 0, 0);
      if (pt > now) pt = new Date(+now - DAY);
      var live = v % 18 === 0;
      if (live) pt.setHours(19, 30, 0, 0);
      var sh = Math.floor(rnd() * shops.length);
      content.push({ t: pt, live: live, shop: sh, prod: Math.floor(rnd() * 2), pull: live ? 6 : 0.4 + rnd() * rnd() * 4 });
    }
    var cidOf = function (c) { var s = BigInt(Math.floor(+c.t / 1000)); return ((s << 32n) + BigInt(Math.floor(rnd() * 4e9))).toString(); };
    content.forEach(function (c) { c.cid = cidOf(c); });
    var rows = [], oid = 576000000000000000n;
    for (var day = 0; day <= 360; day++) {
      var date = new Date(+start + day * DAY);
      var season = 0.55 + day / 360 * 0.9 + (date.getMonth() === 10 ? 0.6 : 0);
      var wk = date.getDay(); var weekend = (wk === 0 || wk === 6) ? 1.35 : 1;
      var count = Math.round((4 + rnd() * 6) * season * weekend);
      var live = content.filter(function (c) { return c.t <= date; });
      if (!live.length) continue;
      for (var i = 0; i < count; i++) {
        var c = live[live.length - 1 - Math.floor(Math.pow(rnd(), 2.2) * live.length)];
        if (rnd() < 0.5) c = pick(live);
        var sIdx = rnd() < 0.7 ? c.shop : (function () { var r = rnd() * 39, a = 0; for (var j = 0; j < weights.length; j++) { a += weights[j]; if (r < a) return j; } return 0; })();
        var s = shops[sIdx], p = s[3][c.shop === sIdx ? c.prod : Math.floor(rnd() * 2)];
        var hr = pick([9, 11, 12, 13, 15, 17, 18, 19, 19, 20, 20, 20, 21, 21, 22, 23]);
        var od = new Date(+start + day * DAY); od.setHours(hr, Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
        if (c.live && rnd() < 0.7) od = new Date(+c.t + rnd() * 7200e3);
        if (od < c.t) od = new Date(+c.t + 3600e3 * (1 + rnd() * 20));
        if (od > now) continue;
        var items = rnd() < 0.03 ? 2 : 1;
        var gmv = p[1] * items, base = Math.round(gmv / 1.2 * 100) / 100, rate = parseFloat(s[2]) / 100;
        var est = Math.round(base * rate * 100) / 100;
        var age = (now - od) / DAY;
        var overseas = /^(CN|HK)/.test(s[1]);
        var lostP = overseas ? 0.18 : 0.08;
        var status, sdate = null, actual = null, refunded = 0;
        if (rnd() < (age > 20 ? lostP : lostP / 3)) { status = 'Ineligible'; actual = 0; refunded = items; }
        else if (age > 15 + rnd() * 8) { status = 'Settled'; sdate = new Date(+od + (15 + Math.floor(rnd() * 6)) * DAY); actual = est; }
        else status = 'Pending';
        oid += BigInt(1 + Math.floor(rnd() * 1e9));
        rows.push({ oid: oid.toString(), sku: '1' + Math.floor(rnd() * 1e9), product: p[0], pid: s[0] + p[0], shop: s[0], shopCode: s[1], otype: 'Shop ads order',
          status: status, ctype: c.live ? 'Live' : 'Video', cid: c.cid, posted: c.t, gmv: gmv, items: items, refunded: refunded, base: base,
          est: est, actual: actual, rate: s[2], odate: od, sdate: sdate });
      }
    }
    var files = [];
    for (var q = 3; q >= 0; q--) {
      var hi = new Date(+now - q * 90 * DAY), lo = new Date(+hi - 89 * DAY);
      var part = rows.filter(function (r) { return r.odate >= lo && r.odate <= hi; });
      if (part.length) files.push(fileObj('Demo export ' + fmtDs(lo) + ' to ' + fmtDs(hi), part, true));
    }
    return files;
  }

  // ---------- analysis ----------
  function analyse(rows) {
    var A = { rows: rows };
    var sum = function (a, f) { return a.reduce(function (s, r) { return s + f(r); }, 0); };
    var earned = function (r) { return r.status === 'Settled' ? (r.actual != null ? r.actual : r.est) : r.status === 'Pending' ? r.est : 0; };
    A.earned = earned;
    var S_ = rows.filter(function (r) { return r.status === 'Settled'; });
    var P_ = rows.filter(function (r) { return r.status === 'Pending'; });
    var I_ = rows.filter(function (r) { return r.status === 'Ineligible'; });
    A.paid = sum(S_, earned); A.owed = sum(P_, function (r) { return r.est; }); A.lost = sum(I_, function (r) { return r.est; });
    A.gmv = sum(rows, function (r) { return r.gmv; }); A.items = sum(rows, function (r) { return r.items; });
    A.nSettled = S_.length; A.nPending = P_.length; A.nLost = I_.length; A.n = rows.length;
    var ok = rows.filter(function (r) { return r.status !== 'Ineligible'; });
    A.perOrder = ok.length ? sum(ok, earned) / ok.length : 0;
    var base = sum(ok, function (r) { return r.base; });
    var okGmv = sum(ok, function (r) { return r.gmv; });
    A.effRate = okGmv ? sum(ok, earned) / okGmv * 100 : 0;
    var t = rows.map(function (r) { return +r.odate; });
    A.min = new Date(Math.min.apply(null, t)); A.max = new Date(Math.max.apply(null, t));
    A.days = Math.max(1, Math.round((A.max - A.min) / DAY) + 1);
    A.perDay = (A.paid + A.owed) / A.days;
    var cids = {}; ok.forEach(function (r) { if (r.cid) cids[r.cid] = 1; }); A.nContent = Object.keys(cids).length;

    // months: aggregate every month, then show the calendar year (Jan to Dec)
    var MM = {};
    rows.forEach(function (r) {
      var k = r.odate.getFullYear() * 12 + r.odate.getMonth();
      var m = MM[k] || (MM[k] = { paid: 0, owed: 0, lost: 0, n: 0, qn: 0 }); m.n++;
      if (r.status === 'Settled') m.paid += earned(r); else if (r.status === 'Pending') { m.owed += r.est; m.qn++; } else m.lost += r.est;
    });
    var mk = function (y, mo) { var d0 = new Date(y, mo, 1), k = y * 12 + mo, x = MM[k] || { paid: 0, owed: 0, lost: 0, n: 0, qn: 0 }; return { d: d0, key: k, paid: x.paid, owed: x.owed, lost: x.lost, n: x.n, qn: x.qn }; };
    var curKey = A.max.getFullYear() * 12 + A.max.getMonth();
    A.years = []; Object.keys(MM).forEach(function (k) { var y = Math.floor(k / 12); if (A.years.indexOf(y) < 0) A.years.push(y); }); A.years.sort();
    A.year = (S.year && A.years.indexOf(S.year) >= 0) ? S.year : A.max.getFullYear();
    A.months = [];
    for (var i = 0; i < 12; i++) { var m = mk(A.year, i); m.future = m.key > curKey; m.current = m.key === curKey; A.months.push(m); }
    A.curIdx = A.year === A.max.getFullYear() ? A.max.getMonth() : 11;
    var allM = Object.keys(MM).map(function (k) { return mk(Math.floor(k / 12), k % 12); });
    A.bestMonth = allM.slice().sort(function (a, b) { return (b.paid + b.owed) - (a.paid + a.owed); })[0];
    A.curMonth = mk(A.max.getFullYear(), A.max.getMonth());
    var pm = new Date(A.max.getFullYear(), A.max.getMonth() - 1, 1); A.lastFull = mk(pm.getFullYear(), pm.getMonth());

    // weeks
    var wkStart = function (x) { var y = new Date(x.getFullYear(), x.getMonth(), x.getDate()); y.setDate(y.getDate() - (y.getDay() + 6) % 7); return +y; };
    var W = new Map();
    rows.forEach(function (r) { var k = wkStart(r.odate), w = W.get(k); if (!w) { w = { k: k, paid: 0, owed: 0 }; W.set(k, w); } if (r.status === 'Settled') w.paid += earned(r); else if (r.status === 'Pending') w.owed += r.est; });
    A.weeks = Array.from(W.values()).sort(function (a, b) { return a.k - b.k; }).slice(-14);

    // buyer heatmap
    var band = function (h) { return h >= 6 && h < 11 ? 0 : h < 14 && h >= 11 ? 1 : h >= 14 && h < 17 ? 2 : h >= 17 && h < 21 ? 3 : 4; };
    var H = []; for (var dd = 0; dd < 7; dd++) H.push([0, 0, 0, 0, 0]);
    ok.forEach(function (r) { H[(r.odate.getDay() + 6) % 7][band(r.odate.getHours())] += earned(r); });
    A.buyHeat = H; A.buyMax = Math.max.apply(null, H.map(function (r) { return Math.max.apply(null, r); })) || 1;
    var bestCell = [0, 0]; H.forEach(function (r, i) { r.forEach(function (v, j) { if (v > H[bestCell[0]][bestCell[1]]) bestCell = [i, j]; }); });
    A.buyBest = bestCell;

    // shops
    var shopMap = new Map();
    rows.forEach(function (r) {
      var s = shopMap.get(r.shop); if (!s) { s = { name: r.shop, code: r.shopCode, n: 0, lostN: 0, paid: 0, owed: 0, lost: 0, first: r.odate, prods: {}, items: 0, lostItems: 0, retN: 0, inelN: 0, inelVal: 0 }; shopMap.set(r.shop, s); }
      s.items += r.items || 0; if (r.status === 'Ineligible') s.lostItems += r.items || 0;
      s.prods[r.product] = (s.prods[r.product] || 0) + earned(r) + (r.status === 'Ineligible' ? 0 : 0.0001);
      s.n++; if (r.odate < s.first) s.first = r.odate;
      if (r.status === 'Settled') s.paid += earned(r); else if (r.status === 'Pending') s.owed += r.est;
      else { s.lost += r.est; s.lostN++; if (r.refunded > 0) s.retN++; else { s.inelN++; s.inelVal += r.est; } }
    });
    A.shops = Array.from(shopMap.values()).map(function (s) { s.earned = s.paid + s.owed; s.lostRate = s.n ? s.lostN / s.n : 0; s.overseas = /^(CN|HK)/i.test(s.code);
      var tp = Object.keys(s.prods).sort(function (a, b) { return s.prods[b] - s.prods[a]; })[0]; s.top = tp ? shortName(tp) : ''; return s; });
    A.shops.sort(function (a, b) { return b.earned - a.earned; });
    var grp = function (o) { var g = A.shops.filter(function (s) { return s.overseas === o; }); var nn = sum(g, function (s) { return s.n; }), l = sum(g, function (s) { return s.lostN; }); return nn ? l / nn : null; };
    A.ukLost = grp(false); A.osLost = grp(true);
    var monthStart = new Date(A.max.getFullYear(), A.max.getMonth(), 1);
    A.newShops = A.shops.filter(function (s) { return s.first >= monthStart; }).map(function (s) { return s.name; });

    // lost: returned by customer vs ruled ineligible with nothing returned
    var RET = I_.filter(function (r) { return r.refunded > 0; }), INEL = I_.filter(function (r) { return !(r.refunded > 0); });
    A.lostRet = sum(RET, function (r) { return r.est; }); A.lostInel = sum(INEL, function (r) { return r.est; });
    var uniq = function (a) { var o = {}; a.forEach(function (r) { o[r.oid] = 1; }); return Object.keys(o).length; };
    A.nRet = uniq(RET); A.nInel = uniq(INEL);
    var CH = new Map();
    INEL.forEach(function (r) {
      var k = r.shop + '|' + r.product, c = CH.get(k);
      if (!c) { c = { shop: r.shop, product: r.product, n: 0, ids: {}, items: 0, est: 0, gmv: 0, first: r.odate, last: r.odate, rows: [] }; CH.set(k, c); }
      if (!c.ids[r.oid]) { c.ids[r.oid] = 1; c.n++; } c.items += r.items || 0; c.est += r.est; c.gmv += r.gmv; c.rows.push(r);
      if (r.odate < c.first) c.first = r.odate; if (r.odate > c.last) c.last = r.odate;
    });
    A.challenge = Array.from(CH.values()).sort(function (a, b) { return b.est - a.est; });

    // payout check
    A.estSettled = sum(S_, function (r) { return r.est; }); A.actSettled = sum(S_, function (r) { return r.actual || 0; });
    A.short = S_.filter(function (r) { return r.actual != null && r.actual < r.est - 0.009; });
    var lags = S_.filter(function (r) { return r.sdate; }).map(function (r) { return (r.sdate - r.odate) / DAY; }).sort(function (a, b) { return a - b; });
    A.lagMed = lags.length ? Math.round(lags[Math.floor(lags.length / 2)]) : 18;
    var cut = new Date(+A.max - 30 * DAY);
    A.stuck = P_.filter(function (r) { return r.odate < cut; }); A.stuckVal = sum(A.stuck, function (r) { return r.est; });
    var payday = [0, 0, 0, 0, 0, 0, 0]; S_.forEach(function (r) { if (r.sdate) payday[r.sdate.getDay()]++; });
    A.payday = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][payday.indexOf(Math.max.apply(null, payday))];

    // forecast this month
    var mNow = A.curMonth, dayOfMonth = A.max.getDate(), dim = new Date(A.max.getFullYear(), A.max.getMonth() + 1, 0).getDate();
    A.forecast = (mNow.paid + mNow.owed) / dayOfMonth * dim;
    A.fc = { soFar: mNow.paid + mNow.owed, days: dayOfMonth, dim: dim, perDay: (mNow.paid + mNow.owed) / dayOfMonth, month: MONTHS[A.max.getMonth()] };

    // content
    var bands = [['Same day', 0, 1], ['1-7 days', 1, 8], ['8-30 days', 8, 31], ['1-3 months', 31, 91], ['3-12 months', 91, 366], ['1 year+', 366, 1e9]];
    var bandVals = bands.map(function () { return 0; }), tot = 0;
    ok.forEach(function (r) { if (!r.posted) return; var age = (r.odate - r.posted) / DAY; var e = earned(r); tot += e; for (var i = 0; i < bands.length; i++) if (age < bands[i][2]) { bandVals[i] += e; break; } });
    A.ages = bands.map(function (b, i) { return { label: b[0], pct: tot ? bandVals[i] / tot * 100 : 0 }; });
    A.evergreen = tot ? (bandVals[3] + bandVals[4] + bandVals[5]) / tot * 100 : 0;
    var C = new Map();
    ok.forEach(function (r) { if (!r.cid) return; var c = C.get(r.cid); if (!c) { c = { cid: r.cid, type: r.ctype, posted: r.posted, e: 0, n: 0, prods: {} }; C.set(r.cid, c); } c.e += earned(r); c.n++; c.prods[r.product] = (c.prods[r.product] || 0) + 1; });
    var cut30 = new Date(+A.max - 30 * DAY);
    ok.forEach(function (r) { var c = r.cid && C.get(r.cid); if (c && r.odate >= cut30) c.recent = (c.recent || 0) + earned(r); });
    var content = Array.from(C.values());
    content.forEach(function (c) { c.top = Object.keys(c.prods).sort(function (x, y) { return c.prods[y] - c.prods[x]; })[0] || ''; });
    A.content = content;
    var lv = ok.filter(function (r) { return /live/i.test(r.ctype); }), vd = ok.filter(function (r) { return !/live/i.test(r.ctype); });
    A.livePer = lv.length ? sum(lv, earned) / lv.length : 0; A.vidPer = vd.length ? sum(vd, earned) / vd.length : 0; A.nLiveOrders = lv.length;
    var allLives = content.filter(function (c) { return /live/i.test(c.type); }); A.nLives = allLives.length; A.lives = allLives.sort(function (a, b) { return b.e - a.e; }).slice(0, 5);
    var vids = content.filter(function (c) { return !/live/i.test(c.type) && c.posted; });
    var PH = []; for (var p2 = 0; p2 < 7; p2++) PH.push([[], [], [], [], []]);
    vids.forEach(function (c) { PH[(c.posted.getDay() + 6) % 7][band(c.posted.getHours())].push(c.e); });
    A.postHeat = PH.map(function (row) { return row.map(function (a) { return a.length >= 3 ? { avg: sum(a, function (x) { return x; }) / a.length, n: a.length } : null; }); });
    var bestPost = null; A.postHeat.forEach(function (row, i) { row.forEach(function (c, j) { if (c && (!bestPost || c.avg > bestPost.avg)) bestPost = { avg: c.avg, n: c.n, i: i, j: j }; }); });
    A.bestPost = bestPost; A.postMax = bestPost ? bestPost.avg : 1; A.nVideos = vids.length;
    // double down: products with few videos, high per-video earnings
    var PV = {};
    var isVid = {}; vids.forEach(function (c) { isVid[c.cid] = 1; });
    ok.forEach(function (r) {
      if (!r.cid || !isVid[r.cid]) return;
      var x = PV[r.product] || (PV[r.product] = { p: r.product, cids: {}, vids: 0, e: 0, orders: 0 });
      if (!x.cids[r.cid]) { x.cids[r.cid] = 1; x.vids++; }
      x.e += earned(r); x.orders++;
    });
    A.doubleDown = Object.keys(PV).map(function (k) { var x = PV[k]; x.per = x.e / x.vids; return x; }).filter(function (x) { return x.vids <= 2 && x.orders >= 3; }).sort(function (a, b) { return b.per - a.per; }).slice(0, 3);
    var prodShop = {}; rows.forEach(function (r) { prodShop[r.product] = r.shop; });
    A.doubleDown.forEach(function (x) { x.shop = prodShop[x.p]; });

    // tax years by settlement date
    var ty = function (dt) { var y = dt.getFullYear(); return dt >= new Date(y, 3, 6) ? y : y - 1; };
    var T = {};
    S_.forEach(function (r) { if (!r.sdate) return; var y = ty(r.sdate); var x = T[y] || (T[y] = { y: y, paid: 0, n: 0, months: {} }); x.paid += earned(r); x.n++; var mk = r.sdate.getMonth(); x.months[mk] = (x.months[mk] || 0) + earned(r); });
    A.taxYears = Object.keys(T).map(function (k) { return T[k]; }).sort(function (a, b) { return b.y - a.y; });
    A.taxNow = ty(A.max);
    return A;
  }

  // ---------- data access by plan ----------
  function goodFiles() { return S.files.filter(function (f) { return !f.error; }); }
  function latestFile() { return goodFiles().slice().sort(function (a, b) { return b.max - a.max; })[0]; }
  var FREE_DAYS = 90;
  function data() {
    var g = goodFiles(); if (!g.length) return null;
    var m = merge(g), rows = m.rows, hidden = 0, winStart = null;
    if (S.plan !== 'pro') {
      var maxT = Math.max.apply(null, rows.map(function (r) { return +r.odate; }));
      winStart = new Date(maxT - (FREE_DAYS - 1) * DAY); winStart.setHours(0, 0, 0, 0);
      var kept = rows.filter(function (r) { return r.odate >= winStart; });
      hidden = rows.length - kept.length; rows = kept;
    }
    var A = analyse(rows); A.dupes = m.dupes; A.files = g; A.allFiles = g; A.hiddenRows = hidden; A.winStart = winStart; return A;
  }

  // ---------- view helpers ----------
  function count(v, fmt, delay) { return '<span data-count="' + v + '" data-fmt="' + (fmt || 'gbp') + '" data-delay="' + (delay || 0) + '">' + fmtVal(v, fmt) + '</span>'; }
  function fmtVal(v, fmt) { return fmt === 'pct' ? Math.round(v) + '%' : fmt === 'num' ? num(v) : gbp(v); }
  function conf(nn, left, spread) {
    var cols = ['var(--paid)', 'var(--pop)', 'var(--card)', '#3DDC97'], out = '';
    for (var k = 0; k < nn; k++) out += '<span class="conf a-conf" aria-hidden="true" style="top:' + (6 + (k * 13) % 60) + 'px;left:' + (left + k * spread) + 'px;width:' + (k % 2 ? 9 : 12) + 'px;height:' + (k % 2 ? 16 : 9) + 'px;background:' + cols[k % 4] + ';animation-delay:' + (700 + k * 60) + 'ms"></span>';
    return out;
  }
  function locked(inner, tag, line) {
    return '<div class="card locked a-in" style="animation-delay:200ms"><div class="blur" aria-hidden="true">' + inner + '</div><span class="shimmer" aria-hidden="true"></span>' +
      '<div class="over"><span class="tag">' + tag + '</span><span style="font-size:15px;font-weight:600;background:var(--card);border-radius:10px;padding:4px 8px">' + line + '</span>' +
      '<button class="btn" data-action="unlock">Unlock Pro</button></div></div>';
  }
  function nudge(A) {
    var lf = A.lastFull, earnedLF = lf ? lf.paid + lf.owed : 0, share = earnedLF ? 2.99 / earnedLF * 100 : 100;
    var head;
    if (earnedLF && share < 1) head = 'Pro is £2.99 a month. Just ' + (share < 0.1 ? share.toFixed(2) : share.toFixed(1)) + '% of the ' + gbp(earnedLF) + ' you earned in ' + MONTHS[lf.d.getMonth()] + '.';
    else if (A.perOrder > 2.99) head = "Pro is £2.99 a month. That's less than one order's commish.";
    else head = 'Pro is £2.99 a month. Merge every export and see your whole year.';
    return '<div class="card dark a-in t" style="display:flex;flex-direction:column;gap:12px;animation-delay:300ms">' +
      '<p style="margin:0;font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1.1">' + esc(head) + '</p>' +
      '<p style="margin:0;font-size:15px;line-height:1.4">Merge every export, see your whole year, find stuck orders and know when your buyers buy.</p>' +
      '<button class="btn pinky" data-action="unlock">Unlock Pro</button><p style="margin:0;font-size:13px;text-align:center">Or £19.99 a year. Cancel any time.</p></div>';
  }
  function yearChart(A, H, interactive) {
    var max = Math.max.apply(null, A.months.map(function (m) { return m.paid + m.owed + m.lost; })) || 1;
    var sel = S.sel == null ? A.curIdx : S.sel, out = '<div class="plot" style="height:' + (H + 6) + 'px">';
    A.months.forEach(function (m, i) {
      var name = MONTHS[m.d.getMonth()];
      var stack = '<span class="stack a-bar' + (interactive && i === sel ? ' on' : '') + '" style="animation-delay:' + (300 + i * 55) + 'ms"><span class="s-lost" style="height:' + (m.lost / max * H) + 'px"></span><span class="s-owed" style="height:' + (m.owed / max * H) + 'px"></span><span class="s-paid" style="height:' + (m.paid / max * H) + 'px"></span></span>';
      out += interactive ? '<button data-action="month" data-i="' + i + '" data-title="' + esc(name + ' ' + m.d.getFullYear()) + '" data-l1="' + esc(gbp(m.paid) + ' paid') + '" data-l2="' + esc(gbp(m.owed) + ' pending, ' + gbp(m.lost) + ' lost') + '" aria-label="' + esc(name + ': paid ' + gbp(m.paid) + ', pending ' + gbp(m.owed) + ', lost ' + gbp(m.lost)) + '">' + stack + '</button>' : '<button tabindex="-1" aria-hidden="true">' + stack + '</button>';
    });
    out += '</div><div class="ticks">';
    A.months.forEach(function (m, i) { out += '<span class="' + (interactive && i === sel ? 'on' : '') + '"' + (m.future ? ' style="opacity:.45"' : '') + '>' + MONTHS[m.d.getMonth()].slice(0, 1) + '</span>'; });
    return out + '</div>';
  }
  function heat(grid, max, cellFn) {
    var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var out = '<div class="heat"><span></span><span class="h">Morn</span><span class="h">Lunch</span><span class="h">Aft</span><span class="h">Eve</span><span class="h">Late</span>';
    grid.forEach(function (row, r) { out += '<span>' + days[r] + '</span>'; row.forEach(function (v, c) { out += cellFn(v, r, c); }); });
    return out + '</div>';
  }
  var BANDS = ['mornings', 'lunchtimes', 'afternoons', 'evenings', 'late nights'];
  var DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  // ---------- views ----------
  function privacyTip() {
    return '<span class="tipwrap"><button class="eye" data-action="tip" aria-expanded="false" aria-controls="privTip" aria-label="How your data stays private">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 11v6"/><circle cx="12" cy="7.2" r="0.6" fill="currentColor"/></svg></button>' +
      '<span class="tip" id="privTip" role="tooltip"><b>How your data stays private</b>' +
      '<span>Your export is opened by your own browser, on this device. It is never sent to Commish or anyone else.</span>' +
      '<span>Commish has no database and no file storage, so there is nowhere for your orders to go.</span>' +
      '<span>Want proof? Open Commish, switch on aeroplane mode, then add your export. It still works, because nothing is sent over the internet.</span></span></span>';
  }
  function mergeNote(g) {
    if (g.length < 2) return '';
    var m = merge(g), total = g.reduce(function (t, f) { return t + f.rows.length; }, 0);
    var tick = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var line = m.dupes
      ? num(m.dupes) + ' duplicate order' + (m.dupes === 1 ? '' : 's') + ' removed across your ' + g.length + ' exports. ' + num(m.rows.length) + ' unique orders, each counted once.'
      : 'No overlap between your ' + g.length + ' exports. ' + num(m.rows.length) + ' unique orders, each counted once.';
    if (S.plan !== 'pro') line += ' Free shows your latest 90 days; Pro shows everything you add.';
    return '<div class="alert t a-pop" style="display:flex;gap:10px;align-items:flex-start;margin-top:4px">' + tick + '<span>' + line + '</span></div>';
  }
  function viewUpload() {
    var g = goodFiles();
    var files = S.files.length ? '<div class="files a-in">' + S.files.map(function (f) {
      return '<div class="file t' + (f.error ? ' err' : '') + '"><b>' + esc(f.name) + '</b><span>' + (f.error ? esc(f.error) : num(f.rows.length) + ' orders, ' + fmtDs(f.min) + ' to ' + fmtDs(f.max)) + '</span></div>';
    }).join('') + '</div>' + mergeNote(g) : '';
    return '<section class="a-in"><h1>Let\'s find your commish</h1><p class="sub" style="font-size:17px;max-width:560px">Upload your TikTok affiliate orders export and see what you\'ve earned, what\'s still owed and what\'s working.</p></section>' +
      '<div class="grid2">' +
      '<div class="card t a-in" style="display:flex;gap:14px;animation-delay:100ms"><button class="video t" data-action="video" aria-label="Play the how-to video"><span class="a-pop" style="width:54px;height:54px;border-radius:50%;background:var(--pop);border:2.5px solid var(--chipInk);display:flex;align-items:center;justify-content:center;color:var(--ink);animation-delay:500ms"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg></span>How-to video coming soon</button>' +
      '<div class="steps"><p style="margin:0;font-size:19px;font-weight:800">Export in 3 taps</p><div class="step"><i class="t">1</i><span>Open your affiliate earnings in TikTok</span></div><div class="step"><i class="t">2</i><span>Tap download on your orders</span></div><div class="step"><i class="t">3</i><span>Pick up to 90 days and export</span></div></div></div>' +
      '<div style="display:flex;flex-direction:column;gap:14px"><div class="drop t a-in" id="drop" style="animation-delay:180ms"><span class="a-bob" aria-hidden="true" style="display:block;position:relative;width:74px;height:88px"><svg width="74" height="88" viewBox="0 0 74 88"><path d="M8 4h40l18 18v58a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" style="fill:var(--tint);stroke:var(--line)" stroke-width="3" stroke-linejoin="round"/><path d="M48 4v18h18" fill="none" style="stroke:var(--line)" stroke-width="3" stroke-linejoin="round"/><path d="M16 44h34M16 54h34M16 64h22" style="stroke:var(--line)" stroke-width="3" stroke-linecap="round"/></svg><span style="position:absolute;right:-10px;bottom:-6px;width:32px;height:32px;border-radius:50%;background:var(--pop);border:2.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-weight:800">£</span></span>' +
      '<button class="btn t" data-action="choose">Choose my export' + (g.length ? 's' : '') + '</button><p class="sub" style="margin:0">.xlsx or .csv. Add a few at once to cover a whole year.</p></div>' +
      '<div class="card dark t" style="display:flex;gap:12px;align-items:center;padding:14px 16px;border-radius:22px"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span style="font-size:15px;font-weight:600;line-height:1.35;flex:1 1 auto">Your file is read on this device and never uploaded anywhere.</span>' + privacyTip() + '</div>' +
      files +
      (g.length ? '<a class="btn" href="#home">See my commish</a><button class="linkish" data-action="clear">Remove all files</button>' : '<button class="linkish" data-action="demo" style="align-self:center">No export yet? Try it with demo data</button>') +
      '</div></div>';
  }

  function viewReveal(A) {
    var top = A.shops[0];
    return '<section class="conf-wrap" style="min-height:70vh;display:flex;flex-direction:column;gap:16px;padding-top:10px">' +
      '<p class="a-in" style="margin:20px 0 0;font-size:22px;font-weight:800">Here\'s your commish</p>' +
      '<div class="a-in" style="animation-delay:120ms"><p class="hero-num" style="font-size:92px">' + count(A.paid + A.owed, 'gbp', 200) + '</p><p class="sub" style="font-size:17px">earned or pending, ' + range(A.min, A.max) + '</p></div>' + conf(16, 10, 22) +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-top:8px;max-width:520px">' +
      '<div class="tile pink a-pop t" style="align-self:flex-start;transform-origin:left center;animation-delay:900ms"><p>Pending payment</p><b>' + gbp(A.owed) + '</b></div>' +
      '<div class="tile a-pop t" style="align-self:flex-end;transform-origin:right center;animation-delay:1100ms"><p>Best month</p><b>' + MONTHS[A.bestMonth.d.getMonth()] + '</b></div>' +
      (top ? '<div class="tile ink a-pop t" style="align-self:flex-start;transform-origin:left center;animation-delay:1300ms"><p>Top shop</p><b>' + esc(top.name) + '</b></div>' : '') +
      '</div><a class="btn a-in" href="#home" style="margin-top:20px;max-width:520px;box-shadow:5px 5px 0 var(--pop);animation-delay:1600ms">See my dashboard</a></section>';
  }

  function viewHome(A) {
    var pro = S.plan === 'pro';
    var out = '';
    if (pro) {
      out += '<section class="conf-wrap a-in"><p class="kicker">Your commish, ' + range(A.min, A.max) + '</p>' + top3(A) + conf(10, 150, 22) + '</section>';
      out += '<div class="tiles">' + tilePending(A, 100) + tileLost(A, 160) + tileRate(A, 220) + tilePer(A, 280) + '</div>' + insightsCard(A, S.plan === 'pro');
      var sel = S.sel == null ? A.curIdx : S.sel, m = A.months[sel];
      out += '<div class="card big t a-in" style="animation-delay:260ms"><div class="row-head"><h2>Your ' + A.year + '</h2><span style="font-size:13px;font-weight:600">Tap a month</span></div>' +
        (A.years.length > 1 ? '<div class="seg t" role="group" aria-label="Year" style="max-width:320px;margin-top:10px;grid-template-columns:repeat(' + Math.min(4, A.years.length) + ',minmax(0,1fr))">' + A.years.slice(-4).map(function (y) { return '<button data-action="year" data-v="' + y + '" aria-pressed="' + (y === A.year) + '">' + y + '</button>'; }).join('') + '</div>' : '') +
        '<div class="legend"><span><i class="key k-paid"></i>Paid</span><span><i class="key k-owed"></i>Pending payment</span><span><i class="key k-lost"></i>Lost</span></div>' + yearChart(A, 166, true) +
        '<div class="alert t" id="mDetail" style="margin-top:14px;display:flex;justify-content:space-between;gap:10px;align-items:center;border:0"><span data-t style="font-size:18px;font-weight:800">' + MONTHS[m.d.getMonth()] + ' ' + m.d.getFullYear() + '</span><span style="text-align:right"><span data-l1>' + gbp(m.paid) + ' paid</span><br><span data-l2>' + gbp(m.owed) + ' pending, ' + gbp(m.lost) + ' lost</span></span></div>';
      if (A.year === A.max.getFullYear()) out += '<p class="sub" style="margin-top:12px">This month you\'re on track for ' + gbp(A.forecast) + ' in commission (' + gbp(A.fc.soFar) + ' paid and pending in the first ' + A.fc.days + ' day' + (A.fc.days === 1 ? '' : 's') + ' of ' + A.fc.month + ', about ' + gbp(A.fc.perDay) + ' a day, multiplied by ' + A.fc.dim + ' days).</p>';
      var owedMonths = A.months.filter(function (x) { return x.owed > 0.5; });
      if (owedMonths.length) out += '<p class="sub">Still pending: ' + owedMonths.map(function (x) { return MONTHS[x.d.getMonth()] + ' ' + gbp(x.owed); }).join(', ') + '.</p>';
      var empty = A.months.filter(function (x) { return !x.n && !x.future; }).length;
      if (empty) out += '<p class="sub">' + empty + ' month' + (empty === 1 ? ' has' : 's have') + ' no data yet. <a href="#upload">Add older exports</a> to fill in your year.</p>';
      out += '</div>';
      out += '<div class="grid2">';
      var b = A.buyBest;
      out += '<div class="card pop t a-in" style="animation-delay:340ms"><h2>When your buyers buy</h2><p style="margin:4px 0 12px;font-size:14px;font-weight:600">' + DAYS[b[0]] + ' ' + BANDS[b[1]] + ' are your strongest. A good time to go Live.</p>' +
        heat(A.buyHeat, A.buyMax, function (v, r, c) { return '<span class="cell a-pop t" style="background:rgba(var(--cell),' + (0.06 + v / A.buyMax * 0.94).toFixed(2) + ');animation-delay:' + (450 + (r + c) * 45) + 'ms" title="' + gbp(v) + '"></span>'; }) + '</div>';
      var diff = A.actSettled - A.estSettled;
      out += '<div class="card t a-in" style="animation-delay:400ms"><h2>Payout check</h2><p class="sub">Settled orders: what TikTok estimated against what it paid.</p>' +
        '<div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px"><div class="tile t"><p>Estimated</p><b style="font-size:20px">' + gbp(A.estSettled) + '</b></div><div class="tile t"><p>Paid</p><b style="font-size:20px">' + gbp(A.actSettled) + '</b></div><div class="tile ink t"><p>Difference</p><b style="font-size:20px">' + (diff < 0 ? '−' : '+') + gbp(Math.abs(diff)) + '</b></div></div>' +
        '<div class="alert t" style="margin-top:12px">' + (A.short.length ? A.short.length + ' orders paid less than estimated, ' + gbp(A.short.reduce(function (s, r) { return s + r.est - r.actual; }, 0)) + ' short.' : 'Every settled order paid exactly what TikTok estimated.') + '</div>' +
        (A.stuck.length ? '<div class="alert pink t" style="margin-top:10px">' + A.stuck.length + ' orders worth ' + gbp(A.stuckVal) + ' have been pending for over 30 days. Most of yours settle in about ' + A.lagMed + ' days, so these are worth asking TikTok about.</div>' : '') +
        '<p class="sub" style="margin-top:10px">Payouts usually land on a ' + A.payday + '.</p></div>';
      out += '</div>';
      out += challengeCard(A, true);
    } else {
      out += '<section class="a-in"><p class="kicker">Your commish, ' + range(A.min, A.max) + ' (latest 90 days)</p>' + top3(A) + '</section>';
      if (A.hiddenRows) out += '<div class="alert t a-in"><b>' + num(A.hiddenRows) + ' older orders are hidden.</b> Free shows your latest 90 days. <button class="linkish" data-action="unlock" style="font-size:inherit;min-height:0">Unlock Pro</button> to see everything you\'ve added.</div>';
      out += '<div class="tiles">' + tilePending(A, 100) + tileLost(A, 160) + tileRate(A, 220) + tilePer(A, 280) + '</div>' + insightsCard(A, S.plan === 'pro');
      var wmax = Math.max.apply(null, A.weeks.map(function (w) { return w.paid + w.owed; })) || 1;
      var ws = S.wsel == null || S.wsel >= A.weeks.length ? A.weeks.length - 1 : S.wsel, wk = A.weeks[ws];
      var wlab = function (w) { return new Date(w.k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
      var nice = function (v) { var m = Math.pow(10, Math.floor(Math.log10(v || 1))); return Math.ceil(v / m * 2) / 2 * m; };
      var top = nice(wmax), PH = 130;
      out += '<div class="grid2"><div class="card t a-in" style="animation-delay:300ms"><h2>Week by week</h2><p class="sub">Commission from each week\'s orders. Tap a bar to see the week.</p>' +
        '<div class="legend"><span><i class="key k-paid"></i>Paid</span><span><i class="key k-owed"></i>Pending payment</span></div>' +
        '<div style="position:relative">' +
        '<span class="gridline" style="bottom:' + PH + 'px"><i>' + gbp(top) + '</i></span><span class="gridline" style="bottom:' + (PH / 2) + 'px"><i>' + gbp(top / 2) + '</i></span>' +
        '<div class="plot" style="height:' + (PH + 2) + 'px;padding-right:44px">' +
        A.weeks.map(function (w, i) { return '<button data-action="week" data-i="' + i + '" data-title="' + esc('Week of ' + wlab(w)) + '" data-l1="' + esc(gbp(w.paid) + ' paid') + '" data-l2="' + esc(gbp(w.owed) + ' pending') + '" aria-label="' + esc('Week of ' + wlab(w) + ': ' + gbp(w.paid) + ' paid, ' + gbp(w.owed) + ' pending') + '"><span class="stack a-bar' + (i === ws ? ' on' : '') + '" style="animation-delay:' + (350 + i * 50) + 'ms"><span class="s-owed" style="height:' + (w.owed / top * PH) + 'px"></span><span class="s-paid" style="height:' + (w.paid / top * PH) + 'px"></span></span></button>'; }).join('') +
        '</div></div><div class="ticks" style="padding-right:44px">' + A.weeks.map(function (w, i) { return '<span>' + (i % 3 === 0 || i === A.weeks.length - 1 ? wlab(w).replace(' ', '<br>') : '') + '</span>'; }).join('') + '</div>' +
        '<div class="alert t" id="wDetail" style="margin-top:12px;display:flex;justify-content:space-between;gap:10px;align-items:center;border:0"><b data-t>Week of ' + wlab(wk) + '</b><span style="text-align:right"><span data-l1>' + gbp(wk.paid) + ' paid</span><br><span data-l2>' + gbp(wk.owed) + ' pending</span></span></div>' +
        '<p class="sub" style="margin-top:12px">You average ' + gbp(A.perDay) + ' of commission a day, paid and pending.</p></div>';
      var all = data_all(); var have = {};
      all.forEach(function (f) { var c = new Date(f.min.getFullYear(), f.min.getMonth(), 1); while (c <= f.max) { have[c.getFullYear() * 12 + c.getMonth()] = 1; c = new Date(c.getFullYear(), c.getMonth() + 1, 1); } });
      var latest = { min: A.min, max: A.max }; var lk = latest.min.getFullYear() * 12 + latest.min.getMonth(), hk = latest.max.getFullYear() * 12 + latest.max.getMonth();
      var inR = function (mm) { var k = mm.d.getFullYear() * 12 + mm.d.getMonth(); return k >= lk && k <= hk; };
      var covered = A.months.filter(inR), nCov = covered.length, soFar = A.months.filter(function (x) { return !x.future; }).length;
      var mtop = Math.max.apply(null, covered.map(function (x) { return x.paid + x.owed; })) || 1;
      var kfmt = function (v) { return v >= 1000 ? '£' + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : gbp(v); };
      var bestCov = covered.slice().sort(function (a2, b2) { return (b2.paid + b2.owed) - (a2.paid + a2.owed); })[0];
      var yearPace = A.perDay * 365;
      out += '<div class="card t a-in" style="animation-delay:360ms"><div class="row-head"><h2>Your ' + A.year + ' so far</h2><span class="badge t">' + nCov + ' of ' + soFar + ' months</span></div>' +
        '<p class="sub">Free covers your latest 90 days, ' + range(latest.min, latest.max) + '. Here\'s what each month earned, paid and pending.</p>' +
        '<div class="yearmap">' + A.months.map(function (mm, i) {
          var have = inR(mm), v = mm.paid + mm.owed, h = have ? Math.max(8, v / mtop * 86) : 0;
          if (mm.future) return '<span class="ym" style="opacity:.4"><i class="ym-q" style="border-style:dotted">&nbsp;</i><b>' + MONTHS[mm.d.getMonth()].slice(0, 1) + '</b></span>';
          return '<span class="ym">' + (have
            ? '<em>' + kfmt(v) + '</em><i class="ym-bar a-bar' + (mm === bestCov ? ' best' : '') + '" style="height:' + h + 'px;animation-delay:' + (450 + i * 60) + 'ms"></i>'
            : '<i class="ym-q a-pop" style="animation-delay:' + (400 + i * 40) + 'ms">?</i>') +
            '<b>' + MONTHS[mm.d.getMonth()].slice(0, 1) + '</b></span>';
        }).join('') + '</div>' +
        '<div class="tiles" style="margin-top:14px">' +
        '<div class="tile t"><p>Best month here</p><b>' + MONTHS[bestCov.d.getMonth()] + '</b><small>' + gbp(bestCov.paid + bestCov.owed) + ' paid and pending</small></div>' +
        '<div class="tile pink t"><p>Your yearly pace</p><b>' + kfmt(yearPace) + '</b><small>If you keep earning ' + gbp(A.perDay) + ' a day</small></div></div>' +
        '<p class="sub" style="margin-top:12px">' + (soFar - nCov) + ' months of ' + A.year + ' are still a mystery. Was ' + MONTHS[bestCov.d.getMonth()] + ' your record? <button class="linkish" data-action="unlock" style="font-size:inherit;min-height:0">Unlock Pro</button> to merge older exports and find out.</p></div></div>';
      var tease = A.months.filter(function (x) { return !x.current && !x.future; }).filter(function (x) { return x.owed > 20; }).sort(function (a, b2) { return b2.owed - a.owed; })[0];
      out += locked('<h2>Your year</h2><div style="height:12px"></div>' + yearChart(A, 120, false), tease ? gbp(tease.owed) + ' is still pending from ' + MONTHS[tease.d.getMonth()] : 'Your whole year in one view', 'See every month of your year with Pro');
      out += challengeCard(A, false);
      out += nudge(A);
    }
    out += '<div class="card t a-in" style="animation-delay:460ms"><div class="row-head"><h2>Top shops</h2>' + (pro ? '<a href="#shops" style="font-weight:600">See all</a>' : '') + '</div><p class="sub">The shops that have earned you the most commission, paid and pending. Returned and cancelled orders don\'t count.</p><div style="margin-top:8px">' +
      A.shops.slice(0, 5).map(function (s, i) { return '<div class="list-row"><div style="display:flex;justify-content:space-between;gap:10px;font-size:15px;font-weight:600"><span>' + esc(s.name) + '</span><b>' + gbp(s.earned) + '</b></div>' + topLine(s) + '<div class="bar-track t" style="margin-top:6px"><div class="bar-fill a-barx" style="width:' + (s.earned / (A.shops[0].earned || 1) * 100) + '%;background:' + (i ? 'var(--owed)' : 'var(--paid)') + ';animation-delay:' + (600 + i * 90) + 'ms"></div></div></div>'; }).join('') + '</div></div>';
    return out;
  }
  function data_all() { return goodFiles(); }
  function topLine(s) { return s.top ? '<p class="topline">Top seller: ' + esc(s.top) + '</p>' : ''; }
  function top3(A) {
    return '<div class="top3">' +
      '<div class="box ink t"><p>Commission paid</p><b>' + count(A.paid, 'gbp', 100) + '</b></div>' +
      '<div class="box t"><p>GMV (sales you drove)</p><b>' + count(A.gmv, 'gbp', 160) + '</b></div>' +
      '<div class="box t"><p>Items sold</p><b>' + count(A.items, 'num', 220) + '</b></div></div>';
  }
  function tilePending(A, dl) { return '<div class="tile pink t a-in" style="animation-delay:' + dl + 'ms"><p>Pending payment</p><b>' + count(A.owed, 'gbp', dl) + '</b><small>Most settle within about ' + A.lagMed + ' days</small></div>'; }
  function tileLost(A, dl) { return '<div class="tile t a-in" style="animation-delay:' + dl + 'ms"><p>Commission lost (returns/cancellations)</p><b>' + count(A.lost, 'gbp', dl) + '</b>' +
    (A.lost > 0 ? '<small>' + gbp(A.lostRet) + ' returned, ' + gbp(A.lostInel) + ' cancelled or ruled ineligible</small>' : '') + '</div>'; }
  function insights(A) {
    var L = [], day = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    var add = function (v, icon, title, text) { L.push({ v: v, icon: icon, title: title, text: text }); };
    var shopOf = {}; A.shops.forEach(function (x) { shopOf[x.name] = x; });
    var safe = function (shopName, product) { var sh = shopOf[shopName]; if (sh && sh.n >= 10 && sh.lostRate >= 0.2) return false; return !(A.challenge || []).some(function (c) { return c.product === product && c.n >= 10; }); };
    (A.doubleDown || []).filter(function (x) { return safe(x.shop, x.p); }).slice(0, 2).forEach(function (x) {
      if (x.per >= 5) add(x.per * 2, 'video', 'Make another video for ' + shortName(x.p), x.vids === 1 ? 'You\'ve only made one video about it, and it earned ' + gbp(x.per) + '. A follow-up is your easiest win.' : 'You\'ve only made ' + x.vids + ' videos about it, and they earned ' + gbp(x.per) + ' each. A follow-up is your easiest win.');
    });
    var old = (A.content || []).filter(function (c) { return c.posted && (A.max - c.posted) / DAY > 45 && (c.recent || 0) >= 10 && !/live/i.test(c.type); }).sort(function (a, b) { return b.recent - a.recent; })[0];
    if (old) add(old.recent * 1.5, 'repeat', 'Your old video is still selling', 'A video from ' + fmtD(old.posted) + ' about ' + shortName(old.top) + ' earned ' + gbp(old.recent) + ' in the last 30 days. Try a part 2 or a fresh take on it.');
    if (A.bestPost && A.bestPost.n >= 3) add(A.bestPost.avg, 'clock', 'Post on ' + day[A.bestPost.i] + ' ' + BANDS[A.bestPost.j], 'Your videos posted then average ' + gbp(A.bestPost.avg) + ' each, from ' + A.bestPost.n + ' videos. A pattern worth testing, not a promise.');
    if (A.nLiveOrders >= 10 && A.livePer > A.vidPer * 1.3) add((A.livePer - A.vidPer) * 20, 'live', 'Go Live more often', 'A Live order earns you ' + gbp2(A.livePer) + ' on average, against ' + gbp2(A.vidPer) + ' from videos. Your buyers are busiest on ' + DAYS[A.buyBest[0]] + ' ' + BANDS[A.buyBest[1]] + '.');
    var risky = A.shops.filter(function (x) { return x.n >= 15 && x.lostRate >= 0.25; }).sort(function (a, b) { return b.lost - a.lost; })[0];
    if (risky) add(risky.lost, 'warn', 'Think twice about ' + risky.name, Math.round(risky.lostRate * 100) + '% of your orders from this shop were lost (' + gbp(risky.lost) + ' commission). Put your effort into shops that pay out.');
    var ch = (A.challenge || []).filter(function (c) { return c.n >= 10; })[0];
    if (ch) add(ch.est, 'flag', 'Ask TikTok about ' + shortName(ch.product), ch.n + ' orders earned nothing even though nothing was returned (' + gbp(ch.est) + '). Use "Worth checking" to copy the order IDs.');
    if (A.stuck && A.stuck.length) add(A.stuckVal, 'clock', gbp(A.stuckVal) + ' stuck in pending', A.stuck.length + ' orders have been pending for over 30 days. Most of yours settle in about ' + A.lagMed + ' days, so chase these.');
    var hi = A.rows.filter(function (r) { return r.status !== 'Ineligible' && parseFloat(r.rate) >= 15; }), lo = A.rows.filter(function (r) { return r.status !== 'Ineligible' && parseFloat(r.rate) > 0 && parseFloat(r.rate) <= 8; });
    if (hi.length >= 20 && lo.length >= 20) {
      var hp = hi.reduce(function (t, r) { return t + A.earned(r); }, 0) / hi.length, lp = lo.reduce(function (t, r) { return t + A.earned(r); }, 0) / lo.length;
      if (lp > hp * 1.5) add((lp - hp) * 10, 'pound', 'Low rates can still pay best', 'Products at 8% or less earn you ' + gbp2(lp) + ' an order, against ' + gbp2(hp) + ' at 15% or more. Big-ticket items beat high percentages.');
      else if (hp > lp * 1.2) add((hp - lp) * 10, 'pound', 'Lean into higher commission rates', 'Products at 15% or more earn you ' + gbp2(hp) + ' an order, against ' + gbp2(lp) + ' at 8% or less.');
    }
    if (A.lastFull && A.forecast && (A.lastFull.paid + A.lastFull.owed) > 0) {
      var ch2 = (A.forecast / (A.lastFull.paid + A.lastFull.owed) - 1) * 100;
      if (Math.abs(ch2) >= 10) add(Math.abs(A.forecast - A.lastFull.paid - A.lastFull.owed) / 3, ch2 > 0 ? 'up' : 'down', ch2 > 0 ? 'You\'re on track to beat last month' : 'This month is running behind', 'On track for ' + gbp(A.forecast) + ', ' + Math.abs(Math.round(ch2)) + '% ' + (ch2 > 0 ? 'up on' : 'down on') + ' ' + MONTHS[A.lastFull.d.getMonth()] + ' (' + gbp(A.lastFull.paid + A.lastFull.owed) + ').');
    }
    return L.sort(function (a, b) { return b.v - a.v; });
  }
  var INS_ICON = {
    video: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M11 10l3 2-3 2z"/>', repeat: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', live: '<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4"/><path d="M17.7 6.3a8 8 0 0 1 0 11.4"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17.2v.1"/>', flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>', pound: '<path d="M16 6.5A4 4 0 0 0 9 9v9"/><path d="M6 13h7"/><path d="M6 18h11"/>',
    up: '<path d="M4 17l6-6 4 4 6-7"/><path d="M14 8h6v6"/>', down: '<path d="M4 7l6 6 4-4 6 7"/><path d="M14 16h6v-6"/>'
  };
  function insightsCard(A, pro) {
    var L = insights(A); if (!L.length) return '';
    var item = function (x, i) {
      return '<div class="ins a-in" style="animation-delay:' + (300 + i * 90) + 'ms"><span class="ins-ic t"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + INS_ICON[x.icon] + '</svg></span><span><b>' + esc(x.title) + '</b><span>' + esc(x.text) + '</span></span></div>';
    };
    L = L.slice(0, 6);
    var head = '<div class="row-head"><h2>Insights</h2><span class="badge t">' + L.length + ' idea' + (L.length === 1 ? '' : 's') + '</span></div><p class="sub">Ideas to earn more, worked out from your own orders.</p>';
    if (pro) return '<div class="card big t a-in" style="animation-delay:200ms">' + head + '<div class="ins-list">' + L.slice(0, 6).map(item).join('') + '</div></div>';
    return '<div class="card t a-in locked" style="animation-delay:200ms">' + head + '<div class="ins-list">' + item(L[0], 0) + '</div>' +
      (L.length > 1 ? '<div class="blur" aria-hidden="true"><div class="ins-list">' + L.slice(1, 3).map(function () { return '<div class="ins"><span class="ins-ic"></span><span><b>Another idea for you</b><span>Worked out from your own orders and videos.</span></span></div>'; }).join('') + '</div></div>' +
      '<div class="over" style="top:auto;height:46%"><button class="btn" data-action="unlock">Unlock ' + (L.length - 1) + ' more with Pro</button></div>' : '') + '</div>';
  }
  function challengeCard(A, pro) {
    if (!A.nInel) return '';
    var head = '<div class="row-head"><h2>Worth checking</h2><span class="badge pink t">' + gbp(A.lostInel) + '</span></div>' +
      '<p class="sub">' + num(A.nInel) + ' orders earned no commission even though nothing was returned. Some are normal cancellations, but a big cluster from one product or shop is worth asking TikTok about.</p>';
    if (!pro) {
      var top = A.challenge[0];
      return '<div class="card t a-in locked" style="animation-delay:380ms">' + head + '<div class="blur" aria-hidden="true" style="margin-top:10px">' + A.challenge.slice(0, 3).map(function () { return '<div class="list-row"><b>Product name here</b><p class="topline">Shop name, 00 orders</p></div>'; }).join('') + '</div>' +
        '<div class="over" style="top:auto;height:62%"><span class="tag">Biggest: ' + gbp(top.est) + ' on ' + esc(shortName(top.product)) + '</span><button class="btn" data-action="unlock">Unlock Pro to see them all</button></div></div>';
    }
    return '<div class="card t a-in" style="animation-delay:380ms">' + head + '<div style="margin-top:8px">' + A.challenge.slice(0, 8).map(function (c, i) {
      return '<div class="list-row"><div style="display:flex;justify-content:space-between;gap:10px;font-size:15px;font-weight:700"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(shortName(c.product)) + '</span><b>' + gbp(c.est) + '</b></div>' +
        '<p class="topline">' + esc(c.shop) + ', ' + range(c.first, c.last) + '</p><p class="topline">' + num(c.n) + ' order' + (c.n === 1 ? '' : 's') + ' with no commission and nothing returned</p>' +
        '<button class="linkish" data-action="copyids" data-i="' + i + '" style="font-size:14px;min-height:36px">Copy order IDs for TikTok support</button></div>';
    }).join('') + (A.challenge.length > 8 ? '<p class="sub">Plus ' + (A.challenge.length - 8) + ' smaller ones.</p>' : '') + '</div></div>';
  }
  function tileRate(A, dl) { return '<div class="tile t a-in" style="animation-delay:' + dl + 'ms"><p>Real commission rate</p><b>' + A.effRate.toFixed(1) + '%</b><small>You earn ' + gbp2(A.effRate) + ' for every £100 of sales you drive</small></div>'; }
  function tilePer(A, dl) { return '<div class="tile ink t a-in" style="animation-delay:' + dl + 'ms"><p>Commission per order (average)</p><b>' + gbp2(A.perOrder) + '</b></div>'; }

  function viewShops(A) {
    if (S.plan !== 'pro') return '<section class="a-in"><h1>Your shops</h1><p class="sub">' + A.shops.length + ' shops paid you commish in your latest 90 days.</p></section>' +
      locked('<h2>All shops</h2>' + A.shops.slice(0, 6).map(function (s) { return '<div class="list-row"><b>' + esc(s.name) + '</b> ' + gbp(s.earned) + '</div>'; }).join(''), 'Which shops lose your orders', 'Lost rates, UK vs overseas sellers and new shops');
    var list = A.shops.slice().sort(function (a, b) { return S.shopSort === 'lost' ? b.lost - a.lost || b.lostRate - a.lostRate : b.earned - a.earned; }).slice(0, 25);
    var out = '<section class="a-in"><h1>Your shops</h1><p class="sub">' + A.shops.length + ' shops paid you commish' + (A.newShops.length ? '. ' + A.newShops.length + ' are new this month.' : '.') + '</p></section>';
    out += '<div class="seg t a-in" role="group" aria-label="Sort shops by" style="max-width:420px"><button data-action="sort" data-v="earned" aria-pressed="' + (S.shopSort !== 'lost') + '">Most earned</button><button data-action="sort" data-v="lost" aria-pressed="' + (S.shopSort === 'lost') + '">Most lost</button></div>';
    out += '<div class="grid2"><div class="card big t a-in" style="animation-delay:120ms">' + list.map(function (s, i) {
      return '<div class="list-row"><div style="display:flex;justify-content:space-between;gap:8px;font-size:16px;font-weight:800"><span>' + esc(s.name) + '</span><span>' + gbp(s.earned) + '</span></div>' + topLine(s) + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px">' + (s.code ? '<span class="badge t' + (s.overseas ? ' pink' : '') + '">' + (s.overseas ? 'Overseas seller' : 'UK seller') + '</span>' : '<span></span>') +
        '<span style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600"><span class="bar-track t" style="width:70px;height:10px"><span class="bar-fill a-barx" style="display:block;width:' + Math.min(100, s.lostRate * 100) + '%;background:var(--ink);animation-delay:' + (300 + i * 50) + 'ms"></span></span>' + Math.round(s.lostRate * 100) + '% lost</span></div>' +
        (s.lostN ? '<p class="topline" style="text-align:right">' + num(s.lostN) + ' of ' + num(s.n) + ' order' + (s.n === 1 ? '' : 's') + ' lost' + (s.lostItems && s.lostItems !== s.lostN ? ' (' + num(s.lostItems) + ' items)' : '') + ', ' + gbp(s.lost) + ' commission</p>' +
        '<p class="topline" style="text-align:right">' + num(s.retN) + ' returned, ' + num(s.inelN) + ' cancelled or ruled ineligible</p>' : '') + '</div>';
    }).join('') + '</div><div style="display:flex;flex-direction:column;gap:16px">';
    if (A.ukLost != null && A.osLost != null) {
      var mx = Math.max(A.ukLost, A.osLost, 0.01);
      out += '<div class="card pop t a-in" style="animation-delay:220ms"><h2>' + (A.osLost > A.ukLost ? 'Overseas sellers lose more of your orders' : 'UK sellers lose more of your orders') + '</h2>' +
        [['UK sellers', A.ukLost, 'var(--paid)'], ['Overseas sellers', A.osLost, 'var(--ink)']].map(function (x, i) { return '<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:15px;font-weight:600"><span>' + x[0] + '</span><b>' + Math.round(x[1] * 100) + '% lost</b></div><div class="t" style="height:18px;border-radius:9px;background:var(--card);border:2px solid var(--line);margin-top:5px;overflow:hidden"><div class="a-barx" style="height:100%;width:' + Math.min(100, x[1] * 100) + '%;background:' + x[2] + ';animation-delay:' + (500 + i * 150) + 'ms"></div></div></div>'; }).join('') +
        '<p style="margin:12px 0 0;font-size:14px">Worth weighing up when you pick what to promote next.</p></div>';
    }
    if (A.newShops.length) out += '<div class="card t a-in" style="animation-delay:300ms"><h2>New this month</h2><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">' + A.newShops.map(function (s, i) { return '<span class="badge a-pop t" style="font-size:15px;padding:8px 12px;border-radius:18px;animation-delay:' + (500 + i * 100) + 'ms">' + esc(s) + '</span>'; }).join('') + '</div></div>';
    return out + '</div></div>';
  }

  function viewVideos(A) {
    if (S.plan !== 'pro') return '<section class="a-in"><h1>Your videos</h1><p class="sub">' + A.nContent + ' videos and Lives earned you commish in your latest 90 days.</p></section>' +
      locked('<h2>When your top earners went up</h2><div style="height:180px"></div>', Math.round(A.evergreen) + '% came from older videos', 'Evergreen videos, posting times and Lives');
    var cols = ['#FF6FB5', '#FFFFFF', '#FFE45C', '#3DDC97', '#B9A6FF', '#0B0716'];
    var out = '<section class="a-in"><h1>Your videos</h1><p class="sub">' + A.nVideos + ' videos and ' + A.nLives + ' Lives earned you commish.</p></section><div class="grid2">';
    out += '<div class="card dark t a-in" style="animation-delay:80ms"><p style="margin:0;font-size:64px;font-weight:800;letter-spacing:-.05em;line-height:.95">' + count(A.evergreen, 'pct') + '</p><p style="margin:6px 0 14px;font-size:17px;font-weight:600;line-height:1.35">of your commish came from videos more than a month old. Your back catalogue is still paying you.</p>' +
      '<div style="display:flex;height:28px;gap:3px">' + A.ages.map(function (a, i) { return a.pct > 0.4 ? '<span class="a-barx" style="flex:' + a.pct + ' 1 0;min-width:6px;border-radius:7px;border:2px solid var(--chipInk);background:' + cols[i] + ';animation-delay:' + (300 + i * 110) + 'ms"></span>' : ''; }).join('') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 10px;margin-top:12px;font-size:13px">' + A.ages.map(function (a, i) { return '<span style="display:flex;gap:6px;align-items:center"><span style="width:12px;height:12px;border-radius:4px;border:2px solid var(--chipInk);background:' + cols[i] + '"></span>' + a.label + ' ' + Math.round(a.pct) + '%</span>'; }).join('') + '</div></div>';
    var bp = A.bestPost;
    out += '<div class="card big t a-in" style="animation-delay:160ms"><h2>When your top earners went up</h2><p class="sub" style="margin-bottom:12px">Average commish per video by posting time. Slots with fewer than 3 videos are greyed out.</p>' +
      heat(A.postHeat, A.postMax, function (v, r, c) { if (!v) return '<span class="cell none a-pop" style="animation-delay:' + (450 + (r + c) * 45) + 'ms"></span>'; var a = v.avg / A.postMax; return '<span class="cell a-pop t" style="color:' + (a > 0.55 ? 'var(--card)' : 'var(--ink)') + ';background:rgba(var(--cell),' + (0.08 + a * 0.92).toFixed(2) + ');animation-delay:' + (450 + (r + c) * 45) + 'ms" title="' + v.n + ' videos">' + gbp(v.avg) + '</span>'; }) +
      (bp ? '<p style="margin:12px 0 0;font-size:14px;font-weight:600">Videos posted on ' + DAYS[bp.i] + ' ' + BANDS[bp.j] + ' average ' + gbp(bp.avg) + ' each, from ' + bp.n + ' videos. A pattern, not a promise.</p>' : '') + '</div>';
    if (A.lives.length) out += '<div class="card t a-in" style="animation-delay:240ms"><h2>Lives leaderboard</h2><div style="margin-top:10px">' + A.lives.map(function (l, i) {
      return '<div style="display:grid;grid-template-columns:30px minmax(0,1fr) 70px;gap:10px;align-items:center;padding:7px 0"><span class="t" style="width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;border:2px solid var(--line);background:' + (i ? 'var(--tint)' : 'var(--hero)') + ';color:' + (i ? 'var(--ink)' : 'var(--card)') + '">' + (i + 1) + '</span><span style="display:flex;flex-direction:column;gap:4px"><span style="font-size:14px;font-weight:600">' + (l.posted ? l.posted.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Live') + '</span><span class="bar-track t" style="height:10px"><span class="bar-fill a-barx" style="display:block;width:' + (l.e / A.lives[0].e * 100) + '%;animation-delay:' + (500 + i * 90) + 'ms"></span></span></span><b style="text-align:right">' + gbp(l.e) + '</b></div>';
    }).join('') + '</div></div>';
    if (A.doubleDown.length) out += '<div class="card pop t a-in" style="animation-delay:320ms"><h2>Make another one of these</h2><p style="margin:6px 0 12px;font-size:14px">High earners per video, with only one or two videos so far.</p>' + A.doubleDown.map(function (x) {
      return '<div class="card t" style="padding:10px 12px;border-radius:18px;display:flex;justify-content:space-between;gap:8px;margin-top:8px"><span style="font-size:15px;font-weight:600">' + esc(shortName(x.p)) + (x.shop ? ', ' + esc(x.shop) : '') + '</span><b style="white-space:nowrap">' + gbp(x.per) + ' a video</b></div>';
    }).join('') + '</div>';
    return out + '</div>';
  }

  function viewTax(A) {
    if (S.plan !== 'pro') return '<section class="a-in"><h1>Tax year</h1><p class="sub">Commission settled into your TikTok balance, 6 April to 5 April.</p></section>' +
      locked('<div class="slot"></div><div class="receipt" style="height:260px"></div>', 'Your tax year, sorted', 'Totals by UK tax year, ready for your accountant');
    if (!A.taxYears.length) return '<section class="a-in"><h1>Tax year</h1><p class="sub">No settled orders yet, so nothing to total up.</p></section>';
    var yr = S.taxYear != null ? S.taxYear : A.taxYears[0].y;
    var T = A.taxYears.find(function (t) { return t.y === yr; }) || A.taxYears[0];
    var label = function (y) { return y + '/' + String(y + 1).slice(2); };
    var startTY = new Date(T.y, 3, 6), endTY = new Date(T.y + 1, 3, 5);
    var coveredFrom = A.min, complete = coveredFrom <= new Date(+startTY + 20 * DAY);
    var current = T.y === A.taxNow;
    var monthsCount = Object.keys(T.months).length || 1;
    var bestM = Object.keys(T.months).sort(function (a, b) { return T.months[b] - T.months[a]; })[0];
    var owedLine = current ? '<div class="line"><span>Pending payment, counts when paid</span><b>' + gbp(A.owed) + '</b></div>' : '';
    var note = complete ? (current ? 'Covers this tax year so far.' : 'This tax year is fully covered by your exports.') : 'Your exports start ' + fmtD(coveredFrom) + ', so this year is only partly covered. Add older exports to complete it.';
    var out = '<section class="a-in"><h1>Tax year</h1><p class="sub">Commission settled into your TikTok balance, grouped by the date TikTok settled it. Withdrawals to your bank are not in the orders export, so they are not counted here.</p></section>';
    out += '<div class="seg t a-in" role="group" aria-label="Tax year" style="max-width:420px;grid-template-columns:repeat(' + Math.min(3, A.taxYears.length) + ',minmax(0,1fr))">' + A.taxYears.slice(0, 3).map(function (t) { return '<button data-action="taxyear" data-v="' + t.y + '" aria-pressed="' + (t.y === T.y) + '">' + label(t.y) + (t.y === A.taxNow ? ' so far' : '') + '</button>'; }).join('') + '</div>';
    out += '<div style="max-width:560px;width:100%"><div style="overflow:hidden;padding-top:2px"><div class="slot t"></div><div class="receipt a-print t" id="receipt">' +
      '<p style="margin:0;text-align:center;font-size:15px;font-weight:600">6 Apr ' + T.y + ' to ' + (current ? fmtD(A.max) : '5 Apr ' + (T.y + 1)) + '</p>' +
      '<p style="margin:14px 0 4px;font-size:15px;font-weight:600">Settled into your TikTok balance</p><p style="margin:0;font-size:56px;font-weight:800;letter-spacing:-.05em;line-height:1;color:var(--hero)">' + count(T.paid, 'gbp', 600) + '</p><hr>' +
      '<div class="line"><span>Settled orders</span><b>' + num(T.n) + '</b></div><div class="line"><span>Monthly average</span><b>' + gbp(T.paid / monthsCount) + '</b></div>' +
      (bestM != null ? '<div class="line"><span>Best month</span><b>' + MONTHS[bestM] + ', ' + gbp(T.months[bestM]) + '</b></div>' : '') + owedLine +
      '<hr><p class="sub" style="margin:0">' + note + '</p><span class="stamp a-stamp t' + (complete ? '' : ' ink') + '" style="animation-delay:1300ms">' + (complete ? 'Sorted' : 'Part year') + '</span></div></div></div>';
    out += '<div style="display:flex;flex-wrap:wrap;gap:10px;max-width:560px"><button class="btn" data-action="copytax" data-v="' + T.y + '">Copy for my accountant</button><button class="btn ghost" data-action="print">Save as PDF</button></div>';
    out += '<p class="sub" style="max-width:560px">Based on the exports you\'ve added. A summary to help you, not tax advice.</p>';
    return out;
  }

  // ---------- render & routing ----------
  var ROUTES = ['upload', 'reveal', 'home', 'shops', 'videos', 'tax'];
  function route() { var h = (location.hash || '').replace('#', ''); if (ROUTES.indexOf(h) < 0) h = goodFiles().length ? 'home' : 'upload'; if (h !== 'upload' && !goodFiles().length) h = 'upload'; return h; }
  function navs(cur) {
    var items = [['home', 'Home', 'home'], ['shops', 'Shops', 'shops'], ['videos', 'Videos', 'videos'], ['tax', 'Tax', 'tax'], ['upload', 'Files', 'upload']];
    var hasData = goodFiles().length > 0;
    $('#bottomnav').hidden = !hasData; $('#topnav').hidden = !hasData;
    if (!hasData) items = [];
    $('#bottomnav').innerHTML = items.map(function (x) { return '<a href="#' + x[0] + '"' + (cur === x[0] ? ' aria-current="page"' : '') + '>' + svg(x[2]) + x[1] + '</a>'; }).join('');
    $('#topnav').innerHTML = items.map(function (x) { return '<a class="t" href="#' + x[0] + '"' + (cur === x[0] ? ' aria-current="page"' : '') + '>' + x[1] + '</a>'; }).join('');
    $('#planLabel').textContent = S.plan === 'pro' ? 'Pro preview' : 'Free';
    $('#planBtn').setAttribute('aria-pressed', S.plan === 'pro');
  }
  function pickBar(btn, detailSel, ticks) {
    var plot = btn.parentNode, i = Array.prototype.indexOf.call(plot.children, btn);
    plot.querySelectorAll('.stack.on').forEach(function (x) { x.classList.remove('on'); });
    var st = btn.querySelector('.stack'); if (st) st.classList.add('on');
    if (ticks) { var tk = plot.parentNode.querySelector('.ticks'); if (tk) Array.prototype.forEach.call(tk.children, function (x, j) { x.classList.toggle('on', j === i); }); }
    var d = $(detailSel); if (!d) return;
    d.querySelector('[data-t]').textContent = btn.dataset.title;
    d.querySelector('[data-l1]').textContent = btn.dataset.l1;
    d.querySelector('[data-l2]').textContent = btn.dataset.l2;
  }
  var SECTIONS = ['home', 'shops', 'videos', 'tax'];
  var dashShown = false, spyLock = 0;
  function render(quiet) {
    var keepY = quiet ? window.scrollY : 0;
    document.documentElement.classList.toggle('quiet', !!quiet);
    var r = route(), html;
    if (r === 'upload') { html = viewUpload(); dashShown = false; }
    else {
      var A = data();
      var parts = { home: viewHome(A), shops: viewShops(A), videos: viewVideos(A), tax: viewTax(A) };
      html = SECTIONS.map(function (k, i) { return '<section class="dsec' + (i && !quiet ? ' pending' : '') + '" id="sec-' + k + '" data-sec="' + k + '" aria-label="' + k + '">' + parts[k] + '</section>'; }).join('');
      dashShown = true;
    }
    $('#app').innerHTML = html + '<p class="foot">Commish is not affiliated with TikTok. Figures come straight from your export file.<br>Version 18 Nov, 09:05</p>';
    navs(r === 'reveal' ? 'home' : r);
    bindDrop();
    if (r === 'upload') { countUp(document, quiet); return; }
    var first = $('#sec-home'); if (first) countUp(first, quiet);
    if (quiet) { document.querySelectorAll('.dsec').forEach(function (x) { x.classList.remove('pending'); }); window.scrollTo(0, keepY); }
    reveal();
  }
  function goSection(k, smooth) {
    var el = $('#sec-' + k); if (!el) return;
    spyLock = Date.now() + 900;
    navs(k);
    if (k === 'home') window.scrollTo({ top: 0, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    else el.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
  }
  function reveal() {
    document.querySelectorAll('.dsec.pending').forEach(function (sec) {
      if (sec.getBoundingClientRect().top < window.innerHeight * 0.85) { sec.classList.remove('pending'); countUp(sec, false); }
    });
  }
  function spy() {
    if (!dashShown) return;
    reveal();
    if (Date.now() < spyLock) return;
    var cur = 'home';
    document.querySelectorAll('.dsec').forEach(function (sec) { if (sec.getBoundingClientRect().top < window.innerHeight * 0.35) cur = sec.dataset.sec; });
    if ((window.innerHeight + window.scrollY) >= document.body.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1];
    if (location.hash !== '#' + cur) { try { history.replaceState(null, '', '#' + cur); } catch (e) {} navs(cur); }
  }
  var spyQueued = false;
  window.addEventListener('scroll', function () { if (spyQueued) return; spyQueued = true; requestAnimationFrame(function () { spyQueued = false; spy(); }); }, { passive: true });
  function countUp(root, quiet) {
    var els = (root || document).querySelectorAll('[data-count]');
    els.forEach(function (el) {
      var target = parseFloat(el.dataset.count), fmt = el.dataset.fmt, delay = +el.dataset.delay || 0;
      var show = function (v) { el.textContent = fmtVal(v, fmt); };
      if (reduceMotion || quiet) { show(target); return; }
      show(0); var t0 = null;
      var step = function (ts) { if (!t0) t0 = ts; var p = Math.min(1, Math.max(0, (ts - t0 - delay) / 1400)); show(target * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  function toast(msg) { var h = $('#toastHost'); h.innerHTML = '<div class="toast">' + esc(msg) + '</div>'; clearTimeout(toast.t); toast.t = setTimeout(function () { h.innerHTML = ''; }, 3600); }

  // ---------- files ----------
  function addFiles(list) {
    var arr = Array.prototype.slice.call(list); if (!arr.length) return;
    S.files = S.files.filter(function (f) { return !f.demo; });
    Promise.all(arr.map(function (f) { return readFile(f).catch(function (e) { return { name: f.name, error: e.message, rows: [] }; }); })).then(function (res) {
      res.forEach(function (f) { S.files.push(f); });
      if (goodFiles().length) { location.hash = '#home'; render(); } else render();
    });
  }
  function bindDrop() {
    var dz = $('#drop'); if (!dz) return;
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-action]'); if (!b) return;
    var a = b.dataset.action;
    if (a === 'choose') $('#fileInput').click();
    else if (a === 'demo') { S.files = makeDemo(); location.hash = '#home'; render(); }
    else if (a === 'clear') { S.files = []; render(); }
    else if (a === 'month') { S.sel = +b.dataset.i; pickBar(b, '#mDetail', true); }
    else if (a === 'week') { S.wsel = +b.dataset.i; pickBar(b, '#wDetail', false); }
    else if (a === 'year') { S.year = +b.dataset.v; S.sel = null; render(true); }
    else if (a === 'sort') { S.shopSort = b.dataset.v; render(true); }
    else if (a === 'taxyear') { S.taxYear = +b.dataset.v; render(true); }
    else if (a === 'unlock') { setPlan('pro'); toast("Payments aren't switched on yet, so here's a free Pro preview."); }
    else if (a === 'tip') { var w = b.parentNode, open = !w.classList.contains('open'); w.classList.toggle('open', open); b.setAttribute('aria-expanded', open); }
    else if (a === 'video') toast('Your how-to video will go here.');
    else if (a === 'print') window.print();
    else if (a === 'copyids') {
      var Ad = data(), c = Ad.challenge[+b.dataset.i];
      var lines = ['Affiliate orders marked Ineligible with no items refunded', 'Product: ' + c.product, 'Shop: ' + c.shop, 'Orders: ' + c.n + ', estimated commission ' + gbp2(c.est), '', 'Order ID, order date, items, estimated commission'];
      c.rows.slice().sort(function (x, y) { return x.odate - y.odate; }).forEach(function (r) { lines.push(r.oid + ', ' + fmtD(r.odate) + ', ' + r.items + ', ' + gbp2(r.est)); });
      if (navigator.clipboard) navigator.clipboard.writeText(lines.join('\n')).then(function () { toast('Copied ' + c.n + ' order IDs. Paste them into your message to TikTok Shop support.'); }, function () { toast('Copying was blocked by your browser.'); });
    }
    else if (a === 'copytax') {
      var A = data(), T = A.taxYears.find(function (t) { return t.y === +b.dataset.v; });
      var txt = 'TikTok Shop affiliate commission, tax year ' + T.y + '/' + String(T.y + 1).slice(2) + '\nCommission settled into my TikTok balance: ' + gbp2(T.paid) + '\nSettled orders: ' + T.n + '\nSource: TikTok affiliate orders export, totalled by Commish by settlement date (not withdrawal date).';
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Copied. Paste it into an email to your accountant.'); }, function () { toast('Copying was blocked by your browser.'); });
    }
  });
  $('#fileInput').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  function setPlan(p) { S.plan = p; try { localStorage.setItem('commish-plan', p); } catch (e) {} S.sel = null; render(); }
  $('#planBtn').addEventListener('click', function () { setPlan(S.plan === 'pro' ? 'free' : 'pro'); });
  $('#themeBtn').addEventListener('click', function () {
    var dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('#themeBtn').setAttribute('aria-pressed', dark);
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#17112B' : '#FFE45C';
    try { localStorage.setItem('commish-theme', dark ? 'dark' : 'light'); } catch (e) {}
  });
  $('#themeBtn').setAttribute('aria-pressed', document.documentElement.dataset.theme === 'dark');
  window.addEventListener('hashchange', function () {
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('nav')) document.activeElement.blur();
    var r = route();
    if (r !== 'upload' && dashShown && SECTIONS.indexOf(r) >= 0) { goSection(r, true); return; }
    render(); window.scrollTo(0, 0);
    if (SECTIONS.indexOf(r) > 0) setTimeout(function () { goSection(r, false); }, 30);
  });
  window.__commish = { S: S, data: data, makeDemo: makeDemo };
  render();
  (function () { var r = route(); if (SECTIONS.indexOf(r) > 0) setTimeout(function () { goSection(r, false); }, 30); })();
})();
