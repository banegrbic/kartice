/*
 * scoring.js — the scoring model.
 *
 * Three independent axes, because they answer different questions:
 *
 *   TAČNOST (accuracy)   — did you get it right, first try?
 *   BRZINA  (speed)      — how fast, measured against a par time that adapts
 *                          to your own history with that card?
 *   EFIKASNOST (efficiency) — how much learning did you buy per minute?
 *                          Points earned per minute spent, normalised.
 *
 * Points per answer combine the grade (how well you recalled it) with a speed
 * bonus (how quickly), and a combo multiplier for sustained accuracy.
 *
 * Every number here is reproducible from the stored per-card and per-session
 * statistics — no hidden state, no server round-trip.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Tuning constants
   * ------------------------------------------------------------------ */

  var BASE_POINTS = { 1: 0, 2: 5, 3: 10, 4: 12 };   // grade -> learning value
  var MAX_SPEED_BONUS = 8;                            // points for a very fast answer
  var COMBO_STEPS = [1.0, 1.1, 1.2, 1.35, 1.5];       // combo multipliers
  var REFERENCE_POINTS_PER_MIN = 90;                  // 100% efficiency
  var PERSONAL_PAR_FACTOR = 1.35;                     // target vs. your own best
  var PAR_MIN = 900;
  var PAR_MAX = 9000;
  // A neutral estimate for a subject that does not supply one.
  var DEFAULT_BASE_PAR = 3000;

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  function clamp(v, lo, hi) {
    return Math.min(Math.max(v, lo), hi);
  }

  function median(values) {
    if (!values.length) return 0;
    var s = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function mean(values) {
    if (!values.length) return 0;
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += values[i];
    return sum / values.length;
  }

  /* ------------------------------------------------------------------ *
   * Par time
   *
   * The time a given answer should take. Two inputs:
   *   - a content-based estimate (how hard the fact is), and
   *   - your own best time on that card, which is the honest benchmark.
   * The tighter of the two wins, so mastering a fact tightens the target.
   *
   * The content-based estimate belongs to the DECK, not here: only the deck
   * knows what its cards mean and how long an answer to them should take.
   * The caller passes it in as `baseMs`; this module owns only the
   * arithmetic that turns it into a target.
   * ------------------------------------------------------------------ */

  function contentPar(card, baseMs) {
    if (typeof baseMs === 'number' && isFinite(baseMs) && baseMs > 0) return baseMs;
    return DEFAULT_BASE_PAR;
  }

  /**
   * Par time for a card.
   *
   * Must be computed from the stats that existed *before* the answer, so the
   * answer being judged never raises its own bar. Callers that need to judge
   * an answer and score it must use the same value — hence State.parFor().
   */
  function parMs(card, cardStats, baseMs) {
    var base = contentPar(card, baseMs);
    if (cardStats && cardStats.bestTimeMs > 0) {
      var personal = cardStats.bestTimeMs * PERSONAL_PAR_FACTOR;
      base = Math.min(base, personal);
    }
    // A card that is hard for you (high FSRS difficulty) gets a little more
    // room, so difficulty never cancels out into the speed score.
    if (cardStats && cardStats.difficulty) {
      base *= 1 + clamp((cardStats.difficulty - 5) / 20, 0, 0.25);
    }
    return clamp(Math.round(base), PAR_MIN, PAR_MAX);
  }

  /* ------------------------------------------------------------------ *
   * Answering
   * ------------------------------------------------------------------ */

  /**
   * Score a single answer.
   *
   * @param {object} o
   * @param {number} o.grade     1..4
   * @param {boolean} o.correct   was the answer right?
   * @param {number} o.elapsedMs  time from card shown to answer submitted
   * @param {number} o.parMs      par time for this card
   * @param {number} o.combo      consecutive correct answers before this one
   * @param {boolean} o.helpUsed  was the answer shown before answering?
   * @returns {{points:number, speedPct:number, comboMultiplier:number, breakdown:object}}
   */
  function answer(o) {
    var grade = o.grade;
    var elapsed = Math.max(1, o.elapsedMs || 0);
    var par = Math.max(PAR_MIN, o.parMs || 3000);

    // Speed: 100 when you meet the par time, 0 when you take twice as long.
    var speedPct = clamp((2 * par - elapsed) / par, 0, 1) * 100;

    // Speed bonus scales with the speed score, so it is worth the most on
    // answers that were both right and quick.
    var speedBonus = Math.round(MAX_SPEED_BONUS * (speedPct / 100) * (o.correct ? 1 : 0.25));

    var base = BASE_POINTS[grade] || 0;
    var comboMultiplier = COMBO_STEPS[Math.min(o.combo || 0, COMBO_STEPS.length - 1)];

    var raw = (base + speedBonus) * comboMultiplier;

    // Help means the answer was shown rather than recalled, so it is
    // worth nothing. The card is still scheduled — the learner did review
    // it — but no points are earned for it.
    var points = o.helpUsed ? 0 : Math.round(raw);

    return {
      points: points,
      speedPct: Math.round(speedPct),
      comboMultiplier: comboMultiplier,
      breakdown: {
        base: base,
        speedBonus: speedBonus,
        combo: comboMultiplier,
        helped: !!o.helpUsed
      }
    };
  }

  /**
   * Map a typed answer to a grade, when the answer is judged automatically.
   *   wrong                -> Again (1)
   *   right but very slow  -> Hard (2)
   *   right                -> Good (3)
   *   right and very fast  -> Easy (4)
   */
  function autoGrade(correct, elapsedMs, parMs) {
    if (!correct) return 1;
    var par = Math.max(PAR_MIN, parMs || 3000);
    if (elapsedMs > par * 1.6) return 2;
    if (elapsedMs <= par * 0.55) return 4;
    return 3;
  }

  /* ------------------------------------------------------------------ *
   * Aggregates
   * ------------------------------------------------------------------ */

  /**
   * Summarise a set of answers (one session).
   * @param {Array} entries [{grade, correct, elapsedMs, points}]
   */
  function sessionSummary(entries) {
    var n = entries.length;
    if (!n) {
      return {
        answers: 0,
        correct: 0,
        accuracy: 0,
        speedScore: 0,
        efficiency: 0,
        points: 0,
        avgMs: 0,
        medianMs: 0,
        pointsPerMinute: 0,
        byGrade: { 1: 0, 2: 0, 3: 0, 4: 0 }
      };
    }

    var correct = 0;
    var points = 0;
    var totalMs = 0;
    var speeds = [];
    var times = [];
    var byGrade = { 1: 0, 2: 0, 3: 0, 4: 0 };

    for (var i = 0; i < n; i++) {
      var e = entries[i];
      if (e.correct) correct++;
      points += e.points || 0;
      totalMs += e.elapsedMs || 0;
      times.push(e.elapsedMs || 0);
      if (e.speedPct != null) speeds.push(e.speedPct);
      if (e.grade) byGrade[e.grade] = (byGrade[e.grade] || 0) + 1;
    }

    var minutes = Math.max(totalMs / 60000, 0.5);
    var pointsPerMinute = points / minutes;

    return {
      answers: n,
      correct: correct,
      accuracy: (correct / n) * 100,
      speedScore: speeds.length ? mean(speeds) : 0,
      efficiency: clamp((pointsPerMinute / REFERENCE_POINTS_PER_MIN) * 100, 0, 100),
      points: points,
      avgMs: Math.round(mean(times)),
      medianMs: Math.round(median(times)),
      pointsPerMinute: Math.round(pointsPerMinute),
      byGrade: byGrade
    };
  }

  /**
   * Lifetime figures for a deck, derived from the accumulated counters.
   *
   * Both branches return the SAME key set — an empty deck must expose the
   * same fields as a populated one, or callers get `undefined` in one case
   * and `0` in the other.
   */
  function deckSummary(deckStats) {
    var s = deckStats || {};
    var reviews = s.reviews || 0;
    var correct = s.correct || 0;
    var points = s.points || 0;
    var totalMs = s.totalTimeMs || 0;
    var minutes = Math.max(totalMs / 60000, 0.5);

    return {
      reviews: reviews,
      correct: correct,
      accuracy: reviews ? (correct / reviews) * 100 : 0,
      points: points,
      avgMs: reviews ? Math.round(totalMs / reviews) : 0,
      medianMs: s.medianMs || 0,
      efficiency: clamp((points / minutes / REFERENCE_POINTS_PER_MIN) * 100, 0, 100),
      // Retention: answers that did not need to be relearnt.
      retention: reviews ? ((reviews - (s.lapses || 0)) / reviews) * 100 : 0,
      lapses: s.lapses || 0,
      byGrade: s.byGrade || { 1: 0, 2: 0, 3: 0, 4: 0 }
    };
  }

  /* ------------------------------------------------------------------ *
   * Levels
   * ------------------------------------------------------------------ */

  function levelForXp(xp) {
    var level = 1;
    while (level < 99 && xp >= xpForLevel(level + 1)) level++;
    var floor = xpForLevel(level);
    var ceil = xpForLevel(level + 1);
    return {
      level: level,
      current: xp - floor,
      needed: Math.max(1, ceil - floor),
      total: xp,
      pct: clamp(((xp - floor) / Math.max(1, ceil - floor)) * 100, 0, 100)
    };
  }

  function xpForLevel(level) {
    if (level <= 1) return 0;
    return 50 * (level - 1) * level;
  }

  /* ------------------------------------------------------------------ *
   * Daily streak
   * ------------------------------------------------------------------ */

  function todayKey(ts) {
    var d = ts ? new Date(ts) : new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /**
   * Update the study streak.
   *
   * @param {object} streak        {count, lastDay}
   * @param {number} ts            timestamp of the activity
   * @param {function} dayKeyFn    day-bucket function, so the streak rolls
   *                                over at the same moment as everything else
   * @returns {{count:number,lastDay:string}}
   */
  function updateStreak(streak, ts, dayKeyFn) {
    var state = streak || { count: 0, lastDay: null };
    var keyOf = dayKeyFn || todayKey;
    var today = keyOf(ts);
    if (state.lastDay === today) return state;
    if (state.lastDay === previousDayKey(keyOf, ts)) {
      state.count += 1;
    } else {
      state.count = 1;
    }
    state.lastDay = today;
    return state;
  }

  function previousDayKey(dayKeyFn, ts) {
    var d = new Date(ts === undefined ? Date.now() : ts);
    d.setDate(d.getDate() - 1);
    return dayKeyFn(d.getTime());
  }

  var Scoring = {
    answer: answer,
    autoGrade: autoGrade,
    parMs: parMs,
    contentPar: contentPar,
    sessionSummary: sessionSummary,
    deckSummary: deckSummary,
    levelForXp: levelForXp,
    xpForLevel: xpForLevel,
    updateStreak: updateStreak,
    todayKey: todayKey,
    constants: {
      DEFAULT_BASE_PAR: DEFAULT_BASE_PAR,
      BASE_POINTS: BASE_POINTS,
      MAX_SPEED_BONUS: MAX_SPEED_BONUS,
      COMBO_STEPS: COMBO_STEPS,
      REFERENCE_POINTS_PER_MIN: REFERENCE_POINTS_PER_MIN,
      PERSONAL_PAR_FACTOR: PERSONAL_PAR_FACTOR
    },
    _internal: { clamp: clamp, median: median, mean: mean }
  };

  global.Scoring = Scoring;
})(window);
