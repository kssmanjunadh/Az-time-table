/**
 * timetable.js
 * Azure Data Engineer - 20-Week Timetable
 * -------------------------------------------------------------
 * Features:
 *   1. DATE UPDATER    - picks a new start date and rewrites every
 *                        .auto-date span across the whole document.
 *   2. DAY COMPLETION  - Done checkbox strikes through a row and
 *                        persists state in localStorage.
 *   3. TIME TRACKER    - per-row stopwatch injected into every
 *                        schedule table. Start / Pause / Reset.
 *                        Accumulated time persists in localStorage.
 *                        Weekly and grand-total summaries update live.
 * -------------------------------------------------------------
 * Usage: <script src="timetable.js" defer><\/script>
 */


/* ============================================================
   SECTION 1 -- DATE UPDATER
   ============================================================ */
(function () {

  var MONTHS_FULL = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  var MONTHS_SHORT = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];
  var DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  var DEFAULT_START = '2026-03-16';

  function parseLocal(str) {
    var p = str.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function addDays(base, n) {
    var d = new Date(base.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function formatDate(d, fmt) {
    var M   = MONTHS_FULL[d.getMonth()];
    var m   = MONTHS_SHORT[d.getMonth()];
    var D   = d.getDate();
    var Y   = d.getFullYear();
    var ddd = DAYS_SHORT[d.getDay()];
    switch (fmt) {
      case 'ddd MMM D':    return ddd + ' ' + m + ' ' + D;
      case 'MMM D':        return m + ' ' + D;
      case 'MMMM D':       return M + ' ' + D;
      case 'MMMM D, YYYY': return M + ' ' + D + ', ' + Y;
      case 'D':            return String(D);
      default:             return M + ' ' + D;
    }
  }

  function updateDates(startDateStr) {
    var start = parseLocal(startDateStr);
    document.querySelectorAll('.auto-date').forEach(function (span) {
      var offset = parseInt(span.getAttribute('data-offset'), 10);
      var fmt    = span.getAttribute('data-fmt');
      span.textContent = formatDate(addDays(start, offset), fmt);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var input = document.getElementById('start-date-input');
    if (!input) return;
    var saved = localStorage.getItem('timetable_start_date');
    if (saved && saved !== DEFAULT_START) {
      input.value = saved;
      updateDates(saved);
    }
    input.addEventListener('change', function () {
      if (!this.value) return;
      updateDates(this.value);
      localStorage.setItem('timetable_start_date', this.value);
    });
  });

})();


/* ============================================================
   SECTION 2 -- DAY COMPLETION (checkbox rows)
   ============================================================ */
(function () {

  var STORAGE_KEY = 'timetable_completed_rows';

  function loadCompleted() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { return new Set(); }
  }

  function saveCompleted(set) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {}
  }

  function rowKey(tr) {
    var cell = tr.querySelector('td:first-child');
    return cell ? cell.textContent.trim() : '';
  }

  function markRow(tr, done) {
    tr.classList.toggle('day-complete', done);
    var cb = tr.querySelector('input.day-done');
    if (cb) cb.checked = done;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var completed = loadCompleted();
    document.querySelectorAll('tbody tr').forEach(function (tr) {
      var key = rowKey(tr);
      if (key && completed.has(key)) markRow(tr, true);
    });
    document.addEventListener('change', function (e) {
      if (!e.target.matches('input.day-done')) return;
      var tr   = e.target.closest('tr');
      var done = e.target.checked;
      var key  = rowKey(tr);
      markRow(tr, done);

      // Auto-pause the running timer for this row when marked Done
      if (done && window.__timerState && key && window.__timerState[key]) {
        var s = window.__timerState[key];
        if (s.startedAt !== null) {
          s.elapsedMs += Date.now() - s.startedAt;
          s.startedAt = null;
          if (s.intervalId) { clearInterval(s.intervalId); s.intervalId = null; }
          var playBtn = tr.querySelector('.timer-play');
          if (playBtn) { playBtn.innerHTML = '▶'; playBtn.classList.remove('running'); }
          tr.classList.remove('timer-running');
          var disp = tr.querySelector('.timer-display');
          if (disp) disp.textContent = window.__fmtMs(s.elapsedMs);
          if (window.__saveTimeLog) window.__saveTimeLog();
          if (window.__updateWeekTotal) window.__updateWeekTotal(tr.closest('table'));
          if (window.__updateGrandTotal) window.__updateGrandTotal();
        }
      }

      if (key) {
        done ? completed.add(key) : completed.delete(key);
        saveCompleted(completed);
      }
    });
  });

})();


/* ============================================================
   SECTION 3 -- TIME TRACKER
   ============================================================ */
(function () {

  var TIME_KEY = 'timetable_time_log';   // { rowKey: elapsedMs }

  /* In-memory state: rowKey -> { elapsedMs, startedAt, intervalId } */
  var state = {};

  /* -- Persistence ----------------------------------------- */

  function loadTimeLog() {
    try {
      var raw = localStorage.getItem(TIME_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveTimeLog() {
    var log = {};
    Object.keys(state).forEach(function (k) { log[k] = currentElapsed(k); });
    try { localStorage.setItem(TIME_KEY, JSON.stringify(log)); } catch (e) {}
  }

  /* -- Helpers --------------------------------------------- */

  function currentElapsed(key) {
    var s = state[key];
    if (!s) return 0;
    return s.startedAt !== null
      ? s.elapsedMs + (Date.now() - s.startedAt)
      : s.elapsedMs;
  }

  function fmtMs(ms) {
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function rowKey(tr) {
    var cell = tr.querySelector('td:first-child');
    return cell ? cell.textContent.trim() : '';
  }

  /* -- Build timer cell ------------------------------------ */

  function buildTimerCell(key) {
    var td = document.createElement('td');
    td.className = 'col-timer';
    td.setAttribute('data-row-key', key);

    var widget = document.createElement('div');
    widget.className = 'timer-widget';

    var btnPlay = document.createElement('button');
    btnPlay.className = 'timer-btn timer-play';
    btnPlay.title = 'Start / Pause timer';
    btnPlay.innerHTML = '▶';          /* ▶ */

    var display = document.createElement('span');
    display.className = 'timer-display';
    display.textContent = '00:00';

    var btnReset = document.createElement('button');
    btnReset.className = 'timer-btn timer-reset';
    btnReset.title = 'Reset timer';
    btnReset.innerHTML = '↻';         /* ↻ */

    widget.appendChild(btnPlay);
    widget.appendChild(display);
    widget.appendChild(btnReset);
    td.appendChild(widget);

    /* Restore saved time */
    var s = state[key];
    if (s && s.elapsedMs > 0) display.textContent = fmtMs(s.elapsedMs);

    /* --- Play / Pause --- */
    btnPlay.addEventListener('click', function (e) {
      e.stopPropagation();
      var s = state[key];
      if (s.startedAt !== null) {
        /* Pause */
        s.elapsedMs += Date.now() - s.startedAt;
        s.startedAt = null;
        clearInterval(s.intervalId);
        s.intervalId = null;
        btnPlay.innerHTML = '▶';
        btnPlay.classList.remove('running');
        td.closest('tr').classList.remove('timer-running');
      } else {
        /* Start */
        s.startedAt = Date.now();
        btnPlay.innerHTML = '⏸'; /* ⏸ */
        btnPlay.classList.add('running');
        td.closest('tr').classList.add('timer-running');
        s.intervalId = setInterval(function () {
          display.textContent = fmtMs(currentElapsed(key));
          updateWeekTotal(td.closest('table'));
          updateGrandTotal();
          saveTimeLog();
        }, 1000);
      }
    });

    /* --- Reset --- */
    btnReset.addEventListener('click', function (e) {
      e.stopPropagation();
      var s = state[key];
      if (s.intervalId) { clearInterval(s.intervalId); s.intervalId = null; }
      s.elapsedMs = 0;
      s.startedAt = null;
      display.textContent = '00:00';
      btnPlay.innerHTML = '▶';
      btnPlay.classList.remove('running');
      td.closest('tr').classList.remove('timer-running');
      updateWeekTotal(td.closest('table'));
      updateGrandTotal();
      saveTimeLog();
    });

    return td;
  }

  /* -- Weekly total footer row ----------------------------- */

  function updateWeekTotal(table) {
    if (!table) return;
    var totalMs = 0;
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var k = rowKey(tr);
      if (k) totalMs += currentElapsed(k);
    });

    var tfoot = table.querySelector('tfoot.timer-tfoot');
    if (!tfoot) {
      tfoot = document.createElement('tfoot');
      tfoot.className = 'timer-tfoot';
      var colCount = table.querySelectorAll('thead tr th').length || 10;
      var tr  = document.createElement('tr');
      var tdL = document.createElement('td');
      tdL.colSpan = colCount - 1;
      tdL.className = 'timer-total-label';
      tdL.innerHTML = '⏲ Week time logged';
      var tdV = document.createElement('td');
      tdV.className = 'timer-total-value';
      tdV.textContent = '00:00';
      tr.appendChild(tdL);
      tr.appendChild(tdV);
      tfoot.appendChild(tr);
      table.appendChild(tfoot);
    }
    tfoot.querySelector('.timer-total-value').textContent = fmtMs(totalMs);
  }

  /* -- Grand total panel (inserted once after meta-bar) ---- */

  function getOrCreateGrandPanel() {
    var panel = document.getElementById('timer-grand-total');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'timer-grand-total';
    panel.innerHTML =
      '<span class="gt-icon">⏲</span>' +
      '<span class="gt-label">Total Study Time Logged</span>' +
      '<span class="gt-value" id="gt-value">0:00:00</span>';

    var metaBar = document.getElementById('meta-bar');
    if (metaBar && metaBar.parentNode) {
      metaBar.parentNode.insertBefore(panel, metaBar.nextSibling);
    } else {
      document.body.insertBefore(panel, document.body.firstChild);
    }
    return panel;
  }

  function updateGrandTotal() {
    var panel = getOrCreateGrandPanel();
    var totalMs = 0;
    Object.keys(state).forEach(function (k) { totalMs += currentElapsed(k); });
    var totalSec = Math.floor(totalMs / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    panel.querySelector('#gt-value').textContent =
      h + ':' + pad(m) + ':' + pad(s);
  }

  /* -- Inject timers into all schedule tables -------------- */

  function injectTimers() {
    var log = loadTimeLog();

    document.querySelectorAll('table').forEach(function (table) {
      /* Only schedule tables have a "Day" header */
      var isSchedule = false;
      table.querySelectorAll('thead th').forEach(function (th) {
        if (th.textContent.trim() === 'Day') isSchedule = true;
      });
      if (!isSchedule) return;
      if (table.querySelector('th.col-timer')) return; /* already injected */

      /* Header cell */
      var headerRow = table.querySelector('thead tr');
      var th = document.createElement('th');
      th.className = 'col-timer';
      th.textContent = 'Time Spent';
      headerRow.appendChild(th);

      /* Timer cell per body row */
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        var key = rowKey(tr);
        if (!key) return;
        state[key] = {
          elapsedMs:  log[key] || 0,
          startedAt:  null,
          intervalId: null
        };
        tr.appendChild(buildTimerCell(key));
      });

      updateWeekTotal(table);
    });

    getOrCreateGrandPanel();
    updateGrandTotal();
  }

  /* -- Expose internals so Section 2 (Done checkbox) can reach them -- */
  window.__timerState       = state;
  window.__fmtMs            = fmtMs;
  window.__saveTimeLog      = saveTimeLog;
  window.__updateWeekTotal  = updateWeekTotal;
  window.__updateGrandTotal = updateGrandTotal;

  /* -- Freeze & save all timers on unload ------------------ */
  window.addEventListener('beforeunload', function () {
    Object.keys(state).forEach(function (key) {
      var s = state[key];
      if (s.startedAt !== null) {
        s.elapsedMs += Date.now() - s.startedAt;
        s.startedAt = null;
        if (s.intervalId) { clearInterval(s.intervalId); s.intervalId = null; }
      }
    });
    saveTimeLog();
  });

  document.addEventListener('DOMContentLoaded', injectTimers);

})();
