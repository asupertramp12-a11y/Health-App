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
    plus: '<path d="M12 5v14M5 12h14"/>'
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
              return '<li><span class="when">' + esc(fmt(e.date)) + '</span><span class="dot ' + esc(e.domain) + '" title="' + esc(domainLabel(e.domain)) + '"></span><span>' + esc(e.title) + '</span></li>';
            }).join('') + '</ul>' +
          '</section>' +
          '<section class="panel"><div class="panel-head"><h2>Worth checking</h2></div>' +
            '<div class="check-tiles">' +
              '<a class="tile coral" href="#/evidence/conflicts"><span class="n">' + arr(D.conflicts).length + '</span><span class="l">Conflicting records</span></a>' +
              '<a class="tile sun" href="#/evidence/gaps"><span class="n">' + arr(D.gaps).length + '</span><span class="l">Missing documents</span></a>' +
              '<a class="tile" href="#/messages?f=awaiting"><span class="n">' + awaiting.length + '</span><span class="l">Awaiting a reply</span></a>' +
              '<a class="tile" href="#/messages"><span class="n">' + (lastCouncil ? Math.max(0, dayDiff(parseD(lastCouncil.date).d, TODAY)) : '–') + '</span><span class="l">Days since council last wrote</span></a>' +
            '</div>' +
          '</section>' +
        '</div>';
    }
  };

  /* --------------------------------------------------------------- Timeline */
  var tlState = { domain: 'all', q: '', upcoming: true, newest: true };

  VIEWS.timeline = {
    html: function () {
      var domains = Object.keys(D.domains || {});
      var chips = '<button class="chip" type="button" data-domain="all" aria-pressed="' + (tlState.domain === 'all') + '">All</button>' +
        domains.map(function (k) {
          return '<button class="chip" type="button" data-domain="' + esc(k) + '" aria-pressed="' + (tlState.domain === k) + '"><span class="dot ' + esc(k) + '"></span>' + esc(domainShort(k)) + '</button>';
        }).join('');
      return pageHead('Timeline', 'Every event from the documents, with its source. Dashed cards are upcoming or worked out from other dates.') +
        '<div class="filters" role="group" aria-label="Filter timeline">' + chips + '</div>' +
        '<div class="filters">' +
          '<label class="visually-hidden" for="tl-q">Filter timeline</label>' +
          '<input class="filter-input" id="tl-q" type="search" placeholder="Filter by word or name" value="' + esc(tlState.q) + '">' +
          '<button class="chip" type="button" id="tl-up" aria-pressed="' + tlState.upcoming + '">Show upcoming</button>' +
          '<button class="chip" type="button" id="tl-sort" aria-pressed="false">' + (tlState.newest ? 'Newest first' : 'Oldest first') + '</button>' +
          '<button class="btn btn-quiet no-print" type="button" id="tl-print">' + icon('print') + 'Print</button>' +
        '</div>' +
        '<div id="tl-body"></div>';
    },
    bind: function (root) {
      function draw() {
        var q = tlState.q.trim().toLowerCase();
        var list = arr(D.events).filter(function (e) {
          if (tlState.domain !== 'all' && e.domain !== tlState.domain) return false;
          if (!tlState.upcoming && isFuture(e.date)) return false;
          if (q) {
            var hay = [e.title, e.summary, e.source, e.evidence, arr(e.people).join(' '), fmt(e.date, true)].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return false;
          }
          return true;
        }).sort(function (a, b) { return tlState.newest ? sortKey(b.date) - sortKey(a.date) : sortKey(a.date) - sortKey(b.date); });

        if (!list.length) { $('#tl-body', root).innerHTML = '<p class="empty">Nothing matches. Try another word or choose All.</p>'; return; }

        /* Put a "Today" marker where past meets future, if both are showing. */
        var hasPast = list.some(function (x) { return !isFuture(x.date); });
        var hasFuture = list.some(function (x) { return isFuture(x.date); });
        var html = '', year = null, todayDrawn = !(hasPast && hasFuture);
        list.forEach(function (e) {
          var future = isFuture(e.date);
          var y = parseD(e.date).d.getFullYear();
          var crossesToday = !todayDrawn && (tlState.newest ? !future : future);
          if (y !== year) {
            if (year !== null) html += '</ol>';
            if (crossesToday) { html += '<p class="today-line">Today, ' + esc(fmt(todayISO())) + '</p>'; todayDrawn = true; crossesToday = false; }
            html += '<div class="year"><h2>' + y + '</h2></div><ol class="tl">';
            year = y;
          }
          if (crossesToday) {
            html += '</ol><p class="today-line">Today, ' + esc(fmt(todayISO())) + '</p><ol class="tl">';
            todayDrawn = true;
          }
          var cls = e.kind === 'deadline' ? 'deadline' : (future ? 'upcoming' : (e.kind === 'inferred' ? 'inferred' : ''));
          html += '<li><span class="dot ' + esc(e.domain) + '"></span><article class="card ' + cls + '">' +
            '<div class="meta"><span class="date">' + esc(fmt(e.date)) + '</span>' +
              '<span class="pill">' + esc(domainShort(e.domain)) + '</span>' +
              (e.evidence ? '<span class="pill sky">' + esc(e.evidence) + '</span>' : '') +
              (e.kind === 'deadline' && !future ? '<span class="pill coral">Missed deadline</span>' : '') +
              (e.kind === 'deadline' && future ? '<span class="pill coral">Deadline</span>' : '') +
              (e.kind === 'change' ? '<span class="pill lilac">Change of officer</span>' : '') +
              (future ? '<span class="pill">' + esc(relative(e.date)) + '</span>' : '') +
              confPill(e.confidence) +
            '</div>' +
            '<h3>' + esc(e.title) + '</h3>' +
            (e.summary ? '<p>' + esc(e.summary) + '</p>' : '') +
            (arr(e.people).length ? '<p class="source"><b>People:</b> ' + esc(e.people.join(', ')) + '</p>' : '') +
            sourceLine(e.source) +
          '</article></li>';
        });
        if (year !== null) html += '</ol>';
        $('#tl-body', root).innerHTML = html;
      }

      $all('[data-domain]', root).forEach(function (b) {
        b.addEventListener('click', function () {
          tlState.domain = b.getAttribute('data-domain');
          $all('[data-domain]', root).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          draw();
        });
      });
      $('#tl-q', root).addEventListener('input', function (ev) { tlState.q = ev.target.value; draw(); });
      $('#tl-up', root).addEventListener('click', function (ev) {
        tlState.upcoming = !tlState.upcoming; ev.currentTarget.setAttribute('aria-pressed', String(tlState.upcoming)); draw();
      });
      $('#tl-sort', root).addEventListener('click', function (ev) {
        tlState.newest = !tlState.newest; ev.currentTarget.textContent = tlState.newest ? 'Newest first' : 'Oldest first'; draw();
      });
      $('#tl-print', root).addEventListener('click', function () { window.print(); });
      draw();
    }
  };

  /* ------------------------------------------------------------------- EHCP */
  VIEWS.ehcp = {
    html: function () {
      var e = D.ehcna || {};
      var due = parseD(e.finalDue), start = parseD(e.requestInferred);
      var daysOver = due ? dayDiff(due.d, TODAY) : 0;
      var weeks = start ? Math.floor(dayDiff(start.d, TODAY) / 7) : '–';
      var events = arr(D.events).filter(function (x) { return x.domain === 'ehcp'; })
        .sort(function (a, b) { return sortKey(a.date) - sortKey(b.date); });

      return pageHead('EHC needs assessment', 'Cheshire East Council, reference ' + esc((D.meta && D.meta.laReference) || '') + '. Dates and statements are from council correspondence unless marked.') +
        '<div class="facts">' +
          '<div class="fact"><span class="k">Decision to assess</span><span class="v">' + esc(fmt(e.decisionToAssess)) + '</span></div>' +
          '<div class="fact"><span class="k">Final EHCP was due</span><span class="v">' + esc(fmt(e.finalDue)) + '</span></div>' +
          '<div class="fact alert"><span class="k">' + (daysOver > 0 ? 'Days overdue' : 'Days remaining') + '</span><span class="v">' + Math.abs(daysOver) + '</span></div>' +
          '<div class="fact"><span class="k">Weeks since request (approx.)</span><span class="v">' + weeks + ' of ' + (e.weeksAllowed || 20) + '</span></div>' +
        '</div>' +
        '<section class="panel section-gap"><div class="panel-head"><h2>Where the assessment is</h2></div>' +
          '<ol class="stepper">' + arr(e.stages).map(function (s) {
            var sub = s.date ? fmt(s.date) + (s.inferred ? ' (inferred)' : '') : '';
            if (s.note) sub = sub ? sub + '. ' + s.note : s.note;
            return '<li class="' + esc(s.state) + '"><span class="lbl">' + esc(s.label) + '</span><span class="sub">' + esc(sub) + '</span></li>';
          }).join('') + '</ol>' +
        '</section>' +
        '<div class="section-gap">' + clockHTML() + '</div>' +
        '<div class="grid grid-2 section-gap">' +
          '<section class="panel"><h2>Advice received</h2><ul class="ticklist">' +
            arr(e.adviceReceived).map(function (a) { return '<li><span class="mark yes">✓</span><div>' + esc(a.label) + '<p class="source">' + esc(a.source) + '</p></div></li>'; }).join('') +
          '</ul></section>' +
          '<section class="panel"><h2>Advice outstanding</h2><ul class="ticklist">' +
            arr(e.adviceOutstanding).map(function (a) { return '<li><span class="mark no">!</span><div><b>' + esc(a.label) + '</b><p class="muted" style="margin:2px 0 0">' + esc(a.detail) + '</p><p class="source">' + esc(a.source) + '</p></div></li>'; }).join('') +
          '</ul>' +
          '<h3 class="section-gap">Reason given for the delay</h3><p>' + esc(e.delayReason || '') + '</p>' +
          '<p><span class="pill coral">No statutory exception applied</span></p></section>' +
        '</div>' +
        '<div class="grid grid-2 section-gap">' +
          '<section class="panel"><h2>Waiting for answers</h2><ul class="ticklist">' +
            arr(e.waitingOn).map(function (q) { return '<li><span class="mark q">?</span><div>' + esc(q) + '</div></li>'; }).join('') +
          '</ul>' + sourceLine(e.waitingOnSource) + '</section>' +
          '<section class="panel"><h2>Who holds the case</h2><ul class="ticklist">' +
            arr(e.officers).map(function (o) {
              return '<li><span class="mark ' + (o.to ? 'no' : 'q') + '">' + (o.to ? '×' : '?') + '</span><div><b>' + esc(o.name) + '</b> — ' + esc(o.role) +
                '<p class="muted" style="margin:2px 0 0">' + esc(fmt(o.from)) + (o.to ? ' to ' + esc(fmt(o.to)) : ' onwards') + '. ' + esc(o.note || '') + '</p></div></li>';
            }).join('') +
          '</ul><p class="source">Until a new officer is named, write to SEN Team East and quote ref ' + esc((D.meta && D.meta.laReference) || '') + '.</p></section>' +
        '</div>' +
        '<section class="panel section-gap"><h2>About the 20-week clock</h2>' +
          '<div class="note-box"><p>' + esc(e.requestInferredNote || '') + '</p></div>' +
        '</section>' +
        '<section class="panel section-gap"><div class="panel-head"><h2>Assessment events</h2><a href="#/timeline">Full timeline</a></div>' +
          '<ul class="mini-events">' + events.map(function (x) {
            return '<li><span class="when">' + esc(fmt(x.date)) + '</span><span class="dot ' + (isFuture(x.date) ? 'family' : 'ehcp') + '"></span><span>' + esc(x.title) + (x.confidence && x.confidence !== 'high' ? ' ' + confPill(x.confidence) : '') + '</span></li>';
          }).join('') + '</ul>' +
        '</section>';
    }
  };

  /* --------------------------------------------------------------- Messages */
  VIEWS.messages = {
    html: function (r) {
      var f = r.query.get('f') || 'all';
      var filters = [['all', 'All'], ['awaiting', 'Awaiting reply'], ['in', 'Received'], ['out', 'Sent by us']];
      var list = arr(D.correspondence).filter(function (m) {
        if (f === 'awaiting') return m.status === 'awaiting reply';
        if (f === 'in' || f === 'out') return m.direction === f;
        return true;
      }).sort(function (a, b) { return sortKey(b.date) - sortKey(a.date); });

      var statusPill = function (m) {
        if (m.status === 'awaiting reply') return '<span class="pill sun">Awaiting reply, ' + Math.max(0, dayDiff(parseD(m.date).d, TODAY)) + ' days</span>';
        if (m.status === 'answered') return '<span class="pill mint">Answered</span>';
        if (m.status === 'superseded') return '<span class="pill">Superseded</span>';
        return '';
      };

      return pageHead('Letters and emails', 'Key correspondence in one place, newest first. Replies we’re waiting for are flagged with how long it’s been.') +
        '<div class="filters" role="group" aria-label="Filter letters">' + filters.map(function (x) {
          return '<a class="chip" href="#/messages' + (x[0] === 'all' ? '' : '?f=' + x[0]) + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</a>';
        }).join('') + '</div>' +
        '<section class="panel">' + (list.length ? '<ul class="msg-list">' + list.map(function (m) {
          return '<li class="msg"><span class="dir ' + esc(m.direction) + '" title="' + (m.direction === 'in' ? 'Received' : 'Sent by us') + '">' + icon(m.direction === 'in' ? 'inbox' : 'outbox') + '</span><div>' +
            '<div class="row1"><span class="who">' + esc(m.direction === 'in' ? m.from : 'To ' + m.to) + '</span><span class="when">' + esc(fmt(m.date)) + (m.dateApprox ? ' or later' : '') + '</span>' + statusPill(m) + '</div>' +
            '<p class="subj">' + esc(m.subject) + '</p>' +
            '<p class="sum">' + esc(m.summary) + '</p>' +
            (arr(m.asks).length ? '<ul>' + m.asks.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
            sourceLine(m.source) +
          '</div></li>';
        }).join('') + '</ul>' : '<p class="empty">No letters in this view.</p>') + '</section>';
    }
  };

  /* ----------------------------------------------------------------- Health */
  VIEWS.health = {
    html: function () {
      var h = D.health || {};
      function col(title, items, badge, cls, intro) {
        return '<section class="panel hcol"><h2><span class="badge pill ' + cls + '">' + badge + '</span>' + esc(title) + '</h2>' +
          (intro ? '<p class="muted">' + esc(intro) + '</p>' : '') +
          arr(items).map(function (i) {
            return '<div class="hitem"><b>' + esc(i.label) + '</b>' + (i.note ? '<p>' + esc(i.note) + '</p>' : '') + sourceLine(i.source) + '</div>';
          }).join('') + '</section>';
      }
      return pageHead('Health', 'Kept in four groups so a concern is never mistaken for a diagnosis. Only the first group comes straight from a clinical letter held in the project.') +
        '<div class="health-cols">' +
          col('Confirmed in clinical letters', h.confirmed, '✓', 'mint', 'Stated by a clinician in a letter we hold.') +
          col('Recorded in other documents', h.recorded, '≈', 'sky', 'Written down by nursery or meeting notes; the original clinical report isn’t in the project.') +
          col('Concerns and observations', h.concerns, '!', 'sun', 'Reported by parents or staff. Not diagnoses.') +
          col('Waiting for or not yet evidenced', h.outstanding, '…', 'coral', 'Referrals and reviews with no outcome on file.') +
        '</div>';
    }
  };

  /* --------------------------------------------------------------- Dorothea */
  VIEWS.dorothea = {
    html: function () {
      var p = D.profile || {}, c = D.child || {};
      function bubbles(title, items, cls) {
        return '<section class="panel"><h2>' + esc(title) + '</h2><ul class="bubbles ' + cls + '">' + arr(items).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
      }
      function list(title, items) {
        return '<section class="panel"><h2>' + esc(title) + '</h2><ul>' + arr(items).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
      }
      return pageHead('About ' + (c.shortName || 'Dorothea'), esc(ageText(c.dob)) + '. Attends ' + esc(c.setting || '') + (c.settingDays ? ' on ' + esc(c.settingDays) : '') + '. Due to start reception in ' + esc(c.receptionYear || '') + '.') +
        '<section class="panel"><p class="quote">' + esc(c.headline || '') + '</p></section>' +
        '<div class="grid grid-2 section-gap">' +
          bubbles('What she does well', p.strengths, 'sun') +
          bubbles('What helps her', p.whatWorks, 'mint') +
          list('What she needs help with', p.needsHelpWith) +
          bubbles('What makes her happy', p.makesHappy, 'lilac') +
          list('Important to her now', p.importantNow) +
          list('Important for her future', p.future) +
        '</div>' +
        '<section class="panel section-gap"><h2>Our hopes for her</h2><p class="quote">' + esc(p.parentAspirations || '') + '</p>' + sourceLine(p.source) + '</section>' +
        '<section class="panel section-gap"><h2>Nursery SEND plan cycles</h2><div class="table-wrap"><table>' +
          '<thead><tr><th>Cycle</th><th>Started</th><th>Review</th><th>Outcome</th><th>Progress noted</th></tr></thead><tbody>' +
          arr(D.sendPlans).map(function (s) {
            return '<tr><td>' + esc(s.cycle) + '</td><td>' + esc(fmt(s.start)) + '</td><td>' + esc(fmt(s.review)) + '</td><td>' + esc(s.outcome) + '</td><td>' + esc(s.progress) + '</td></tr>';
          }).join('') +
        '</tbody></table></div></section>';
    }
  };

  /* ----------------------------------------------------------------- People */
  VIEWS.people = {
    html: function () {
      return pageHead('People', 'Everyone involved, grouped by service. Tap an email or phone number to use it.') +
        '<div class="filters"><label class="visually-hidden" for="ppl-q">Filter people</label><input class="filter-input" id="ppl-q" type="search" placeholder="Filter by name, role or service"></div>' +
        '<div id="ppl-body"></div>';
    },
    bind: function (root) {
      var order = ['Council', 'Advice', 'Nursery', 'Therapy', 'Health'];
      function draw(q) {
        q = (q || '').toLowerCase();
        var people = arr(D.people).filter(function (p) {
          return !q || [p.name, p.role, p.org, p.group, p.note].join(' ').toLowerCase().indexOf(q) !== -1;
        });
        var groups = {};
        people.forEach(function (p) { (groups[p.group || 'Other'] = groups[p.group || 'Other'] || []).push(p); });
        var keys = Object.keys(groups).sort(function (a, b) {
          var ia = order.indexOf(a), ib = order.indexOf(b);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        });
        var labels = { Council: 'Cheshire East Council', Advice: 'Independent advice', Nursery: 'Nursery', Therapy: 'Therapy and sensory support', Health: 'Health' };
        $('#ppl-body', root).innerHTML = keys.length ? keys.map(function (k) {
          return '<h2 class="group-title">' + esc(labels[k] || k) + '</h2><div class="people-grid">' + groups[k].map(function (p) {
            var contact = '';
            if (p.email) contact += '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>';
            if (p.phone) contact += '<a href="tel:' + esc(p.phone.replace(/\s+/g, '')) + '">' + esc(p.phone) + '</a>';
            return '<article class="person"><h3>' + esc(p.name) + '</h3><div class="role">' + esc(p.role) + '</div><div class="org">' + esc(p.org) + '</div>' +
              (contact ? '<div class="contact">' + contact + '</div>' : '') +
              (p.note ? '<div class="flag">' + esc(p.note) + '</div>' : '') + '</article>';
          }).join('') + '</div>';
        }).join('') : '<p class="empty">No one matches that.</p>';
      }
      $('#ppl-q', root).addEventListener('input', function (e) { draw(e.target.value); });
      draw('');
    }
  };

  /* ------------------------------------------------------------------- Prep */
  function prepState(id) {
    if (!NOTES.prep[id]) NOTES.prep[id] = { checkedQ: {}, extraQ: [], hiddenQ: [], checkedB: {}, extraB: [], hiddenB: [], notes: '', outcome: '' };
    var s = NOTES.prep[id];
    ['checkedQ', 'checkedB'].forEach(function (k) { if (!s[k]) s[k] = {}; });
    ['extraQ', 'hiddenQ', 'extraB', 'hiddenB'].forEach(function (k) { if (!s[k]) s[k] = []; });
    return s;
  }

  VIEWS.prep = {
    html: function (r) {
      if (r.param === 'new') return prepNewHTML();
      if (r.param) return prepDetailHTML(r.param);
      var all = allAppointments().slice().sort(function (a, b) { return sortKey(a.date) - sortKey(b.date); });
      var next = all.filter(function (a) { return isFuture(a.date); });
      var past = all.filter(function (a) { return !isFuture(a.date); }).reverse();
      function card(a, isPast) {
        var s = prepState(a.id);
        var qTotal = arr(a.questions).length - s.hiddenQ.length + s.extraQ.length;
        var qDone = Object.keys(s.checkedQ).filter(function (k) { return s.checkedQ[k]; }).length;
        return '<a class="appt' + (isPast ? ' past' : '') + '" href="#/prep/' + encodeURIComponent(a.id) + '">' + datebox(a.date) + '<div>' +
          '<h3>' + esc(a.title) + '</h3><div class="s">' + esc([a.time, a.with].filter(Boolean).join(', ')) + '</div>' +
          '<div class="s" style="margin-top:6px"><span class="pill' + (a.status === 'booked' ? ' mint' : ' sun') + '">' + esc(a.status || 'added by you') + '</span> ' +
          (isPast ? '' : esc(relative(a.date)) + ', ') + qDone + ' of ' + qTotal + ' questions ticked</div></div></a>';
      }
      return pageHead('Appointment prep', 'Each appointment pulls together what’s on file, questions to ask and what to take. Tick things off, add your own and print a sheet.') +
        '<div class="btn-row no-print" style="margin-bottom:18px"><a class="btn btn-primary" href="#/prep/new">' + icon('plus') + 'Add an appointment</a></div>' +
        '<h2>Coming up</h2>' +
        (next.length ? '<div class="appt-list">' + next.map(function (a) { return card(a, false); }).join('') + '</div>' : '<p class="empty">Nothing coming up. Add an appointment to start preparing.</p>') +
        (past.length ? '<h2 class="section-gap">Past</h2><div class="appt-list">' + past.map(function (a) { return card(a, true); }).join('') + '</div>' : '');
    },
    bind: function (root, r) {
      if (r.param === 'new') return bindPrepNew(root);
      if (r.param) return bindPrepDetail(root, r.param);
    }
  };

  function findAppt(id) {
    return allAppointments().filter(function (a) { return a.id === id; })[0] || null;
  }

  function relatedEvents(a) {
    return arr(D.events).filter(function (e) { return e.domain === a.domain && !isFuture(e.date); })
      .sort(function (x, y) { return sortKey(y.date) - sortKey(x.date); }).slice(0, 4);
  }

  function prepDetailHTML(id) {
    var a = findAppt(id);
    if (!a) return pageHead('Appointment not found', 'It may have been removed. <a href="#/prep">Back to appointment prep</a>.');
    var s = prepState(id);
    var questions = arr(a.questions).map(function (q, i) { return { key: 'd' + i, text: q, idx: i, mine: false }; })
      .filter(function (q) { return s.hiddenQ.indexOf(q.idx) === -1; })
      .concat(s.extraQ.map(function (q, i) { return { key: 'x' + i, text: q, idx: i, mine: true }; }));
    var bring = arr(a.bring).map(function (b, i) { return { key: 'd' + i, text: b, mine: false, idx: i }; })
      .filter(function (b) { return s.hiddenB.indexOf(b.idx) === -1; })
      .concat(s.extraB.map(function (b, i) { return { key: 'x' + i, text: b, mine: true, idx: i }; }));
    var related = relatedEvents(a);

    function checks(items, kind, state) {
      return '<ul class="checks">' + items.map(function (q) {
        var cid = 'c-' + kind + '-' + q.key;
        return '<li><input type="checkbox" id="' + cid + '" data-kind="' + kind + '" data-key="' + q.key + '"' + (state[q.key] ? ' checked' : '') + '>' +
          '<label for="' + cid + '">' + esc(q.text) + '</label>' +
          '<button type="button" class="del" data-del="' + kind + '" data-mine="' + q.mine + '" data-idx="' + q.idx + '" aria-label="Remove">×</button></li>';
      }).join('') + '</ul>';
    }

    return '<div id="prep-detail"><a class="crumb no-print" href="#/prep">Appointment prep</a>' +
      '<header class="page-head"><h1>' + esc(a.title) + '</h1>' +
        '<p>' + esc(fmt(a.date, true)) + (a.time ? ', ' + esc(a.time) : '') + ' — ' + esc(relative(a.date)) + '<br>' +
        esc(a.with || '') + (a.where ? '<br>' + esc(a.where) : '') + '</p>' +
        '<div class="btn-row no-print"><button class="btn btn-secondary" type="button" id="print">' + icon('print') + 'Print prep sheet</button>' +
        (a.local ? '<button class="btn btn-quiet danger" type="button" id="remove-appt">Remove this appointment</button>' : '') + '</div>' +
      '</header>' +
      '<div class="grid grid-2">' +
        '<section class="panel"><h2>What’s on file</h2>' +
          (arr(a.context).length ? '<ul>' + a.context.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '<p class="empty">Nothing added yet.</p>') +
          (related.length ? '<h3 class="section-gap">Recent related events</h3><ul class="mini-events">' + related.map(function (e) {
            return '<li><span class="when">' + esc(fmt(e.date)) + '</span><span>' + esc(e.title) + '</span></li>';
          }).join('') + '</ul>' : '') +
        '</section>' +
        '<section class="panel"><h2>Questions to ask</h2>' + checks(questions, 'q', s.checkedQ) +
          '<form class="add-row no-print" data-add="q"><label class="visually-hidden" for="add-q">Add a question</label><input type="text" id="add-q" placeholder="Add a question"><button class="btn btn-secondary" type="submit">Add</button></form>' +
          '<h3 class="section-gap">Take with you</h3>' + checks(bring, 'b', s.checkedB) +
          '<form class="add-row no-print" data-add="b"><label class="visually-hidden" for="add-b">Add something to take</label><input type="text" id="add-b" placeholder="Add something to take"><button class="btn btn-secondary" type="submit">Add</button></form>' +
        '</section>' +
      '</div>' +
      '<div class="grid grid-2 section-gap">' +
        '<section class="panel"><div class="field"><label for="notes">Notes during the appointment</label><textarea id="notes" data-field="notes" placeholder="Who was there, what they said, anything to follow up">' + esc(s.notes) + '</textarea></div><div class="saved" data-saved="notes"></div></section>' +
        '<section class="panel"><div class="field"><label for="outcome">What was agreed and next steps</label><textarea id="outcome" data-field="outcome" placeholder="Actions, who will do them and by when">' + esc(s.outcome) + '</textarea></div><div class="saved" data-saved="outcome"></div></section>' +
      '</div>' +
      '<p class="tiny section-gap">Ticks, added questions and notes are saved in this browser only. Use Data and backups to copy them to another device.</p></div>';
  }

  function bindPrepDetail(main, id) {
    var a = findAppt(id); if (!a) return;
    var s = prepState(id);
    var root = $('#prep-detail', main);
    var printBtn = $('#print', root);
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    root.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.matches('input[type="checkbox"][data-kind]')) {
        var bucket = t.getAttribute('data-kind') === 'q' ? s.checkedQ : s.checkedB;
        bucket[t.getAttribute('data-key')] = t.checked;
        saveNotes();
      }
    });
    root.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-del]');
      if (!b) return;
      var kind = b.getAttribute('data-del'), mine = b.getAttribute('data-mine') === 'true', idx = +b.getAttribute('data-idx');
      if (kind === 'q') {
        if (mine) { s.extraQ.splice(idx, 1); s.checkedQ = remapChecks(s.checkedQ, 'x', idx); }
        else { s.hiddenQ.push(idx); delete s.checkedQ['d' + idx]; }
      } else {
        if (mine) { s.extraB.splice(idx, 1); s.checkedB = remapChecks(s.checkedB, 'x', idx); }
        else { s.hiddenB.push(idx); delete s.checkedB['d' + idx]; }
      }
      saveNotes(); render();
    });
    $all('form[data-add]', root).forEach(function (f) {
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var input = $('input', f); var v = input.value.trim(); if (!v) return;
        (f.getAttribute('data-add') === 'q' ? s.extraQ : s.extraB).push(v);
        saveNotes(); render();
        var again = $('#add-' + f.getAttribute('data-add')); if (again) again.focus();
      });
    });
    var timers = {};
    $all('textarea[data-field]', root).forEach(function (ta) {
      ta.addEventListener('input', function () {
        var field = ta.getAttribute('data-field');
        clearTimeout(timers[field]);
        timers[field] = setTimeout(function () {
          s[field] = ta.value;
          var ok = saveNotes();
          var el = $('[data-saved="' + field + '"]', root);
          if (el) el.textContent = ok ? 'Saved' : 'Couldn’t save — this browser may block storage';
        }, 400);
      });
    });
    var rm = $('#remove-appt', root);
    if (rm) rm.addEventListener('click', function () {
      if (!confirm('Remove this appointment and its notes?')) return;
      NOTES.appts = NOTES.appts.filter(function (x) { return x.id !== id; });
      delete NOTES.prep[id];
      saveNotes(); location.hash = '#/prep';
    });
  }

  function remapChecks(map, prefix, removedIdx) {
    var out = {};
    Object.keys(map).forEach(function (k) {
      if (k.charAt(0) !== prefix) { out[k] = map[k]; return; }
      var n = +k.slice(1);
      if (n < removedIdx) out[k] = map[k];
      else if (n > removedIdx) out[prefix + (n - 1)] = map[k];
    });
    return out;
  }

  function prepNewHTML() {
    var opts = Object.keys(D.domains || {}).map(function (k) { return '<option value="' + esc(k) + '">' + esc(domainLabel(k)) + '</option>'; }).join('');
    return '<a class="crumb" href="#/prep">Appointment prep</a>' + pageHead('Add an appointment', 'It’ll appear in Coming up with space for questions and notes. Saved in this browser.') +
      '<form class="panel" id="new-appt" style="max-width:640px">' +
        '<div class="field"><label for="na-title">What is it?</label><input type="text" id="na-title" required placeholder="For example: Audiology review"></div>' +
        '<div class="grid grid-2"><div class="field"><label for="na-date">Date</label><input type="date" id="na-date" required></div>' +
        '<div class="field"><label for="na-time">Time</label><input type="time" id="na-time"></div></div>' +
        '<div class="field"><label for="na-with">Who with</label><input type="text" id="na-with" placeholder="Name and service"></div>' +
        '<div class="field"><label for="na-where">Where</label><input type="text" id="na-where" placeholder="Place or video call"></div>' +
        '<div class="field"><label for="na-domain">Area</label><select id="na-domain">' + opts + '</select></div>' +
        '<div class="btn-row"><button class="btn btn-primary" type="submit">Add appointment</button><a class="btn btn-quiet" href="#/prep">Cancel</a></div>' +
      '</form>';
  }
  function bindPrepNew(root) {
    $('#new-appt', root).addEventListener('submit', function (ev) {
      ev.preventDefault();
      var id = 'local-' + Date.now().toString(36);
      NOTES.appts.push({
        id: id, local: true,
        title: $('#na-title').value.trim(),
        date: $('#na-date').value,
        time: $('#na-time').value,
        with: $('#na-with').value.trim(),
        where: $('#na-where').value.trim(),
        domain: $('#na-domain').value,
        status: 'added by you',
        context: [], questions: [], bring: []
      });
      saveNotes();
      location.hash = '#/prep/' + id;
    });
  }

  /* --------------------------------------------------------------- Evidence */
  VIEWS.evidence = {
    html: function (r) {
      var tab = r.param || 'conflicts';
      var tabs = [['conflicts', 'Conflicting records', arr(D.conflicts).length], ['gaps', 'Missing documents', arr(D.gaps).length], ['index', 'Evidence index', arr(D.evidence).length], ['documents', 'Source files', arr(D.documents).length]];
      var body = '';
      if (tab === 'conflicts') {
        body = '<p class="muted">Where two documents disagree. Neither is assumed right — the last line says which looks stronger, or what would settle it.</p>' +
          arr(D.conflicts).map(function (c) {
            return '<section class="panel conflict"><h2>' + esc(c.title) + '</h2><dl>' +
              '<dt>Source A</dt><dd>' + esc(c.a) + '</dd><dt>Source B</dt><dd>' + esc(c.b) + '</dd>' +
              '<dt>Possible reason</dt><dd>' + esc(c.explanation) + '</dd><dt>Which to trust</dt><dd><b>' + esc(c.stronger) + '</b></dd></dl></section>';
          }).join('');
      } else if (tab === 'gaps') {
        body = '<p class="muted">Documents that are referred to elsewhere, or should exist, but aren’t in the project yet.</p><ul class="gap-list">' +
          arr(D.gaps).map(function (g) { return '<li><b>' + esc(g.title) + '</b><p>' + esc(g.detail) + '</p><p class="act">' + esc(g.action) + '</p></li>'; }).join('') + '</ul>';
      } else if (tab === 'index') {
        body = '<section class="panel"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Document</th><th>From</th><th>Finding</th><th>Strength</th></tr></thead><tbody>' +
          arr(D.evidence).slice().sort(function (a, b) { return a.id.localeCompare(b.id); }).map(function (e) {
            return '<tr><td><span class="pill sky">' + esc(e.id) + '</span></td><td style="white-space:nowrap">' + esc(fmt(e.date)) + '</td><td>' + esc(e.doc) + '</td><td>' + esc(e.author) + '<br><span class="tiny">' + esc(e.org) + '</span></td><td>' + esc(e.finding) + '</td><td>' + esc(e.strength) + '</td></tr>';
          }).join('') + '</tbody></table></div></section>';
      } else {
        body = '<section class="panel"><div class="table-wrap"><table><thead><tr><th>File</th><th>Type</th><th>What it is</th></tr></thead><tbody>' +
          arr(D.documents).map(function (d) { return '<tr><td>' + esc(d.name) + '</td><td>' + esc(d.kind) + '</td><td>' + esc(d.note) + '</td></tr>'; }).join('') +
          '</tbody></table></div></section>';
      }
      return pageHead('Evidence check', 'Use this before meetings and before the draft plan arrives, to spot what needs correcting or chasing.') +
        '<div class="tabs" role="tablist">' + tabs.map(function (t) {
          return '<a class="chip" role="tab" href="#/evidence/' + t[0] + '" aria-selected="' + (tab === t[0]) + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + ' <span class="pill">' + t[2] + '</span></a>';
        }).join('') + '</div><div class="stack">' + body + '</div>';
    }
  };

  /* ------------------------------------------------------------------- More */
  VIEWS.more = {
    html: function () {
      var rest = ROUTES.filter(function (r) { return TABS.indexOf(r.key) === -1; });
      return pageHead('More', '') +
        '<ul class="more-list">' + rest.map(function (r) {
          var badge = r.key === 'messages' && awaitingCount() ? ' <span class="pill sun">' + awaitingCount() + ' awaiting</span>' : '';
          return '<li><a href="#/' + r.key + '">' + icon(r.icon) + '<span>' + esc(r.label) + badge + '<span class="desc">' + esc(r.desc) + '</span></span></a></li>';
        }).join('') +
        '<li><a href="#" data-action="open-settings">' + icon('evidence') + '<span>Data and backups<span class="desc">Load updated data, back up your notes</span></span></a></li>' +
        '</ul>';
    }
  };

  /* ----------------------------------------------------------------- Search */
  function highlight(text, q) {
    var safe = esc(text);
    if (!q) return safe;
    var pattern = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp('(' + pattern + ')', 'ig'), '<mark>$1</mark>');
  }
  function searchAll(q) {
    var needle = q.toLowerCase();
    var out = [];
    function add(kind, title, body, href, date) {
      var hay = (title + ' ' + body).toLowerCase();
      if (hay.indexOf(needle) !== -1) out.push({ kind: kind, title: title, body: body, href: href, date: date });
    }
    arr(D.events).forEach(function (e) { add('Timeline', e.title, [fmt(e.date), e.summary, arr(e.people).join(', '), e.source].join(' — '), '#/timeline', e.date); });
    arr(D.correspondence).forEach(function (m) { add('Letter', m.subject, [fmt(m.date), m.from, m.to, m.summary].join(' — '), '#/messages', m.date); });
    allAppointments().forEach(function (a) { add('Appointment', a.title, [fmt(a.date), a.with, arr(a.context).join(' ')].join(' — '), '#/prep/' + encodeURIComponent(a.id), a.date); });
    arr(D.people).forEach(function (p) { add('Person', p.name, [p.role, p.org, p.email, p.phone, p.note].filter(Boolean).join(' — '), '#/people'); });
    ['confirmed', 'recorded', 'concerns', 'outstanding'].forEach(function (k) {
      arr(D.health && D.health[k]).forEach(function (h) { add('Health', h.label, [h.note, h.source].join(' — '), '#/health'); });
    });
    arr(D.evidence).forEach(function (e) { add('Evidence', e.id + ' ' + e.doc, [fmt(e.date), e.author, e.finding].join(' — '), '#/evidence/index', e.date); });
    arr(D.conflicts).forEach(function (c) { add('Conflict', c.title, c.a + ' ' + c.b, '#/evidence/conflicts'); });
    arr(D.gaps).forEach(function (g) { add('Missing', g.title, g.detail + ' ' + g.action, '#/evidence/gaps'); });
    arr(D.documents).forEach(function (d) { add('File', d.name, d.note, '#/evidence/documents'); });
    Object.keys(NOTES.prep).forEach(function (id) {
      var s = NOTES.prep[id], a = findAppt(id);
      if (a && (s.notes || s.outcome)) add('My notes', a.title, [s.notes, s.outcome].join(' — '), '#/prep/' + encodeURIComponent(id), a.date);
    });
    return out;
  }
  VIEWS.search = {
    html: function (r) {
      var q = (r.query.get('q') || '').trim();
      if (!q) return pageHead('Search', 'Type a name, a word or a date in the box above.');
      var results = searchAll(q);
      return pageHead('Results for “' + q + '”', results.length + (results.length === 1 ? ' match' : ' matches')) +
        '<section class="panel">' + (results.length ? results.map(function (x) {
          return '<div class="result"><span class="pill kind">' + esc(x.kind) + '</span><a href="' + x.href + '">' + highlight(x.title, q) + '</a><p>' + highlight(x.body, q) + '</p></div>';
        }).join('') : '<p class="empty">No matches. Try a shorter word or a surname.</p>') + '</section>';
    }
  };

  /* --------------------------------------------------------------- Settings */
  function download(name, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function readJSONFile(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      try { cb(null, JSON.parse(reader.result)); } catch (e) { cb(e); }
    };
    reader.readAsText(file);
  }
  function setStatus(msg, bad) {
    var el = $('#settings-status');
    el.textContent = msg; el.style.color = bad ? 'var(--coral)' : '';
  }
  function refreshSettingsNote() {
    var compiled = D && D.meta && D.meta.compiled ? fmt(D.meta.compiled, true) : 'unknown date';
    if (!D) {
      $('#data-source-note').textContent = 'No data loaded on this device yet.';
      $('#compiled-note').textContent = '';
      return;
    }
    $('#data-source-note').textContent = usingOverride
      ? 'Showing a data file you loaded into this browser (compiled ' + compiled + ').'
      : 'Showing the built-in data, compiled ' + compiled + '.';
    $('#compiled-note').textContent = 'Data compiled ' + compiled + (usingOverride ? ' (loaded file)' : '');
  }

  function bindGlobal() {
    var dlg = $('#settings');
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-action]');
      if (!t) return;
      var action = t.getAttribute('data-action');
      if (action === 'open-settings') {
        ev.preventDefault(); setStatus(''); refreshSettingsNote();
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      } else if (action === 'export-data') {
        if (!D) { setStatus('No data loaded yet.', true); return; }
        download('case-data.json', D); setStatus('Downloaded case-data.json');
      } else if (action === 'reset-data') {
        if (!BUILT_IN && !confirm('Remove Dorothea’s data from this device? You can load the file again any time.')) return;
        removeStore(KEYS.data); D = BUILT_IN; usingOverride = false; refreshSettingsNote(); render();
        setStatus(BUILT_IN ? 'Now using the built-in data.' : 'Data removed from this device.');
      } else if (action === 'export-notes') {
        download('dorothea-hub-notes-' + todayISO() + '.json', NOTES); setStatus('Notes backed up.');
      } else if (action === 'clear-notes') {
        if (!confirm('Clear all your ticks, notes and added appointments in this browser?')) return;
        NOTES = { v: 1, prep: {}, appts: [] }; saveNotes(); render(); setStatus('Your notes have been cleared.');
      }
    });

    $('#load-data').addEventListener('change', function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      readJSONFile(f, function (err, obj) {
        ev.target.value = '';
        if (err || !obj || !obj.child || !Array.isArray(obj.events)) { setStatus('That file isn’t a Dorothea Hub data file. It needs “child” and “events” sections.', true); return; }
        if (!writeStore(KEYS.data, obj)) { setStatus('This browser wouldn’t store the file. It may be in private mode.', true); return; }
        D = obj; usingOverride = true; refreshSettingsNote(); render(); setStatus('Loaded ' + f.name + '.');
      });
    });
    $('#load-notes').addEventListener('change', function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      readJSONFile(f, function (err, obj) {
        ev.target.value = '';
        if (err || !obj || typeof obj.prep !== 'object') { setStatus('That file isn’t a notes backup.', true); return; }
        NOTES = { v: 1, prep: obj.prep || {}, appts: arr(obj.appts) }; saveNotes(); render(); setStatus('Notes restored from ' + f.name + '.');
      });
    });

    $('#search-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var q = $('#search-input').value.trim();
      location.hash = '#/search?q=' + encodeURIComponent(q);
    });

    window.addEventListener('hashchange', onRoute);
  }

  /* ------------------------------------------------------------------- Start */
  bindGlobal();
  if (D) refreshSettingsNote();
  render();
})();
