/* Dorothea Hub — app logic
   Plain JavaScript, no build step. Reads window.CASE_DATA from data/case-data.js.
   Personal notes and added appointments are kept in this browser's localStorage. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ Storage */
  var KEYS = { data: 'dh:data:v1', notes: 'dh:notes:v1' };

  function readStore(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
  function removeStore(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  var BUILT_IN = window.CASE_DATA || null;
  var override = readStore(KEYS.data);
  var D = override || BUILT_IN;
  var usingOverride = !!override;

  var NOTES = readStore(KEYS.notes) || { v: 1, prep: {}, appts: [] };
  if (!NOTES.prep) NOTES.prep = {};
  if (!NOTES.appts) NOTES.appts = [];
  function ensureLogs() {
    if (!NOTES.sleep) NOTES.sleep = [];
    if (!NOTES.incidents) NOTES.incidents = [];
  }
  ensureLogs();
  function saveNotes() { return writeStore(KEYS.notes, NOTES); }

  /* --------------------------------------------------------------- Utilities */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function parseD(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return null;
    var precision = m[3] ? 'day' : 'month';
    return { d: new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1), precision: precision };
  }
  function fmt(s, long) {
    var p = parseD(s);
    if (!p) return s || '';
    var mo = long ? MONTHS_LONG[p.d.getMonth()] : MONTHS[p.d.getMonth()];
    return p.precision === 'month' ? mo + ' ' + p.d.getFullYear() : p.d.getDate() + ' ' + mo + ' ' + p.d.getFullYear();
  }
  var DAY = 86400000;
  function dayDiff(a, b) { return Math.round((b - a) / DAY); }

  var TODAY = (function () {
    var q = new URLSearchParams(location.search).get('today');
    var p = q && parseD(q);
    var t = p ? p.d : new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  })();
  function todayISO() {
    var m = TODAY.getMonth() + 1, d = TODAY.getDate();
    return TODAY.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  /* For month-only dates, treat "upcoming" as any time up to the end of that month. */
  function isFuture(s) {
    var p = parseD(s); if (!p) return false;
    if (p.precision === 'month') {
      var end = new Date(p.d.getFullYear(), p.d.getMonth() + 1, 0);
      return end >= TODAY;
    }
    return p.d >= TODAY;
  }
  function relative(s) {
    var p = parseD(s); if (!p) return '';
    if (p.precision === 'month') {
      var months = (p.d.getFullYear() - TODAY.getFullYear()) * 12 + p.d.getMonth() - TODAY.getMonth();
      if (months === 0) return 'this month';
      if (months === 1) return 'next month';
      if (months > 1) return 'in ' + months + ' months';
      return months === -1 ? 'last month' : (-months) + ' months ago';
    }
    var n = dayDiff(TODAY, p.d);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    if (n > 1 && n < 60) return 'in ' + n + ' days';
    if (n < -1 && n > -60) return (-n) + ' days ago';
    var mths = Math.round(Math.abs(n) / 30.44);
    return n > 0 ? 'in ' + mths + ' months' : mths + ' months ago';
  }
  function ageText(dob) {
    var p = parseD(dob); if (!p) return '';
    var y = TODAY.getFullYear() - p.d.getFullYear();
    var m = TODAY.getMonth() - p.d.getMonth();
    if (TODAY.getDate() < p.d.getDate()) m -= 1;
    if (m < 0) { y -= 1; m += 12; }
    return y + (y === 1 ? ' year' : ' years') + (m ? ', ' + m + (m === 1 ? ' month' : ' months') : '');
  }
  function sortKey(s) { var p = parseD(s); return p ? p.d.getTime() : 0; }

  function domainLabel(key) {
    var d = D.domains && D.domains[key];
    return d ? d.label : (key || 'Other');
  }
  function domainShort(key) {
    var d = D.domains && D.domains[key];
    return d ? d.short : (key || 'Other');
  }

  /* -------------------------------------------------------------------- Icons */
  var ICON = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
    timeline: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/>',
    ehcp: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="m9 13 2 2 4-4"/>',
    prep: '<path d="M8 3v3M16 3v3"/><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17"/><path d="m8.5 15 2 2 4.5-4.5"/>',
    messages: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    health: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7.5 2.9C19.5 15.4 12 20 12 20Z"/>',
    dorothea: '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7Z"/>',
    people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.4.2 4.3 1.8 4.8 4.4"/>',
    evidence: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="m10 14 1.5 1.5L15 12"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    inbox: '<path d="M17 7 7 17"/><path d="M15 17H7V9"/>',
    outbox: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
    print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    support: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'
  };
  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" aria-hidden="true" viewBox="0 0 24 24">' + (ICON[name] || '') + '</svg>';
  }

  /* ------------------------------------------------------------------ Routes */
  var ROUTES = [
    { key: 'home', label: 'Overview', icon: 'home', desc: 'Where things stand today' },
    { key: 'timeline', label: 'Timeline', icon: 'timeline', desc: 'Everything in date order' },
    { key: 'ehcp', label: 'EHC assessment', icon: 'ehcp', desc: 'Statutory clock, advice and next steps' },
    { key: 'prep', label: 'Appointment prep', icon: 'prep', desc: 'Questions, notes and what to bring' },
    { key: 'messages', label: 'Letters and emails', icon: 'messages', desc: 'Who said what, and what we’re waiting for' },
    { key: 'health', label: 'Health', icon: 'health', desc: 'Diagnoses, concerns and referrals' },
    { key: 'dorothea', label: 'About Dorothea', icon: 'dorothea', desc: 'Strengths, needs and what works' },
    { key: 'support', label: 'Support and benefits', icon: 'support', desc: 'Sleep diary, road-safety log, DLA and Blue Badge' },
    { key: 'people', label: 'People', icon: 'people', desc: 'Professionals and contacts' },
    { key: 'evidence', label: 'Evidence check', icon: 'evidence', desc: 'Conflicts, gaps and the evidence index' }
  ];
  var TABS = ['home', 'timeline', 'ehcp', 'prep', 'more'];

  function awaitingCount() {
    return D ? arr(D.correspondence).filter(function (c) { return c.status === "awaiting reply"; }).length : 0;
  }

  function renderNav(active) {
    var count = awaitingCount();
    $('#nav').innerHTML = ROUTES.map(function (r) {
      var badge = r.key === 'messages' && count ? '<span class="count" aria-label="' + count + ' awaiting reply">' + count + '</span>' : '';
      return '<a href="#/' + r.key + '"' + (r.key === active ? ' aria-current="page"' : '') + '>' + icon(r.icon) + '<span>' + esc(r.label) + '</span>' + badge + '</a>';
    }).join('');

    var inMore = TABS.indexOf(active) === -1;
    $('#tabbar').innerHTML = TABS.map(function (k) {
      var r = k === 'more' ? { key: 'more', label: 'More', icon: 'more' } : ROUTES.filter(function (x) { return x.key === k; })[0];
      var current = k === active || (k === 'more' && inMore && active !== 'search');
      var short = { home: 'Overview', timeline: 'Timeline', ehcp: 'EHCP', prep: 'Prep', more: 'More' }[k];
      var badge = k === 'more' && count ? '<span class="count">' + count + '</span>' : '';
      return '<a href="#/' + r.key + '"' + (current ? ' aria-current="page"' : '') + '>' + icon(r.icon) + '<span>' + short + '</span>' + badge + '</a>';
    }).join('');
  }

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var qi = h.indexOf('?');
    var query = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : '');
    var parts = (qi >= 0 ? h.slice(0, qi) : h).split('/').filter(Boolean).map(decodeURIComponent);
    return { route: parts[0] || 'home', param: parts[1] || null, query: query };
  }

  var VIEWS = {};

  function render() {
    if (!D) {
      renderNav('home');
      $('#main').innerHTML =
        '<section class="hello"><div class="avatar" aria-hidden="true">D</div><div>' +
        '<h1>Load your data to begin</h1>' +
        '<p class="headline">Dorothea’s information isn’t stored on this website. Choose your <code>case-data.json</code> file once on this device and it will stay here, in this browser only.</p></div></section>' +
        '<div class="btn-row"><button class="btn btn-primary" type="button" data-action="open-settings">Load data file</button></div>' +
        '<p class="tiny section-gap">On iPhone, add the site to your Home Screen first and load the file from the Home Screen icon — Safari and the icon keep separate storage.</p>';
      return;
    }
    var r = parseHash();
    var view = VIEWS[r.route] || VIEWS.home;
    var activeKey = VIEWS[r.route] ? r.route : 'home';
    renderNav(activeKey);
    var main = $('#main');
    main.innerHTML = view.html(r);
    if (view.bind) view.bind(main, r);
    var title = (ROUTES.filter(function (x) { return x.key === activeKey; })[0] || {}).label;
    document.title = (title && activeKey !== 'home' ? title + ' — ' : '') + 'Dorothea Hub';
    $('#search-input').value = r.route === 'search' ? (r.query.get('q') || '') : '';
  }

  function onRoute() {
    render();
    window.scrollTo(0, 0);
    $('#main').focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------- Shared pieces */
  function pageHead(title, intro) {
    return '<header class="page-head"><h1>' + esc(title) + '</h1>' + (intro ? '<p>' + intro + '</p>' : '') + '</header>';
  }
  function sourceLine(s) {
    return s ? '<p class="source"><b>Source:</b> ' + esc(s) + '</p>' : '';
  }
  function confPill(c) {
    if (!c || c === 'high') return '';
    var map = { medium: ['sun', 'Secondary source'], low: ['coral', 'Inferred'] };
    var m = map[c] || ['', c];
    return '<span class="pill ' + m[0] + '">' + m[1] + '</span>';
  }

  /* The statutory clock */
  function clockHTML() {
    var e = D.ehcna || {};
    var start = parseD(e.requestInferred), due = parseD(e.finalDue), decision = parseD(e.decisionToAssess);
    if (!start || !due) return '';
    var startD = start.d, dueD = due.d;
    var overdue = TODAY > dueD;
    var end = overdue ? TODAY : dueD;
    var span = Math.max(1, end - startD);
    var allowedPct = Math.min(100, ((dueD - startD) / span) * 100);
    var overPct = overdue ? 100 - allowedPct : 0;
    var todayPct = Math.min(100, Math.max(0, ((TODAY - startD) / span) * 100));
    var decisionPct = decision ? ((decision.d - startD) / span) * 100 : null;
    var daysOver = dayDiff(dueD, TODAY);
    var weeksSince = Math.floor(dayDiff(startD, TODAY) / 7);

    var big = overdue
      ? daysOver + '<small>' + (daysOver === 1 ? 'day' : 'days') + ' past the statutory date</small>'
      : dayDiff(TODAY, dueD) + '<small>days until the statutory date</small>';

    function short(s) { var p = parseD(s); return p ? p.d.getDate() + ' ' + MONTHS[p.d.getMonth()] : ''; }
    var labels = '' +
      '<span class="track-mark" style="left:0"></span>' +
      '<span class="track-label start" style="left:0"><b>Request</b> ~' + esc(short(e.requestInferred)) + '</span>' +
      (decisionPct !== null ? '<span class="track-mark" style="left:' + decisionPct.toFixed(2) + '%"></span><span class="track-label mid" style="left:' + decisionPct.toFixed(2) + '%"><b>Decision</b> ' + esc(short(e.decisionToAssess)) + '</span>' : '') +
      '<span class="track-mark" style="left:' + allowedPct.toFixed(2) + '%"></span>' +
      '<span class="track-label' + (overdue ? '' : ' end') + '" style="left:' + allowedPct.toFixed(2) + '%"><b>Due</b> ' + esc(short(e.finalDue)) + '</span>' +
      (overdue ? '<span class="track-mark today" style="left:calc(' + todayPct.toFixed(2) + '% - 4px)"></span><span class="track-label end today" style="left:' + todayPct.toFixed(2) + '%"><b>Today</b></span>' : '');

    return '' +
      '<section class="clock" aria-labelledby="clock-title">' +
        '<div class="clock-top">' +
          '<div><h2 id="clock-title">EHC needs assessment</h2><p class="status">' + esc(e.status || '') + '</p></div>' +
          '<div class="clock-big" aria-live="off">' + big + '</div>' +
        '</div>' +
        '<div class="track" role="img" aria-label="20-week statutory period from about ' + esc(fmt(e.requestInferred, true)) + ' to ' + esc(fmt(e.finalDue, true)) + (overdue ? ', now ' + daysOver + ' days over' : '') + '">' +
          '<div class="track-bar"><span class="track-allowed" style="width:' + allowedPct.toFixed(2) + '%"></span>' +
          (overdue ? '<span class="track-over" style="width:' + overPct.toFixed(2) + '%"></span>' : '') + '</div>' +
          labels +
        '</div>' +
        '<div class="clock-foot">' +
          '<span>Week ' + weeksSince + ' since the request (limit: ' + (e.weeksAllowed || 20) + ')</span>' +
          '<span>No statutory exception applied</span>' +
          '<a href="#/ehcp">See the full assessment</a>' +
        '</div>' +
      '</section>';
  }

  function datebox(s) {
    var p = parseD(s); if (!p) return '<span class="datebox"><span class="d">?</span></span>';
    var soon = p.precision === 'day' && dayDiff(TODAY, p.d) <= 14 && dayDiff(TODAY, p.d) >= 0;
    var top = p.precision === 'day' ? p.d.getDate() : MONTHS[p.d.getMonth()];
    var bottom = p.precision === 'day' ? MONTHS[p.d.getMonth()] + ' ' + String(p.d.getFullYear()).slice(2) : p.d.getFullYear();
    return '<span class="datebox' + (soon ? ' soon' : '') + '"><span class="d">' + top + '</span><span class="m">' + bottom + '</span></span>';
  }

  function allAppointments() {
    return arr(D.appointments).concat(arr(NOTES.appts));
  }

  function upcomingItems() {
    var items = [];
    allAppointments().forEach(function (a) {
      items.push({ date: a.date, label: a.title, sub: [a.time, a.with].filter(Boolean).join(', '), href: '#/prep/' + encodeURIComponent(a.id) });
    });
    arr(D.keyDates).forEach(function (k) {
      var dup = items.some(function (i) { return i.date === k.date && i.label === k.label; });
      var linked = allAppointments().some(function (a) { return a.date === k.date; });
      if (!dup && !linked) items.push({ date: k.date, label: k.label, sub: k.type === 'deadline' ? 'Deadline' : (k.type === 'milestone' ? 'Milestone' : ''), href: '#/timeline' });
    });
    return items.filter(function (i) { return isFuture(i.date); })
      .sort(function (a, b) { return sortKey(a.date) - sortKey(b.date); });
  }

  /* Flags when nobody currently holds the case (officer with no end date and no name). */
  function officerGapHTML() {
    var officers = arr(D.ehcna && D.ehcna.officers);
    var named = officers.some(function (o) { return !o.to && o.name && o.name !== 'Not yet named'; });
    if (named || !officers.length) return '';
    var left = officers.filter(function (o) { return o.to; }).sort(function (a, b) { return sortKey(b.to) - sortKey(a.to); })[0];
    return '<li><span class="pill coral">Officer</span><div class="what"><b>New EHCNA Officer</b><span>' +
      (left ? 'None named since ' + esc(left.name) + ' left on ' + esc(fmt(left.to)) : 'Not yet named') + '</span></div></li>';
  }

  /* ------------------------------------------------------------------- Home */
  VIEWS.home = {
    html: function () {
      var c = D.child || {};
      var up = upcomingItems().slice(0, 5);
      var awaiting = arr(D.correspondence).filter(function (m) { return m.status === 'awaiting reply'; });
      var outstanding = arr(D.ehcna && D.ehcna.adviceOutstanding);
      var recent = arr(D.events).filter(function (e) { return !isFuture(e.date) && e.kind !== 'inferred'; })
        .sort(function (a, b) { return sortKey(b.date) - sortKey(a.date); }).slice(0, 6);

      var lastCouncil = arr(D.correspondence).filter(function (m) { return m.direction === 'in' && /SEND|SEN Team|council/i.test(m.from); })
        .sort(function (a, b) { return sortKey(b.date) - sortKey(a.date); })[0];

      return '' +
        '<section class="hello">' +
          '<div class="avatar" aria-hidden="true">' + esc((c.shortName || 'D').charAt(0)) + '</div>' +
          '<div><h1>' + esc(c.shortName || c.name || 'Overview') + '</h1>' +
          '<p class="age">' + esc(ageText(c.dob)) + (c.setting ? ', at ' + esc(c.setting) : '') + '</p>' +
          (c.headline ? '<p class="headline">' + esc(c.headline) + '</p>' : '') + '</div>' +
        '</section>' +
        morningBannerHTML() +
        clockHTML() +
        '<div class="grid grid-2 section-gap">' +
          '<section class="panel"><div class="panel-head"><h2>Coming up</h2><a href="#/prep">Prep</a></div>' +
            (up.length ? '<ul class="upcoming-list">' + up.map(function (i) {
              return '<li>' + datebox(i.date) + '<div><a class="t" href="' + i.href + '">' + esc(i.label) + '</a><span class="s">' + esc(relative(i.date)) + (i.sub ? ', ' + esc(i.sub) : '') + '</span></div></li>';
            }).join('') + '</ul>' : '<p class="empty">Nothing booked. Add an appointment from Prep.</p>') +
          '</section>' +
          '<section class="panel"><div class="panel-head"><h2>Waiting on</h2><a href="#/messages">Letters</a></div>' +
            '<ul class="wait-list">' +
              outstanding.map(function (o) {
                return '<li><span class="pill coral">Advice</span><div class="what"><b>' + esc(o.label) + '</b><span>' + esc(o.detail || '') + '</span></div></li>';
              }).join('') +
              awaiting.map(function (m) {
                return '<li><span class="pill sun">Reply</span><div class="what"><b>' + esc(m.to) + '</b><span>' + esc(m.subject) + ' — sent ' + esc(relative(m.date)) + (m.dateApprox ? ' (approx.)' : '') + '</span></div></li>';
              }).join('') +
              officerGapHTML() +
            '</ul>' +
          '</section>' +
        '</div>' +
        '<div class="grid grid-2 section-gap">' +
          '<section class="panel"><div class="panel-head"><h2>Recently</h2><a href="#/timeline">Timeline</a></div>' +
            '<ul class="mini-events">' + recent.map(function (e) {
              return '<li><span class="when">' + esc(fmt(e.date)) + '</span><span class="dot ' + esc(e.domain) + '" title="' + esc(domainLabel(e.domain)) + '"></span><span>' + esc(e.title) + '<