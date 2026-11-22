/*
 * app.js — UI controller.
 *
 * Routing is hash-based so the app works from any static host without server
 * configuration. Three views: deck picker, study session, deck statistics.
 */
(function (global) {
  'use strict';

  var Decks = global.Decks;
  var State = global.State;
  var Scoring = global.Scoring;
  var FSRS = global.FSRS;

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------------ *
   * Session (in-memory, not persisted)
   * ------------------------------------------------------------------ */

  var session = null;

  function newSession(deckId) {
    var built = State.buildQueue(deckId);
    return {
      deckId: deckId,
      queue: built.queue,
      counts: built.counts,
      index: 0,
      startedAt: Date.now(),
      cardShownAt: 0,
      answered: false,
      reveal: null,
      entries: [],
      combo: 0,
      undoStack: [],
      correct: 0,
      points: 0,
      finished: false,
      // Whether help was asked for on the card now on screen. Help means
      // the answer was shown, not recalled, so it is worth no points.
      helpUsed: false
    };
  }

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  function fmtMs(ms) {
    if (!ms) return '—';
    if (ms < 1000) return ms + ' ms';
    return fmtDec(ms / 1000, ms < 10000 ? 2 : 1) + ' s';
  }

  // Serbian writes the decimal separator as a comma and groups the
  // thousands with a dot (1.234,5), so every fraction goes through here
  // instead of toFixed().
  function fmtDec(value, digits) {
    return Number(value).toLocaleString('sr-Latn-RS', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function fmtPct(v) {
    return Math.round(v) + '%';
  }

  function fmtNumber(n) {
    return (n || 0).toLocaleString('sr-Latn-RS');
  }

  var toastTimer = null;
  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */

  var views = ['view-decks', 'view-study', 'view-stats'];

  function showView(name) {
    views.forEach(function (v) { $(v).hidden = (v !== name); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function route() {
    var hash = location.hash.replace(/^#\/?/, '') || 'decks';
    var parts = hash.split('/');

    if (parts[0] === 'study' && parts[1]) {
      if (!session || session.deckId !== parts[1]) {
        session = newSession(parts[1]);
      }
      showView('view-study');
      renderStudy();
      return;
    }

    if (parts[0] === 'stats' && parts[1]) {
      showView('view-stats');
      renderStats(parts[1]);
      return;
    }

    session = null;
    showView('view-decks');
    renderDecks();
  }

  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  /* ------------------------------------------------------------------ *
   * Header stats
   * ------------------------------------------------------------------ */

  function renderHeader() {
    var raw = State.raw;
    var lvl = Scoring.levelForXp(raw.global.xp);
    $('stat-level').textContent = lvl.level;
    $('stat-xp').textContent = fmtNumber(raw.global.xp);
    $('stat-streak').textContent = raw.global.streak.count + ' ' + State.plural(raw.global.streak.count, 'dan', 'dana', 'dana');
    $('level-bar-fill').style.width = lvl.pct + '%';
  }

  /* ------------------------------------------------------------------ *
   * Deck picker
   * ------------------------------------------------------------------ */

  function renderDecks() {
    renderHeader();

    var grid = $('deck-list');
    var html = '';

    Decks.all.forEach(function (deck) {
      var summary = State.deckSummary(deck.id);
      var counts = State.deckDueCount(deck.id);
      var due = counts.total;
      var total = Decks.cards(deck.id).length;

      html +=
        '<article class="deck-row">' +
          '<button class="deck-row-main" type="button" data-deck="' + deck.id + '">' +
            '<div class="deck-row-title">' + esc(deck.name) +
              '<span class="count">' + total + ' ' + State.plural(total, 'kartica', 'kartice', 'kartica') + '</span>' +
            '</div>' +
            '<p class="deck-row-desc">' + esc(deck.description) + '</p>' +
          '</button>' +
          '<div class="deck-row-figures">' +
            figure('Tačnost', summary.reviews ? fmtPct(summary.accuracy) : '—') +
            figure('Vreme', summary.medianMs ? fmtDec(summary.medianMs / 1000, 1) + ' s' : '—') +
            figure('Efikasnost', summary.reviews ? fmtPct(summary.efficiency) : '—') +
          '</div>' +
          '<div class="deck-row-go">' +
            '<span class="status' + (due ? ' ready' : '') + '">' +
              (due > 0 ? due + ' na čekanju' : 'sve obrađeno') +
            '</span>' +
            '<button class="btn" type="button" data-stats="' + deck.id + '">Statistika</button>' +
          '</div>' +
        '</article>';
    });

    grid.innerHTML = html;

    grid.querySelectorAll('[data-deck]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigate('#/study/' + btn.getAttribute('data-deck'));
      });
    });

    grid.querySelectorAll('[data-stats]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigate('#/stats/' + btn.getAttribute('data-stats'));
      });
    });

    renderOverview();
  }

  function figure(label, value) {
    return '<div class="figure"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  function renderOverview() {
    var totalReviews = 0;
    var totalCorrect = 0;
    var totalTime = 0;
    var totalPoints = 0;
    var totalDue = 0;

    Decks.all.forEach(function (deck) {
      var s = State.deckSummary(deck.id);
      var counts = State.deckDueCount(deck.id);
      totalReviews += s.reviews;
      totalCorrect += s.correct;
      totalTime += s.avgMs * s.reviews;
      totalPoints += s.points;
      totalDue += counts.total;
    });

    var totalCards = State.uniqueCardCount();
    var minutes = Math.max(totalTime / 60000, 0.5);
    var ppm = totalPoints / minutes;
    var accuracy = totalReviews ? (totalCorrect / totalReviews) * 100 : 0;
    var efficiency = Math.min(100, (ppm / Scoring.constants.REFERENCE_POINTS_PER_MIN) * 100);

    $('overview-sub').textContent = totalReviews
      ? totalReviews + ' ' + State.plural(totalReviews, 'ponavljanje', 'ponavljanja', 'ponavljanja') + ' ukupno'
      : 'Još nema ponavljanja';

    $('overview-grid').innerHTML = [
      ledgerCell('Kartica', fmtNumber(totalCards), Decks.all.length === 1 ? 'u 1 paketu' : 'u ' + Decks.all.length + ' paketa'),
      ledgerCell('Ponavljanja', fmtNumber(totalReviews), totalDue ? totalDue + ' na čekanju' : 'sve obrađeno'),
      ledgerCell('Tačnost', totalReviews ? fmtPct(accuracy) : '—', 'prosečno, svi paketi'),
      ledgerCell('Efikasnost', totalReviews ? fmtPct(efficiency) : '—', 'poena po minuti: ' + Math.round(ppm)),
      ledgerCell('Vreme', totalReviews ? fmtNumber(Math.round(minutes)) + ' ' + State.plural(Math.round(minutes), 'minut', 'minuta', 'minuta') : '—', 'vežbanje ukupno'),
      ledgerCell('Poeni', fmtNumber(totalPoints), 'nivo ' + Scoring.levelForXp(State.raw.global.xp).level)
    ].join('');
  }

  function ledgerCell(label, value, note) {
    return '<div class="ledger-cell">' +
      '<span class="label">' + esc(label) + '</span>' +
      '<b>' + esc(value) + '</b>' +
      '<small>' + esc(note) + '</small>' +
    '</div>';
  }

  /* ------------------------------------------------------------------ *
   * Study session
   * ------------------------------------------------------------------ */

  function currentCard() {
    if (!session || session.index >= session.queue.length) return null;
    return session.queue[session.index];
  }

  function renderStudy() {
    var deck = Decks.get(session.deckId);
    $('study-deck-name').textContent = deck ? deck.name : '—';

    if (!session.queue.length) {
      $('card-stage').hidden = true;
      $('grade-panel').hidden = true;
      $('session-summary').hidden = false;
      $('study-progress-fill').style.width = '100%';
      $('study-progress').textContent = 'Nema kartica za vežbanje';
      renderSummary();
      return;
    }

    if (session.finished || session.index >= session.queue.length) {
      $('card-stage').hidden = true;
      $('grade-panel').hidden = true;
      $('session-summary').hidden = false;
      renderSummary();
      return;
    }

    $('card-stage').hidden = false;
    $('session-summary').hidden = true;

    var card = currentCard();
    // The question and the label are the deck's business: only the deck
    // knows what its cards look like.
    $('card-question').textContent = Decks.questionFor(session.deckId, card);
    var tag = Decks.tagFor(session.deckId, card);
    $('card-tag').textContent = tag;
    $('card-tag-back').textContent = tag;
    $('card-answer').textContent = card.back;
    $('card-back-meta').innerHTML = '';

    // A deck may need its own treatment of the card face (a chord
    // diagram is monospace and several lines long).
    $('flashcard').className = 'flashcard' +
      (Decks.cardClassFor(session.deckId) ? ' ' + Decks.cardClassFor(session.deckId) : '');
    $('flashcard').classList.remove('flipped');
    $('card-feedback').hidden = true;
    $('card-input').classList.remove('correct', 'wrong');
    $('card-input').value = '';
    $('grade-panel').hidden = true;

    // The help is per card and starts fresh with every card.
    session.helpUsed = false;
    $('card-help').hidden = true;
    $('card-help').textContent = '';
    $('help-btn').disabled = false;

    var typed = State.settings().typedInput;

    // A deck that offers choices is answered by picking one of them,
    // not by typing — so the input field and the reveal button step
    // aside and the quiz takes their place.
    var quiz = Decks.isQuiz(session.deckId);
    $('choice-panel').hidden = !quiz;
    if (quiz) {
      // In a quiz the label can be half the answer, so the deck decides
      // whether it may be shown.
      $('card-tag').hidden = Decks.labelHidden(session.deckId);
      $('card-input-wrap').hidden = true;
      $('reveal-btn').hidden = true;
      renderChoices(card);
    } else {
      $('card-tag').hidden = false;
      $('card-input-wrap').hidden = !typed;
      $('reveal-btn').hidden = typed;
      $('choice-buttons').innerHTML = '';
    }

    // A numeric keyboard for arithmetic, a plain one for everything else.
    $('card-input').setAttribute('inputmode', Decks.inputModeFor(session.deckId));

    session.cardShownAt = Date.now();
    session.answered = false;
    session.reveal = null;

    updateStudyHud();
    updateProgress();

    if (typed && !quiz) {
      var input = $('card-input');
      input.focus();
      input.setAttribute('aria-label', 'Odgovor za: ' + card.front);
    }
  }

  /**
   * Draw the answers of a quiz.
   *
   * The order comes from the deck, and it does not change between
   * renders — a quiz that reshuffles itself looks like a bug.
   */
  function renderChoices(card) {
    var list = Decks.choicesFor(session.deckId, card) || [];
    $('choice-buttons').innerHTML = list.map(function (text) {
      return '<button class="choice-btn" type="button" data-answer="' + esc(text) + '">' +
             esc(text) + '</button>';
    }).join('');
  }

  /**
   * The help for the current card: it shows the answer outright.
   *
   * There is nothing to hint at here — the learner asks and is told. That
   * is why such an answer is worth no points: it was read, not recalled.
   * The card is still scheduled, because the learner did review it.
   */
  function showHelp() {
    if (!session || session.answered) return;
    var card = currentCard();
    if (!card) return;

    session.helpUsed = true;
    var box = $('card-help');
    box.textContent = card.back;
    box.hidden = false;
    $('help-btn').disabled = true;

    // In a quiz the answer is one of the offered buttons, so it is
    // marked there too — the learner should not have to hunt for it.
    if (Decks.isQuiz(session.deckId)) {
      var buttons = $('choice-buttons').querySelectorAll('.choice-btn');
      for (var i = 0; i < buttons.length; i++) {
        if (Decks.matches(session.deckId, buttons[i].getAttribute('data-answer'), card)) {
          buttons[i].classList.add('correct');
        }
      }
    }
  }

  function updateProgress() {
    var total = session.queue.length;
    var done = Math.min(session.index, total);
    $('study-progress-fill').style.width = (total ? (done / total) * 100 : 0) + '%';
    $('study-progress').textContent = done + ' / ' + total + ' ' + State.plural(total, 'kartica', 'kartice', 'kartica');
  }

  function updateStudyHud() {
    $('hud-points').textContent = session.points;
    $('hud-accuracy').textContent = session.entries.length
      ? fmtPct((session.correct / session.entries.length) * 100)
      : '—';
    $('hud-combo').textContent = session.combo;

    // The undo button is only shown when there is something to take back.
    // On a phone there is no keyboard, so this button is the only way to
    // reach undo at all.
    var undoBtn = $('undo-btn');
    if (undoBtn) undoBtn.hidden = !session.undoStack.length;
  }

  function showGrades() {
    var card = currentCard();
    if (!card) return;

    var preview = State.preview(session.deckId, card, Date.now());
    var showIntervals = State.settings().showIntervals;

    for (var g = 1; g <= 4; g++) {
      var el = document.querySelector('[data-interval="' + g + '"]');
      if (el) el.textContent = showIntervals ? preview[g].label : '';
    }

    $('grade-panel').hidden = false;
    $('reveal-btn').hidden = true;
  }

  function submitTypedAnswer() {
    if (!session || session.answered) return;
    var card = currentCard();
    if (!card) return;

    var input = $('card-input');
    var raw = input.value.trim();
    if (raw === '') return;

    var elapsed = Date.now() - session.cardShownAt;
    var correct = Decks.matches(session.deckId, raw, card);
    var par = State.parFor(session.deckId, card);
    var grade = Scoring.autoGrade(correct, elapsed, par);

    input.classList.add(correct ? 'correct' : 'wrong');

    var fb = $('card-feedback');
    fb.hidden = false;
    fb.className = 'card-feedback ' + (correct ? 'good' : 'bad');
    fb.textContent = correct
      ? 'Tačno!'
      : 'Netačno — tačan odgovor je ' + card.back;

    applyGrade(card, grade, correct, elapsed);
  }

  /**
   * Answer a quiz by clicking one of the offered answers.
   *
   * The picked answer is graded exactly as a typed one would be: right
   * means right, wrong means wrong, and the speed counts the same.
   */
  function submitChoice(picked) {
    if (!session || session.answered) return;
    var card = currentCard();
    if (!card) return;

    var elapsed = Date.now() - session.cardShownAt;
    var correct = Decks.matches(session.deckId, picked, card);
    var par = State.parFor(session.deckId, card);
    var grade = Scoring.autoGrade(correct, elapsed, par);

    // The chosen answer is marked, and so is the right one — otherwise a
    // wrong click leaves the learner guessing what the answer was.
    var buttons = $('choice-buttons').querySelectorAll('.choice-btn');
    for (var i = 0; i < buttons.length; i++) {
      var answer = buttons[i].getAttribute('data-answer');
      buttons[i].disabled = true;
      if (answer === picked) buttons[i].classList.add(correct ? 'correct' : 'wrong');
      else if (Decks.matches(session.deckId, answer, card)) buttons[i].classList.add('correct');
    }

    var fb = $('card-feedback');
    fb.hidden = false;
    fb.className = 'card-feedback ' + (correct ? 'good' : 'bad');
    fb.textContent = correct
      ? 'Tačno!'
      : 'Netačno — tačan odgovor je ' + card.back;

    applyGrade(card, grade, correct, elapsed);
  }

  function revealAnswer() {
    if (!session || session.answered) return;
    var card = currentCard();
    if (!card) return;

    $('flashcard').classList.add('flipped');
    var par = State.parFor(session.deckId, card);
    var elapsed = Date.now() - session.cardShownAt;

    var preview = State.preview(session.deckId, card, Date.now());
    var meta = $('card-back-meta');
    var html = 'Potrebno vreme: <strong>' + fmtMs(par) + '</strong>';
    if (State.settings().showIntervals) {
      html += '<span class="muted"> · Sledeće ponavljanje (dobro): ' + preview[3].label + '</span>';
    }
    meta.innerHTML = html;

    showGrades();
    // The grade is decided when the user picks one.
    session.reveal = { elapsed: elapsed, par: par };
  }

  function applyGrade(card, grade, correct, elapsed) {
    // The combo as it stood BEFORE this answer. Keeping it lets an undo
    // restore the streak exactly instead of flattening it to zero.
    var comboBefore = session.combo;

    var result = State.grade({
      deckId: session.deckId,
      card: card,
      grade: grade,
      correct: correct,
      elapsedMs: elapsed,
      combo: comboBefore,
      helpUsed: !!session.helpUsed
    });

    if (correct) session.combo += 1;
    else session.combo = 0;
    session.correct += correct ? 1 : 0;
    session.points += result.points;

    session.entries.push({
      grade: grade,
      correct: correct,
      elapsedMs: elapsed,
      points: result.points,
      speedPct: result.speedPct,
      comboBefore: comboBefore,
      helpUsed: !!session.helpUsed
    });

    session.undoStack.push(result.snapshot);

    session.answered = true;
    session.index += 1;

    updateStudyHud();
    updateProgress();

    // A short pause so the feedback is visible, then the next card.
    setTimeout(function () {
      if (!session) return;
      if (session.index >= session.queue.length) {
        session.finished = true;
      }
      renderStudy();
    }, correct ? 620 : 1500);
  }

  function gradeWith(grade) {
    if (!session || session.answered) return;
    var card = currentCard();
    if (!card) return;

    if (session.reveal) {
      // Self-assessed grade: correct unless the user picked "Ponovo".
      var correct = grade > 1;
      applyGrade(card, grade, correct, session.reveal.elapsed);
      return;
    }

    if (State.settings().typedInput) {
      submitTypedAnswer();
      return;
    }
  }

  function undoLast() {
    if (!session || !session.undoStack.length) {
      toast('Nema šta da se vrati');
      return;
    }
    var last = session.undoStack.pop();
    State.undo(session.deckId, last);

    // Roll back the in-memory session counters.
    var entry = session.entries.pop();
    if (entry) {
      session.points -= entry.points;
      if (entry.correct) session.correct -= 1;
      // Restore the combo exactly as it was, instead of flattening it to
      // zero — otherwise one undone answer would break the streak.
      session.combo = entry.comboBefore != null ? entry.comboBefore : 0;
    }
    session.index = Math.max(0, session.index - 1);
    session.finished = false;

    toast('Odgovor vraćen');
    renderStudy();
  }

  function renderSummary() {
    var summary = Scoring.sessionSummary(session.entries);
    $('summary-cards').innerHTML = [
      { v: fmtNumber(summary.points), l: 'Poeni' },
      { v: fmtPct(summary.accuracy), l: 'Tačnost' },
      { v: fmtPct(summary.speedScore), l: 'Brzina' },
      { v: fmtPct(summary.efficiency), l: 'Efikasnost' },
      { v: summary.answers + '', l: 'Kartica' },
      { v: fmtMs(summary.medianMs), l: 'Medijana po kartici' }
    ].map(function (c) {
      return '<div class="summary-card"><div class="sc-value">' + esc(c.v) + '</div>' +
             '<div class="sc-label">' + esc(c.l) + '</div></div>';
    }).join('');

    // Keep a copy of the last session with the deck.
    var d = State.deckState(session.deckId);
    d.lastSession = {
      at: Date.now(),
      answers: summary.answers,
      correct: summary.correct,
      points: summary.points,
      accuracy: summary.accuracy,
      speedScore: summary.speedScore,
      efficiency: summary.efficiency,
      medianMs: summary.medianMs
    };
    State.save();
    renderHeader();
  }

  /* ------------------------------------------------------------------ *
   * Stats view
   * ------------------------------------------------------------------ */

  function renderStats(deckId) {
    var deck = Decks.get(deckId);
    if (!deck) { navigate('#/'); return; }

    var summary = State.deckSummary(deckId);
    var bd = State.deckBreakdown(deckId);

    $('stats-title').textContent = deck.name;
    $('stats-sub').textContent = deck.subtitle + ' · ' + summary.cardsTotal + ' ' + State.plural(summary.cardsTotal, 'kartica', 'kartice', 'kartica');

    $('kpi-grid').innerHTML = [
      kpi('Tačnost', summary.reviews ? fmtPct(summary.accuracy) : '—', summary.reviews + ' ' + State.plural(summary.reviews, 'ponavljanje', 'ponavljanja', 'ponavljanja')),
      kpi('Vreme', summary.medianMs ? fmtDec(summary.medianMs / 1000, 1) + ' s' : '—', 'medijana odgovora'),
      kpi('Efikasnost', summary.reviews ? fmtPct(summary.efficiency) : '—', 'poena po minuti'),
      kpi('Retencija', summary.reviews ? fmtPct(summary.retention) : '—', 'bez ponovnog učenja'),
      kpi('Ukupno poena', fmtNumber(summary.points), 'od početka'),
      kpi('Naučeno', bd.mature + bd.young + '/' + (bd.new + bd.young + bd.mature + bd.learning), 'zapamćenih kartica')
    ].join('');

    renderTableMap(deckId);

    // Breakdown
    var total = bd.new + bd.learning + bd.young + bd.mature + bd.leech;
    var rows = [
      ['Nove', bd.new, 'new'],
      ['Učenje', bd.learning, 'learning'],
      ['Mlade', bd.young, 'young'],
      ['Zrele', bd.mature, 'mature'],
      ['Trdoglave', bd.leech, 'leech']
    ];
    $('breakdown').innerHTML = rows.map(function (r) {
      var pct = total ? Math.round((r[1] / total) * 100) : 0;
      return '<div class="bd-row" data-tone="' + r[2] + '">' +
        '<div class="bd-name">' + r[0] + '</div>' +
        '<div class="bd-track"><span style="width:' + pct + '%"></span></div>' +
        '<div class="bd-count">' + r[1] + '</div>' +
      '</div>';
    }).join('');

    // Forecast
    var fc = State.forecast(deckId);
    var max = Math.max(1, Math.max.apply(null, fc.days));
    var names = ['danas', '1 dan', '2 dana', '3 dana', '4 dana', '5 dana', '6 dana'];
    $('forecast').innerHTML = fc.days.map(function (n, i) {
      var h = Math.max(4, Math.round((n / max) * 90));
      return '<div class="fc-col">' +
        '<div class="fc-count">' + (n || '') + '</div>' +
        '<div class="fc-bar" style="height:' + h + 'px"></div>' +
        '<div class="fc-day">' + names[i] + '</div>' +
      '</div>';
    }).join('');

    // Weakest cards
    var weak = State.weakestCards(deckId, 6);
    $('weak-list').innerHTML = weak.length ? weak.map(function (w) {
      // The card's face may be a multi-line drawing (a chord shape is six
      // lines, one per string), so it is shown as the deck draws it and
      // never re-wrapped — a broken drawing would be unreadable.
      return '<div class="weak-row' + (Decks.cardClassFor(deckId) ? ' ' + Decks.cardClassFor(deckId) : '') + '">' +
        '<div class="weak-q">' + esc(w.card.front) + '</div>' +
        '<div class="weak-bar"><span style="width:' + Math.round(w.accuracy) + '%"></span></div>' +
        '<div class="weak-acc">' + fmtPct(w.accuracy) + '</div>' +
        '<div class="weak-time">' + (w.lastTimeMs ? fmtDec(w.lastTimeMs / 1000, 1) + ' s' : '—') + '</div>' +
      '</div>';
    }).join('') : '<p class="muted small">Nema dovoljno podataka — vežbaj još da bi merenje bilo potpunije.</p>';

    // Activity, last 14 days
    var daily = summary.daily || {};
    var days = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = State.dayKey(d.getTime());
      days.push({ key: key, label: String(d.getDate()), n: (daily[key] ? daily[key].reviews : 0) });
    }
    var maxN = Math.max(1, Math.max.apply(null, days.map(function (x) { return x.n; })));
    $('activity-chart').innerHTML = days.map(function (x) {
      var h = Math.max(3, Math.round((x.n / maxN) * 92));
      return '<div class="ac-col" title="' + x.key + ': ' + x.n + ' ' + State.plural(x.n, 'ponavljanje', 'ponavljanja', 'ponavljanja') + '">' +
        '<div class="ac-bar" style="height:' + h + 'px"></div>' +
        '<div class="ac-day">' + x.label + '</div>' +
      '</div>';
    }).join('');
  }

  /**
   * Draw the deck's map as a grid of cells, one per card.
   *
   * The learner sees the whole subject at once and can see at a glance which
   * cards are solid, which are still shaky, and which have not been met yet.
   *
   * The LAYOUT — how many rows and columns, what the axes are called, where
   * each card sits — belongs to the deck. This function only draws it and
   * paints the learner's progress on top.
   */
  function renderTableMap(deckId) {
    var spec = State.deckMap(deckId);
    if (!spec) {
      $('table-map').innerHTML = '';
      return;
    }

    var html = '';
    var hasRowHead = !!spec.rowHeaders;
    var hasColHead = !!spec.colHeaders;

    // Column headers, if the deck labels that axis.
    if (hasColHead) {
      html += '<div class="head"></div>';
      for (var c = 0; c < spec.cols; c++) {
        html += '<div class="head">' + esc(spec.colHeaders[c]) + '</div>';
      }
    }

    for (var r = 0; r < spec.rows; r++) {
      // Row headers, if the deck labels that axis.
      if (hasRowHead) {
        html += '<div class="head">' + esc(spec.rowHeaders[r]) + '</div>';
      }
      for (var k = 0; k < spec.cols; k++) {
        var cell = spec.cells[r][k];
        if (!cell) {
          html += '<div class="cell" data-tone="empty"></div>';
          continue;
        }
        var title = cell.tip || (cell.label + ' = ' + cell.answer);
        if (cell.attempts) {
          title += ' · ' + Math.round(cell.accuracy) + '% tačnosti od ' +
            cell.attempts + ' pokušaja';
          if (cell.bestMs) title += ' · najbrže vreme: ' + fmtDec(cell.bestMs / 1000, 1) + ' s';
        } else {
          title += ' · još nisu uvedene';
        }
        html += '<div class="cell" data-tone="' + cell.tone + '" title="' + esc(title) + '">' +
          esc(cell.answer) +
        '</div>';
      }
    }

    $('table-map').innerHTML = html;
    $('table-map').className = 'grid-lg' +
      (spec.className ? ' ' + spec.className : '');
    // The grid has one extra column for the row headers, when there are any.
    $('table-map').style.setProperty('--map-cols', String(spec.cols + (hasRowHead ? 1 : 0)));

    $('table-map-label').textContent = spec.label;
    $('table-map-title').textContent = spec.title;

    $('table-legend').innerHTML = [
      ['unseen', 'Nove'],
      ['learning', 'Učenje'],
      ['young', 'Mlade'],
      ['mature', 'Zrele'],
      ['leech', 'Trdoglave']
    ].map(function (l) {
      return '<div class="legend-item">' +
        '<span class="legend-swatch" style="background:var(--cell-' + l[0] + ')"></span>' +
        esc(l[1]) +
      '</div>';
    }).join('');
  }

  function kpi(label, value, note) {
    return '<div class="kpi">' +
      '<span class="label">' + esc(label) + '</span>' +
      '<b>' + esc(value) + '</b>' +
      '<small>' + esc(note) + '</small>' +
    '</div>';
  }

  /* ------------------------------------------------------------------ *
   * Settings drawer
   * ------------------------------------------------------------------ */

  function openDrawer() {
    var s = State.settings();
    $('set-new-per-day').value = s.newPerDay;
    $('out-new-per-day').textContent = s.newPerDay;
    $('set-retention').value = s.retention;
    $('out-retention').textContent = Math.round(s.retention * 100) + '%';
    $('set-typed').checked = s.typedInput;
    $('set-intervals').checked = s.showIntervals;
    $('set-random-order').checked = s.randomOrder !== false;

    var bytes = global.Store.size('state');
    $('storage-info').textContent = 'Podaci se čuvaju u ' +
      (global.Store.backend === 'cookie' ? 'kolačićima' :
       global.Store.backend === 'local' ? 'lokalnom skladištu' : 'memoriji ove stranice') +
      ' — zauzimaju oko ' + fmtDec(bytes / 1024, 1) + ' KB';

    $('settings-drawer').hidden = false;
    $('drawer-backdrop').hidden = false;
  }

  function closeDrawer() {
    $('settings-drawer').hidden = true;
    $('drawer-backdrop').hidden = true;
  }

  function applySettings() {
    var s = State.settings();
    s.newPerDay = Number($('set-new-per-day').value);
    s.retention = Number($('set-retention').value);
    s.typedInput = $('set-typed').checked;
    s.showIntervals = $('set-intervals').checked;
    s.randomOrder = $('set-random-order').checked;
    State.saveNow();
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */

  function init() {
    var s = State.settings();
    document.documentElement.setAttribute('data-theme', s.theme);

    $('theme-toggle').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      State.settings().theme = next;
      State.saveNow();
    });

    $('settings-btn').addEventListener('click', openDrawer);
    $('drawer-close').addEventListener('click', closeDrawer);
    $('drawer-backdrop').addEventListener('click', closeDrawer);

    $('set-new-per-day').addEventListener('input', function () {
      $('out-new-per-day').textContent = this.value;
      applySettings();
    });
    $('set-retention').addEventListener('input', function () {
      $('out-retention').textContent = Math.round(this.value * 100) + '%';
      applySettings();
    });
    $('set-typed').addEventListener('change', applySettings);
    $('set-intervals').addEventListener('change', applySettings);
    $('set-random-order').addEventListener('change', applySettings);

    $('export-btn').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(State.raw, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'kartice-podaci-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Podaci izvezeni');
    });

    $('reset-scores').addEventListener('click', function () {
      if (!confirm('Resetovati poene i statistiku? Raspored kartica ostaje.')) return;
      State.resetScores();
      renderHeader();
      toast('Poeni i statistika resetovani');
    });

    $('reset-decks').addEventListener('click', function () {
      if (!confirm('Resetovati napredak svih paketa? Ovo briše sve zapamćene rasporede kartica.')) return;
      Decks.all.forEach(function (d) { State.resetDeck(d.id); });
      renderHeader();
      toast('Napredak svih paketa resetovan');
    });

    $('reset-all').addEventListener('click', function () {
      if (!confirm('Resetovati sve — napredak, poene i podešavanja? Ovo se ne može vratiti.')) return;
      State.resetAll();
      document.documentElement.setAttribute('data-theme', State.settings().theme);
      renderHeader();
      toast('Sve je resetovano');
    });

    // Study controls
    $('exit-study').addEventListener('click', function () { navigate('#/'); });
    $('undo-btn').addEventListener('click', undoLast);
    $('stats-back').addEventListener('click', function () { navigate('#/'); });
    $('reveal-btn').addEventListener('click', revealAnswer);
    $('help-btn').addEventListener('click', showHelp);
    $('card-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitTypedAnswer(); }
    });

    // The quiz answers are drawn fresh for every card, so the click is
    // delegated to the container that holds them.
    $('choice-buttons').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.choice-btn') : null;
      if (!btn || btn.disabled) return;
      submitChoice(btn.getAttribute('data-answer'));
    });

    document.querySelectorAll('[data-grade]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        gradeWith(Number(btn.getAttribute('data-grade')));
      });
    });

    $('summary-again').addEventListener('click', function () {
      session = newSession(session.deckId);
      renderStudy();
    });
    $('summary-exit').addEventListener('click', function () { navigate('#/'); });

    // Keyboard
    document.addEventListener('keydown', function (e) {
      var drawerOpen = !$('settings-drawer').hidden;
      var studying = !$('view-study').hidden;
      var statsOpen = !$('view-stats').hidden;

      if (drawerOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); }
        return;
      }

      // Never hijack keys while the user is typing an answer.
      var typing = e.target && e.target.tagName === 'INPUT' && e.target.type === 'text';

      if (studying || statsOpen) {
        if (e.key === 'Escape') { e.preventDefault(); navigate('#/'); return; }
      }

      if (!studying) return;

      // Undo is available whenever the last answer can be taken back — even
      // while the answer field has focus, as long as the field is still
      // empty. A non-empty field keeps the key for itself, so the user can
      // type freely.
      if ((e.key === 'u' || e.key === 'U') && session && session.undoStack.length) {
        var fieldBusy = typing && $('card-input').value !== '';
        if (!fieldBusy) {
          e.preventDefault();
          undoLast();
          return;
        }
      }

      if (typing) return;

      var gradesVisible = !$('grade-panel').hidden;

      // In a quiz the number keys pick the offered answers; the grade
      // buttons are not on screen, so the keys are free for that.
      if (!gradesVisible && Decks.isQuiz(session.deckId)) {
        if (e.key >= '1' && e.key <= '4') {
          var buttons = $('choice-buttons').querySelectorAll('.choice-btn');
          var idx = Number(e.key) - 1;
          if (buttons[idx] && !buttons[idx].disabled) {
            e.preventDefault();
            submitChoice(buttons[idx].getAttribute('data-answer'));
          }
          return;
        }
      }

      if (gradesVisible) {
        if (e.key >= '1' && e.key <= '4') {
          e.preventDefault();
          gradeWith(Number(e.key));
          return;
        }
      }

      // The help is available on every card, in every mode.
      if (!gradesVisible && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        showHelp();
        return;
      }

      // In a quiz the answer is picked, so Enter and Space have nothing
      // to submit and must not fall through to the reveal flow.
      if (!gradesVisible && Decks.isQuiz(session.deckId)) return;

      if (!gradesVisible && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        if (State.settings().typedInput) submitTypedAnswer();
        else revealAnswer();
      }
    });

    window.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.App = { route: route, navigate: navigate, toast: toast };
})(window);
