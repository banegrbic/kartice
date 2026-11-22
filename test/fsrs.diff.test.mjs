/*
 * Differential test: our port (js/fsrs.js) vs the official `ts-fsrs` package.
 *
 * Both implementations are driven through identical random review sequences and
 * every observable field of the resulting card + log is compared. Any mismatch
 * is a real bug in the port.
 *
 * Run: node test/fsrs.diff.test.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const ourFsrs = require(path.join(here, '..', 'js', 'fsrs.js'));

const REF_ROOT = process.env.FSRS_REF_ROOT ||
  path.join(here, '..', 'fsrs-ref', 'node_modules', 'ts-fsrs');
const ref = require(REF_ROOT);
const { Rating, State, createEmptyCard, generatorParameters } = ref;

/* ------------------------------------------------------------------ *
 * Deterministic PRNG so failures are reproducible.
 * ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 1831565813) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * Adapters
 * ------------------------------------------------------------------ */

function refParams(params) {
  return generatorParameters({
    request_retention: params.request_retention,
    maximum_interval: params.maximum_interval,
    w: params.w,
    enable_fuzz: params.enable_fuzz,
    enable_short_term: params.enable_short_term,
    learning_steps: params.learning_steps,
    relearning_steps: params.relearning_steps,
  });
}

// One reference scheduler instance per parameter set.
const refSchedulerCache = new Map();
function getRefScheduler(params) {
  const key = JSON.stringify(params);
  if (!refSchedulerCache.has(key)) {
    refSchedulerCache.set(key, ref.fsrs(refParams(params)));
  }
  return refSchedulerCache.get(key);
}

function toRefCard(c) {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    learning_steps: c.learning_steps,
    state: c.state,
    last_review: c.last_review == null ? undefined : new Date(c.last_review),
  };
}

function plainCard(c) {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    learning_steps: c.learning_steps,
    state: c.state,
    last_review: c.last_review == null ? null : c.last_review,
  };
}

function normalizeRefCard(card) {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

function normalizeRefLog(log) {
  return {
    rating: log.rating,
    state: log.state,
    due: log.due.getTime(),
    stability: log.stability,
    difficulty: log.difficulty,
    scheduled_days: log.scheduled_days,
    learning_steps: log.learning_steps,
    review: log.review.getTime(),
  };
}

function refNext(card, nowMs, grade, params) {
  const out = getRefScheduler(params).next(toRefCard(card), new Date(nowMs), grade);
  return { card: normalizeRefCard(out.card), log: normalizeRefLog(out.log) };
}

function ourNext(card, nowMs, grade, params) {
  const inst = new ourFsrs.Scheduler(plainCard(card), nowMs, params);
  const out = inst.review(grade);
  return { card: plainCard(out.card), log: out.log };
}

/* ------------------------------------------------------------------ *
 * Comparison
 * ------------------------------------------------------------------ */
const NUM_EPS = 1e-9;

function compareCard(label, a, b, mismatches) {
  const fields = ['stability', 'difficulty', 'scheduled_days', 'reps', 'lapses', 'learning_steps', 'state'];
  for (const f of fields) {
    const av = a[f];
    const bv = b[f];
    if (typeof av === 'number' && typeof bv === 'number') {
      if (Math.abs(av - bv) > NUM_EPS) {
        mismatches.push(`${label}: ${f} ours=${av} ref=${bv}`);
      }
    } else if (av !== bv) {
      mismatches.push(`${label}: ${f} ours=${JSON.stringify(av)} ref=${JSON.stringify(bv)}`);
    }
  }
  if (Math.abs(a.due - b.due) > 1) {
    mismatches.push(`${label}: due ours=${a.due} ref=${b.due}`);
  }
  const alr = a.last_review, blr = b.last_review;
  if (alr == null || blr == null) {
    if (alr !== blr) mismatches.push(`${label}: last_review ours=${alr} ref=${blr}`);
  } else if (Math.abs(alr - blr) > 1) {
    mismatches.push(`${label}: last_review ours=${alr} ref=${blr}`);
  }
}

/* ------------------------------------------------------------------ *
 * Test runs
 * ------------------------------------------------------------------ */

function runSequence(seed, { steps = 60, fuzz = false, shortTerm = true, retention = 0.9 } = {}) {
  const rnd = mulberry32(seed);
  const params = ourFsrs.defaultParams({
    enable_fuzz: fuzz,
    enable_short_term: shortTerm,
    request_retention: retention,
  });

  let ourCard = ourFsrs.createEmptyCard(Date.UTC(2026, 0, 1, 10, 0, 0));
  let now = Date.UTC(2026, 0, 1, 10, 0, 0);
  const mismatches = [];

  for (let i = 0; i < steps; i++) {
    // Advance time by a random number of days (sometimes same-day).
    const dayJump = rnd() < 0.25 ? 0 : Math.floor(rnd() * 30);
    now += dayJump * 86400000 + Math.floor(rnd() * 3600000);

    const grade = 1 + Math.floor(rnd() * 4);

    const refResult = refNext(ourCard, now, grade, params);
    const ourResult = ourNext(ourCard, now, grade, params);

    compareCard(`seq${seed} step${i} grade${grade}`, ourResult.card, refResult.card, mismatches);
    compareCard(`seq${seed} step${i} grade${grade} LOG`, ourResult.log, refResult.log, mismatches);

    if (mismatches.length > 0) break;
    ourCard = ourResult.card;
  }
  return mismatches;
}

/* Also assert the "preview all four grades" path agrees. */
function runPreviewCheck(seed) {
  const rnd = mulberry32(seed);
  const params = ourFsrs.defaultParams({ enable_fuzz: false });
  let card = ourFsrs.createEmptyCard(Date.UTC(2026, 0, 1, 10, 0, 0));
  const mismatches = [];

  for (let i = 0; i < 12; i++) {
    const now = Date.UTC(2026, 0, 1 + i * 3, 10, 0, 0);
    const grade = 1 + Math.floor(rnd() * 4);

    const refPreview = getRefScheduler(params).repeat(toRefCard(card), new Date(now));
    const ourPreview = new ourFsrs.Scheduler(plainCard(card), now, params).preview();

    for (const g of [1, 2, 3, 4]) {
      compareCard(
        `preview seq${seed} step${i} grade${g}`,
        plainCard(ourPreview[g].card),
        normalizeRefCard(refPreview[g].card),
        mismatches
      );
    }
    if (mismatches.length) break;

    card = plainCard(ourPreview[grade].card);
  }
  return mismatches;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
let failures = [];
let checked = 0;

function run(name, fn) {
  const m = fn();
  checked++;
  if (m.length) {
    failures = failures.concat(m.slice(0, 8));
    console.error(`  ✗ ${name}: ${m.length} mismatch(es)`);
    for (const line of m.slice(0, 4)) console.error('      ' + line);
  }
}

for (let seed = 1; seed <= 300; seed++) {
  run(`plain seq${seed}`, () => runSequence(seed, { steps: 40 }));
  if (failures.length) break;
}
for (let seed = 1001; seed <= 1060; seed++) {
  run(`fuzz seq${seed}`, () => runSequence(seed, { steps: 40, fuzz: true }));
  if (failures.length) break;
}
for (let seed = 2001; seed <= 2060; seed++) {
  run(`preview seq${seed}`, () => runPreviewCheck(seed));
  if (failures.length) break;
}
for (const retention of [0.7, 0.8, 0.95]) {
  run(`retention ${retention}`, () => runSequence(31337, { steps: 30, retention }));
  if (failures.length) break;
}
// Long-term mode (no short-term stability) exercises a different code path.
for (let seed = 4001; seed <= 4040; seed++) {
  run(`longterm seq${seed}`, () => runSequence(seed, { steps: 30, shortTerm: false }));
  if (failures.length) break;
}

if (failures.length) {
  console.error('\nFSRS DIFFERENTIAL TEST FAILED\n');
  console.error(`${failures.length} mismatch(es) across ${checked} sequences.`);
  process.exit(1);
}

console.log(`FSRS differential test PASSED — ${checked} sequences, 0 mismatches vs ts-fsrs ${ref.FSRSVersion}.`);
