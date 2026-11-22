/*
 * fsrs.js — FSRS-6 spaced-repetition scheduler.
 *
 * A dependency-free port of FSRS-6 (Open Spaced Repetition) covering both the
 * memory model (stability / difficulty / forgetting curve) and the scheduler
 * lifecycle (learning steps, relearning, due dates, interval ordering, fuzz).
 *
 * Correctness is not assumed: this file is differentially tested against the
 * official `ts-fsrs` package over randomised review sequences (see
 * test/fsrs.diff.test.mjs). Any change here must keep that suite green.
 *
 * Licence of the algorithm: MIT (open-spaced-repetition).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FSRS = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  var Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };
  var State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };
  var GRADES = [1, 2, 3, 4];

  // FSRS-6 default weights (21 parameters, last one is the decay).
  var DEFAULT_W = [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
    0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
    0.0912, 0.0658, 0.1542
  ];

  var S_MIN = 0.001;
  var S_MAX = 36500;
  var MAX_INTERVAL = 36500;

  var DEFAULT_LEARNING_STEPS = ['1m', '10m'];
  var DEFAULT_RELEARNING_STEPS = ['10m'];

  var FUZZ_RANGES = [
    { start: 2.5, end: 7, factor: 0.15 },
    { start: 7, end: 20, factor: 0.10 },
    { start: 20, end: Infinity, factor: 0.05 }
  ];

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function roundTo(num, decimals) {
    var factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
  }

  // "1m" | "10m" | "2h" | "3d" -> minutes
  function stepToMinutes(step) {
    var unit = step.slice(-1);
    var value = Number(step.slice(0, -1));
    if (unit === 'm') return value;
    if (unit === 'h') return value * 60;
    if (unit === 'd') return value * 1440;
    throw new Error('Invalid step unit: ' + step);
  }

  // UTC calendar-day difference, matching the reference implementation.
  function dateDiffInDays(lastMs, nowMs) {
    var a = new Date(lastMs);
    var b = new Date(nowMs);
    var utc1 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
    var utc2 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    return Math.floor((utc2 - utc1) / 86400000);
  }

  function fnv1a32(str) {
    var hash = 2166136261;
    for (var i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 1831565813) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fuzzRange(interval, elapsedDays, maximumInterval) {
    var delta = 1;
    for (var i = 0; i < FUZZ_RANGES.length; i++) {
      var range = FUZZ_RANGES[i];
      delta += range.factor * Math.max(Math.min(interval, range.end) - range.start, 0);
    }
    var capped = Math.min(interval, maximumInterval);
    var minInterval = Math.max(2, Math.round(capped - delta));
    var maxInterval = Math.min(Math.round(capped + delta), maximumInterval);
    if (capped > elapsedDays) minInterval = Math.max(minInterval, elapsedDays + 1);
    minInterval = Math.min(minInterval, maxInterval);
    return { minInterval: minInterval, maxInterval: maxInterval };
  }

  function withFuzzing(interval, elapsedDays, config, seed) {
    if (!config.enableFuzz || interval < 2.5) return Math.round(interval);
    var range = fuzzRange(interval, elapsedDays, config.maximumInterval);
    var rng = mulberry32(fnv1a32(seed == null ? String(Date.now()) : seed));
    return Math.floor(rng() * (range.maxInterval - range.minInterval + 1) + range.minInterval);
  }

  /* ------------------------------------------------------------------ *
   * Memory model (FSRS-6)
   * ------------------------------------------------------------------ */

  function decayFactor(decayWeight) {
    var decay = -decayWeight;
    return { decay: decay, factor: roundTo(Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1, 8) };
  }

  function initStability(w, grade) {
    return clamp(w[grade - 1], S_MIN, S_MAX);
  }

  function initDifficulty(w, grade) {
    return roundTo(w[4] - Math.exp((grade - 1) * w[5]) + 1, 8);
  }

  function linearDamping(deltaD, oldD) {
    return roundTo((deltaD * (10 - oldD)) / 9, 8);
  }

  function meanReversion(w, init, current) {
    return roundTo(w[7] * init + (1 - w[7]) * current, 8);
  }

  function nextDifficulty(w, d, grade) {
    var deltaD = -w[6] * (grade - 3);
    var nextD = d + linearDamping(deltaD, d);
    return clamp(meanReversion(w, initDifficulty(w, Rating.Easy), nextD), 1, 10);
  }

  function nextRecallStability(w, d, s, r, grade) {
    var hardPenalty = grade === Rating.Hard ? w[15] : 1;
    var easyBound = grade === Rating.Easy ? w[16] : 1;
    var value = s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) *
      (Math.exp((1 - r) * w[10]) - 1) * hardPenalty * easyBound);
    return roundTo(clamp(value, S_MIN, S_MAX), 8);
  }

  function nextForgetStability(w, d, s, r) {
    var value = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
    return roundTo(clamp(value, S_MIN, S_MAX), 8);
  }

  function nextShortTermStability(w, s, grade, enableShortTerm) {
    var sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (grade - 3 + w[18]));
    var masked = grade >= Rating.Hard ? Math.max(sinc, 1) : sinc;
    return roundTo(clamp(s * masked, S_MIN, S_MAX), 8);
  }

  /**
   * One memory-state transition.
   * @param {{stability:number,difficulty:number}} memoryState
   * @param {number} t elapsed days
   * @param {number} grade 1..4
   * @param {number} [r] retrievability (defaults to the forgetting curve)
   */
  function nextState(w, memoryState, t, grade, r, enableShortTerm) {
    var d = memoryState ? memoryState.difficulty : 0;
    var s = memoryState ? memoryState.stability : 0;

    if (d === 0 && s === 0) {
      return {
        difficulty: clamp(initDifficulty(w, grade), 1, 10),
        stability: initStability(w, grade)
      };
    }

    var retrievability = typeof r === 'number' ? r : forgettingCurve(w, t, s);
    var newS;

    if (t === 0 && enableShortTerm) {
      newS = nextShortTermStability(w, s, grade, enableShortTerm);
    } else if (grade === Rating.Again) {
      var sAfterFail = nextForgetStability(w, d, s, retrievability);
      var w17 = enableShortTerm ? w[17] : 0;
      var w18 = enableShortTerm ? w[18] : 0;
      var nextSMin = s / Math.exp(w17 * w18);
      newS = clamp(roundTo(nextSMin, 8), S_MIN, sAfterFail);
    } else {
      newS = nextRecallStability(w, d, s, retrievability, grade);
    }

    return { difficulty: nextDifficulty(w, d, grade), stability: newS };
  }

  function forgettingCurve(w, elapsedDays, stability) {
    var info = decayFactor(w[20]);
    return roundTo(Math.pow(1 + (info.factor * elapsedDays) / stability, info.decay), 8);
  }

  function nextInterval(w, stability, desiredRetention) {
    var info = decayFactor(w[20]);
    var value = stability / info.factor * (Math.pow(desiredRetention, 1 / info.decay) - 1);
    return Math.max(Math.round(value), 1);
  }

  /* ------------------------------------------------------------------ *
   * Learning steps
   * ------------------------------------------------------------------ */

  function calculateLearningSteps(config, state, learningStep) {
    var steps = state === State.Relearning || state === State.Review
      ? config.relearningSteps
      : config.learningSteps;
    var stepsLength = steps.length;
    if (stepsLength === 0 || learningStep >= stepsLength) return {};

    var learningStepUnit = steps[Math.max(0, learningStep)];

    if (state === State.Review) {
      return { 1: { scheduledMinutes: stepToMinutes(learningStepUnit), nextStep: 0 } };
    }

    var firstMinutes = stepToMinutes(steps[0]);
    var secondMinutes = stepsLength > 1 ? stepToMinutes(steps[1]) : undefined;
    var hardMinutes = secondMinutes === undefined ? firstMinutes * 1.5 : (firstMinutes + secondMinutes) / 2;

    var result = {
      1: { scheduledMinutes: firstMinutes, nextStep: 0 },
      2: { scheduledMinutes: hardMinutes, nextStep: learningStep }
    };

    var nextStepUnit = steps[learningStep + 1];
    if (nextStepUnit) {
      var nextMinutes = (learningStep === 0 && secondMinutes !== undefined)
        ? secondMinutes
        : stepToMinutes(nextStepUnit);
      if (nextMinutes > 0) {
        result[3] = { scheduledMinutes: nextMinutes, nextStep: learningStep + 1 };
      }
    }
    return result;
  }

  // Keeps each successive rating at least one day beyond the previous.
  function calculateScheduleDays(candidates, maximumInterval) {
    var first = Math.min(candidates[0], maximumInterval);
    if (candidates.length === 1) return [first];
    var second = Math.min(Math.max(candidates[1], first === 0 ? 0 : first + 1), maximumInterval);
    if (candidates.length === 2) return [first, second];
    var third = Math.min(Math.max(candidates[2], second === 0 ? 0 : second + 1), maximumInterval);
    if (candidates.length === 3) return [first, second, third];
    return [first, second, third, Math.min(Math.max(candidates[3], third === 0 ? 0 : third + 1), maximumInterval)];
  }

  /* ------------------------------------------------------------------ *
   * Cards & scheduler
   * ------------------------------------------------------------------ */

  function createEmptyCard(nowMs) {
    return {
      due: nowMs,
      stability: 0,
      difficulty: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      learning_steps: 0,
      state: State.New,
      last_review: null
    };
  }

  function defaultParams(overrides) {
    var p = overrides || {};
    return {
      w: p.w ? p.w.slice() : DEFAULT_W.slice(),
      request_retention: p.request_retention || 0.9,
      maximum_interval: p.maximum_interval || MAX_INTERVAL,
      enable_fuzz: p.enable_fuzz === undefined ? false : !!p.enable_fuzz,
      enable_short_term: p.enable_short_term === undefined ? true : !!p.enable_short_term,
      learning_steps: p.learning_steps ? p.learning_steps.slice() : DEFAULT_LEARNING_STEPS.slice(),
      relearning_steps: p.relearning_steps ? p.relearning_steps.slice() : DEFAULT_RELEARNING_STEPS.slice()
    };
  }

  /**
   * Scheduler for a single card. Mirrors the reference `BasicScheduler`:
   * `.preview()` returns the result for all four grades, `.review(g)` commits one.
   */
  function Scheduler(card, nowMs, params) {
    this.params = defaultParams(params);
    this.w = this.params.w;
    this.reviewTime = nowMs;
    this.last = Object.assign({}, card);
    this.current = Object.assign({}, card);
    this.next = {};

    var elapsed = 0;
    if (this.current.state !== State.New && this.current.last_review != null) {
      elapsed = dateDiffInDays(this.current.last_review, this.reviewTime);
    }
    this.current.last_review = this.reviewTime;
    this.elapsedDays = elapsed;
    this.current.reps += 1;
    this.seed = this.reviewTime + '_' + this.current.reps + '_' +
      this.current.difficulty * this.current.stability;
  }

  Scheduler.prototype.learningInfo = function (grade) {
    var step = this.current.learning_steps || 0;
    var steps = calculateLearningSteps(
      { learningSteps: this.params.learning_steps, relearningSteps: this.params.relearning_steps },
      this.current.state,
      step
    );
    var entry = steps[grade];
    return {
      scheduledMinutes: Math.round(Math.max(0, entry ? entry.scheduledMinutes : 0) * 60) / 60,
      nextStep: Math.max(0, entry ? entry.nextStep : 0)
    };
  };

  Scheduler.prototype.applyLearningSteps = function (nextCard, grade, toState) {
    var info = this.learningInfo(grade);
    if (info.scheduledMinutes > 0 && info.scheduledMinutes < 1440) {
      nextCard.learning_steps = info.nextStep;
      nextCard.scheduled_days = 0;
      nextCard.state = toState;
      nextCard.due = this.reviewTime + info.scheduledMinutes * 60000;
    } else {
      nextCard.state = State.Review;
      if (info.scheduledMinutes >= 1440) {
        nextCard.learning_steps = info.nextStep;
        nextCard.due = this.reviewTime + info.scheduledMinutes * 60000;
        nextCard.scheduled_days = Math.floor(info.scheduledMinutes / 1440);
      } else {
        nextCard.learning_steps = 0;
        var interval = this.schedulerNextInterval(nextCard, this.elapsedDays);
        nextCard.scheduled_days = interval;
        nextCard.due = this.reviewTime + interval * 86400000;
      }
    }
    return nextCard;
  };

  Scheduler.prototype.schedulerNextInterval = function (card, elapsedDays) {
    var base = nextInterval(this.w, card.stability, this.params.request_retention);
    return withFuzzing(base, elapsedDays, {
      enableFuzz: this.params.enable_fuzz,
      maximumInterval: this.params.maximum_interval
    }, this.seed);
  };

  Scheduler.prototype.nextDs = function (t, grade, retrievability) {
    var state = nextState(this.w, this.current, t, grade, retrievability, this.params.enable_short_term);
    var card = Object.assign({}, this.current);
    card.difficulty = state.difficulty;
    card.stability = state.stability;
    return card;
  };

  Scheduler.prototype.buildLog = function (grade) {
    var last = this.last;
    return {
      rating: grade,
      state: this.current.state,
      due: last.last_review != null ? last.last_review : last.due,
      stability: this.current.stability,
      difficulty: this.current.difficulty,
      scheduled_days: this.current.scheduled_days,
      learning_steps: this.current.learning_steps,
      review: this.reviewTime
    };
  };

  Scheduler.prototype.newState = function (grade) {
    var next = this.nextDs(this.elapsedDays, grade);
    this.applyLearningSteps(next, grade, State.Learning);
    var item = { card: next, log: this.buildLog(grade) };
    this.next[grade] = item;
    return item;
  };

  Scheduler.prototype.learningState = function (grade) {
    var next = this.nextDs(this.elapsedDays, grade);
    this.applyLearningSteps(next, grade, this.last.state);
    var item = { card: next, log: this.buildLog(grade) };
    this.next[grade] = item;
    return item;
  };

  Scheduler.prototype.reviewState = function (grade) {
    var interval = this.elapsedDays;
    var retrievability = forgettingCurve(this.w, interval, this.current.stability);

    var nextAgain = this.nextDs(interval, Rating.Again, retrievability);
    var nextHard = this.nextDs(interval, Rating.Hard, retrievability);
    var nextGood = this.nextDs(interval, Rating.Good, retrievability);
    var nextEasy = this.nextDs(interval, Rating.Easy, retrievability);

    // Interval ordering: hard < good < easy, each at least a day apart.
    var days = calculateScheduleDays([
      this.schedulerNextInterval(nextHard, interval),
      this.schedulerNextInterval(nextGood, interval),
      this.schedulerNextInterval(nextEasy, interval)
    ], this.params.maximum_interval);

    nextHard.scheduled_days = days[0];
    nextHard.due = this.reviewTime + days[0] * 86400000;
    nextGood.scheduled_days = days[1];
    nextGood.due = this.reviewTime + days[1] * 86400000;
    nextEasy.scheduled_days = days[2];
    nextEasy.due = this.reviewTime + days[2] * 86400000;

    nextHard.state = State.Review; nextHard.learning_steps = 0;
    nextGood.state = State.Review; nextGood.learning_steps = 0;
    nextEasy.state = State.Review; nextEasy.learning_steps = 0;

    this.applyLearningSteps(nextAgain, Rating.Again, State.Relearning);
    nextAgain.lapses += 1;

    this.next[Rating.Again] = { card: nextAgain, log: this.buildLog(Rating.Again) };
    this.next[Rating.Hard] = { card: nextHard, log: this.buildLog(Rating.Hard) };
    this.next[Rating.Good] = { card: nextGood, log: this.buildLog(Rating.Good) };
    this.next[Rating.Easy] = { card: nextEasy, log: this.buildLog(Rating.Easy) };
    return this.next[grade];
  };

  /* ------------------------------------------------------------------ *
   * Long-term scheduling (enable_short_term = false)
   *
   * The reference implementation swaps in a different scheduler class here:
   * there are no learning steps, every card graduates straight to Review, and
   * a lapse is scheduled like any other interval rather than through a
   * relearning step. This mirrors it exactly.
   * ------------------------------------------------------------------ */

  Scheduler.prototype.longTermNextDs = function (t, grade) {
    // No explicit retrievability: the model derives it from the forgetting curve.
    return this.nextDs(t, grade, undefined);
  };

  Scheduler.prototype.longTermNextInterval = function (nextAgain, nextHard, nextGood, nextEasy, interval) {
    var days = calculateScheduleDays([
      this.schedulerNextInterval(nextAgain, interval),
      this.schedulerNextInterval(nextHard, interval),
      this.schedulerNextInterval(nextGood, interval),
      this.schedulerNextInterval(nextEasy, interval)
    ], this.params.maximum_interval);

    var cards = [nextAgain, nextHard, nextGood, nextEasy];
    for (var i = 0; i < cards.length; i++) {
      cards[i].scheduled_days = days[i];
      cards[i].due = this.reviewTime + days[i] * 86400000;
      cards[i].state = State.Review;
      cards[i].learning_steps = 0;
    }
  };

  Scheduler.prototype.longTermReviewState = function (grade) {
    var interval = this.elapsedDays;
    var nextAgain = this.longTermNextDs(interval, Rating.Again);
    var nextHard = this.longTermNextDs(interval, Rating.Hard);
    var nextGood = this.longTermNextDs(interval, Rating.Good);
    var nextEasy = this.longTermNextDs(interval, Rating.Easy);

    this.longTermNextInterval(nextAgain, nextHard, nextGood, nextEasy, interval);
    nextAgain.lapses += 1;

    this.next[Rating.Again] = { card: nextAgain, log: this.buildLog(Rating.Again) };
    this.next[Rating.Hard] = { card: nextHard, log: this.buildLog(Rating.Hard) };
    this.next[Rating.Good] = { card: nextGood, log: this.buildLog(Rating.Good) };
    this.next[Rating.Easy] = { card: nextEasy, log: this.buildLog(Rating.Easy) };
    return this.next[grade];
  };

  Scheduler.prototype.longTermNewState = function (grade) {
    this.current.scheduled_days = 0;
    var firstInterval = 0;
    var nextAgain = this.longTermNextDs(firstInterval, Rating.Again);
    var nextHard = this.longTermNextDs(firstInterval, Rating.Hard);
    var nextGood = this.longTermNextDs(firstInterval, Rating.Good);
    var nextEasy = this.longTermNextDs(firstInterval, Rating.Easy);

    this.longTermNextInterval(nextAgain, nextHard, nextGood, nextEasy, firstInterval);
    // Note: unlike reviewState, a brand-new card does not count as a lapse.

    this.next[Rating.Again] = { card: nextAgain, log: this.buildLog(Rating.Again) };
    this.next[Rating.Hard] = { card: nextHard, log: this.buildLog(Rating.Hard) };
    this.next[Rating.Good] = { card: nextGood, log: this.buildLog(Rating.Good) };
    this.next[Rating.Easy] = { card: nextEasy, log: this.buildLog(Rating.Easy) };
    return this.next[grade];
  };

  Scheduler.prototype.review = function (grade) {
    var state = this.last.state;
    if (!this.params.enable_short_term) {
      // Long-term mode: learning cards are scheduled like review cards.
      if (state === State.New) return this.longTermNewState(grade);
      return this.longTermReviewState(grade);
    }
    if (state === State.New) return this.newState(grade);
    if (state === State.Learning || state === State.Relearning) return this.learningState(grade);
    return this.reviewState(grade);
  };

  Scheduler.prototype.preview = function () {
    var out = {};
    for (var i = 0; i < GRADES.length; i++) {
      out[GRADES[i]] = this.review(GRADES[i]);
    }
    return out;
  };

  return {
    Rating: Rating,
    State: State,
    GRADES: GRADES,
    DEFAULT_W: DEFAULT_W,
    DEFAULT_LEARNING_STEPS: DEFAULT_LEARNING_STEPS,
    DEFAULT_RELEARNING_STEPS: DEFAULT_RELEARNING_STEPS,
    S_MIN: S_MIN,
    S_MAX: S_MAX,
    MAX_INTERVAL: MAX_INTERVAL,
    createEmptyCard: createEmptyCard,
    Scheduler: Scheduler,
    defaultParams: defaultParams,
    // Exposed for tests
    _internal: {
      nextState: nextState,
      nextInterval: nextInterval,
      forgettingCurve: forgettingCurve,
      calculateLearningSteps: calculateLearningSteps,
      calculateScheduleDays: calculateScheduleDays,
      dateDiffInDays: dateDiffInDays,
      withFuzzing: withFuzzing,
      decayFactor: decayFactor
    }
  };
});
