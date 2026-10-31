/* Family Hub — app logic
   Plain JavaScript, no build step. Reads window.CASE_DATA from data/case-data.js.
   Personal notes and added appointments are kept in this browser's localStorage.
   Edit mode (pencil button) changes the case data itself; see “Edit mode” below. */
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
    if (!NOTES.captured) NOTES.captured = [];
    if (!NOTES.statusOverrides) NOTES.statusOverrides = {};
  }
  ensureLogs();
  function saveNotes() { NOTES.updated = new Date().toISOString(); return writeStore(KEYS.notes, NOTES); }
  /* Names come from the loaded data file, so the public code holds nothing about the family. */
  function kid() { var c = D && D.child; return (c && (c.shortName || (c.name || '').split(' ')[0])) || 'your child'; }
  function kids() { return kid() === 'your child' ? 'your child’s' : kid() + '’s'; }
  function Kids() { var k = kids(); return k.charAt(0).toUpperCase() + k.slice(1); }
  function appName() { return D && D.child && kid() !== 'your child' ? kid() + ' Hub' : 'Family Hub'; }
  function council() { return (D && D.child && D.child.localAuthority) || 'The council'; }
  function senTeam() { return (D && D.ehcna && D.ehcna.team) || 'the council’s SEN team'; }
  /* Who can get up in the night: from the data file if listed, else the names already used in the diary. */
  function carers() {
    var c = D && D.child && D.child.carers;
    var list = c ? String(c).split(',').map(function (x) { return x.trim(); }).filter(Boolean) : [];
    if (!list.length) (NOTES.sleep || []).forEach(function (s) { if (s.who && s.who !== 'Both' && list.indexOf(s.who) === -1) list.push(s.who); });
    if (!list.length) list = ['Parent 1', 'Parent 2'];
    return list;
  }
  /* Is a From line one of us? Matches the carers' names and any family email addresses in the data file. */
  function isFamily(from) {
    var f = String(from || '').toLowerCase();
    var extra = D && D.child && D.child.familyEmails ? String(D.child.familyEmails).split(',') : [];
    return carers().concat(extra).some(function (t) {
      t = String(t).trim().toLowerCase();
      return t.length > 2 && !/^parent \d$/.test(t) && f.indexOf(t) !== -1;
    });
  }
  var BACKUP_KEY = 'dh:notesBackup:v1';
  function emptyNotes() { return { v: 1, prep: {}, appts: [], sleep: [], incidents: [], captured: [], statusOverrides: {} }; }
  function hasNotes() {
    var p = NOTES.prep || {};
    var prepUsed = Object.keys(p).some(function (k) {
      var x = p[k] || {};
      return (x.notes || x.outcome || (x.extraQ || []).length || (x.extraB || []).length || (x.hiddenQ || []).length || (x.hiddenB || []).length ||
        Object.keys(x.checkedQ || {}).some(function (c) { return x.checkedQ[c]; }) || Object.keys(x.checkedB || {}).some(function (c) { return x.checkedB[c]; }));
    });
    return !!(prepUsed || (NOTES.appts || []).length || (NOTES.sleep || []).length || (NOTES.incidents || []).length ||
      (NOTES.captured || []).length || Object.keys(NOTES.statusOverrides || {}).length);
  }

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
  /* Still to come: a future date that hasn't been marked as done or happened. */
  function ahead(x) {
    if (!x) return false;
    if (x.status === 'done' || x.status === 'cancelled' || x.happened) return false;
    return isFuture(x.date);
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
    about: '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7Z"/>',
    people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.4.2 4.3 1.8 4.8 4.4"/>',
    evidence: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="m10 14 1.5 1.5L15 12"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    inbox: '<path d="M17 7 7 17"/><path d="M15 17H7V9"/>',
    outbox: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
    print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    support: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'
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
    { key: 'about', get label() { return D ? 'About ' + kid() : 'About'; }, icon: 'about', desc: 'Strengths, needs and what works' },
    { key: 'support', label: 'Support and benefits', icon: 'support', desc: 'Sleep diary, road-safety log, DLA and Blue Badge' },
    { key: 'people', label: 'People', icon: 'people', desc: 'Professionals and contacts' },
    { key: 'evidence', label: 'Evidence check', icon: 'evidence', desc: 'Conflicts, gaps and the evidence index' }
  ];
  var TABS = ['home', 'timeline', 'ehcp', 'prep', 'more'];

  function awaitingCount() {
    return allCorrespondence().filter(function (c) { return c.status === "awaiting reply"; }).length;
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
    $all('.brand-name').forEach(function (el) { el.textContent = appName(); });
    $all('a.brand').forEach(function (el) { el.setAttribute('aria-label', appName() + ' home'); });
    if (!D) {
      renderNav('home');
      $('#main').innerHTML =
        '<section class="hello"><div class="avatar" aria-hidden="true"><img src="logo.svg" alt="" width="40" height="40"></div><div>' +
        '<h1>Load your data to begin</h1>' +
        '<p class="headline">Your child’s information isn’t stored on this website. Choose your <code>case-data.json</code> file once on this device and it will stay here, in this browser only.</p></div></section>' +
        '<div class="btn-row"><button class="btn btn-primary" type="button" data-action="pick-data">Load data file</button><button class="btn btn-quiet" type="button" data-action="open-settings">Data and backups</button></div>' +
        '<p class="tiny section-gap">On iPhone, add the site to your Home Screen first and load the file from the Home Screen icon — Safari and the icon keep separate storage.</p>';
      return;
    }
    refreshBackupNote();
    var r = parseHash();
    var view = VIEWS[r.route] || VIEWS.home;
    var activeKey = VIEWS[r.route] ? r.route : 'home';
    renderNav(activeKey);
    var main = $('#main');
    main.innerHTML = (r.route === 'edit' ? '' : editBarHTML()) + view.html(r);
    if (view.bind) view.bind(main, r);
    syncEditToggle();
    var title = (ROUTES.filter(function (x) { return x.key === activeKey; })[0] || {}).label;
    document.title = (title && activeKey !== 'home' ? title + ' — ' : '') + appName();
    $('#search-input').value = r.route === 'search' ? (r.query.get('q') || '') : '';
  }

  function onRoute() {
    prepUndo = null;
    render();
    window.scrollTo(0, 0);
    $('#main').focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------- Shared pieces */
  function pageHead(title, intro) {
    return '<header class="page-head"><h1>' + esc(title) + '</h1>' + (intro ? '<p>' + intro + '</p>' : '') + '</header>';
  }
  /* Letters from the data file plus ones captured on this device. A captured item
     drops out automatically once an entry with the same id appears in the data file. */
  function allCorrespondence() {
    if (!D) return [];
    var ids = {};
    var base = arr(D.correspondence).map(function (c) {
      ids[c.id] = true;
      var o = NOTES.statusOverrides[c.id];
      return o ? Object.assign({}, c, { status: o, statusLocal: true }) : c;
    });
    var local = arr(NOTES.captured).filter(function (c) { return !ids[c.id]; }).map(function (c) {
      var o = NOTES.statusOverrides[c.id];
      return Object.assign({}, c, { local: true }, o ? { status: o } : {});
    });
    return base.concat(local);
  }
  function capturedAsEvents() {
    if (!D) return [];
    var ids = {};
    arr(D.correspondence).forEach(function (c) { ids[c.id] = true; });
    return arr(NOTES.captured).filter(function (c) { return !ids[c.id]; }).map(function (c) {
      return { id: 'ev-' + c.id, date: c.date, title: (c.direction === 'in' ? 'Received: ' : 'Sent: ') + c.subject,
        domain: c.domain || 'ehcp', summary: c.summary, source: 'Captured on this device', people: [c.direction === 'in' ? c.from : c.to].filter(Boolean), confidence: 'high', local: true };
    });
  }
  function allEvents() { return D ? arr(D.events).concat(capturedAsEvents()) : []; }

  function sourceLine(s) {
    return s ? '<p class="source"><b>Source:</b> ' + esc(s) + '</p>' : '';
  }
  function confPill(c) {
    if (!c || c === 'high') return '';
    var map = { medium: ['sun', 'Secondary source'], low: ['coral', 'Inferred'] };
    var m = map[c] || ['', c];
    return '<span class="pill ' + m[0] + '">' + m[1] + '</span>';
  }

  /* The statutory clock.
     clockModel works out the period and checks the dates add up; clockHTML draws it.
     The full clock (big number) lives on the Overview; the EHCP page shows the bar only. */
  function clockIssues(e) {
    var out = [], start = parseD(e && e.requestInferred), due = parseD(e && e.finalDue), dec = parseD(e && e.decisionToAssess);
    var weeks = +(e && e.weeksAllowed) || 20;
    if (!start) return out;
    if (!due) out.push('there is no due date');
    else if (due.d <= start.d) out.push('the due date (' + fmt(e.finalDue) + ') is on or before the request date (' + fmt(e.requestInferred) + ')');
    else if (!e.exceptionApplied && Math.abs(dayDiff(start.d, due.d) - weeks * 7) > 7)
      out.push('the due date is ' + Math.round(dayDiff(start.d, due.d) / 7) + ' weeks after the request, not ' + weeks);
    if (dec && dec.d < start.d) out.push('the decision to assess (' + fmt(e.decisionToAssess) + ') is before the request');
    return out;
  }
  function clockModel() {
    var e = D.ehcna || {};
    var start = parseD(e.requestInferred); if (!start) return null;
    var weeks = +e.weeksAllowed || 20, given = parseD(e.finalDue);
    var computed = !given || given.d <= start.d;   // unusable due date: fall back to request + 20 weeks
    var dueD = computed ? new Date(start.d.getTime() + weeks * 7 * DAY) : given.d;
    var overdue = TODAY > dueD;
    return { e: e, startD: start.d, dueD: dueD, computed: computed, overdue: overdue, weeks: weeks,
      daysOver: dayDiff(dueD, TODAY), daysLeft: dayDiff(TODAY, dueD), weeksSince: Math.floor(dayDiff(start.d, TODAY) / 7), issues: clockIssues(e) };
  }
  function caseHolder() {
    var cur = arr(D.ehcna && D.ehcna.officers).filter(function (o) { return !o.to && o.name && o.name !== 'Not yet named'; }).pop();
    var p = cur && arr(D.people).filter(function (x) { return x.name === cur.name; })[0];
    return { name: cur ? cur.name : senTeam(), email: p && p.email, named: !!cur };
  }
  function chaseEmailText(m) {
    var e = m.e, h = caseHolder(), ref = (D.meta && D.meta.laReference) || '';
    var c = D.child || {}, who = c.name || kid();
    var asks = ['the date the final EHC plan (or the decision not to issue one) will be sent to us', 'what is causing the delay, and what is being done about it']
      .concat(arr(e.waitingOn).slice(0, 4).map(function (q) { q = String(q).trim().replace(/[.?]$/, ''); return /^[A-Z][a-z]/.test(q) ? q.charAt(0).toLowerCase() + q.slice(1) : q; }));
    return 'Subject: EHC needs assessment for ' + who + (ref ? ' (ref ' + ref + ')' : '') + '\n\n' +
      'Dear ' + (h.named ? h.name : 'SEN team') + ',\n\n' +
      'The EHC needs assessment for ' + who + ' was requested ' + (requestIsInferred() ? 'on or around ' : 'on ') + fmt(e.requestInferred, true) + '. ' +
      'The final EHC plan was due by ' + fmt(isoDate(m.dueD), true) + ', ' + m.daysOver + ' days ago' + (e.exceptionApplied ? '' : ', and we have not been told of any statutory exception') + '.\n\n' +
      'Please could you tell us:\n' + asks.map(function (a) { return '- ' + a; }).join('\n') + '\n\n' +
      'Kind regards,\n' + carers().filter(function (x) { return !/^Parent \d$/.test(x); }).join(' and ');
  }
  function clockActHTML(m) {
    if (!m.overdue) return '';
    var h = caseHolder(), ref = esc((D.meta && D.meta.laReference) || '');
    return '<div class="clock-act">' +
      '<h3>What you can do</h3>' +
      '<ol>' +
        '<li><b>Chase in writing.</b> Write to ' + esc(h.name) + (h.email ? ' (<a href="mailto:' + esc(h.email) + '">' + esc(h.email) + '</a>)' : '') +
          (ref ? ', quote ref ' + ref : '') + ' and ask for the date the final plan will be issued. ' +
          '<button type="button" class="btn btn-sun-quiet no-print" data-action="copy-chase">Copy chase email</button></li>' +
        '<li><b>No clear answer?</b> Make a formal complaint through ' + esc(council().replace(/^The /, 'the ')) + '’s complaints process.</li>' +
        '<li><b>Still not resolved?</b> Complain to the <a href="https://www.lgo.org.uk/" target="_blank" rel="noopener">Local Government and Social Care Ombudsman</a>.</li>' +
      '</ol></div>';
  }
  function clockHTML(opts) {
    opts = opts || {};
    var m = clockModel(); if (!m) return '';
    var e = m.e, startD = m.startD, dueD = m.dueD, overdue = m.overdue;
    var end = overdue ? TODAY : dueD;
    var span = Math.max(1, end - startD);
    var allowedPct = Math.min(100, ((dueD - startD) / span) * 100);
    var overPct = overdue ? 100 - allowedPct : 0;
    var todayPct = Math.min(100, Math.max(0, ((TODAY - startD) / span) * 100));
    var decision = parseD(e.decisionToAssess);
    var decisionPct = decision && decision.d >= startD ? Math.min(100, ((decision.d - startD) / span) * 100) : null;
    var daysOver = m.daysOver;

    var big = overdue
      ? daysOver + '<small>' + (daysOver === 1 ? 'day' : 'days') + ' past the statutory date</small>'
      : m.daysLeft + '<small>days until the statutory date</small>';

    function shortD(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
    var labels = '' +
      '<span class="track-mark" style="left:0"></span>' +
      '<span class="track-label start" style="left:0"><b>Request</b> ' + (requestIsInferred() ? '~' : '') + esc(shortD(startD)) + '</span>' +
      (decisionPct !== null ? '<span class="track-mark" style="left:' + decisionPct.toFixed(2) + '%"></span><span class="track-label mid" style="left:' + decisionPct.toFixed(2) + '%"><b>Decision</b> ' + esc(shortD(decision.d)) + '</span>' : '') +
      '<span class="track-mark" style="left:' + allowedPct.toFixed(2) + '%"></span>' +
      '<span class="track-label' + (overdue ? '' : ' end') + '" style="left:' + allowedPct.toFixed(2) + '%"><b>Due</b> ' + esc(shortD(dueD)) + (m.computed ? ' (20 wks)' : '') + '</span>' +
      (overdue ? '<span class="track-mark today" style="left:calc(' + todayPct.toFixed(2) + '% - 4px)"></span><span class="track-label end today" style="left:' + todayPct.toFixed(2) + '%"><b>Today</b></span>' : '');

    var warn = m.issues.length ? '<p class="clock-warn" role="note"><b>These dates don’t add up:</b> ' + esc(m.issues.join('; ')) + '.' +
      (m.computed ? ' The clock is using ' + m.weeks + ' weeks from the request instead.' : '') +
      ' <a href="#/edit/ehcna">Check the dates</a></p>' : '';

    return '' +
      '<section class="clock' + (opts.compact ? ' compact' : '') + '" aria-labelledby="clock-title">' +
        (opts.compact
          ? '<h2 id="clock-title">The 20-week clock</h2>'
          : '<div class="clock-top">' +
              '<div><h2 id="clock-title">EHC needs assessment</h2><p class="status">' + esc(e.status || '') + '</p></div>' +
              '<p class="clock-big">' + big + '</p>' +
            '</div>') +
        warn +
        '<div class="track" role="img" aria-label="' + m.weeks + '-week statutory period from ' + (requestIsInferred() ? 'about ' : '') + esc(fmt(isoDate(startD), true)) + ' to ' + esc(fmt(isoDate(dueD), true)) + (overdue ? ', now ' + daysOver + ' days over' : '') + '">' +
          '<div class="track-bar"><span class="track-allowed" style="width:' + allowedPct.toFixed(2) + '%"></span>' +
          (overdue ? '<span class="track-over" style="width:' + overPct.toFixed(2) + '%"></span>' : '') + '</div>' +
          labels +
        '</div>' +
        '<div class="clock-foot">' +
          '<span>Week ' + m.weeksSince + ' since the request (limit: ' + m.weeks + ')</span>' +
          '<span>' + (e.exceptionApplied ? 'Statutory exception applied' : 'No statutory exception applied') + '</span>' +
          (opts.compact ? '' : '<a href="#/ehcp">See the full assessment</a>') +
        '</div>' +
        clockActHTML(m) +
      '</section>';
  }

  function requestIsInferred() {
    var st = arr(D.ehcna && D.ehcna.stages).filter(function (x) { return x.key === 'request'; })[0];
    return st ? !!st.inferred : true;
  }

  function datebox(s) {
    var p = parseD(s); if (!p) return '<span class="datebox"><span class="d">?</span></span>';
    var soon = p.precision === 'day' && dayDiff(TODAY, p.d) <= 14 && dayDiff(TODAY, p.d) >= 0;
    var top = p.precision === 'day' ? p.d.getDate() : MONTHS[p.d.getMonth()];
    var bottom = p.precision === 'day' ? MONTHS[p.d.getMonth()] + ' ' + String(p.d.getFullYear()).slice(2) : p.d.getFullYear();
    return '<span class="datebox' + (soon ? ' soon' : '') + '"><span class="d" aria-hidden="true">' + top + '</span><span class="m" aria-hidden="true">' + bottom + '</span>' +
      '<span class="visually-hidden">' + esc(fmt(s, true)) + '</span></span>';
  }

  function allAppointments() {
    return arr(D.appointments).concat(arr(NOTES.appts));
  }

  function upcomingItems() {
    var items = [];
    allAppointments().forEach(function (a) {
      if (a.status === 'done' || a.status === 'cancelled') return;
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
      var awaiting = allCorrespondence().filter(function (m) { return m.status === 'awaiting reply'; });
      var outstanding = arr(D.ehcna && D.ehcna.adviceOutstanding);
      var recent = allEvents().filter(function (e) { return !ahead(e) && e.kind !== 'inferred'; })
        .sort(function (a, b) { return sortKey(b.date) - sortKey(a.date); }).slice(0, 6);

      var lastCouncil = allCorrespondence().filter(function (m) { return m.direction === 'in' && /SEND|SEN Team|council/i.test(m.from); })
        .sort(function (a, b) { return sortKey(b.date) - sortKey(a.date); })[0];

      return '' +
        '<section class="hello">' +
          '<div class="avatar" aria-hidden="true">' + esc(kid().charAt(0).toUpperCase()) + '</div>' +
          '<div><h1>' + esc(c.shortName || c.name || 'Overview') + '</h1>' +
          '<p class="age">' + esc(ageText(c.dob)) + (c.setting ? ', at ' + esc(c.setting) : '') + '</p>' +
          (c.headline ? '<p class="headline">' + esc(c.headline) + '</p>' : '') + '</div>' +
        '</section>' +
        morningBannerHTML() +
        clockHTML() +
        '<div class="grid grid-2 section-gap">' +
          '<section class="panel"><div class="panel-head"><h2>Coming up</h2>' + (EDIT ? '<a href="#/edit/keyDates">Key dates</a>' : '<a href="#/prep">Prep</a>') + '</div>' +
            (up.length ? '<ul class="upcoming-list">' + up.map(function (i) {
              return '<li>' + datebox(i.date) + '<div><a class="t" href="' + i.href + '">' + esc(i.label) + '</a><span class="s">' + esc(relative(i.date)) + (i.sub ? ', ' + esc(i.sub) : '') + '</span></div></li>';
            }).join('') + '</ul>' : '<p class="empty">Nothing booked. Add an appointment from Prep.</p>') +
          '</section>' +
          '<section class="panel"><div class="panel-head"><h2>Waiting on</h2>' + (EDIT ? '<a href="#/edit/ehcna.adviceOutstanding">Edit</a>' : '<a href="#/messages">Letters</a>') + '</div>' +
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
              return '<li><span class="when">' + esc(fmt(e.date)) + '</span><span class="dot ' + esc(e.domain) + '" title="' + esc(domainLabel(e.domain)) + '" aria-hidden="true"></span><span><span class="visually-hidden">' + esc(domainLabel(e.domain)) + ': </span>' + esc(e.title) + '</span></li>';
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
          return '<button class="chip" type="button" data-domain="' + esc(k) + '" aria-pressed="' + (tlState.domain === k) + '"><span class="dot ' + esc(k) + '" aria-hidden="true"></span>' + esc(domainShort(k)) + '</button>';
        }).join('');
      return pageHead('Timeline', 'Every event from the documents, with its source. Dashed cards are upcoming or worked out from other dates.') +
        '<div class="filters" role="group" aria-label="Filter timeline">' + chips + '</div>' +
        '<div class="filters">' +
          '<label class="visually-hidden" for="tl-q">Filter timeline</label>' +
          '<input class="filter-input" id="tl-q" type="search" placeholder="Filter by word or name" value="' + esc(tlState.q) + '">' +
          '<button class="chip" type="button" id="tl-up" aria-pressed="' + tlState.upcoming + '">Show upcoming</button>' +
          '<button class="chip" type="button" id="tl-sort"><span class="visually-hidden">Order: </span>' + (tlState.newest ? 'Newest first' : 'Oldest first') + '</button>' +
          '<button class="btn btn-quiet no-print" type="button" id="tl-print">' + icon('print') + 'Print</button>' + addLink('events', 'Add event') +
        '</div>' +
        '<div id="tl-body"></div>';
    },
    bind: function (root) {
      function draw() {
        var q = tlState.q.trim().toLowerCase();
        var list = allEvents().filter(function (e) {
          if (tlState.domain !== 'all' && e.domain !== tlState.domain) return false;
          if (!tlState.upcoming && ahead(e)) return false;
          if (q) {
            var hay = [e.title, e.summary, e.source, e.evidence, arr(e.people).join(' '), fmt(e.date, true)].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return false;
          }
          return true;
        }).sort(function (a, b) { return tlState.newest ? sortKey(b.date) - sortKey(a.date) : sortKey(a.date) - sortKey(b.date); });

        if (!list.length) { $('#tl-body', root).innerHTML = '<p class="empty">Nothing matches. Try another word or choose All.</p>'; return; }

        /* Put a "Today" marker where past meets future, if both are showing. */
        var hasPast = list.some(function (x) { return !ahead(x); });
        var hasFuture = list.some(function (x) { return ahead(x); });
        var html = '', year = null, todayDrawn = !(hasPast && hasFuture);
        list.forEach(function (e) {
          var future = ahead(e);
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
          html += '<li><span class="dot ' + esc(e.domain) + '" aria-hidden="true"></span><article class="card ' + cls + '">' +
            '<div class="meta"><span class="date">' + esc(fmt(e.date)) + '</span>' +
              '<span class="pill">' + esc(domainShort(e.domain)) + '</span>' +
              (e.evidence ? '<span class="pill sky">' + esc(e.evidence) + '</span>' : '') +
              (e.kind === 'deadline' && !future ? '<span class="pill coral">Missed deadline</span>' : '') +
              (e.kind === 'deadline' && future ? '<span class="pill coral">Deadline</span>' : '') +
              (e.kind === 'change' ? '<span class="pill lilac">Change of officer</span>' : '') +
              (future ? '<span class="pill">' + esc(relative(e.date)) + '</span>' : '') +
              confPill(e.confidence) + eb('events', e) +
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
        tlState.newest = !tlState.newest; ev.currentTarget.innerHTML = '<span class="visually-hidden">Order: </span>' + (tlState.newest ? 'Newest first' : 'Oldest first'); draw();
      });
      $('#tl-print', root).addEventListener('click', function () { window.print(); });
      draw();
    }
  };

  /* ------------------------------------------------------------------- EHCP */
  VIEWS.ehcp = {
    html: function () {
      var e = D.ehcna || {};
      var cm = clockModel(), start = parseD(e.requestInferred);
      var daysOver = cm ? cm.daysOver : 0;
      var weeks = start ? Math.floor(dayDiff(start.d, TODAY) / 7) : '–';
      var events = allEvents().filter(function (x) { return x.domain === 'ehcp'; })
        .sort(function (a, b) { return sortKey(a.date) - sortKey(b.date); });

      return pageHead('EHC needs assessment', esc(council()) + ', reference ' + esc((D.meta && D.meta.laReference) || '') + '. Dates and statements are from council correspondence unless marked.') +
        (EDIT ? '<div class="btn-row" style="margin-bottom:12px">' + objLink('ehcna', 'Edit status and dates') + '</div>' : '') +
        '<div class="facts">' +
          '<div class="fact"><span class="k">Decision to assess</span><span class="v">' + esc(fmt(e.decisionToAssess)) + '</span></div>' +
          '<div class="fact"><span class="k">Final EHCP ' + (daysOver > 0 ? 'was due' : 'due') + '</span><span class="v">' + esc(cm ? fmt(isoDate(cm.dueD)) : fmt(e.finalDue)) + '</span></div>' +
          '<div class="fact alert"><span class="k">' + (daysOver > 0 ? 'Days overdue' : 'Days remaining') + '</span><span class="v">' + Math.abs(daysOver) + '</span></div>' +
          '<div class="fact"><span class="k">Weeks since request' + (requestIsInferred() ? ' (approx.)' : '') + '</span><span class="v">' + weeks + ' of ' + (e.weeksAllowed || 20) + '</span></div>' +
        '</div>' +
        '<section class="panel section-gap"><div class="panel-head"><h2>Where the assessment is</h2>' + (EDIT ? '<a href="#/edit/ehcna.stages">Edit stages</a>' : '') + '</div>' +
          '<ol class="stepper">' + arr(e.stages).map(function (s) {
            var sub = s.date ? fmt(s.date) + (s.inferred ? ' (inferred)' : '') : '';
            if (s.note) sub = sub ? sub + '. ' + s.note : s.note;
            return '<li class="' + esc(s.state) + '"><span class="lbl">' + esc(s.label) + '</span><span class="sub">' + esc(sub) + '</span></li>';
          }).join('') + '</ol>' +
          (e.expectedOutcome ? '<div class="note-box section-gap"><p><b>Expected next:</b> ' + esc(e.expectedOutcome) + '</p></div>' : '') +
        '</section>' +
        '<div class="section-gap">' + clockHTML({ compact: true }) + '</div>' +
        '<div class="grid grid-2 section-gap">' +
          '<section class="panel"><h2>Advice received</h2><ul class="ticklist">' +
            arr(e.adviceReceived).map(function (a) { return '<li><span class="mark yes">✓</span><div>' + esc(a.label) + '<p class="source">' + esc(a.source) + '</p>' + eb('ehcna.adviceReceived', a) + '</div></li>'; }).join('') +
          '</ul>' + addLink('ehcna.adviceReceived', 'Add advice received') + '</section>' +
          '<section class="panel"><h2>Advice outstanding</h2><ul class="ticklist">' +
            arr(e.adviceOutstanding).map(function (a) { return '<li><span class="mark no">!</span><div><b>' + esc(a.label) + '</b><p class="muted" style="margin:2px 0 0">' + esc(a.detail) + '</p><p class="source">' + esc(a.source) + '</p>' + eb('ehcna.adviceOutstanding', a) + '</div></li>'; }).join('') +
          '</ul>' + addLink('ehcna.adviceOutstanding', 'Add outstanding advice') +
          '<h3 class="section-gap">Reason given for the delay</h3><p>' + esc(e.delayReason || '') + '</p>' +
          '<p><span class="pill coral">' + (e.exceptionApplied ? 'Statutory exception applied' : 'No statutory exception applied') + '</span></p></section>' +
        '</div>' +
        '<div class="grid grid-2 section-gap">' +
          '<section class="panel"><h2>Waiting for answers</h2><ul class="ticklist">' +
            arr(e.waitingOn).map(function (q) { return '<li><span class="mark q">?</span><div>' + esc(q) + '</div></li>'; }).join('') +
          '</ul>' + sourceLine(e.waitingOnSource) + objLink('ehcna', 'Edit questions') + '</section>' +
          '<section class="panel"><h2>Who holds the case</h2><ul class="ticklist">' +
            arr(e.officers).map(function (o) {
              var current = !o.to && o.name && o.name !== 'Not yet named';
              return '<li><span class="mark ' + (o.to ? 'no' : (current ? 'yes' : 'q')) + '">' + (o.to ? '×' : (current ? '✓' : '?')) + '</span><div><b>' + esc(o.name) + '</b> — ' + esc(o.role) +
                '<p class="muted" style="margin:2px 0 0">' + esc(fmt(o.from)) + (o.to ? ' to ' + esc(fmt(o.to)) : ' onwards') + '. ' + esc(o.note || '') + '</p>' + eb('ehcna.officers', o) + '</div></li>';
            }).join('') +
          '</ul>' + addLink('ehcna.officers', 'Add officer') + caseHolderNote() + '</section>' +
        '</div>' +
        commitmentsHTML(e) +
        '<div>' +
        '</div>' +
        '<section class="panel section-gap"><h2>About the 20-week clock</h2>' +
          '<div class="note-box"><p>' + esc(e.requestInferredNote || '') + '</p></div>' +
        '</section>' +
        '<section class="panel section-gap"><div class="panel-head"><h2>Assessment events</h2><a href="#/timeline">Full timeline</a></div>' +
          '<ul class="mini-events">' + events.map(function (x) {
            return '<li><span class="when">' + esc(fmt(x.date)) + '</span><span class="dot ' + (ahead(x) ? 'family' : 'ehcp') + '" aria-hidden="true"></span><span>' + (ahead(x) ? '<span class="visually-hidden">Coming up: </span>' : '') + esc(x.title) + (x.confidence && x.confidence !== 'high' ? ' ' + confPill(x.confidence) : '') + '</span></li>';
          }).join('') + '</ul>' +
        '</section>';
    }
  };

  function caseHolderNote() {
    var ref = esc((D.meta && D.meta.laReference) || '');
    var cur = arr(D.ehcna && D.ehcna.officers).filter(function (o) { return !o.to && o.name && o.name !== 'Not yet named'; }).pop();
    if (cur) {
      var p = arr(D.people).filter(function (x) { return x.name === cur.name; })[0];
      return '<p class="source">Write to ' + esc(cur.name) + (p && p.email ? ' (<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>)' : '') + ' and quote ref ' + ref + '.</p>';
    }
    return '<p class="source">Until a new officer is named, write to ' + esc(senTeam()) + ' and quote ref ' + ref + '.</p>';
  }
  function commitmentsHTML(e) {
    var list = arr(e.commitmentsFromLetters);
    if (!list.length && !EDIT) return '';
    return '<section class="panel section-gap"><div class="panel-head"><h2>What the council said it would do</h2></div>' +
      (list.length ? '<ul class="ticklist">' + list.slice().sort(function (a, b) { return sortKey(a.date) - sortKey(b.date); }).map(function (c) {
        var met = /^met\b/i.test(c.position || ''), missed = /missed|not recorded|not done/i.test(c.position || '');
        return '<li><span class="mark ' + (met ? 'yes' : missed ? 'no' : 'q') + '">' + (met ? '✓' : missed ? '!' : '?') + '</span><div><b>' + esc(c.commitment) + '</b>' +
          '<p class="muted" style="margin:2px 0 0">' + esc(c.position || '') + '</p><p class="source">' + esc(fmt(c.date)) + (c.source ? ' — ' + esc(c.source) : '') + '</p>' + eb('ehcna.commitmentsFromLetters', c) + '</div></li>';
      }).join('') + '</ul>' : '<p class="empty">Nothing recorded yet.</p>') +
      addLink('ehcna.commitmentsFromLetters', 'Add a commitment') + '</section>';
  }

  /* --------------------------------------------------------------- Messages */
  var MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function looseDate(str) {
    if (!str) return '';
    var m = str.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
    if (m && MONTH_INDEX[m[2].slice(0, 3).toLowerCase()] != null) return isoDate(new Date(+m[3], MONTH_INDEX[m[2].slice(0, 3).toLowerCase()], +m[1]));
    m = str.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
    if (m && MONTH_INDEX[m[1].slice(0, 3).toLowerCase()] != null) return isoDate(new Date(+m[3], MONTH_INDEX[m[1].slice(0, 3).toLowerCase()], +m[2]));
    m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return isoDate(new Date(+m[3], +m[2] - 1, +m[1]));
    m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    return '';
  }
  function cleanName(v) {
    return (v || '').replace(/<[^>]*>/g, '').replace(/\[mailto:[^\]]*\]/g, '').replace(/["']/g, '').replace(/\s+/g, ' ').trim();
  }
  /* Reads the header block at the top of a pasted email (From, To, Sent/Date, Subject). */
  function parseEmail(text) {
    var out = {};
    var lines = text.split(/\r?\n/).slice(0, 40);
    lines.forEach(function (line) {
      var m = line.match(/^\s*(From|To|Sent|Date|Subject)\s*:\s*(.+)$/i);
      if (!m) return;
      var k = m[1].toLowerCase();
      if (k === 'sent') k = 'date';
      if (out[k] == null) out[k] = m[2].trim();
    });
    if (out.date) out.date = looseDate(out.date);
    if (!out.date) out.date = looseDate(lines.join(' '));
    if (out.from) out.direction = isFamily(out.from) ? 'out' : 'in';
    if (out.from) out.from = cleanName(out.from);
    if (out.to) out.to = cleanName(out.to);
    if (out.subject) out.subject = out.subject.replace(/^((re|fw|fwd)\s*:\s*)+/i, function (x) { return x; }).trim();
    var bodyStart = text.search(/\n\s*\n/);
    var body = (bodyStart > -1 && (out.from || out.subject) ? text.slice(bodyStart) : text).trim();
    var greeting = body.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (greeting.length && /^(dear|hi|hello|good (morning|afternoon|evening))\b/i.test(greeting[0])) greeting.shift();
    var signoff = greeting.findIndex(function (l) { return /^(kind regards|best regards|regards|many thanks|thanks|yours sincerely|yours faithfully|best wishes)\b/i.test(l.trim()); });
    if (signoff > 0) greeting = greeting.slice(0, signoff);
    out.summary = greeting.join(' ').replace(/\s+/g, ' ').slice(0, 280);
    if (out.summary.length === 280) out.summary = out.summary.replace(/\s+\S*$/, '') + '…';
    return out;
  }
  function letterAsText(m) {
    return [
      'Letter or email captured in ' + appName(),
      'ID: ' + m.id,
      'Direction: ' + (m.direction === 'in' ? 'Received' : 'Sent by us'),
      'Date: ' + fmt(m.date, true),
      'From: ' + (m.from || ''),
      'To: ' + (m.to || ''),
      'Subject: ' + (m.subject || ''),
      'Status: ' + (m.status || 'info'),
      'Area: ' + domainLabel(m.domain || 'ehcp'),
      '',
      m.fullText || m.summary || ''
    ].join('\n');
  }

  VIEWS.messages = {
    html: function (r) {
      if (r.param === 'new' || r.param === 'edit') return captureFormHTML(r.query.get('id'));
      var f = r.query.get('f') || 'all';
      var filters = [['all', 'All'], ['awaiting', 'Awaiting reply'], ['in', 'Received'], ['out', 'Sent by us'], ['local', 'Added on this device']];
      var all = allCorrespondence();
      var localCount = all.filter(function (m) { return m.local; }).length;
      var list = all.filter(function (m) {
        if (f === 'awaiting') return m.status === 'awaiting reply';
        if (f === 'in' || f === 'out') return m.direction === f;
        if (f === 'local') return m.local;
        return true;
      }).sort(function (a, b) { return sortKey(b.date) - sortKey(a.date); });

      var statusPill = function (m) {
        if (m.status === 'awaiting reply') return '<span class="pill sun">Awaiting reply, ' + Math.max(0, dayDiff(parseD(m.date).d, TODAY)) + ' days</span>';
        if (m.status === 'answered') return '<span class="pill mint">Answered</span>';
        if (m.status === 'superseded') return '<span class="pill">Superseded</span>';
        return '';
      };

      return '<div id="msg-page">' + pageHead('Letters and emails', 'Key correspondence in one place, newest first. Replies we’re waiting for are flagged with how long it’s been.') +
        '<div class="btn-row no-print" style="margin-bottom:16px"><a class="btn btn-primary" href="#/messages/new">' + icon('plus') + 'Capture an email or letter</a>' + addLink('correspondence', 'Add to case data directly') +
        (localCount ? '<button class="btn btn-secondary" type="button" data-msg="export">Download ' + localCount + ' for Claude</button>' : '') + '</div>' +
        '<div class="filters" role="group" aria-label="Filter letters">' + filters.filter(function (x) { return x[0] !== 'local' || localCount; }).map(function (x) {
          return '<a class="chip" href="#/messages' + (x[0] === 'all' ? '' : '?f=' + x[0]) + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</a>';
        }).join('') + '</div>' +
        '<section class="panel">' + (list.length ? '<ul class="msg-list">' + list.map(function (m) {
          var actions = '';
          if (m.status === 'awaiting reply') actions += '<button class="btn btn-quiet" type="button" data-msg="replied" data-id="' + esc(m.id) + '">Mark as replied</button>';
          if (EDIT && !m.local) actions += eb('correspondence', { id: m.id });
          if (EDIT && m.local) actions += '<button class="btn btn-quiet" type="button" data-msg="promote" data-id="' + esc(m.id) + '">Add to case data</button>';
          if (m.statusLocal) actions += '<button class="btn btn-quiet" type="button" data-msg="undo-status" data-id="' + esc(m.id) + '">Undo status change</button>';
          if (m.local) actions += '<button class="btn btn-quiet" type="button" data-msg="copy" data-id="' + esc(m.id) + '">Copy</button>' +
            '<a class="btn btn-quiet" href="#/messages/edit?id=' + encodeURIComponent(m.id) + '">Edit</a>' +
            '<button class="btn btn-quiet danger" type="button" data-msg="delete" data-id="' + esc(m.id) + '">Delete</button>';
          return '<li class="msg"><span class="dir ' + esc(m.direction) + '" title="' + (m.direction === 'in' ? 'Received' : 'Sent by us') + '">' + icon(m.direction === 'in' ? 'inbox' : 'outbox') + '</span><div>' +
            '<div class="row1"><span class="who">' + esc(m.direction === 'in' ? m.from : 'To ' + m.to) + '</span><span class="when">' + esc(fmt(m.date)) + (m.dateApprox ? ' or later' : '') + '</span>' + statusPill(m) +
              (m.local ? '<span class="pill lilac">Added on this device</span>' : '') + '</div>' +
            '<p class="subj">' + esc(m.subject) + '</p>' +
            (m.summary ? '<p class="sum">' + esc(m.summary) + '</p>' : '') +
            (arr(m.asks).length ? '<ul>' + m.asks.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
            (m.fullText ? '<details class="fulltext"><summary>Show full text</summary><div class="fulltext-body">' + esc(m.fullText) + '</div></details>' : '') +
            sourceLine(m.local ? 'Captured on this device' : m.source) +
            (actions ? '<div class="btn-row msg-actions no-print">' + actions + '</div>' : '') +
          '</div></li>';
        }).join('') + '</ul>' : '<p class="empty">No letters in this view.</p>') + '</section>' +
        (localCount ? '<p class="tiny section-gap">Letters you capture are saved on this device. Use “Download for Claude” to send them to your Claude project, and they’ll come back in the next data file.</p>' : '') +
        '</div>';
    },
    bind: function (root, r) {
      if (r.param === 'new' || r.param === 'edit') return bindCaptureForm(root, r.query.get('id'));
      var page = $('#msg-page', root);
      page.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-msg]'); if (!b) return;
        var act = b.getAttribute('data-msg'), id = b.getAttribute('data-id');
        if (act === 'replied') {
          var inData = EDIT && arr(D.correspondence).filter(function (x) { return x.id === id; })[0];
          if (inData) {
            pushUndo('mark answered ' + inData.subject);
            inData.status = 'answered'; delete NOTES.statusOverrides[id]; saveNotes();
            persist('edited', 'Letters and emails', inData.subject + ' — marked answered');
          } else { NOTES.statusOverrides[id] = 'answered'; saveNotes(); }
          render();
        }
        else if (act === 'promote') { promoteCaptured(id); }
        else if (act === 'undo-status') { delete NOTES.statusOverrides[id]; saveNotes(); render(); }
        else if (act === 'delete') {
          if (!confirm('Delete this captured letter from this device?')) return;
          NOTES.captured = NOTES.captured.filter(function (c) { return c.id !== id; });
          delete NOTES.statusOverrides[id]; saveNotes(); render();
        } else if (act === 'copy') {
          var m = allCorrespondence().filter(function (x) { return x.id === id; })[0]; if (!m) return;
          var text = letterAsText(m);
          var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1800); };
          if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this text:', text); });
          else window.prompt('Copy this text:', text);
        } else if (act === 'export') {
          var items = allCorrespondence().filter(function (x) { return x.local; }).sort(function (a, c) { return sortKey(a.date) - sortKey(c.date); });
          var text2 = appName() + ' — letters and emails captured on this device (' + fmt(todayISO(), true) + ')\nPlease add these to the hub data, keeping the IDs.\n\n' +
            items.map(letterAsText).join('\n\n========================================\n\n');
          downloadText('hub-letters-' + todayISO() + '.txt', text2, 'text/plain');
        }
      });
    }
  };

  function captureFormHTML(editId) {
    var m = editId ? arr(NOTES.captured).filter(function (x) { return x.id === editId; })[0] || {} : {};
    var opts = Object.keys(D.domains || {}).map(function (k) { return '<option value="' + esc(k) + '"' + ((m.domain || 'ehcp') === k ? ' selected' : '') + '>' + esc(domainLabel(k)) + '</option>'; }).join('');
    var dir = m.direction || 'in';
    return '<a class="crumb" href="#/messages">Letters and emails</a>' +
      pageHead(editId ? 'Edit captured letter' : 'Capture an email or letter', 'Paste the whole email, including the From, Sent and Subject lines if you can. The details below fill themselves in; check them before saving.') +
      '<form class="panel" id="cap-form" style="max-width:760px">' +
        '<p class="draft-note" id="cf-draft" role="status" aria-live="polite"></p>' +
        '<div class="field"><label for="cf-text">Paste the email or letter</label><textarea id="cf-text" rows="10" style="min-height:220px" placeholder="From: …&#10;Sent: …&#10;To: …&#10;Subject: …&#10;&#10;Dear …">' + esc(m.fullText || '') + '</textarea>' +
        '<div class="btn-row" style="margin-top:8px"><button class="btn btn-secondary" type="button" id="cf-parse">Fill in details from the text</button><span class="saved" id="cf-parsed"></span></div></div>' +
        '<div class="field"><span class="label">Direction</span><div class="btn-row seg">' +
          '<label><input type="radio" name="dir" value="in"' + (dir === 'in' ? ' checked' : '') + '> Received</label>' +
          '<label><input type="radio" name="dir" value="out"' + (dir === 'out' ? ' checked' : '') + '> Sent by us</label></div></div>' +
        '<div class="grid grid-2"><div class="field"><label for="cf-date">Date</label><input type="date" id="cf-date" required value="' + esc(m.date || todayISO()) + '"></div>' +
        '<div class="field"><label for="cf-domain">Area</label><select id="cf-domain">' + opts + '</select></div></div>' +
        '<div class="grid grid-2"><div class="field"><label for="cf-from">From</label><input type="text" id="cf-from" value="' + esc(m.from || '') + '"></div>' +
        '<div class="field"><label for="cf-to">To</label><input type="text" id="cf-to" value="' + esc(m.to || '') + '"></div></div>' +
        '<div class="field"><label for="cf-subject">Subject</label><input type="text" id="cf-subject" required value="' + esc(m.subject || '') + '"></div>' +
        '<div class="field"><label for="cf-summary">Short summary</label><textarea id="cf-summary" rows="3" style="min-height:80px" placeholder="What it says in a sentence or two">' + esc(m.summary || '') + '</textarea></div>' +
        '<div class="field"><span class="label">Does it need a reply?</span><div class="btn-row seg">' +
          '<label><input type="radio" name="status" value="info"' + (m.status !== 'awaiting reply' ? ' checked' : '') + '> No</label>' +
          '<label><input type="radio" name="status" value="awaiting reply"' + (m.status === 'awaiting reply' ? ' checked' : '') + '> Yes, we’re waiting for one</label></div></div>' +
        '<div class="btn-row"><button class="btn btn-primary" type="submit">Save</button><a class="btn btn-quiet" href="#/messages">Cancel</a></div>' +
      '</form>';
  }
  var DRAFT_KEY = 'dh:capdraft:v1';
  var DRAFT_FIELDS = ['cf-text', 'cf-date', 'cf-from', 'cf-to', 'cf-subject', 'cf-summary', 'cf-domain'];
  function bindCaptureForm(root, editId) {
    var form = $('#cap-form', root);
    /* New captures keep a draft on this device so an interruption doesn't lose a long pasted email. */
    if (!editId) {
      var note = $('#cf-draft', form), dt = null;
      var draft = readStore(DRAFT_KEY);
      if (draft && draft.fields && draft.fields['cf-text'] !== undefined) {
        DRAFT_FIELDS.forEach(function (k) { var el = $('#' + k, form); if (el && draft.fields[k] != null) el.value = draft.fields[k]; });
        ['dir', 'status'].forEach(function (n) { var r = draft[n] && $('input[name="' + n + '"][value="' + draft[n] + '"]', form); if (r) r.checked = true; });
        note.innerHTML = 'Draft restored (saved ' + esc(daysAgo(draft.at)) + ' at ' + esc(new Date(draft.at).toTimeString().slice(0, 5)) + '). <button type="button" class="linkish" id="cf-discard">Discard draft</button>';
        $('#cf-discard', form).addEventListener('click', function () { removeStore(DRAFT_KEY); form.reset(); note.textContent = 'Draft discarded.'; $('#cf-text', form).focus(); });
      }
      var saveDraft = function () {
        clearTimeout(dt);
        dt = setTimeout(function () {
          var f = {}; DRAFT_FIELDS.forEach(function (k) { var el = $('#' + k, form); if (el) f[k] = el.value; });
          var any = ['cf-text', 'cf-from', 'cf-subject', 'cf-summary'].some(function (k) { return (f[k] || '').trim(); });
          if (!any) { removeStore(DRAFT_KEY); return; }
          writeStore(DRAFT_KEY, { at: new Date().toISOString(), fields: f,
            dir: ($('input[name="dir"]:checked', form) || {}).value, status: ($('input[name="status"]:checked', form) || {}).value });
        }, 400);
      };
      form.addEventListener('input', saveDraft); form.addEventListener('change', saveDraft);
      var cancel = $('a.btn-quiet[href="#/messages"]', form);
      if (cancel) cancel.addEventListener('click', function () { clearTimeout(dt); removeStore(DRAFT_KEY); });
    }
    function fill(force) {
      var p = parseEmail($('#cf-text', form).value);
      var filled = [];
      [['from', 'cf-from'], ['to', 'cf-to'], ['subject', 'cf-subject'], ['summary', 'cf-summary']].forEach(function (k) {
        var el = $('#' + k[1], form);
        if (p[k[0]] && (force || !el.value.trim())) { el.value = p[k[0]]; filled.push(k[0]); }
      });
      if (p.date) { $('#cf-date', form).value = p.date; filled.push('date'); }
      if (p.direction) { $('input[name="dir"][value="' + p.direction + '"]', form).checked = true; filled.push('direction'); }
      $('#cf-parsed', form).textContent = filled.length ? 'Filled in: ' + filled.join(', ') + '. Please check.' : 'Couldn’t find From, Sent or Subject lines — fill in the details yourself.';
    }
    $('#cf-parse', form).addEventListener('click', function () { fill(true); });
    $('#cf-text', form).addEventListener('paste', function () { setTimeout(function () { fill(false); }, 50); });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var entry = {
        id: editId || 'cap-' + todayISO().replace(/-/g, '') + '-' + Date.now().toString(36).slice(-4),
        date: $('#cf-date', form).value || todayISO(),
        direction: ($('input[name="dir"]:checked', form) || {}).value || 'in',
        from: $('#cf-from', form).value.trim(),
        to: $('#cf-to', form).value.trim(),
        subject: $('#cf-subject', form).value.trim() || '(no subject)',
        summary: $('#cf-summary', form).value.trim(),
        status: ($('input[name="status"]:checked', form) || {}).value || 'info',
        domain: $('#cf-domain', form).value,
        fullText: $('#cf-text', form).value.trim(),
        captured: new Date().toISOString()
      };
      if (!entry.from && entry.direction === 'out') entry.from = carers().join(' and ');
      NOTES.captured = NOTES.captured.filter(function (c) { return c.id !== entry.id; });
      NOTES.captured.push(entry);
      saveNotes();
      if (!editId) { clearTimeout(dt); removeStore(DRAFT_KEY); }
      location.hash = '#/messages?f=local';
    });
  }

  /* ----------------------------------------------------------------- Health */
  VIEWS.health = {
    html: function () {
      var h = D.health || {};
      function col(title, items, badge, cls, intro, key) {
        return '<section class="panel hcol"><h2><span class="badge pill ' + cls + '">' + badge + '</span>' + esc(title) + '</h2>' +
          (intro ? '<p class="muted">' + esc(intro) + '</p>' : '') +
          arr(items).map(function (i) {
            return '<div class="hitem"><b>' + esc(i.label) + '</b>' + (i.note ? '<p>' + esc(i.note) + '</p>' : '') + sourceLine(i.source) + eb('health.' + key, i) + '</div>';
          }).join('') + addLink('health.' + key, 'Add') + '</section>';
      }
      return pageHead('Health', 'Kept in four groups so a concern is never mistaken for a diagnosis. Only the first group comes straight from a clinical letter held in the project.') +
        '<div class="health-cols">' +
          col('Confirmed in clinical letters', h.confirmed, '✓', 'mint', 'Stated by a clinician in a letter we hold.', 'confirmed') +
          col('Recorded in other documents', h.recorded, '≈', 'sky', 'Written down by nursery or meeting notes; the original clinical report isn’t in the project.', 'recorded') +
          col('Concerns and observations', h.concerns, '!', 'sun', 'Reported by parents or staff. Not diagnoses.', 'concerns') +
          col('Waiting for or not yet evidenced', h.outstanding, '…', 'coral', 'Referrals and reviews with no outcome on file.', 'outstanding') +
        '</div>';
    }
  };

  /* ------------------------------------------------------------------ About */
  VIEWS.about = {
    html: function () {
      var p = D.profile || {}, c = D.child || {};
      function bubbles(title, items, cls) {
        return '<section class="panel"><h2>' + esc(title) + '</h2><ul class="bubbles ' + cls + '">' + arr(items).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
      }
      function list(title, items) {
        return '<section class="panel"><h2>' + esc(title) + '</h2><ul>' + arr(items).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
      }
      return pageHead('About ' + kid(), esc(ageText(c.dob)) + '. Attends ' + esc(c.setting || '') + (c.settingDays ? ' on ' + esc(c.settingDays) : '') + '. Due to start reception in ' + esc(c.receptionYear || '') + '.') +
        (EDIT ? '<div class="btn-row" style="margin-bottom:12px">' + objLink('child', 'Edit her details') + objLink('profile', 'Edit profile') + '<a class="edit-btn no-print" href="#/edit/sendPlans">' + icon('pencil') + 'SEND plan cycles</a></div>' : '') +
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
        '<div class="filters"><label class="visually-hidden" for="ppl-q">Filter people</label><input class="filter-input" id="ppl-q" type="search" placeholder="Filter by name, role or service">' + addLink('people', 'Add person') + '</div>' +
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
        var labels = { Council: council(), Advice: 'Independent advice', Nursery: 'Nursery', Therapy: 'Therapy and sensory support', Health: 'Health' };
        $('#ppl-body', root).innerHTML = keys.length ? keys.map(function (k) {
          return '<h2 class="group-title">' + esc(labels[k] || k) + '</h2><div class="people-grid">' + groups[k].map(function (p) {
            var contact = '';
            if (p.email) contact += '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>';
            if (p.phone) contact += '<a href="tel:' + esc(p.phone.replace(/\s+/g, '')) + '">' + esc(p.phone) + '</a>';
            return '<article class="person"><h3>' + esc(p.name) + '</h3><div class="role">' + esc(p.role) + '</div><div class="org">' + esc(p.org) + '</div>' +
              (contact ? '<div class="contact">' + contact + '</div>' : '') +
              (p.note ? '<div class="flag">' + esc(p.note) + '</div>' : '') + eb('people', p) + '</article>';
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
      var next = all.filter(function (a) { return ahead(a); });
      var past = all.filter(function (a) { return !ahead(a); }).reverse();
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
      var rows = items.map(function (q) {
        var cid = 'c-' + kind + '-' + q.key;
        return '<li><input type="checkbox" id="' + cid + '" data-kind="' + kind + '" data-key="' + q.key + '"' + (state[q.key] ? ' checked' : '') + '>' +
          '<label for="' + cid + '">' + esc(q.text) + '</label>' +
          '<button type="button" class="del" data-del="' + kind + '" data-mine="' + q.mine + '" data-idx="' + q.idx + '" aria-label="Remove: ' + esc(q.text) + '">×</button></li>';
      });
      if (prepUndo && prepUndo.id === id && prepUndo.kind === kind) {
        rows.splice(Math.min(prepUndo.pos, rows.length), 0,
          '<li class="undo-row"><span>Removed “' + esc(prepUndo.text) + '”</span><button type="button" class="btn btn-quiet" data-undo-prep>Undo</button></li>');
      }
      return '<ul class="checks">' + rows.join('') + '</ul>';
    }

    return '<div id="prep-detail"><a class="crumb no-print" href="#/prep">Appointment prep</a>' +
      '<header class="page-head"><h1>' + esc(a.title) + '</h1>' +
        '<p>' + esc(fmt(a.date, true)) + (a.time ? ', ' + esc(a.time) : '') + ' — ' + esc(relative(a.date)) + '<br>' +
        esc(a.with || '') + (a.where ? '<br>' + esc(a.where) : '') + '</p>' +
        '<div class="btn-row no-print"><button class="btn btn-secondary" type="button" id="print">' + icon('print') + 'Print prep sheet</button>' +
        (a.local ? '<button class="btn btn-quiet danger" type="button" id="remove-appt">Remove this appointment</button>' : '') + eb('appointments', a, 'Edit appointment details') + '</div>' +
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

  var prepUndo = null;   // last removed prep item, offered back as an inline Undo row
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
        if (prepUndo) { prepUndo = null; var ur = $('#prep-detail .undo-row'); if (ur) ur.remove(); }
        saveNotes();
      }
    });
    root.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-undo-prep]')) {
        if (!prepUndo || prepUndo.id !== id) return;
        var u = prepUndo; prepUndo = null;
        NOTES.prep[id] = JSON.parse(u.snap); saveNotes(); render();
        var li = $all('#prep-detail ul.checks')[u.kind === 'q' ? 0 : 1];
        var back = li && $all('li', li)[u.pos]; var cb = back && $('input', back); if (cb) cb.focus();
        return;
      }
      var b = ev.target.closest('[data-del]');
      if (!b) return;
      var kind = b.getAttribute('data-del'), mine = b.getAttribute('data-mine') === 'true', idx = +b.getAttribute('data-idx');
      var row = b.closest('li'), list = row.parentNode;
      prepUndo = { id: id, kind: kind, text: $('label', row).textContent, snap: JSON.stringify(s),
        pos: $all('li', list).filter(function (x) { return !x.classList.contains('undo-row'); }).indexOf(row) };
      if (kind === 'q') {
        if (mine) { s.extraQ.splice(idx, 1); s.checkedQ = remapChecks(s.checkedQ, 'x', idx); }
        else { s.hiddenQ.push(idx); delete s.checkedQ['d' + idx]; }
      } else {
        if (mine) { s.extraB.splice(idx, 1); s.checkedB = remapChecks(s.checkedB, 'x', idx); }
        else { s.hiddenB.push(idx); delete s.checkedB['d' + idx]; }
      }
      saveNotes(); render();
      var ub = $('#prep-detail [data-undo-prep]'); if (ub) ub.focus({ preventScroll: true });
    });
    $all('form[data-add]', root).forEach(function (f) {
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var input = $('input', f); var v = input.value.trim(); if (!v) return;
        prepUndo = null;
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

  /* ---------------------------------------------------------------- Support
     Sleep diary (filled in each morning about the night before), road-safety
     incident log, and a tracker of benefits and support. Logs live in NOTES. */

  var SLEEP_NEEDS = [
    ['carried', 'Carried or helped downstairs'],
    ['supervised', 'Stayed up with her to keep her safe'],
    ['settling', 'Calming or settling'],
    ['toileting', 'Toileting or nappy change'],
    ['communication', 'Working out what she needed'],
    ['siblings', 'Kept her from waking Douglas']
  ];
  var ROAD_TYPES = [
    ['bolted', 'Ran off or pulled away'],
    ['dropped', 'Dropped to the ground or refused to move'],
    ['noresponse', 'Didn’t respond to her name or a warning'],
    ['fall', 'Fell or stumbled'],
    ['carried', 'Had to be carried'],
    ['overwhelmed', 'Overwhelmed by noise or crowds'],
    ['traffic', 'Moved towards traffic or moving cars']
  ];

  function isoDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function lastNightISO() { return isoDate(new Date(TODAY.getTime() - DAY)); }
  function nightLabel(iso) {
    var p = parseD(iso); if (!p) return iso;
    var next = new Date(p.d.getTime() + DAY);
    return 'Night of ' + p.d.getDate() + ' ' + MONTHS[p.d.getMonth()] + '–' + next.getDate() + ' ' + MONTHS[next.getMonth()];
  }
  function minutesBetween(a, b) {
    if (!a || !b) return null;
    var pa = a.split(':'), pb = b.split(':');
    var m = (+pb[0] * 60 + +pb[1]) - (+pa[0] * 60 + +pa[1]);
    if (m < 0) m += 1440;
    return m;
  }
  function hm(mins) {
    if (mins == null || isNaN(mins)) return '–';
    var h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return h ? h + 'h ' + (m ? m + 'm' : '') : m + 'm';
  }
  function sleepFor(night) { return NOTES.sleep.filter(function (s) { return s.night === night; })[0] || null; }

  function morningBannerHTML() {
    var now = new Date();
    var realToday = new URLSearchParams(location.search).get('today') ? 7 : now.getHours();
    if (realToday < 6) return '';
    if (sleepFor(lastNightISO())) return '';
    return '<section class="morning-banner"><div><h2>How was last night?</h2><p>' + esc(nightLabel(lastNightISO())) + ' isn’t in the sleep diary yet.</p></div>' +
      '<div class="btn-row"><button class="btn btn-secondary" type="button" data-quick-sleep="' + lastNightISO() + '">Slept through</button>' +
      '<a class="btn btn-primary" href="#/support/sleep-new?night=' + lastNightISO() + '">She woke up</a></div></section>';
  }

  function sleepStats(days) {
    var since = isoDate(new Date(TODAY.getTime() - days * DAY));
    var list = NOTES.sleep.filter(function (s) { return s.night >= since; });
    var woke = list.filter(function (s) { return s.woke; });
    var mins = woke.map(function (s) { return +s.minutes || 0; });
    var total = mins.reduce(function (a, b) { return a + b; }, 0);
    var needs = {};
    woke.forEach(function (s) { arr(s.needs).forEach(function (n) { needs[n] = (needs[n] || 0) + 1; }); });
    var times = woke.reduce(function (a, s) { return a + (+s.times || 1); }, 0);
    var first = list.map(function (s) { return s.night; }).sort()[0];
    return { logged: list.length, woke: woke.length, total: total, avg: woke.length ? total / woke.length : 0, needs: needs, times: times, first: first, longest: mins.length ? Math.max.apply(null, mins) : 0 };
  }

  function sleepSummaryText(st) {
    if (!st.logged) return '';
    var name = (D.child && D.child.shortName) || 'She';
    var lines = [];
    lines.push('Between ' + fmt(st.first, true) + ' and ' + fmt(lastNightISO(), true) + ' we kept a nightly diary for ' + st.logged + ' nights.');
    lines.push(name + ' woke and needed an adult on ' + st.woke + ' of those nights (' + Math.round(st.woke / st.logged * 100) + '%), getting up ' + (st.times === 1 ? 'once' : st.times + ' times') + ' in total.');
    if (st.woke) lines.push('On those nights an adult was up with her for ' + hm(st.avg) + ' on average, and up to ' + hm(st.longest) + '; ' + hm(st.total) + ' in total.');
    var needText = SLEEP_NEEDS.filter(function (n) { return st.needs[n[0]]; }).map(function (n) { return n[1].toLowerCase() + ' (' + st.needs[n[0]] + (st.needs[n[0]] === 1 ? ' night)' : ' nights)'); });
    if (needText.length) lines.push('What we had to do: ' + needText.join('; ') + '.');
    lines.push('She has low awareness of danger, needs help on stairs and cannot tell us what is wrong, so she cannot be left awake on her own at night.');
    return lines.join(' ');
  }

  function roadStats() {
    var counts = {};
    NOTES.incidents.forEach(function (i) { arr(i.types).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    return counts;
  }

  VIEWS.support = {
    html: function (r) {
      if (r.param === 'sleep-new') return sleepFormHTML(r.query.get('night') || lastNightISO(), r.query.get('edit'));
      if (r.param === 'sleep') return sleepListHTML();
      if (r.param === 'road-new') return roadFormHTML(r.query.get('edit'));
      if (r.param === 'roads') return roadListHTML();

      var st = sleepStats(28), all = sleepStats(3650);
      var rc = roadStats();
      var support = arr(D.support);
      var statusCls = { 'in place': 'mint', 'to do': 'sun', 'exploring': 'sky', 'not yet': '', 'later': '' };
      return pageHead('Support and benefits', 'Logs that turn everyday life into evidence, and a tracker of the help ' + kid() + ' may be entitled to.') +
        '<div class="grid grid-2">' +
          '<section class="panel"><div class="panel-head"><h2>Sleep diary</h2><a href="#/support/sleep">All nights</a></div>' +
            (st.logged ? '<div class="facts facts-3">' +
              '<div class="fact"><span class="k">Nights woken (4 weeks)</span><span class="v">' + st.woke + ' of ' + st.logged + '</span></div>' +
              '<div class="fact"><span class="k">Average time up</span><span class="v">' + hm(st.avg) + '</span></div>' +
              '<div class="fact"><span class="k">Total time up</span><span class="v">' + hm(st.total) + '</span></div></div>'
              : '<p class="muted">Fill it in each morning about the night before. Two to four weeks of entries make strong DLA evidence.</p>') +
            '<div class="btn-row section-gap"><a class="btn btn-primary" href="#/support/sleep-new?night=' + lastNightISO() + '">Log last night</a>' +
            (all.logged ? '<button class="btn btn-secondary" type="button" id="copy-sleep">Copy summary for DWP</button>' : '') + '</div>' +
            (all.logged ? '<p class="tiny section-gap" id="sleep-summary">' + esc(sleepSummaryText(all)) + '</p>' : '') +
          '</section>' +
          '<section class="panel"><div class="panel-head"><h2>Road and car park safety</h2><a href="#/support/roads">All incidents</a></div>' +
            (NOTES.incidents.length ? '<p><b>' + NOTES.incidents.length + '</b> ' + (NOTES.incidents.length === 1 ? 'incident' : 'incidents') + ' logged.</p><ul class="mini-events">' + ROAD_TYPES.filter(function (t) { return rc[t[0]]; }).map(function (t) {
              return '<li><span class="when">' + rc[t[0]] + '×</span><span>' + esc(t[1]) + '</span></li>';
            }).join('') + '</ul>'
              : '<p class="muted">Note each time getting in or out of the car, crossing or walking near traffic is unsafe. This is the evidence the Blue Badge assessment needs most.</p>') +
            '<div class="btn-row section-gap"><a class="btn btn-primary" href="#/support/road-new">Log an incident</a></div>' +
          '</section>' +
        '</div>' +
        '<section class="panel section-gap"><h2>Support tracker</h2>' +
          (support.length ? '<ul class="ticklist">' + support.map(function (x) {
            return '<li><span class="pill ' + (statusCls[x.status] || '') + '" style="flex:none">' + esc(x.status) + '</span><div><b>' + esc(x.name) + '</b>' +
              '<p class="muted" style="margin:2px 0 0">' + esc(x.position) + '</p>' +
              (x.next ? '<p style="margin:4px 0 0"><b>Next:</b> ' + esc(x.next) + '</p>' : '') +
              (x.source ? '<p class="source">' + esc(x.source) + '</p>' : '') + eb('support', x) + '</div></li>';
          }).join('') + '</ul>' : '<p class="empty">No support items in the data file yet.</p>') + addLink('support', 'Add support item') +
        '</section>' +
        '<p class="tiny section-gap">Diary and incident entries are saved on this device only. Use Data and backups to copy them to another phone.</p>';
    },
    bind: function (root, r) {
      if (r.param === 'sleep-new') return bindSleepForm(root, r.query.get('night') || lastNightISO());
      if (r.param === 'road-new') return bindRoadForm(root, r.query.get('edit'));
      if (r.param === 'sleep' || r.param === 'roads') return bindLogList(root, r.param);
      var copy = $('#copy-sleep', root);
      if (copy) copy.addEventListener('click', function () {
        var text = $('#sleep-summary', root).textContent;
        var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy summary for DWP'; }, 2000); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this text:', text); });
        else window.prompt('Copy this text:', text);
      });
    }
  };

  function checkboxGroup(name, options, selected) {
    return '<div class="check-grid">' + options.map(function (o) {
      var id = name + '-' + o[0];
      return '<label for="' + id + '"><input type="checkbox" id="' + id + '" name="' + name + '" value="' + o[0] + '"' + (arr(selected).indexOf(o[0]) !== -1 ? ' checked' : '') + '> ' + esc(o[1]) + '</label>';
    }).join('') + '</div>';
  }

  function sleepFormHTML(night) {
    var s = sleepFor(night) || {};
    var woke = s.night ? !!s.woke : true;
    return '<a class="crumb" href="#/support">Support and benefits</a>' +
      pageHead(nightLabel(night), 'Fill this in in the morning. Rough times are fine.') +
      '<form class="panel" id="sleep-form" style="max-width:640px">' +
        '<div class="field"><label for="sf-night">Night starting</label><input type="date" id="sf-night" value="' + esc(night) + '" max="' + todayISO() + '"></div>' +
        '<div class="field"><span class="label">Did she wake and need someone?</span><div class="btn-row seg">' +
          '<label><input type="radio" name="woke" value="yes"' + (woke ? ' checked' : '') + '> Yes</label>' +
          '<label><input type="radio" name="woke" value="no"' + (!woke ? ' checked' : '') + '> Slept through</label></div></div>' +
        '<div id="woke-fields"' + (woke ? '' : ' hidden') + '>' +
          '<div class="grid grid-2"><div class="field"><label for="sf-from">First woke at</label><input type="time" id="sf-from" value="' + esc(s.from || '') + '"></div>' +
          '<div class="field"><label for="sf-to">Back asleep at</label><input type="time" id="sf-to" value="' + esc(s.to || '') + '"></div></div>' +
          '<div class="grid grid-2"><div class="field"><label for="sf-times">Times someone got up</label><input type="number" min="1" max="12" id="sf-times" value="' + esc(s.times || 1) + '"></div>' +
          '<div class="field"><label for="sf-mins">Total time up (minutes)</label><input type="number" min="0" max="720" id="sf-mins" value="' + esc(s.minutes != null ? s.minutes : '') + '"><span class="tiny">Fills in from the times; change it if she woke more than once.</span></div></div>' +
          '<div class="field"><span class="label">Who got up</span><div class="btn-row seg">' + carers().concat(s.who && s.who !== 'Both' && carers().indexOf(s.who) === -1 ? [s.who] : [], ['Both']).map(function (w) {
            return '<label><input type="radio" name="who" value="' + w + '"' + (s.who === w ? ' checked' : '') + '> ' + w + '</label>';
          }).join('') + '</div></div>' +
          '<div class="field"><span class="label">What you had to do</span>' + checkboxGroup('needs', SLEEP_NEEDS, s.needs) + '</div>' +
          '<div class="field"><label for="sf-risk">Anything risky? (climbing, falls, stairs, wandering)</label><input type="text" id="sf-risk" value="' + esc(s.risk || '') + '"></div>' +
        '</div>' +
        '<div class="field"><label for="sf-notes">Notes</label><textarea id="sf-notes" rows="3" style="min-height:80px">' + esc(s.notes || '') + '</textarea></div>' +
        '<div class="btn-row"><button class="btn btn-primary" type="submit">Save</button><a class="btn btn-quiet" href="#/support">Cancel</a></div>' +
      '</form>';
  }

  function bindSleepForm(root) {
    var form = $('#sleep-form', root);
    var wf = $('#woke-fields', root);
    $all('input[name="woke"]', form).forEach(function (r) {
      r.addEventListener('change', function () { wf.hidden = r.value === 'no' && r.checked; });
    });
    var minsTouched = !!$('#sf-mins', form).value;
    $('#sf-mins', form).addEventListener('input', function () { minsTouched = true; });
    function recalc() {
      if (minsTouched) return;
      var m = minutesBetween($('#sf-from', form).value, $('#sf-to', form).value);
      if (m != null) $('#sf-mins', form).value = m;
    }
    $('#sf-from', form).addEventListener('change', recalc);
    $('#sf-to', form).addEventListener('change', recalc);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var night = $('#sf-night', form).value || lastNightISO();
      var woke = ($('input[name="woke"]:checked', form) || {}).value !== 'no';
      var entry = { night: night, woke: woke, notes: $('#sf-notes', form).value.trim(), saved: new Date().toISOString() };
      if (woke) {
        entry.from = $('#sf-from', form).value; entry.to = $('#sf-to', form).value;
        entry.times = +$('#sf-times', form).value || 1;
        var mins = $('#sf-mins', form).value;
        entry.minutes = mins === '' ? minutesBetween(entry.from, entry.to) : +mins;
        entry.who = ($('input[name="who"]:checked', form) || {}).value || '';
        entry.needs = $all('input[name="needs"]:checked', form).map(function (c) { return c.value; });
        entry.risk = $('#sf-risk', form).value.trim();
      }
      NOTES.sleep = NOTES.sleep.filter(function (s) { return s.night !== night; });
      NOTES.sleep.push(entry);
      NOTES.sleep.sort(function (a, b) { return a.night < b.night ? -1 : 1; });
      saveNotes();
      location.hash = '#/support/sleep';
    });
  }

  function sleepListHTML() {
    var list = NOTES.sleep.slice().reverse();
    return '<div id="log-page"><a class="crumb" href="#/support">Support and benefits</a>' +
      pageHead('Sleep diary', list.length + (list.length === 1 ? ' night' : ' nights') + ' logged. Tap a night to change it.') +
      '<div class="btn-row no-print" style="margin-bottom:16px"><a class="btn btn-primary" href="#/support/sleep-new?night=' + lastNightISO() + '">Log last night</a>' +
      '<button class="btn btn-secondary" type="button" data-export="sleep">Download as spreadsheet (CSV)</button>' +
      '<button class="btn btn-quiet" type="button" onclick="window.print()">Print</button></div>' +
      '<div id="log-list"><section class="panel">' + (list.length ? '<div class="table-wrap"><table><thead><tr><th>Night</th><th>Woke</th><th>Up</th><th>Who</th><th>What was needed</th><th></th></tr></thead><tbody>' +
        list.map(function (s) {
          var needs = SLEEP_NEEDS.filter(function (n) { return arr(s.needs).indexOf(n[0]) !== -1; }).map(function (n) { return n[1]; }).join(', ');
          return '<tr><td style="white-space:nowrap"><a href="#/support/sleep-new?night=' + esc(s.night) + '">' + esc(fmt(s.night)) + '</a></td>' +
            '<td>' + (s.woke ? esc((s.from || '?') + '–' + (s.to || '?')) + (s.times > 1 ? ' (' + s.times + '×)' : '') : '<span class="pill mint">Slept through</span>') + '</td>' +
            '<td>' + (s.woke ? esc(hm(s.minutes)) : '') + '</td><td>' + esc(s.who || '') + '</td>' +
            '<td>' + esc(needs) + (s.risk ? '<br><span class="tiny">Risk: ' + esc(s.risk) + '</span>' : '') + (s.notes ? '<br><span class="tiny">' + esc(s.notes) + '</span>' : '') + '</td>' +
            '<td class="no-print"><button class="del-btn" type="button" data-del-sleep="' + esc(s.night) + '" aria-label="Delete this night">×</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">No nights logged yet.</p>') + '</section></div></div>';
  }

  function roadFormHTML(editId) {
    var i = editId ? NOTES.incidents.filter(function (x) { return x.id === editId; })[0] || {} : {};
    var now = new Date();
    var t = (now.getHours() < 10 ? '0' : '') + now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();
    return '<a class="crumb" href="#/support">Support and benefits</a>' +
      pageHead(editId ? 'Edit incident' : 'Log a road or car park incident', 'Short and factual is best: what happened, where, and what you had to do.') +
      '<form class="panel" id="road-form" style="max-width:640px" data-id="' + esc(editId || '') + '">' +
        '<div class="grid grid-2"><div class="field"><label for="rf-date">Date</label><input type="date" id="rf-date" value="' + esc(i.date || todayISO()) + '" max="' + todayISO() + '"></div>' +
        '<div class="field"><label for="rf-time">Time</label><input type="time" id="rf-time" value="' + esc(i.time || t) + '"></div></div>' +
        '<div class="field"><label for="rf-where">Where</label><input type="text" id="rf-where" placeholder="For example: supermarket car park, school drop-off" value="' + esc(i.where || '') + '"></div>' +
        '<div class="field"><span class="label">What happened</span>' + checkboxGroup('types', ROAD_TYPES, i.types) + '</div>' +
        '<div class="field"><label for="rf-what">Details</label><textarea id="rf-what" rows="3" style="min-height:90px" placeholder="What she did, any near miss, how you kept her safe">' + esc(i.what || '') + '</textarea></div>' +
        '<div class="btn-row"><button class="btn btn-primary" type="submit">Save</button><a class="btn btn-quiet" href="#/support">Cancel</a></div>' +
      '</form>';
  }
  function bindRoadForm(root, editId) {
    var form = $('#road-form', root);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var entry = {
        id: editId || 'i' + Date.now().toString(36),
        date: $('#rf-date', form).value || todayISO(), time: $('#rf-time', form).value,
        where: $('#rf-where', form).value.trim(),
        types: $all('input[name="types"]:checked', form).map(function (c) { return c.value; }),
        what: $('#rf-what', form).value.trim()
      };
      NOTES.incidents = NOTES.incidents.filter(function (x) { return x.id !== entry.id; });
      NOTES.incidents.push(entry);
      NOTES.incidents.sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? -1 : 1; });
      saveNotes();
      location.hash = '#/support/roads';
    });
  }
  function roadListHTML() {
    var list = NOTES.incidents.slice().reverse();
    return '<div id="log-page"><a class="crumb" href="#/support">Support and benefits</a>' +
      pageHead('Road and car park incidents', list.length + (list.length === 1 ? ' incident' : ' incidents') + ' logged.') +
      '<div class="btn-row no-print" style="margin-bottom:16px"><a class="btn btn-primary" href="#/support/road-new">Log an incident</a>' +
      '<button class="btn btn-secondary" type="button" data-export="roads">Download as spreadsheet (CSV)</button>' +
      '<button class="btn btn-quiet" type="button" onclick="window.print()">Print</button></div>' +
      '<div id="log-list"><section class="panel">' + (list.length ? '<ul class="msg-list">' + list.map(function (i) {
        var types = ROAD_TYPES.filter(function (t) { return arr(i.types).indexOf(t[0]) !== -1; }).map(function (t) { return '<span class="pill coral">' + esc(t[1]) + '</span>'; }).join(' ');
        return '<li class="msg" style="grid-template-columns:1fr auto"><div><div class="row1"><b>' + esc(fmt(i.date)) + (i.time ? ', ' + esc(i.time) : '') + '</b><span class="when">' + esc(i.where || '') + '</span></div>' +
          '<div style="margin:6px 0;display:flex;flex-wrap:wrap;gap:6px">' + types + '</div>' + (i.what ? '<p class="sum">' + esc(i.what) + '</p>' : '') + '</div>' +
          '<div class="no-print" style="display:flex;gap:4px;align-items:flex-start"><a class="btn btn-quiet" href="#/support/road-new?edit=' + esc(i.id) + '">Edit</a><button class="del-btn" type="button" data-del-road="' + esc(i.id) + '" aria-label="Delete">×</button></div></li>';
      }).join('') + '</ul>' : '<p class="empty">No incidents logged yet.</p>') + '</section></div></div>';
  }

  function csv(rows) {
    return rows.map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\n');
  }
  function downloadText(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function bindLogList(root) {
    var main = $('#log-page', root);
    if (!main) return;
    main.addEventListener('click', function (ev) {
      var t = ev.target;
      var ds = t.closest('[data-del-sleep]'), dr = t.closest('[data-del-road]'), ex = t.closest('[data-export]');
      if (ds && confirm('Delete this night from the diary?')) {
        var n = ds.getAttribute('data-del-sleep');
        NOTES.sleep = NOTES.sleep.filter(function (s) { return s.night !== n; }); saveNotes(); render();
      } else if (dr && confirm('Delete this incident?')) {
        var id = dr.getAttribute('data-del-road');
        NOTES.incidents = NOTES.incidents.filter(function (x) { return x.id !== id; }); saveNotes(); render();
      } else if (ex) {
        if (ex.getAttribute('data-export') === 'sleep') {
          downloadText('sleep-diary-' + todayISO() + '.csv', csv([['Night starting', 'Woke', 'First woke', 'Back asleep', 'Times up', 'Minutes up', 'Who', 'What was needed', 'Risk', 'Notes']].concat(
            NOTES.sleep.map(function (s) { return [s.night, s.woke ? 'Yes' : 'No', s.from, s.to, s.times, s.minutes, s.who, arr(s.needs).map(function (k) { return (SLEEP_NEEDS.filter(function (n) { return n[0] === k; })[0] || [k, k])[1]; }).join('; '), s.risk, s.notes]; }))), 'text/csv');
        } else {
          downloadText('road-safety-log-' + todayISO() + '.csv', csv([['Date', 'Time', 'Where', 'What happened', 'Details']].concat(
            NOTES.incidents.map(function (i) { return [i.date, i.time, i.where, arr(i.types).map(function (k) { return (ROAD_TYPES.filter(function (n) { return n[0] === k; })[0] || [k, k])[1]; }).join('; '), i.what]; }))), 'text/csv');
        }
      }
    });
  }

  /* Quick "slept through" from the Overview banner */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-quick-sleep]');
    if (!b) return;
    var night = b.getAttribute('data-quick-sleep');
    NOTES.sleep = NOTES.sleep.filter(function (s) { return s.night !== night; });
    NOTES.sleep.push({ night: night, woke: false, saved: new Date().toISOString() });
    NOTES.sleep.sort(function (a, b2) { return a.night < b2.night ? -1 : 1; });
    saveNotes(); render();
  });

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
              '<dt>Possible reason</dt><dd>' + esc(c.explanation) + '</dd><dt>Which to trust</dt><dd><b>' + esc(c.stronger) + '</b></dd></dl>' + eb('conflicts', c) + '</section>';
          }).join('') + addLink('conflicts', 'Add a conflicting record');
      } else if (tab === 'gaps') {
        body = '<p class="muted">Documents that are referred to elsewhere, or should exist, but aren’t in the project yet.</p><ul class="gap-list">' +
          arr(D.gaps).map(function (g) { return '<li><b>' + esc(g.title) + '</b><p>' + esc(g.detail) + '</p><p class="act">' + esc(g.action) + '</p>' + eb('gaps', g) + '</li>'; }).join('') + '</ul>' + addLink('gaps', 'Add a missing document');
      } else if (tab === 'index') {
        body = '<section class="panel"><div class="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Document</th><th>From</th><th>Finding</th><th>Strength</th></tr></thead><tbody>' +
          arr(D.evidence).slice().sort(function (a, b) { return a.id.localeCompare(b.id); }).map(function (e) {
            return '<tr><td><span class="pill sky">' + esc(e.id) + '</span></td><td style="white-space:nowrap">' + esc(fmt(e.date)) + '</td><td>' + esc(e.doc) + '</td><td>' + esc(e.author) + '<br><span class="tiny">' + esc(e.org) + '</span></td><td>' + esc(e.finding) + '</td><td>' + esc(e.strength) + eb('evidence', e) + '</td></tr>';
          }).join('') + '</tbody></table></div></section>' + addLink('evidence', 'Add evidence');
      } else {
        body = '<section class="panel"><div class="table-wrap"><table><thead><tr><th>File</th><th>Type</th><th>What it is</th></tr></thead><tbody>' +
          arr(D.documents).map(function (d) { return '<tr><td>' + esc(d.name) + '</td><td>' + esc(d.kind) + '</td><td>' + esc(d.note) + eb('documents', d) + '</td></tr>'; }).join('') +
          '</tbody></table></div></section>' + addLink('documents', 'Add a source file');
      }
      return pageHead('Evidence check', 'Use this before meetings and before the draft plan arrives, to spot what needs correcting or chasing.') +
        '<nav class="tabs" aria-label="Evidence sections">' + tabs.map(function (t) {
          return '<a class="chip" href="#/evidence/' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + ' <span class="pill">' + t[2] + '</span></a>';
        }).join('') + '</nav><div class="stack">' + body + '</div>';
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
        '<li><a href="#/edit">' + icon('pencil') + '<span>Edit case data<span class="desc">Update letters, dates and status, save the file, undo</span></span></a></li>' +
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
    allCorrespondence().forEach(function (m) { add('Letter', m.subject, [fmt(m.date), m.from, m.to, m.summary, m.fullText || ''].join(' — '), '#/messages', m.date); });
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
    el.textContent = msg; el.classList.toggle('bad', !!bad);
    if (msg && !$('#settings').open) flash(msg);
  }
  function daysAgo(iso) {
    var d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
    return d < 1 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
  }
  function refreshBackupNote() {
    var b = readStore(BACKUP_KEY), has = hasNotes(), txt, warn = false;
    if (!has) txt = 'Nothing to back up yet.';
    else if (!b) { txt = 'Your notes haven’t been backed up yet.'; warn = true; }
    else {
      var changed = NOTES.updated && Date.parse(NOTES.updated) > Date.parse(b);
      txt = 'Last backup: ' + daysAgo(b) + (changed ? ' · changes since then' : '');
      warn = changed && (Date.now() - Date.parse(b)) > 7 * 864e5;
    }
    var el = $('#backup-note'); if (el) { el.textContent = txt; el.classList.toggle('warn', warn); }
    var side = $('#backup-side'); if (side) { side.textContent = has ? txt : ''; side.classList.toggle('warn', warn); }
    var gear = $('.topbar .settings-btn');
    if (gear) { gear.classList.toggle('needs-backup', warn); gear.setAttribute('aria-label', warn ? 'Data and backups (notes need backing up)' : 'Data and backups'); }
    var ex = $('#export-data-btn'); if (ex) ex.hidden = !D;
  }
  function backupNotes(tag) {
    download('hub-notes-' + todayISO() + (tag ? '-' + tag : '') + '.json', NOTES);
    writeStore(BACKUP_KEY, new Date().toISOString());
    refreshBackupNote();
  }
  function normaliseNotes(obj) {
    return { v: 1, prep: obj.prep || {}, appts: arr(obj.appts), sleep: arr(obj.sleep), incidents: arr(obj.incidents), captured: arr(obj.captured), statusOverrides: obj.statusOverrides || {} };
  }
  /* Merge a backup into the notes on this device: keep everything here, add what is missing. */
  function mergeNotes(mine, theirs) {
    function byKey(a, b, key) {
      var have = {}; a.forEach(function (x) { if (x) have[x[key]] = 1; });
      b.forEach(function (x) { if (x && !have[x[key]]) a.push(x); });
    }
    byKey(mine.appts, theirs.appts, 'id'); byKey(mine.sleep, theirs.sleep, 'night');
    byKey(mine.incidents, theirs.incidents, 'id'); byKey(mine.captured, theirs.captured, 'id');
    Object.keys(theirs.statusOverrides).forEach(function (k) { if (!(k in mine.statusOverrides)) mine.statusOverrides[k] = theirs.statusOverrides[k]; });
    Object.keys(theirs.prep).forEach(function (id) {
      var t = theirs.prep[id] || {};
      if (!mine.prep[id]) { mine.prep[id] = t; return; }
      var m = prepState(id);
      ['Q', 'B'].forEach(function (k) {
        var ex = m['extra' + k], chk = m['checked' + k], tchk = t['checked' + k] || {};
        Object.keys(tchk).forEach(function (c) { if (tchk[c] && c.charAt(0) === 'd') chk[c] = true; });
        arr(t['extra' + k]).forEach(function (txt, j) {
          var at = ex.indexOf(txt);
          if (at === -1) { ex.push(txt); at = ex.length - 1; }
          if (tchk['x' + j]) chk['x' + at] = true;
        });
        arr(t['hidden' + k]).forEach(function (i) { if (m['hidden' + k].indexOf(i) === -1) m['hidden' + k].push(i); });
      });
      ['notes', 'outcome'].forEach(function (f) {
        var a = m[f] || '', b = t[f] || '';
        if (!b || a === b || a.indexOf(b) !== -1) return;
        m[f] = a ? a + '\n\n— From backup —\n' + b : b;
      });
    });
  }
  var pendingRestore = null;
  function showRestoreChoice(on) {
    var box = $('#restore-choice'); box.hidden = !on;
    if (on){ $('#restore-title').textContent = 'Restore from ' + pendingRestore.name + '?'; $('[data-action="restore-merge"]', box).focus(); }
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
    var tb = $('.topbar'), sb = $('.settings-btn', tb);
    if (tb && !$('.edit-toggle', tb)) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'icon-btn edit-toggle';
      btn.setAttribute('data-action', 'toggle-edit'); btn.setAttribute('aria-label', 'Edit mode'); btn.setAttribute('aria-pressed', String(EDIT));
      btn.innerHTML = icon('pencil');
      tb.insertBefore(btn, sb || null);
    }
    var foot = $('.sidebar-foot');
    if (foot && !$('[href="#/edit"]', foot)) foot.insertAdjacentHTML('afterbegin', '<p style="margin:0 0 8px"><a class="linkish" href="#/edit">Edit case data</a></p>');
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-action]');
      if (!t) return;
      var action = t.getAttribute('data-action');
      if (action === 'copy-chase') {
        var cmod = D && clockModel(); if (!cmod) return;
        var ctext = chaseEmailText(cmod);
        var cdone = function () { t.textContent = 'Copied'; flash('Chase email copied. Paste it into a new email.'); setTimeout(function () { t.textContent = 'Copy chase email'; }, 2500); };
        if (navigator.clipboard) navigator.clipboard.writeText(ctext).then(cdone, function () { window.prompt('Copy this text:', ctext); });
        else window.prompt('Copy this text:', ctext);
      } else if (action === 'pick-data') {
        ev.preventDefault(); $('#load-data').click();
      } else if (action === 'pick-notes') {
        ev.preventDefault(); $('#load-notes').click();
      } else if (action === 'restore-merge' || action === 'restore-replace') {
        if (!pendingRestore) return;
        var inc = normaliseNotes(pendingRestore.obj), nm = pendingRestore.name;
        if (action === 'restore-replace') { backupNotes('before-restore'); NOTES = inc; }
        else mergeNotes(NOTES, inc);
        pendingRestore = null; showRestoreChoice(false);
        saveNotes();
        if (action === 'restore-replace') writeStore(BACKUP_KEY, new Date().toISOString());
        render(); refreshBackupNote();
        setStatus(action === 'restore-replace' ? 'Notes replaced from ' + nm + '. Your previous notes were downloaded first.' : 'Added notes from ' + nm + '.');
      } else if (action === 'restore-cancel') {
        pendingRestore = null; showRestoreChoice(false); setStatus('Restore cancelled. Nothing changed.');
      } else if (action === 'open-settings') {
        ev.preventDefault(); setStatus(''); refreshSettingsNote(); refreshBackupNote(); pendingRestore = null; showRestoreChoice(false);
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      } else if (action === 'export-data') {
        if (!D) { setStatus('No data loaded yet.', true); return; }
        download('case-data.json', D); markExported(); setStatus('Downloaded case-data.json');
      } else if (action === 'save-file') {
        ev.preventDefault();
        if (!D) return;
        saveFile(function () { render(); flash('File saved'); });
      } else if (action === 'toggle-edit') {
        ev.preventDefault();
        if (!D) { if (dlg.showModal) dlg.showModal(); return; }
        setEdit(!EDIT); render();
        if (EDIT) flash('Edit mode on — tap Edit on anything to change it');
      } else if (action === 'reset-data') {
        if (!BUILT_IN && !confirm('Remove ' + kids() + ' data from this device? You can load the file again any time.')) return;
        removeStore(KEYS.data); D = BUILT_IN; usingOverride = false; refreshSettingsNote(); render();
        setStatus(BUILT_IN ? 'Now using the built-in data.' : 'Data removed from this device.');
      } else if (action === 'export-notes') {
        if (!hasNotes()) { setStatus('There’s nothing to back up yet.'); return; }
        backupNotes(); setStatus('Notes backed up. Keep the file somewhere safe, like iCloud Drive.');
      } else if (action === 'clear-notes') {
        if (!hasNotes()) { setStatus('There are no notes to clear.'); return; }
        if (!confirm('Clear all your ticks, notes, diary entries and added appointments on this device?\n\nA backup file will download first, so you can restore them later.')) return;
        backupNotes('before-clear');
        NOTES = emptyNotes(); saveNotes(); render(); refreshBackupNote();
        setStatus('Your notes have been cleared. A backup was downloaded first.');
      }
    });

    $('#load-data').addEventListener('change', function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      readJSONFile(f, function (err, obj) {
        ev.target.value = '';
        if (err || !obj || !obj.child || !Array.isArray(obj.events)) {
          var d3 = $('#settings'); if (!d3.open && d3.showModal) d3.showModal();
          setStatus('That file isn’t a hub data file. It needs “child” and “events” sections.', true); return;
        }
        if (D) pushUndo('load ' + f.name);
        if (!writeStore(KEYS.data, obj)) { setStatus('This browser wouldn’t store the file. It may be in private mode.', true); return; }
        markExported();
        D = obj; usingOverride = true; refreshSettingsNote(); render();
        var iss = clockIssues(obj.ehcna || {});
        setStatus('Loaded ' + f.name + '.' + (iss.length ? ' Check the assessment dates: ' + iss.join('; ') + '.' : ''), iss.length > 0);
      });
    });
    $('#load-notes').addEventListener('change', function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      readJSONFile(f, function (err, obj) {
        ev.target.value = '';
        if (err || !obj || typeof obj.prep !== 'object') { setStatus('That file isn’t a notes backup. Choose a file named like hub-notes-….json.', true); return; }
        if (!hasNotes()) { NOTES = normaliseNotes(obj); saveNotes(); writeStore(BACKUP_KEY, new Date().toISOString()); render(); refreshBackupNote(); setStatus('Notes restored from ' + f.name + '.'); return; }
        pendingRestore = { obj: obj, name: f.name };
        var dlg2 = $('#settings'); if (!dlg2.open && dlg2.showModal) dlg2.showModal();
        setStatus(''); showRestoreChoice(true);
      });
    });

    $('#search-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var q = $('#search-input').value.trim();
      location.hash = '#/search?q=' + encodeURIComponent(q);
    });

    window.addEventListener('hashchange', onRoute);
  }

  /* ------------------------------------------------------------ Edit mode
     Lets you change case-data.json from inside the app. Every edit is written
     straight into the data stored on this device, stamped in a change log, and
     can be undone. "Save file" hands the updated case-data.json to the share
     sheet (iPhone) or downloads it, so you always have a master copy. */

  var EKEYS = { mode: 'dh:edit:v1', undo: 'dh:undo:v1', exported: 'dh:exported:v1' };
  var EDIT = !!readStore(EKEYS.mode);
  var UNDO_MAX = 15;

  function opts(list) { return function () { return list.map(function (x) { return Array.isArray(x) ? x : [x, x || '(none)']; }); }; }
  function domainOpts() { return Object.keys(D.domains || {}).map(function (k) { return [k, domainLabel(k)]; }); }

  var F = {
    date: function (k, label, o) { return Object.assign({ k: k, label: label, type: 'date' }, o || {}); },
    text: function (k, label, o) { return Object.assign({ k: k, label: label, type: 'text' }, o || {}); },
    area: function (k, label, o) { return Object.assign({ k: k, label: label, type: 'textarea' }, o || {}); },
    lines: function (k, label, o) { return Object.assign({ k: k, label: label, type: 'lines' }, o || {}); },
    sel: function (k, label, options, o) { return Object.assign({ k: k, label: label, type: 'select', options: options }, o || {}); },
    check: function (k, label, o) { return Object.assign({ k: k, label: label, type: 'check' }, o || {}); },
    num: function (k, label, o) { return Object.assign({ k: k, label: label, type: 'number' }, o || {}); }
  };

  var SECTIONS = {
    'ehcna': { label: 'Assessment status and dates', kind: 'object', group: 'EHC assessment', fields: [
      F.text('status', 'Current status (shown on the clock)', { required: true }),
      F.text('team', 'SEN team to write to', { help: 'Used when no case officer is named.' }),
      F.date('requestInferred', 'Request received by the council', { help: 'The 20-week clock starts here.' }),
      F.area('requestInferredNote', 'Note about the 20-week clock'),
      F.date('decisionToAssess', 'Decision to assess'),
      F.area('decisionToAssessNote', 'Note about the decision date'),
      F.date('draftDecisionDue', 'Decision on a draft plan was due'),
      F.date('finalDue', 'Final EHCP due'),
      F.num('weeksAllowed', 'Weeks allowed'),
      F.text('expectedOutcome', 'What the council now expects, and when'),
      F.check('exceptionApplied', 'A statutory exception has been applied', { keepFalse: true }),
      F.area('delayReason', 'Reason given for the delay'),
      F.lines('waitingOn', 'Waiting for answers on', { help: 'One per line. Delete a line once it’s answered.' }),
      F.text('waitingOnSource', 'Asked in (letter or email)')
    ] },
    'ehcna.stages': { label: 'Assessment stages', kind: 'list', group: 'EHC assessment', title: 'label', fields: [
      F.text('label', 'Stage', { required: true }),
      F.date('date', 'Date'),
      F.sel('state', 'State', opts([['done', 'Done'], ['current', 'Happening now'], ['todo', 'Still to come'], ['late', 'Late']])),
      F.text('note', 'Note'),
      F.check('inferred', 'Date is worked out, not confirmed')
    ] },
    'ehcna.adviceReceived': { label: 'Advice received', kind: 'list', group: 'EHC assessment', title: 'label', fields: [
      F.text('label', 'Advice', { required: true }), F.text('source', 'Source')
    ] },
    'ehcna.adviceOutstanding': { label: 'Advice outstanding or not held', kind: 'list', group: 'EHC assessment', title: 'label', fields: [
      F.text('label', 'Advice', { required: true }), F.area('detail', 'Detail'), F.text('source', 'Source')
    ] },
    'ehcna.officers': { label: 'Who holds the case', kind: 'list', group: 'EHC assessment', title: 'name', fields: [
      F.text('name', 'Name', { required: true }), F.text('role', 'Role'), F.date('from', 'From'), F.date('to', 'To', { help: 'Leave empty if they still hold the case.' }), F.area('note', 'Note')
    ] },
    'ehcna.commitmentsFromLetters': { label: 'What the council committed to', kind: 'list', group: 'EHC assessment', title: 'commitment', date: 'date', fields: [
      F.date('date', 'Letter date'), F.area('commitment', 'What they said they would do', { required: true }), F.area('position', 'Where it stands now'), F.text('source', 'Source')
    ] },
    'correspondence': { label: 'Letters and emails', kind: 'list', group: 'Letters and timeline', idPrefix: 'c', title: 'subject', date: 'date', fields: [
      F.date('date', 'Date', { required: true }),
      F.check('dateApprox', 'Date is approximate'),
      F.sel('direction', 'Direction', opts([['in', 'Received'], ['out', 'Sent by us']])),
      F.text('from', 'From'), F.text('to', 'To'),
      F.text('subject', 'Subject', { required: true }),
      F.area('summary', 'Summary'),
      F.sel('status', 'Status', opts([['info', 'For information'], ['awaiting reply', 'Awaiting reply'], ['answered', 'Answered'], ['superseded', 'Superseded']])),
      F.sel('answers', 'This replies to', function () {
        return [['', '(not a reply)']].concat(arr(D.correspondence).filter(function (c) { return c.status === 'awaiting reply' || c.status === 'info'; })
          .slice().sort(function (a, b) { return sortKey(b.date) - sortKey(a.date); }).slice(0, 12)
          .map(function (c) { return [c.id, fmt(c.date) + ' — ' + c.subject + (c.status === 'awaiting reply' ? ' (awaiting)' : '')]; }));
      }, { pseudo: true, newOnly: true, help: 'Marks that letter as answered.' }),
      F.lines('asks', 'Points raised or asked', { help: 'One per line.' }),
      F.text('source', 'Source file'),
      F.area('fullText', 'Full text (optional)'),
      F.check('addEvent', 'Also add it to the timeline', { pseudo: true, newOnly: true, defaultOn: true })
    ] },
    'events': { label: 'Timeline events', kind: 'list', group: 'Letters and timeline', idPrefix: 'e', title: 'title', date: 'date', fields: [
      F.date('date', 'Date', { required: true }),
      F.text('title', 'Title', { required: true }),
      F.sel('domain', 'Area', domainOpts),
      F.sel('kind', 'Type', opts([['', 'Event'], ['deadline', 'Deadline'], ['inferred', 'Worked out from other dates'], ['change', 'Change of officer']])),
      F.area('summary', 'Summary'),
      F.text('source', 'Source'),
      F.check('happened', 'This has happened (show it as past even if dated today or later)'),
      F.sel('confidence', 'How sure', opts([['high', 'From the document itself'], ['medium', 'Secondary source'], ['low', 'Inferred']]))
    ] },
    'keyDates': { label: 'Key dates', kind: 'list', group: 'Letters and timeline', title: 'label', date: 'date', fields: [
      F.date('date', 'Date', { required: true }), F.text('label', 'What', { required: true }),
      F.sel('type', 'Type', opts([['appointment', 'Appointment'], ['deadline', 'Deadline'], ['milestone', 'Milestone']]))
    ] },
    'appointments': { label: 'Appointments', kind: 'list', group: 'Letters and timeline', idPrefix: 'appt-', title: 'title', date: 'date', fields: [
      F.text('title', 'What is it?', { required: true }), F.date('date', 'Date', { required: true }), F.text('time', 'Time'),
      F.text('with', 'Who with'), F.text('where', 'Where'),
      F.sel('status', 'Status', opts(['booked', 'proposed', 'date to confirm', 'done', 'cancelled'])),
      F.sel('domain', 'Area', domainOpts),
      F.lines('context', 'What’s on file', { help: 'One per line.' }), F.lines('questions', 'Questions to ask', { help: 'One per line.' }), F.lines('bring', 'Take with you', { help: 'One per line.' })
    ] },
    'people': { label: 'People', kind: 'list', group: 'People and support', title: 'name', fields: [
      F.text('name', 'Name', { required: true }), F.text('role', 'Role'), F.text('org', 'Organisation'),
      F.sel('group', 'Group', opts(['Council', 'Advice', 'Nursery', 'Therapy', 'Health', 'Other'])),
      F.text('email', 'Email'), F.text('phone', 'Phone'), F.area('note', 'Note')
    ] },
    'support': { label: 'Support and benefits', kind: 'list', group: 'People and support', title: 'name', fields: [
      F.text('name', 'Name', { required: true }), F.sel('status', 'Status', opts(['in place', 'to do', 'exploring', 'not yet', 'later'])),
      F.area('position', 'Where it stands'), F.area('next', 'Next step'), F.text('source', 'Source')
    ] },
    'health.confirmed': { label: 'Health: confirmed in clinical letters', kind: 'list', group: 'Health', title: 'label', fields: [F.text('label', 'What', { required: true }), F.area('note', 'Note'), F.text('source', 'Source')] },
    'health.recorded': { label: 'Health: recorded in other documents', kind: 'list', group: 'Health', title: 'label', fields: [F.text('label', 'What', { required: true }), F.area('note', 'Note'), F.text('source', 'Source')] },
    'health.concerns': { label: 'Health: concerns and observations', kind: 'list', group: 'Health', title: 'label', fields: [F.text('label', 'What', { required: true }), F.area('note', 'Note'), F.text('source', 'Source')] },
    'health.outstanding': { label: 'Health: waiting for or not yet evidenced', kind: 'list', group: 'Health', title: 'label', fields: [F.text('label', 'What', { required: true }), F.area('note', 'Note'), F.text('source', 'Source')] },
    'conflicts': { label: 'Conflicting records', kind: 'list', group: 'Evidence', title: 'title', fields: [
      F.text('title', 'Title', { required: true }), F.area('a', 'Source A'), F.area('b', 'Source B'), F.area('explanation', 'Possible reason'), F.area('stronger', 'Which to trust')
    ] },
    'gaps': { label: 'Missing documents', kind: 'list', group: 'Evidence', title: 'title', fields: [
      F.text('title', 'Title', { required: true }), F.area('detail', 'Detail'), F.area('action', 'Action')
    ] },
    'evidence': { label: 'Evidence index', kind: 'list', group: 'Evidence', title: 'doc', date: 'date', fields: [
      F.text('id', 'ID (e.g. DDW-016)', { required: true }), F.date('date', 'Date'), F.text('doc', 'Document', { required: true }), F.text('author', 'Author'), F.text('org', 'Organisation'),
      F.area('finding', 'Finding'), F.sel('domain', 'Area', domainOpts), F.text('strength', 'Strength')
    ] },
    'documents': { label: 'Source files', kind: 'list', group: 'Evidence', title: 'name', fields: [
      F.text('name', 'File name', { required: true }), F.text('kind', 'Type'), F.text('note', 'What it is')
    ] },
    'child': { get label() { return Kids() + ' details'; }, kind: 'object', group: 'About', fields: [
      F.text('name', 'Full name', { required: true }), F.text('shortName', 'Short name'), F.date('dob', 'Date of birth'),
      F.text('setting', 'Nursery or school'), F.text('settingDays', 'Days attending'), F.text('receptionYear', 'Starts reception'),
      F.text('localAuthority', 'Council'), F.text('carers', 'Parents or carers', { help: 'First names separated by commas. Used in the sleep diary and to spot emails you sent.' }),
      F.text('familyEmails', 'Your email addresses', { help: 'Separated by commas. Pasted emails from these count as sent by you.' }), F.area('headline', 'Headline')
    ] },
    'profile': { get label() { return 'About ' + kid() + ' (profile)'; }, kind: 'object', group: 'About', fields: [
      F.lines('strengths', 'What she does well'), F.lines('whatWorks', 'What helps her'), F.lines('needsHelpWith', 'What she needs help with'),
      F.lines('makesHappy', 'What makes her happy'), F.lines('importantNow', 'Important to her now'), F.lines('future', 'Important for her future'),
      F.area('parentAspirations', 'Our hopes for her'), F.text('source', 'Source')
    ] },
    'sendPlans': { label: 'Nursery SEND plan cycles', kind: 'list', group: 'About', title: 'cycle', date: 'start', fields: [
      F.text('cycle', 'Cycle', { required: true }), F.date('start', 'Started'), F.date('review', 'Review'), F.text('outcome', 'Outcome'), F.area('progress', 'Progress noted')
    ] }
  };

  function getPath(path, create) {
    var parts = path.split('.'), o = D;
    for (var i = 0; i < parts.length; i++) {
      var last = i === parts.length - 1;
      if (o[parts[i]] == null) {
        if (!create) return last && SECTIONS[path] && SECTIONS[path].kind === 'list' ? [] : null;
        o[parts[i]] = last && SECTIONS[path] && SECTIONS[path].kind === 'list' ? [] : {};
      }
      o = o[parts[i]];
    }
    return o;
  }
  function itemTitle(sec, x) {
    if (typeof x === 'string') return x;
    var t = x && (x[sec.title] || x.title || x.label || x.name || x.subject || x.id);
    return t ? String(t) : '(untitled)';
  }
  function nextId(prefix, list) {
    var max = 0;
    arr(list).forEach(function (x) {
      if (x && typeof x.id === 'string' && x.id.indexOf(prefix) === 0) {
        var n = parseInt(x.id.slice(prefix.length), 10); if (!isNaN(n) && n > max) max = n;
      }
    });
    var n2 = max + 1;
    return prefix + (n2 < 10 ? '0' : '') + n2;
  }
  function findIndex(path, ref) {
    var list = getPath(path);
    if (!Array.isArray(list)) return -1;
    if (ref && ref.id != null) {
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === ref.id) return i;
    }
    if (ref && ref.obj) return list.indexOf(ref.obj);
    return ref && ref.i != null ? +ref.i : -1;
  }

  /* Links used inside the normal pages while edit mode is on */
  function editHref(path, ref) {
    var q = [];
    if (ref === 'new') q.push('i=new');
    else if (ref && ref.id != null) q.push('id=' + encodeURIComponent(ref.id));
    else if (ref && ref.obj) { var i = findIndex(path, ref); if (i < 0) return ''; q.push('i=' + i); }
    q.push('back=' + encodeURIComponent(location.hash || '#/home'));
    return '#/edit/' + path + '?' + q.join('&');
  }
  function eb(path, obj, label) {
    if (!EDIT || !obj || obj.local) return '';
    var href = editHref(path, obj.id != null ? { id: obj.id } : { obj: obj });
    return href ? '<a class="edit-btn no-print" href="' + href + '">' + icon('pencil') + (label || 'Edit') + '</a>' : '';
  }
  function addLink(path, label) {
    if (!EDIT) return '';
    return '<a class="edit-btn add no-print" href="' + editHref(path, 'new') + '">' + icon('plus') + esc(label || 'Add') + '</a>';
  }
  function objLink(path, label) {
    if (!EDIT) return '';
    return '<a class="edit-btn no-print" href="#/edit/' + path + '?back=' + encodeURIComponent(location.hash || '#/home') + '">' + icon('pencil') + esc(label || 'Edit') + '</a>';
  }

  /* Saving, undo and the change log */
  function pushUndo(label) {
    var stack = readStore(EKEYS.undo) || [];
    stack.unshift({ at: new Date().toISOString(), label: label, data: JSON.stringify(D) });
    stack = stack.slice(0, UNDO_MAX);
    while (stack.length && !writeStore(EKEYS.undo, stack)) stack.pop();
  }
  function persist(action, section, item) {
    D.meta = D.meta || {};
    D.meta.updated = todayISO();
    D.meta.editedAt = new Date().toISOString();
    D.changeLog = arr(D.changeLog);
    D.changeLog.unshift({ at: D.meta.editedAt, action: action, section: section, item: item });
    if (D.changeLog.length > 300) D.changeLog.length = 300;
    var ok = writeStore(KEYS.data, D);
    usingOverride = true;
    refreshSettingsNote();
    return ok;
  }
  function unsavedCount() {
    var ex = readStore(EKEYS.exported);
    return arr(D && D.changeLog).filter(function (c) { return !ex || c.at > ex; }).length;
  }
  function markExported() { writeStore(EKEYS.exported, new Date().toISOString()); }
  function saveFile(after) {
    var name = 'case-data.json';
    var json = JSON.stringify(D, null, 2);
    function fallback() { download(name, D); markExported(); if (after) after(); }
    try {
      var file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: appName() + ' data' }).then(function () { markExported(); if (after) after(); }, function (err) {
          if (err && err.name === 'AbortError') return;
          fallback();
        });
        return;
      }
    } catch (e) { /* fall through to download */ }
    fallback();
  }
  function undoLast() {
    var stack = readStore(EKEYS.undo) || [];
    var top = stack.shift();
    if (!top) return null;
    try { D = JSON.parse(top.data); } catch (e) { return null; }
    writeStore(EKEYS.undo, stack);
    writeStore(KEYS.data, D);
    usingOverride = true;
    refreshSettingsNote();
    return top.label;
  }
  function setEdit(on) {
    EDIT = !!on;
    if (EDIT) writeStore(EKEYS.mode, 1); else removeStore(EKEYS.mode);
    syncEditToggle();
  }
  function syncEditToggle() {
    $all('[data-action="toggle-edit"].edit-toggle').forEach(function (b) { b.setAttribute('aria-pressed', String(EDIT)); });
    document.body.classList.toggle('editing', EDIT);
  }

  function editBarHTML() {
    if (!EDIT || !D) return '';
    var n = unsavedCount();
    return '<div class="edit-bar no-print" role="region" aria-label="Edit mode">' +
      '<div><b>Edit mode</b><span>' + (n ? n + (n === 1 ? ' change' : ' changes') + ' not yet saved to a file' : 'Everything is saved to a file') + '</span></div>' +
      '<div class="btn-row"><a class="btn btn-quiet" href="#/edit">Edit hub</a>' +
      '<button class="btn ' + (n ? 'btn-primary' : 'btn-secondary') + '" type="button" data-action="save-file">Save file</button>' +
      '<button class="btn btn-quiet" type="button" data-action="toggle-edit">Done</button></div></div>';
  }

  function timeAgo(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var h = Math.round(mins / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* ----- The edit hub, section lists and forms */
  VIEWS.edit = {
    html: function (r) {
      if (!r.param) return editHubHTML();
      var sec = SECTIONS[r.param];
      if (!sec) return pageHead('Not found', '<a href="#/edit">Back to the edit hub</a>');
      if (sec.kind === 'object' || r.query.get('i') != null || r.query.get('id') != null) return editFormHTML(r.param, r.query);
      return sectionListHTML(r.param);
    },
    bind: function (root, r) {
      if (r.param && SECTIONS[r.param] && (SECTIONS[r.param].kind === 'object' || r.query.get('i') != null || r.query.get('id') != null)) bindEditForm(root, r.param, r.query);
      var u = $('#undo-btn', root);
      if (u) u.addEventListener('click', function () {
        var label = undoLast();
        render();
        flash(label ? 'Undone: ' + label : 'Nothing to undo');
      });
    }
  };

  function flash(msg) {
    var el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 2200);
    setTimeout(function () { el.remove(); }, 2700);
  }

  function editHubHTML() {
    var n = unsavedCount();
    var ex = readStore(EKEYS.exported);
    var stack = readStore(EKEYS.undo) || [];
    var log = arr(D.changeLog).slice(0, 25);
    var groups = {};
    Object.keys(SECTIONS).forEach(function (k) { var s = SECTIONS[k]; (groups[s.group] = groups[s.group] || []).push(k); });
    var quick = [
      ['correspondence', 'new', 'Add a letter or email'],
      ['ehcna', null, 'Update assessment status'],
      ['events', 'new', 'Add a timeline event'],
      ['keyDates', 'new', 'Add a key date'],
      ['gaps', 'new', 'Add a missing document'],
      ['conflicts', 'new', 'Add a conflicting record'],
      ['people', 'new', 'Add a person']
    ];
    return pageHead('Edit case data', 'Changes save on this phone straight away and every page updates. Use Save file to keep a master copy of <code>case-data.json</code> in Files or iCloud.') +
      '<section class="panel save-panel">' +
        '<div class="facts facts-3">' +
          '<div class="fact' + (n ? ' alert' : '') + '"><span class="k">Not yet saved to a file</span><span class="v">' + n + '</span></div>' +
          '<div class="fact"><span class="k">Last change</span><span class="v small">' + esc(D.meta && D.meta.editedAt ? timeAgo(D.meta.editedAt) : '–') + '</span></div>' +
          '<div class="fact"><span class="k">Last saved file</span><span class="v small">' + esc(ex ? timeAgo(ex) : 'Not yet') + '</span></div>' +
        '</div>' +
        '<div class="btn-row section-gap">' +
          '<button class="btn btn-primary" type="button" data-action="save-file">Save file</button>' +
          (stack.length ? '<button class="btn btn-secondary" type="button" id="undo-btn">Undo: ' + esc(stack[0].label) + '</button>' : '') +
          '<button class="btn btn-quiet" type="button" data-action="toggle-edit">' + (EDIT ? 'Turn off edit buttons' : 'Show edit buttons on every page') + '</button>' +
        '</div>' +
      '</section>' +
      '<section class="panel section-gap"><h2>Quick updates</h2><div class="quick-grid">' +
        quick.map(function (q) {
          var href = q[1] === 'new' ? '#/edit/' + q[0] + '?i=new&back=' + encodeURIComponent('#/edit') : '#/edit/' + q[0] + '?back=' + encodeURIComponent('#/edit');
          return '<a class="tile" href="' + href + '"><span class="l">' + esc(q[2]) + '</span></a>';
        }).join('') +
      '</div></section>' +
      '<div class="grid grid-2 section-gap">' +
        '<section class="panel"><h2>Everything in the file</h2>' +
          Object.keys(groups).map(function (g) {
            return '<h3 class="section-gap">' + esc(g) + '</h3><ul class="mini-events">' + groups[g].map(function (k) {
              var s = SECTIONS[k], list = getPath(k);
              var count = s.kind === 'list' ? '<span class="pill">' + arr(list).length + '</span>' : '';
              return '<li><a href="#/edit/' + k + '">' + esc(s.label) + '</a>' + count + '</li>';
            }).join('') + '</ul>';
          }).join('') +
        '</section>' +
        '<section class="panel"><h2>Recent changes</h2>' +
          (log.length ? '<ul class="mini-events change-log">' + log.map(function (c) {
            var unsaved = !ex || c.at > ex;
            return '<li><span class="when">' + esc(timeAgo(c.at)) + '</span><span><span class="pill ' + (c.action === 'deleted' ? 'coral' : c.action === 'added' ? 'mint' : 'sky') + '">' + esc(c.action) + '</span> ' +
              esc(c.item) + '<span class="tiny"> · ' + esc(c.section) + (unsaved ? ' · not in a saved file yet' : '') + '</span></span></li>';
          }).join('') + '</ul>' : '<p class="empty">No changes made in the app yet.</p>') +
        '</section>' +
      '</div>';
  }

  function sectionListHTML(path) {
    var sec = SECTIONS[path];
    var list = arr(getPath(path));
    var rows = list.map(function (x, i) { return { x: x, i: i }; });
    if (sec.date) rows.sort(function (a, b) { return sortKey(b.x[sec.date]) - sortKey(a.x[sec.date]); });
    return '<a class="crumb" href="#/edit">Edit hub</a>' + pageHead(sec.label, list.length + (list.length === 1 ? ' item' : ' items') + '. Tap one to change or delete it.') +
      '<div class="btn-row" style="margin-bottom:16px"><a class="btn btn-primary" href="#/edit/' + path + '?i=new">' + icon('plus') + 'Add</a></div>' +
      '<section class="panel">' + (rows.length ? '<ul class="mini-events edit-list">' + rows.map(function (r) {
        var d = sec.date ? r.x[sec.date] : '';
        return '<li><span class="when">' + esc(d ? fmt(d) : '') + '</span><a href="#/edit/' + path + '?i=' + r.i + '">' + esc(itemTitle(sec, r.x)) + '</a></li>';
      }).join('') + '</ul>' : '<p class="empty">Nothing here yet.</p>') + '</section>';
  }

  function dateFieldHTML(id, val) {
    var month = /^\d{4}-\d{2}$/.test(val || '');
    return '<div class="date-field"><input type="' + (month ? 'month' : 'date') + '" id="' + id + '" value="' + esc(val || '') + '">' +
      '<label class="mini-check"><input type="checkbox" data-month-for="' + id + '"' + (month ? ' checked' : '') + '> Month only</label>' +
      '<button type="button" class="btn btn-quiet small" data-clear-for="' + id + '">Clear</button></div>';
  }

  function fieldHTML(f, item, isNew) {
    if (f.newOnly && !isNew) return '';
    var id = 'ef-' + f.k, v = item[f.k];
    var help = f.help ? '<span class="tiny">' + esc(f.help) + '</span>' : '';
    var req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
    if (f.type === 'check') {
      var on = f.pseudo ? !!f.defaultOn : !!v;
      return '<div class="field"><label class="check-line" for="' + id + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + esc(f.label) + '</label>' + help + '</div>';
    }
    var input;
    if (f.type === 'textarea') input = '<textarea id="' + id + '" rows="4">' + esc(v || '') + '</textarea>';
    else if (f.type === 'lines') input = '<textarea id="' + id + '" rows="5">' + esc(arr(v).join('\n')) + '</textarea>';
    else if (f.type === 'date') input = dateFieldHTML(id, v);
    else if (f.type === 'number') input = '<input type="number" id="' + id + '" value="' + esc(v == null ? '' : v) + '">';
    else if (f.type === 'select') {
      var o = f.options();
      var cur = v == null ? '' : String(v);
      if (cur && !o.some(function (x) { return x[0] === cur; })) o = o.concat([[cur, cur]]);
      input = '<select id="' + id + '">' + o.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === cur ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>';
    } else input = '<input type="text" id="' + id + '" value="' + esc(v == null ? '' : v) + '"' + (f.required ? ' required' : '') + '>';
    return '<div class="field"><label for="' + id + '">' + esc(f.label) + req + '</label>' + input + help + '</div>';
  }

  function resolveItem(path, q) {
    var sec = SECTIONS[path];
    if (sec.kind === 'object') return { item: getPath(path) || {}, index: null, isNew: false };
    if (q.get('i') === 'new') return { item: {}, index: -1, isNew: true };
    var idx = q.get('id') != null ? findIndex(path, { id: q.get('id') }) : +q.get('i');
    var list = arr(getPath(path));
    return idx >= 0 && idx < list.length ? { item: list[idx], index: idx, isNew: false } : null;
  }

  function editFormHTML(path, q) {
    var sec = SECTIONS[path];
    var res = resolveItem(path, q);
    var back = q.get('back') || (sec.kind === 'object' ? '#/edit' : '#/edit/' + path);
    if (!res) return '<a class="crumb" href="' + esc(back) + '">Back</a>' + pageHead('Item not found', 'It may have been deleted or changed in a newer data file.');
    var title = res.isNew ? 'Add to ' + sec.label.toLowerCase() : (sec.kind === 'object' ? sec.label : itemTitle(sec, res.item));
    var extra = res.item.id ? '<p class="tiny">ID: ' + esc(res.item.id) + '</p>' : '';
    return '<a class="crumb" href="' + esc(back) + '">Back</a>' +
      pageHead(title, res.isNew ? '' : (sec.kind === 'object' ? '' : esc(sec.label))) +
      '<form class="panel edit-form" id="edit-form" novalidate>' + extra +
        sec.fields.map(function (f) { return fieldHTML(f, res.item, res.isNew); }).join('') +
        '<p class="status-line" id="ef-status" role="status" aria-live="polite"></p>' +
        '<div class="btn-row edit-actions"><button class="btn btn-primary" type="submit">Save</button>' +
        '<a class="btn btn-quiet" href="' + esc(back) + '">Cancel</a>' +
        (!res.isNew && sec.kind === 'list' ? '<button class="btn btn-quiet danger" type="button" id="ef-delete">Delete</button>' : '') + '</div>' +
      '</form>';
  }

  function readField(f, form) {
    var el = $('#ef-' + f.k, form);
    if (!el) return undefined;
    if (f.type === 'check') return el.checked;
    if (f.type === 'lines') return el.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (f.type === 'number') return el.value === '' ? '' : +el.value;
    return el.value.trim();
  }

  function bindEditForm(root, path, q) {
    var form = $('#edit-form', root); if (!form) return;
    var sec = SECTIONS[path];
    var back = q.get('back') || (sec.kind === 'object' ? '#/edit' : '#/edit/' + path);

    form.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.matches('[data-month-for]')) {
        var inp = $('#' + t.getAttribute('data-month-for'), form), v = inp.value;
        inp.type = t.checked ? 'month' : 'date';
        if (t.checked && /^\d{4}-\d{2}-\d{2}$/.test(v)) inp.value = v.slice(0, 7);
        else if (!t.checked && /^\d{4}-\d{2}$/.test(v)) inp.value = v + '-01';
      }
    });
    form.addEventListener('click', function (ev) {
      var c = ev.target.closest('[data-clear-for]');
      if (c) { $('#' + c.getAttribute('data-clear-for'), form).value = ''; }
    });

    var del = $('#ef-delete', form);
    if (del) del.addEventListener('click', function () {
      var res = resolveItem(path, q); if (!res) return;
      var name = itemTitle(sec, res.item);
      if (!confirm('Delete “' + name + '”? You can undo this from the edit hub.')) return;
      pushUndo('delete ' + name);
      getPath(path).splice(res.index, 1);
      persist('deleted', sec.label, name);
      location.hash = back.indexOf('#/edit/' + path + '?') === 0 ? '#/edit/' + path : back;
      flash('Deleted');
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var res = resolveItem(path, q); if (!res) return;
      var vals = {}, pseudo = {}, missing = [];
      sec.fields.forEach(function (f) {
        if (f.newOnly && !res.isNew) return;
        var v = readField(f, form);
        if (v === undefined) return;
        if (f.required && (v === '' || (Array.isArray(v) && !v.length))) missing.push(f.label);
        if (f.pseudo) pseudo[f.k] = v; else vals[f.k] = v;
      });
      if (missing.length) { $('#ef-status', form).textContent = 'Please fill in: ' + missing.join(', '); $('#ef-status', form).style.color = 'var(--coral-text)'; return; }
      if (path === 'ehcna') {   // warn once if the clock dates don't add up; a second Save keeps them
        var probe = {}; Object.keys(res.item || {}).forEach(function (k) { probe[k] = res.item[k]; });
        Object.keys(vals).forEach(function (k) { probe[k] = vals[k]; });
        var iss = clockIssues(probe), sig = iss.join('|');
        if (iss.length && form.getAttribute('data-date-warned') !== sig) {
          form.setAttribute('data-date-warned', sig);
          $('#ef-status', form).textContent = 'These dates don’t add up: ' + iss.join('; ') + '. Fix them, or press Save again to keep them.';
          $('#ef-status', form).style.color = 'var(--coral-text)'; return;
        }
      }

      var target = res.isNew ? {} : res.item;
      var before = JSON.stringify(target);
      var name = vals[sec.title] || itemTitle(sec, target);
      pushUndo((res.isNew ? 'add ' : 'edit ') + name);

      sec.fields.forEach(function (f) {
        if (f.pseudo || !(f.k in vals)) return;
        var v = vals[f.k];
        var empty = v === '' || v === false || (Array.isArray(v) && !v.length);
        if (empty && !(f.keepFalse && v === false)) {
          if (f.type === 'date' && f.k in target && target[f.k] === null) return;
          delete target[f.k];
        } else target[f.k] = v;
      });

      var list;
      if (sec.kind === 'object') {
        var parts = path.split('.'), parent = D;
        parts.slice(0, -1).forEach(function (p) { parent = parent[p] = parent[p] || {}; });
        parent[parts[parts.length - 1]] = target;
      } else if (res.isNew) {
        list = getPath(path, true);
        if (sec.idPrefix && !target.id) target.id = nextId(sec.idPrefix, list);
        list.push(target);
      }

      if (path === 'correspondence') {
        if (target.id && NOTES.statusOverrides[target.id]) { delete NOTES.statusOverrides[target.id]; saveNotes(); }
        if (pseudo.answers) {
          var orig = arr(D.correspondence).filter(function (c) { return c.id === pseudo.answers; })[0];
          if (orig) { orig.status = 'answered'; orig.answeredBy = target.id; if (NOTES.statusOverrides[orig.id]) { delete NOTES.statusOverrides[orig.id]; saveNotes(); } }
        }
        if (res.isNew && pseudo.addEvent) {
          D.events = arr(D.events);
          D.events.push({ id: nextId('e', D.events), date: target.date, title: (target.direction === 'out' ? 'Sent: ' : 'Received: ') + target.subject,
            domain: 'ehcp', summary: target.summary || '', source: target.source || 'Added in the app', confidence: 'high' });
        }
      }

      if (!res.isNew && before === JSON.stringify(target) && !pseudo.answers) { location.hash = back; return; }
      var ok = persist(res.isNew ? 'added' : 'edited', sec.label, name);
      location.hash = back;
      flash(ok ? 'Saved' : 'Couldn’t save on this phone — storage may be full or blocked');
    });
  }

  /* Move a letter captured on this device into the case data itself */
  function promoteCaptured(id) {
    var c = arr(NOTES.captured).filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    pushUndo('add ' + c.subject);
    D.correspondence = arr(D.correspondence);
    var entry = { id: nextId('c', D.correspondence), date: c.date, direction: c.direction, from: c.from, to: c.to, subject: c.subject,
      summary: c.summary, status: NOTES.statusOverrides[c.id] || c.status || 'info', source: 'Captured in the app ' + fmt(todayISO()) };
    if (c.fullText) entry.fullText = c.fullText;
    D.correspondence.push(entry);
    D.events = arr(D.events);
    D.events.push({ id: nextId('e', D.events), date: c.date, title: (c.direction === 'out' ? 'Sent: ' : 'Received: ') + c.subject,
      domain: c.domain || 'ehcp', summary: c.summary || '', source: entry.source, confidence: 'high' });
    NOTES.captured = NOTES.captured.filter(function (x) { return x.id !== id; });
    delete NOTES.statusOverrides[id];
    saveNotes();
    persist('added', 'Letters and emails', c.subject);
    location.hash = '#/edit/correspondence?id=' + encodeURIComponent(entry.id) + '&back=' + encodeURIComponent('#/messages');
    flash('Added to the case data — check the details');
  }


  /* ------------------------------------------------------------------- Start */
  bindGlobal();
  if (D) refreshSettingsNote();
  render();
})();
