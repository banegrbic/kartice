/*
 * state.js — application state.
 *
 * Owns everything that is persisted (in cookies) and everything that is
 * derived from it. The scheduling itself is delegated to fsrs.js, which is
 * differentially tested against the official implementation.
 *
 * Persisted shape:
 * {
 *   version: 1,
 *   decks: {
 *     [deckId]: {
 *       cards:     { [cardId]: packedCardState },
 *       cardStats: { [cardId]: {attempts, correct, bestTimeMs, lastTimeMs} },
 *       stats:     { reviews, correct, points, totalTimeMs, lapses, byGrade, hist },
 *       daily:     { 'YYYY-MM-DD': {reviews, correct, points, timeMs} },
 *       newToday:  { date, count },
 *       lastSession: {...}
 *     }
 *   },
 *   global: { xp, streak: {count, lastDay}, settings: {...} }
 * }
 */
(function (global) {
  'use strict';

  var FSRS = global.FSRS;
  var Store = global.Store;
  var Decks = global.Decks;
  var Scoring = global.Scoring;

  var STATE_KEY = 'state';
  var VERSION = 1;

  // Anki-style day boundary: a "day" starts at 04:00 local time.
  var DAY_START_HOUR = 4;

  // Per-deck new-card allowance.
  var DEFAULT_NEW_PER_DAY = 20;
  var DEFAULT_RETENTION = 0.9;

  // Histogram buckets for the response-time median (500 ms each, 30 s max).
  var HIST_BUCKET = 500;
  var HIST_COUNT = 60;

  var LEECH_THRESHOLD = 8;

  /* ------------------------------------------------------------------ *
   * Packed card state
   *
   * Stored as a short array rather than an object: with 200 cards per deck,
   * the difference in cookie size is significant.
   *   [stability, difficulty, due, scheduled_days, reps, lapses,
   *    learning_steps, state, last_review]
   * ------------------------------------------------------------------ */

  var C_STABILITY = 0, C_DIFFICULTY = 1, C_DUE = 2, C_SCHEDULED = 3,
      C_REPS = 4, C_LAPSES = 5, C_STEP = 6, C_STATE = 7, C_LAST = 8;

  // The decoded (object) form of a card that has never been reviewed.
  function emptyCardState(now) {
    return {
      stability: 0,
      difficulty: 0,
      due: now,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      learning_steps: 0,
      state: FSRS.State.New,
      last_review: null
    };
  }

  function encodeCard(card) {
    var num = function (v) {
      // Never let a non-finite value reach storage: JSON turns NaN into null,
      // which would silently corrupt the schedule on the next read.
      return (typeof v === 'number' && isFinite(v)) ? +v.toFixed(4) : 0;
    };
    return [
      num(card.stability),
      num(card.difficulty),
      card.due || 0,
      num(card.scheduled_days),
      num(card.reps),
      num(card.lapses),
      num(card.learning_steps),
      num(card.state),
      card.last_review || 0
    ];
  }

  function decodeCard(packed, now) {
    if (!packed || packed.length < 9) return emptyCardState(now);
    return {
      stability: packed[C_STABILITY],
      difficulty: packed[C_DIFFICULTY],
      due: packed[C_DUE],
      scheduled_days: packed[C_SCHEDULED],
      reps: packed[C_REPS],
      lapses: packed[C_LAPSES],
      learning_steps: packed[C_STEP],
      state: packed[C_STATE],
      last_review: packed[C_LAST] || null
    };
  }

  /* ------------------------------------------------------------------ *
   * Serbian number agreement
   *
   * 1 → one, 2–4 → few, 5+ → many, with the usual exceptions: numbers
   * ending in 1 take the singular (21 dan) unless they end in 11, and
   * 12–14 always take the "few" form.
   * ------------------------------------------------------------------ */

  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return few;
    return many;
  }

  /* ------------------------------------------------------------------ *
   * Day helpers
   * ------------------------------------------------------------------ */

  function dayStart(ts) {
    var d = new Date(ts);
    d.setHours(DAY_START_HOUR, 0, 0, 0);
    if (ts < d.getTime()) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  function dayKey(ts) {
    var d = new Date(dayStart(ts));
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ------------------------------------------------------------------ *
   * State container
   * ------------------------------------------------------------------ */

  function blankState() {
    return {
      version: VERSION,
      decks: {},
      global: {
        xp: 0,
        streak: { count: 0, lastDay: null },
        settings: {
          newPerDay: DEFAULT_NEW_PER_DAY,
          retention: DEFAULT_RETENTION,
          theme: 'dark',
          typedInput: true,
          showIntervals: true,
          randomOrder: true
        }
      }
    };
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return blankState();
    var state = blankState();
    if (raw.decks && typeof raw.decks === 'object') state.decks = raw.decks;
    if (raw.global && typeof raw.global === 'object') {
      state.global.xp = Number(raw.global.xp) || 0;
      state.global.streak = raw.global.streak || { count: 0, lastDay: null };
      var s = raw.global.settings || {};
      state.global.settings.newPerDay = Number(s.newPerDay) || DEFAULT_NEW_PER_DAY;
      state.global.settings.retention = Number(s.retention) || DEFAULT_RETENTION;
      state.global.settings.theme = s.theme === 'light' ? 'light' : 'dark';
      state.global.settings.typedInput = s.typedInput !== false;
      state.global.settings.showIntervals = s.showIntervals !== false;
      // Absent means "on": random order is the default.
      state.global.settings.randomOrder = s.randomOrder !== false;
    }
    // Every deck needs the full complement of fields, even if older saves
    // were written before some of them existed.
    Object.keys(state.decks).forEach(function (id) {
      var d = state.decks[id];
      d.cards = d.cards || {};
      d.cardStats = d.cardStats || {};
      d.stats = d.stats || {};
      d.stats.byGrade = d.stats.byGrade || { 1: 0, 2: 0, 3: 0, 4: 0 };
      d.stats.hist = d.stats.hist || new Array(HIST_COUNT).fill(0);
      d.daily = d.daily || {};
      d.newToday = d.newToday || { date: null, count: 0 };
    });
    return state;
  }

  var state = migrate(Store.get(STATE_KEY, null));

  var saveTimer = null;
  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      Store.set(STATE_KEY, state);
    }, 120);
  }

  function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    Store.set(STATE_KEY, state);
  }

  /* ------------------------------------------------------------------ *
   * Deck accessors
   * ------------------------------------------------------------------ */

  function deckState(deckId) {
    if (!state.decks[deckId]) {
      state.decks[deckId] = {
        cards: {},
        cardStats: {},
        stats: {
          reviews: 0, correct: 0, points: 0, totalTimeMs: 0,
          lapses: 0, byGrade: { 1: 0, 2: 0, 3: 0, 4: 0 },
          hist: new Array(HIST_COUNT).fill(0)
        },
        daily: {},
        newToday: { date: null, count: 0 },
        lastSession: null
      };
    }
    var d = state.decks[deckId];
    d.stats.byGrade = d.stats.byGrade || { 1: 0, 2: 0, 3: 0, 4: 0 };
    d.stats.hist = d.stats.hist || new Array(HIST_COUNT).fill(0);
    d.daily = d.daily || {};
    d.newToday = d.newToday || { date: null, count: 0 };
    d.cardStats = d.cardStats || {};
    d.cards = d.cards || {};
    return d;
  }

  function settings() {
    return state.global.settings;
  }

  function cardState(deckId, cardId, now) {
    var d = deckState(deckId);
    return decodeCard(d.cards[cardId], now || Date.now());
  }

  function cardStats(deckId, cardId) {
    var d = deckState(deckId);
    if (!d.cardStats[cardId]) {
      d.cardStats[cardId] = { attempts: 0, correct: 0, bestTimeMs: 0, lastTimeMs: 0, difficulty: 0 };
    }
    if (d.cardStats[cardId].difficulty == null) d.cardStats[cardId].difficulty = 0;
    return d.cardStats[cardId];
  }

  /* ------------------------------------------------------------------ *
   * Queue building
   * ------------------------------------------------------------------ */

  /**
   * Fisher-Yates shuffle. Returns a new array; the input is not modified.
   * A seeded PRNG can be supplied, which keeps the tests deterministic.
   */
  function shuffle(list, rng) {
    var rand = rng || Math.random;
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  /**
   * Pick `count` distinct elements at random from `list`.
   * Returns fewer if the list is shorter.
   */
  function sample(list, count, rng) {
    if (count >= list.length) return list.slice();
    return shuffle(list, rng).slice(0, count);
  }

  /**
   * Build the study queue for a deck.
   *
   * By default the order is random, and so is WHICH new cards are
   * introduced today. Selecting the first N new cards in deck order would
   * walk the table from 1x1 upwards and never reach the hard products — the
   * learner would drill 1x2 and 1x3 forever while 8x9 waited its turn.
   *
   * Two rules survive the randomness, because they are functional rather
   * than cosmetic:
   *
   *   - Cards in a learning step come first, sorted by how soon they are
   *     due. They are due within minutes and would be lost for the session
   *     if they were scattered.
   *   - With `randomOrder` off, everything follows deck order (1x1, 1x2,
   *     1x3 ...) for learners who want to work through the table
   *     progressively.
   */
  function buildQueue(deckId, now, rng) {
    now = now || Date.now();
    var rand = rng || Math.random;
    var randomOrder = settings().randomOrder !== false;
    // A deck may declare itself ordered: some subjects are taught in
    // sequence, and there the order of the deck IS the teaching order.
    var ordered = Decks.isOrdered(deckId);
    var cards = Decks.cards(deckId);
    var d = deckState(deckId);
    var learning = [];
    var due = [];
    var fresh = [];

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var cs = d.cards[card.id];
      if (!cs) {
        fresh.push(card);
        continue;
      }
      var st = decodeCard(cs, now);
      if (st.state === FSRS.State.New) {
        fresh.push(card);
      } else if (st.due <= now) {
        if (st.state === FSRS.State.Learning || st.state === FSRS.State.Relearning) {
          learning.push({ card: card, state: st });
        } else {
          due.push({ card: card, state: st });
        }
      }
    }

    // Learning cards first, soonest due at the front.
    learning.sort(function (a, b) { return a.state.due - b.state.due; });

    if (randomOrder) {
      // Due reviews in random order too: two cards that became due on the
      // same day should not always arrive in the same sequence.
      due = shuffle(due, rand);
    } else {
      // Most overdue first.
      due.sort(function (a, b) { return a.state.due - b.state.due; });
    }

    // New-card allowance resets on the day boundary.
    var today = dayKey(now);
    if (d.newToday.date !== today) {
      d.newToday = { date: today, count: 0 };
    }

    // A deck may cap how many new cards it introduces per day. The
    // global setting is the ceiling; the deck's own limit can only
    // lower it. A subject with two hundred cards and a slow learning
    // curve needs fewer new cards a day than one with a hundred facts.
    var limit = settings().newPerDay;
    var deckLimit = Decks.newPerDayLimit(deckId);
    if (deckLimit > 0 && deckLimit < limit) limit = deckLimit;
    var allowance = Math.max(0, limit - d.newToday.count);

    // WHICH new cards get introduced today is a random draw from the whole
    // unseen pool, not the first N in deck order.
    //
    // An ORDERED deck is the exception: it lists its cards from easiest to
    // hardest, and a learner is meant to meet them in that order. So there
    // the first N of the deck are taken, in the deck's own order.
    var chosen = (randomOrder && !ordered)
      ? sample(fresh, Math.min(fresh.length, allowance), rand)
      : fresh.slice(0, allowance);

    var queue = [];
    learning.forEach(function (x) { queue.push(x.card); });
    due.forEach(function (x) { queue.push(x.card); });
    var orderedNew = (randomOrder && !ordered) ? shuffle(chosen, rand) : chosen;
    orderedNew.forEach(function (c) { queue.push(c); });

    return {
      queue: queue,
      counts: {
        learning: learning.length,
        due: due.length,
        new: fresh.length,
        newAllowed: chosen.length
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * Reviewing a card
   * ------------------------------------------------------------------ */

  function fsrsParams() {
    return FSRS.defaultParams({
      request_retention: settings().retention,
      enable_fuzz: true,
      enable_short_term: true
    });
  }

  /**
   * The par time for a card, as it stands right now.
   * Single source of truth: the UI uses it to judge an answer and the
   * scorer uses it to award points, so the two can never disagree.
   */
  function parFor(deckId, card) {
    // The deck supplies the content-based estimate; the scorer turns it into
    // a target and adapts it to the learner's own history with the card.
    return Scoring.parMs(card, cardStats(deckId, card.id), Decks.parMsFor(deckId, card));
  }

  /**
   * Preview the four possible outcomes for a card, with the interval each
   * grade would produce (used to label the buttons).
   */
  function preview(deckId, card, now) {
    now = now || Date.now();
    var st = cardState(deckId, card.id, now);
    var scheduler = new FSRS.Scheduler(st, now, fsrsParams());
    var out = {};
    for (var i = 0; i < FSRS.GRADES.length; i++) {
      var g = FSRS.GRADES[i];
      var res = scheduler.review(g);
      out[g] = {
        card: res.card,
        log: res.log,
        label: intervalLabel(res.card, now)
      };
    }
    return out;
  }

  function intervalLabel(card, now) {
    var delta = card.due - now;
    if (delta < 0) delta = 0;
    var minutes = Math.round(delta / 60000);
    if (minutes < 60) return minutes + ' ' + plural(minutes, 'minut', 'minuta', 'minuta');
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + ' ' + plural(hours, 'sat', 'sata', 'sati');
    var days = Math.round(hours / 24);
    if (days < 30) return days + ' ' + plural(days, 'dan', 'dana', 'dana');
    var months = Math.round(days / 30);
    if (months < 12) return months + ' ' + plural(months, 'mesec', 'meseca', 'meseci');
    var years = Math.round(days / 365);
    return years + ' ' + plural(years, 'godina', 'godine', 'godina');
  }

  /**
   * Apply a grade to a card and record the statistics.
   *
   * @param {object} o
   * @param {string} o.deckId
   * @param {object} o.card
   * @param {number} o.grade      1..4
   * @param {boolean} o.correct
   * @param {number} o.elapsedMs
   * @param {number} o.combo
   * @param {boolean} o.helpUsed   was the answer shown before answering?
   * @returns {{points:number, speedPct:number, comboMultiplier:number, next:object, label:string}}
   */
  function grade(o) {
    var now = Date.now();
    var deckId = o.deckId;
    var card = o.card;
    var d = deckState(deckId);

    var st = cardState(deckId, card.id, now);

    // Snapshot everything this answer is about to change, so it can be undone.
    var snapshot = {
      cardId: card.id,
      cardPacked: d.cards[card.id] ? d.cards[card.id].slice() : null,
      cardStats: Object.assign({}, cardStats(deckId, card.id)),
      stats: {
        reviews: d.stats.reviews,
        correct: d.stats.correct,
        points: d.stats.points,
        totalTimeMs: d.stats.totalTimeMs,
        lapses: d.stats.lapses,
        byGrade: Object.assign({}, d.stats.byGrade),
        hist: d.stats.hist.slice()
      },
      daily: JSON.parse(JSON.stringify(d.daily)),
      newToday: Object.assign({}, d.newToday),
      xp: state.global.xp,
      // The streak is mutated in place by Scoring.updateStreak, so an undo
      // that did not restore it would keep a day counted that never happened.
      streak: {
        count: state.global.streak.count,
        lastDay: state.global.streak.lastDay
      }
    };

    var scheduler = new FSRS.Scheduler(st, now, fsrsParams());
    var result = scheduler.review(o.grade);

    d.cards[card.id] = encodeCard(result.card);

    // --- scoring ---------------------------------------------------
    // The par time is derived from the stats as they were BEFORE this
    // answer, so an answer never raises its own bar.
    var par = parFor(deckId, card);
    var scored = Scoring.answer({
      grade: o.grade,
      correct: o.correct,
      elapsedMs: o.elapsedMs,
      parMs: par,
      combo: o.combo,
      helpUsed: !!o.helpUsed
    });

    // --- statistics -------------------------------------------------
    var cs = cardStats(deckId, card.id);
    cs.attempts += 1;
    if (o.correct) cs.correct += 1;
    cs.lastTimeMs = o.elapsedMs;
    if (!cs.bestTimeMs || o.elapsedMs < cs.bestTimeMs) cs.bestTimeMs = o.elapsedMs;
    cs.difficulty = result.card.difficulty;

    var s = d.stats;
    s.reviews += 1;
    if (o.correct) s.correct += 1;
    s.points += scored.points;
    s.totalTimeMs += o.elapsedMs;
    s.byGrade[o.grade] = (s.byGrade[o.grade] || 0) + 1;
    if (o.grade === 1) s.lapses += 1;

    var bucket = Math.min(HIST_COUNT - 1, Math.floor(o.elapsedMs / HIST_BUCKET));
    s.hist[bucket] = (s.hist[bucket] || 0) + 1;

    var today = dayKey(now);
    if (!d.daily[today]) d.daily[today] = { reviews: 0, correct: 0, points: 0, timeMs: 0 };
    d.daily[today].reviews += 1;
    if (o.correct) d.daily[today].correct += 1;
    d.daily[today].points += scored.points;
    d.daily[today].timeMs += o.elapsedMs;

    // New-card allowance is consumed when a card is first seen.
    var wasNew = st.state === FSRS.State.New;
    if (wasNew) {
      var todayKeyNow = dayKey(now);
      if (d.newToday.date !== todayKeyNow) d.newToday = { date: todayKeyNow, count: 0 };
      d.newToday.count += 1;
    }

    state.global.xp += scored.points;
    // The streak uses the same day boundary as the rest of the app (04:00),
    // so "today" means one thing everywhere.
    state.global.streak = Scoring.updateStreak(state.global.streak, now, dayKey);

    save();

    return {
      points: scored.points,
      speedPct: scored.speedPct,
      comboMultiplier: scored.comboMultiplier,
      next: result.card,
      label: intervalLabel(result.card, now),
      par: par,
      snapshot: snapshot
    };
  }

  /**
   * Undo the most recent answer: restore the scheduling state and every
   * statistic that the answer touched.
   */
  function undo(deckId, snapshot) {
    if (!snapshot) return;
    var d = deckState(deckId);

    if (snapshot.cardPacked) d.cards[snapshot.cardId] = snapshot.cardPacked;
    else delete d.cards[snapshot.cardId];

    if (snapshot.cardStats) d.cardStats[snapshot.cardId] = Object.assign({}, snapshot.cardStats);

    if (snapshot.stats) {
      d.stats.reviews = snapshot.stats.reviews;
      d.stats.correct = snapshot.stats.correct;
      d.stats.points = snapshot.stats.points;
      d.stats.totalTimeMs = snapshot.stats.totalTimeMs;
      d.stats.lapses = snapshot.stats.lapses;
      d.stats.byGrade = Object.assign({}, snapshot.stats.byGrade);
      d.stats.hist = snapshot.stats.hist.slice();
    }
    if (snapshot.daily) d.daily = JSON.parse(JSON.stringify(snapshot.daily));
    if (snapshot.newToday) d.newToday = Object.assign({}, snapshot.newToday);
    if (snapshot.xp != null) state.global.xp = snapshot.xp;
    if (snapshot.streak) {
      state.global.streak.count = snapshot.streak.count;
      state.global.streak.lastDay = snapshot.streak.lastDay;
    }

    save();
  }

  /* ------------------------------------------------------------------ *
   * Statistics & reporting
   * ------------------------------------------------------------------ */

  function medianFromHistogram(hist) {
    if (!hist || !hist.length) return 0;
    var total = 0;
    for (var i = 0; i < hist.length; i++) total += hist[i] || 0;
    if (!total) return 0;
    var half = total / 2;
    var seen = 0;
    for (var j = 0; j < hist.length; j++) {
      seen += hist[j] || 0;
      if (seen >= half) return Math.round((j + 0.5) * HIST_BUCKET);
    }
    return 0;
  }

  function deckSummary(deckId) {
    var d = state.decks[deckId];
    if (!d) {
      // A deck nobody has opened yet still has a summary: it simply has
      // no reviews. The card count comes from the deck itself, so the
      // statistics screen reads properly before the first card is graded.
      var empty = Scoring.deckSummary(null);
      empty.cardsTotal = Decks.cards(deckId).length;
      empty.cardsTouched = 0;
      empty.daily = null;
      empty.lastSession = null;
      return empty;
    }
    var s = d.stats;
    var summary = Scoring.deckSummary({
      reviews: s.reviews,
      correct: s.correct,
      points: s.points,
      totalTimeMs: s.totalTimeMs,
      lapses: s.lapses,
      byGrade: s.byGrade,
      medianMs: medianFromHistogram(s.hist)
    });
    summary.cardsTotal = Decks.cards(deckId).length;
    summary.cardsTouched = Object.keys(d.cards).length;
    summary.daily = d.daily;
    summary.lastSession = d.lastSession;
    return summary;
  }

  /** Breakdown of a deck into new / learning / young / mature / leech. */
  function deckBreakdown(deckId) {
    var now = Date.now();
    var cards = Decks.cards(deckId);
    var d = deckState(deckId);
    var out = { new: 0, learning: 0, young: 0, mature: 0, leech: 0, due: 0, suspended: 0 };

    for (var i = 0; i < cards.length; i++) {
      var packed = d.cards[cards[i].id];
      if (!packed) { out.new++; continue; }
      var st = decodeCard(packed, now);
      if (st.lapses >= LEECH_THRESHOLD) { out.leech++; continue; }
      if (st.state === FSRS.State.New) { out.new++; continue; }
      if (st.state === FSRS.State.Learning || st.state === FSRS.State.Relearning) { out.learning++; continue; }
      if (st.scheduled_days >= 21) out.mature++; else out.young++;
      if (st.due <= now) out.due++;
    }
    return out;
  }

  /** Cards due on each of the next seven days, for the forecast. */
  function forecast(deckId) {
    var now = Date.now();
    var cards = Decks.cards(deckId);
    var d = deckState(deckId);
    var buckets = new Array(7).fill(0);
    var overdue = 0;
    var today = dayStart(now);

    for (var i = 0; i < cards.length; i++) {
      var packed = d.cards[cards[i].id];
      if (!packed) continue;
      var st = decodeCard(packed, now);
      if (st.state === FSRS.State.New) continue;
      if (st.due <= now) { overdue++; continue; }
      var dayDiff = Math.floor((dayStart(st.due) - today) / 86400000);
      if (dayDiff < 0) overdue++;
      else if (dayDiff < 7) buckets[dayDiff]++;
    }
    return { overdue: overdue, days: buckets };
  }

  /** The cards that are hardest for the learner, for the stats screen. */
  function weakestCards(deckId, limit) {
    var d = state.decks[deckId];
    if (!d) return [];
    var cards = Decks.cards(deckId);
    var out = [];
    for (var i = 0; i < cards.length; i++) {
      var cs = d.cardStats[cards[i].id];
      if (!cs || cs.attempts < 2) continue;
      out.push({
        card: cards[i],
        attempts: cs.attempts,
        correct: cs.correct,
        accuracy: (cs.correct / cs.attempts) * 100,
        bestTimeMs: cs.bestTimeMs,
        lastTimeMs: cs.lastTimeMs
      });
    }
    out.sort(function (a, b) {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return b.lastTimeMs - a.lastTimeMs;
    });
    return out.slice(0, limit || 5);
  }

  /**
   * A deck's due count, as a user would understand it: cards waiting to be
   * reviewed, plus the new cards still available to be introduced today.
   */
  function deckDueCount(deckId) {
    var now = Date.now();
    var built = buildQueue(deckId, now);
    return {
      due: built.counts.learning + built.counts.due,
      fresh: built.counts.newAllowed,
      total: built.counts.learning + built.counts.due + built.counts.newAllowed
    };
  }

  /**
   * Number of distinct cards across every deck (decks may overlap, so this
   * counts each fact once).
   */
  function uniqueCardCount() {
    var seen = {};
    var n = 0;
    Decks.all.forEach(function (deck) {
      Decks.cards(deck.id).forEach(function (card) {
        if (!seen[card.id]) { seen[card.id] = true; n++; }
      });
    });
    return n;
  }

  /**
   * The tone of a card: how well it is learned.
   *
   * Shared by every map, because "how well do I know this" means the same
   * thing in every subject.
   */
  function toneFor(packed, now) {
    if (!packed) return 'unseen';
    var st = decodeCard(packed, now);
    if (st.lapses >= LEECH_THRESHOLD) return 'leech';
    if (st.state === FSRS.State.New) return 'unseen';
    if (st.state === FSRS.State.Learning || st.state === FSRS.State.Relearning) return 'learning';
    if (st.scheduled_days >= 21) return 'mature';
    return 'young';
  }

  /**
   * A deck's map with the learner's progress painted onto it.
   *
   * The LAYOUT comes from the deck (where each card sits, what the cell
   * shows); the PROGRESS comes from here (the tone, the attempt count, the
   * accuracy, the fastest time). The engine never needs to know what
   * subject it is looking at.
   *
   * Returns the deck's map spec with each cell's progress filled in.
   */
  function deckMap(deckId) {
    var spec = Decks.mapSpec(deckId);
    if (!spec) return null;

    var now = Date.now();
    var d = state.decks[deckId] || { cards: {}, cardStats: {} };

    for (var r = 0; r < spec.cells.length; r++) {
      for (var c = 0; c < spec.cells[r].length; c++) {
        var cell = spec.cells[r][c];
        if (!cell) continue;

        cell.tone = toneFor(d.cards[cell.id], now);

        var cs = d.cardStats[cell.id];
        if (cs && cs.attempts) {
          cell.attempts = cs.attempts;
          cell.correct = cs.correct;
          cell.accuracy = (cs.correct / cs.attempts) * 100;
          cell.bestMs = cs.bestTimeMs || null;
        }
      }
    }

    return spec;
  }

  /* ------------------------------------------------------------------ *
   * Reset
   * ------------------------------------------------------------------ */

  function resetDeck(deckId) {
    delete state.decks[deckId];
    saveNow();
  }

  function resetAll() {
    state = blankState();
    saveNow();
  }

  function resetScores() {
    state.global.xp = 0;
    state.global.streak = { count: 0, lastDay: null };
    Object.keys(state.decks).forEach(function (id) {
      var d = state.decks[id];
      d.stats = {
        reviews: 0, correct: 0, points: 0, totalTimeMs: 0,
        lapses: 0, byGrade: { 1: 0, 2: 0, 3: 0, 4: 0 },
        hist: new Array(HIST_COUNT).fill(0)
      };
      d.daily = {};
      d.lastSession = null;
    });
    saveNow();
  }

  /* ------------------------------------------------------------------ *
   * Export
   * ------------------------------------------------------------------ */

  var State = {
    get raw() { return state; },
    settings: settings,
    save: save,
    saveNow: saveNow,
    deckState: deckState,
    cardState: cardState,
    cardStats: cardStats,
    buildQueue: buildQueue,
    shuffle: shuffle,
    sample: sample,
    preview: preview,
    parFor: parFor,
    intervalLabel: intervalLabel,
    grade: grade,
    undo: undo,
    deckSummary: deckSummary,
    deckBreakdown: deckBreakdown,
    forecast: forecast,
    weakestCards: weakestCards,
    deckDueCount: deckDueCount,
    uniqueCardCount: uniqueCardCount,
    deckMap: deckMap,
    resetDeck: resetDeck,
    resetAll: resetAll,
    resetScores: resetScores,
    dayKey: dayKey,
    dayStart: dayStart,
    plural: plural,
    encodeCard: encodeCard,
    decodeCard: decodeCard,
    emptyCardState: emptyCardState,
    HIST_BUCKET: HIST_BUCKET,
    LEECH_THRESHOLD: LEECH_THRESHOLD,
    version: VERSION
  };

  global.State = State;
})(window);
