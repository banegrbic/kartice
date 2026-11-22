/*
 * Unit tests for the app logic that is not covered by the FSRS differential
 * test: the scoring model, the storage encoding, and the card-state packing.
 *
 * These modules are browser scripts that attach to `window`. The harness below
 * provides just enough of a browser for them to load, so the tests exercise
 * the real shipped code rather than a copy.
 *
 * Run: node test/app.test.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

/* ------------------------------------------------------------------ *
 * Minimal browser harness
 * ------------------------------------------------------------------ */

function makeHarness() {
  const cookies = new Map();

  const document = {
    get cookie() {
      return Array.from(cookies.entries())
        .map(([k, v]) => k + '=' + v)
        .join('; ');
    },
    set cookie(str) {
      const [pair, ...attrs] = str.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      const maxAge = attrs.find(a => a.trim().toLowerCase().startsWith('max-age='));
      if (maxAge && Number(maxAge.split('=')[1]) <= 0) cookies.delete(name);
      else cookies.set(name, value);
    },
    getElementById() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };

  const localStorage = {
    _d: new Map(),
    getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
    setItem(k, v) { this._d.set(k, String(v)); },
    removeItem(k) { this._d.delete(k); },
    key(i) { return Array.from(this._d.keys())[i] ?? null; },
    get length() { return this._d.size; }
  };

  const win = {
    document,
    localStorage,
    console,
    TextEncoder,
    TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    Date,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    isFinite,
    setTimeout,
    clearTimeout
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;

  const context = vm.createContext(win);

  function load(file) {
    const code = require('fs').readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  return { win, context, load, cookies };
}

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || 'not close'}: expected ~${expected}, got ${actual}`);
  }
}

/* ================================================================== *
 * Storage: chunking and encoding
 * ================================================================== */

const h = makeHarness();
h.load('js/fsrs.js');
h.load('js/storage.js');
h.load('js/scoring.js');
// The registry first, then one file per deck — each registers itself.
h.load('js/deck-registry.js');
h.load('js/deck-tablica-mnozenje.js');
h.load('js/deck-tablica-deljenje.js');
h.load('js/deck-tablica.js');
h.load('js/deck-akordi.js');
h.load('js/state.js');

const { Store, Scoring, Decks, State, FSRS } = h.win;

check('storage: backend is cookie when cookies work', () => {
  assertEqual(Store.backend, 'cookie');
});

check('storage: small payload round-trips', () => {
  const value = { hello: 'world', n: 42, list: [1, 2, 3] };
  assert(Store.set('t1', value));
  assertEqual(JSON.stringify(Store.get('t1', null)), JSON.stringify(value));
});

check('storage: large payload spans multiple chunks and round-trips', () => {
  const big = { blob: 'x'.repeat(60000), nested: { a: [1, 2, 3] } };
  assert(Store.set('t2', big));
  const names = Array.from(h.cookies.keys()).filter(k => k.startsWith('krt1.meta.t2.'));
  assert(names.length >= 2, `expected multiple chunks, got ${names.length}`);
  const back = Store.get('t2', null);
  assertEqual(back.blob.length, 60000);
  assertEqual(JSON.stringify(back.nested), JSON.stringify(big.nested));
});

check('storage: every cookie stays under the browser 4096-byte limit', () => {
  const big = { blob: 'y'.repeat(30000) };
  Store.set('t3', big);
  for (const [name, value] of h.cookies.entries()) {
    assert(
      name.length + value.length <= 4096,
      `cookie ${name} is ${name.length + value.length} bytes, over the limit`
    );
  }
});

check('storage: missing key returns the fallback', () => {
  assertEqual(Store.get('never-written', 'fallback'), 'fallback');
});

check('storage: a truncated write is rejected rather than half-read', () => {
  Store.set('t4', { ok: 1, pad: 'z'.repeat(5000) });
  // Simulate a chunk vanishing.
  const chunkName = Array.from(h.cookies.keys()).find(k => k.startsWith('krt1.meta.t4.0'));
  h.cookies.delete(chunkName);
  assertEqual(Store.get('t4', 'MISSING'), 'MISSING');
});

check('storage: clearAll removes only our own cookies', () => {
  h.cookies.set('unrelated_cookie', 'keepme');
  Store.set('t5', { x: 1 });
  Store.clearAll();
  assertEqual(h.cookies.get('unrelated_cookie'), 'keepme');
  assertEqual(h.cookies.has('krt1.meta.t5.0'), false);
});

/* ================================================================== *
 * Scoring
 * ================================================================== */

check('scoring: a wrong answer earns no base points', () => {
  const s = Scoring.answer({ grade: 1, correct: false, elapsedMs: 500, parMs: 2000, combo: 0 });
  assertEqual(s.breakdown.base, 0);
});

check('scoring: a correct answer at par time scores well', () => {
  const s = Scoring.answer({ grade: 3, correct: true, elapsedMs: 2000, parMs: 2000, combo: 0 });
  assertEqual(s.speedPct, 100);
  assert(s.points > Scoring.constants.BASE_POINTS[3], 'speed bonus missing');
});

check('scoring: twice the par time scores zero on speed', () => {
  const s = Scoring.answer({ grade: 3, correct: true, elapsedMs: 4000, parMs: 2000, combo: 0 });
  assertEqual(s.speedPct, 0);
});

check('scoring: faster answers never score less than slower ones', () => {
  const fast = Scoring.answer({ grade: 3, correct: true, elapsedMs: 800, parMs: 2000, combo: 0 });
  const slow = Scoring.answer({ grade: 3, correct: true, elapsedMs: 3200, parMs: 2000, combo: 0 });
  assert(fast.points > slow.points, `${fast.points} !> ${slow.points}`);
});

check('scoring: the combo multiplier is capped', () => {
  const a = Scoring.answer({ grade: 3, correct: true, elapsedMs: 1000, parMs: 2000, combo: 0 });
  const b = Scoring.answer({ grade: 3, correct: true, elapsedMs: 1000, parMs: 2000, combo: 99 });
  assertEqual(b.comboMultiplier, Scoring.constants.COMBO_STEPS[Scoring.constants.COMBO_STEPS.length - 1]);
  assert(b.points > a.points);
});

check('scoring: autoGrade maps correctness and speed to a grade', () => {
  assertEqual(Scoring.autoGrade(false, 500, 2000), 1, 'wrong -> Again');
  assertEqual(Scoring.autoGrade(true, 4000, 2000), 2, 'correct but slow -> Hard');
  assertEqual(Scoring.autoGrade(true, 2000, 2000), 3, 'correct at par -> Good');
  assertEqual(Scoring.autoGrade(true, 500, 2000), 4, 'correct and fast -> Easy');
});

check('scoring: session summary is consistent with its inputs', () => {
  const entries = [
    { grade: 3, correct: true, elapsedMs: 1000, points: 18, speedPct: 100 },
    { grade: 1, correct: false, elapsedMs: 3000, points: 0, speedPct: 0 },
    { grade: 4, correct: true, elapsedMs: 800, points: 20, speedPct: 100 }
  ];
  const s = Scoring.sessionSummary(entries);
  assertEqual(s.answers, 3);
  assertEqual(s.correct, 2);
  assertClose(s.accuracy, 200 / 3, 0.01);
  assertEqual(s.points, 38);
  assertEqual(s.byGrade[1], 1);
  assertEqual(s.byGrade[3], 1);
  assertEqual(s.byGrade[4], 1);
});

check('scoring: an empty session does not divide by zero', () => {
  const s = Scoring.sessionSummary([]);
  assertEqual(s.answers, 0);
  assertEqual(s.accuracy, 0);
  assertEqual(s.efficiency, 0);
  assert(isFinite(s.efficiency));
});

check('scoring: efficiency is 100 at the reference pace', () => {
  // One minute of work earning exactly the reference number of points.
  const entries = [];
  for (let i = 0; i < 30; i++) {
    entries.push({ grade: 3, correct: true, elapsedMs: 2000, points: 3, speedPct: 100 });
  }
  const s = Scoring.sessionSummary(entries);
  assertClose(s.efficiency, 100, 0.001);
});

check('scoring: levels increase monotonically with xp', () => {
  let prev = 0;
  for (const xp of [0, 50, 100, 300, 600, 1000, 5000]) {
    const l = Scoring.levelForXp(xp).level;
    assert(l >= prev, `level went backwards at xp=${xp}`);
    prev = l;
  }
  assertEqual(Scoring.levelForXp(0).level, 1);
});

check('scoring: streak increments on consecutive days and resets after a gap', () => {
  const key = (ts) => {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const d1 = new Date(2026, 0, 10, 12, 0, 0).getTime();
  const d2 = new Date(2026, 0, 11, 12, 0, 0).getTime();
  const d3 = new Date(2026, 0, 12, 12, 0, 0).getTime();
  const d9 = new Date(2026, 0, 20, 12, 0, 0).getTime();

  let s = Scoring.updateStreak(null, d1, key);
  assertEqual(s.count, 1);
  s = Scoring.updateStreak(s, d1, key);   // same day again
  assertEqual(s.count, 1);
  s = Scoring.updateStreak(s, d2, key);
  assertEqual(s.count, 2);
  s = Scoring.updateStreak(s, d3, key);
  assertEqual(s.count, 3);
  s = Scoring.updateStreak(s, d9, key);   // gap
  assertEqual(s.count, 1);
});

/* ================================================================== *
 * Card-state packing
 * ================================================================== */

check('state: a new card decodes to the New state with zero stability', () => {
  const now = Date.now();
  const st = State.emptyCardState(now);
  assertEqual(st.state, FSRS.State.New);
  assertEqual(st.stability, 0);
  assertEqual(st.difficulty, 0);
  assertEqual(typeof st.due, 'number');
});

check('state: encode/decode round-trips a card', () => {
  const card = {
    stability: 12.3456789, difficulty: 5.4321, due: 1700000000000,
    scheduled_days: 14, reps: 7, lapses: 2, learning_steps: 0,
    state: FSRS.State.Review, last_review: 1699900000000
  };
  const back = State.decodeCard(State.encodeCard(card), Date.now());
  assertClose(back.stability, 12.3457, 0.0001);
  assertClose(back.difficulty, 5.4321, 0.0001);
  assertEqual(back.due, card.due);
  assertEqual(back.scheduled_days, 14);
  assertEqual(back.reps, 7);
  assertEqual(back.lapses, 2);
  assertEqual(back.state, FSRS.State.Review);
  assertEqual(back.last_review, card.last_review);
});

check('state: encoding never emits NaN or null', () => {
  const packed = State.encodeCard({
    stability: NaN, difficulty: Infinity, due: 0,
    scheduled_days: NaN, reps: 0, lapses: 0,
    learning_steps: 0, state: FSRS.State.New, last_review: null
  });
  for (const v of packed) {
    assert(typeof v === 'number', 'packed value is not a number');
    assert(isFinite(v), 'packed value is not finite');
  }
});

check('state: decoding a missing card yields the New state', () => {
  const st = State.decodeCard(undefined, Date.now());
  assertEqual(st.state, FSRS.State.New);
  assertEqual(st.stability, 0);
});

/* ================================================================== *
 * Deck definitions
 * ================================================================== */

check('decks: the multiplication deck covers the full table', () => {
  const cards = Decks.cards('tablica-mnozenje');
  assertEqual(cards.length, 100);
  const keys = new Set(cards.map(c => c.id));
  assertEqual(keys.size, 100, 'duplicate card ids');
  // Every product 1..10 x 1..10 is present and correct.
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      const card = cards.find(c => c.front === a + ' × ' + b);
      assert(card, 'missing fact ' + a + ' x ' + b);
      assertEqual(card.back, String(a * b));
    }
  }
});

check('decks: division cards are the inverse of multiplication', () => {
  const cards = Decks.cards('tablica-deljenje');
  assertEqual(cards.length, 100);
  for (const c of cards.slice(0, 20)) {
    const m = c.front.match(/^(\d+) ÷ (\d+)$/);
    assert(m, 'unparseable division front: ' + c.front);
    assertEqual(String(Number(m[1]) / Number(m[2])), c.back);
  }
});

check('decks: every deck id is unique and resolvable', () => {
  const ids = Decks.all.map(d => d.id);
  assertEqual(new Set(ids).size, ids.length);
  for (const id of ids) assert(Decks.get(id), 'deck not resolvable: ' + id);
});

/* ================================================================== *
 * Scheduling integration (our FSRS + our state layer)
 *
 * These use a real deck id, because the queue builder resolves decks through
 * the registry. Each test resets the deck afterwards so they stay isolated.
 * ================================================================== */

const TEST_DECK = 'tablica-mnozenje';

check('integration: grading a new card produces a finite, sane schedule', () => {
  const card = Decks.cards(TEST_DECK)[0];
  const res = State.grade({
    deckId: TEST_DECK, card, grade: 3, correct: true, elapsedMs: 1500, combo: 0
  });
  assert(isFinite(res.next.stability) && res.next.stability > 0, 'stability not finite/positive');
  assert(isFinite(res.next.difficulty) && res.next.difficulty >= 1 && res.next.difficulty <= 10,
    'difficulty out of range');
  assert(res.next.due > Date.now(), 'due date not in the future');
  assert(res.points > 0, 'no points awarded');
  State.resetDeck(TEST_DECK);
});

check('integration: the first review of a new card counts against the daily allowance', () => {
  const cards = Decks.cards(TEST_DECK);
  for (let i = 0; i < 3; i++) {
    State.grade({ deckId: TEST_DECK, card: cards[i], grade: 3, correct: true, elapsedMs: 1200, combo: 0 });
  }
  const ds = State.deckState(TEST_DECK);
  assertEqual(ds.newToday.count, 3, 'new-card counter did not advance');
  const built = State.buildQueue(TEST_DECK);
  assertEqual(built.counts.newAllowed, 20 - 3, 'allowance did not shrink');
  State.resetDeck(TEST_DECK);
});

check('integration: an undo restores the exact prior state', () => {
  const card = Decks.cards(TEST_DECK)[5];

  const before = State.deckSummary(TEST_DECK);
  const xpBefore = State.raw.global.xp;

  const res = State.grade({ deckId: TEST_DECK, card, grade: 3, correct: true, elapsedMs: 1000, combo: 0 });
  const after = State.deckSummary(TEST_DECK);
  assertEqual(after.reviews, before.reviews + 1);
  assertEqual(after.points, before.points + res.points);

  State.undo(TEST_DECK, res.snapshot);

  const restored = State.deckSummary(TEST_DECK);
  assertEqual(restored.reviews, before.reviews, 'reviews not restored');
  assertEqual(restored.points, before.points, 'points not restored');
  assertEqual(restored.correct, before.correct, 'correct count not restored');
  assertEqual(State.raw.global.xp, xpBefore, 'xp not restored');
  assertEqual(restored.lapses, before.lapses, 'lapses not restored');
  State.resetDeck(TEST_DECK);
});

check('integration: an undo restores the streak as well', () => {
  const card = Decks.cards(TEST_DECK)[6];

  // Force the streak to a known value so the assertion is about the undo,
  // not about whether today happens to be a new day.
  State.raw.global.streak = { count: 4, lastDay: null };
  const streakBefore = JSON.stringify(State.raw.global.streak);

  const res = State.grade({ deckId: TEST_DECK, card, grade: 3, correct: true, elapsedMs: 1000, combo: 0 });
  assert(State.raw.global.streak.count !== 4, 'the streak did not change, nothing to undo');

  State.undo(TEST_DECK, res.snapshot);

  assertEqual(JSON.stringify(State.raw.global.streak), streakBefore, 'streak not restored');
  State.raw.global.streak = { count: 0, lastDay: null };
  State.resetDeck(TEST_DECK);
});

check('integration: an undo restores the daily new-card allowance', () => {
  const card = Decks.cards(TEST_DECK)[8];

  const before = State.deckState(TEST_DECK).newToday.count;
  const res = State.grade({ deckId: TEST_DECK, card, grade: 3, correct: true, elapsedMs: 900, combo: 0 });
  assertEqual(State.deckState(TEST_DECK).newToday.count, before + 1, 'allowance did not advance');

  State.undo(TEST_DECK, res.snapshot);
  assertEqual(State.deckState(TEST_DECK).newToday.count, before, 'allowance not restored');
  State.resetDeck(TEST_DECK);
});

check('map: the multiplication map puts each product at factor × factor', () => {
  const cells = State.deckMap('tablica-mnozenje').cells;

  // Row 7 (index 6), column 8 (index 7) -> 7 × 8 = 56.
  assertEqual(cells[6][7].answer, '56', 'wrong product at 7 × 8');
  assertEqual(cells[6][7].label, '7 × 8', 'wrong label at 7 × 8');
  assertEqual(cells[0][0].answer, '1', 'wrong product at 1 × 1');
  assertEqual(cells[9][9].answer, '100', 'wrong product at 10 × 10');
});

check('map: the division map mirrors the axes and holds the dividend', () => {
  const cells = State.deckMap('tablica-deljenje').cells;

  // Row is the divisor, column is the quotient: 9 × 8 = 72 -> 72 ÷ 9 = 8.
  assertEqual(cells[8][7].answer, '72', 'wrong dividend at divisor 9, quotient 8');
  assertEqual(cells[8][7].label, '72 ÷ 9', 'wrong label at divisor 9, quotient 8');
  assertEqual(cells[8][7].tip, '72 ÷ 9 = 8', 'wrong tooltip');
  assertEqual(cells[0][0].answer, '1', 'wrong dividend at divisor 1, quotient 1');
  assertEqual(cells[9][9].answer, '100', 'wrong dividend at divisor 10, quotient 10');
});

check('map: a division map is never empty and never shows multiplication labels', () => {
  const cells = State.deckMap('tablica-deljenje').cells;
  let allFilled = true;
  let noMultLabels = true;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if (!cells[r] || !cells[r][c]) allFilled = false;
      else if (cells[r][c].label.indexOf('×') !== -1) noMultLabels = false;
    }
  }
  assert(allFilled, 'the division map has gaps');
  assert(noMultLabels, 'the division map contains multiplication labels');
});

check('integration: a lapsed review card is recorded as a lapse', () => {
  const card = Decks.cards(TEST_DECK)[7];

  // Take the card to the review state first: a brand-new card that is
  // forgotten is not a "lapse", it is simply still being learned.
  const first = State.grade({ deckId: TEST_DECK, card, grade: 4, correct: true, elapsedMs: 800, combo: 0 });
  const st = State.cardState(TEST_DECK, card.id);
  assertEqual(st.state, FSRS.State.Review, 'card did not reach the review state');
  assertEqual(first.next.lapses, 0, 'a new card should not count as a lapse');

  // Now forget it.
  const lapse = State.grade({ deckId: TEST_DECK, card, grade: 1, correct: false, elapsedMs: 5000, combo: 0 });
  assert(lapse.next.lapses >= 1, 'lapse not recorded on the card');
  assertEqual(State.deckSummary(TEST_DECK).lapses, 1, 'lapse not counted in the summary');
  State.resetDeck(TEST_DECK);
});

check('integration: the queue contains no duplicates', () => {
  const cards = Decks.cards(TEST_DECK);
  for (let i = 0; i < 5; i++) {
    State.grade({ deckId: TEST_DECK, card: cards[i], grade: 3, correct: true, elapsedMs: 1000, combo: 0 });
  }
  const built = State.buildQueue(TEST_DECK);
  assertEqual(new Set(built.queue.map(c => c.id)).size, built.queue.length, 'duplicate cards queued');
  State.resetDeck(TEST_DECK);
});

check('integration: the daily allowance caps how many new cards are queued', () => {
  const prev = State.settings().newPerDay;
  State.settings().newPerDay = 5;
  const built = State.buildQueue(TEST_DECK);
  assertEqual(built.queue.length, 5, 'queue not capped by the daily allowance');
  assertEqual(built.counts.newAllowed, 5);
  State.settings().newPerDay = prev;
  State.resetDeck(TEST_DECK);
});

check('integration: preview returns a label for every grade', () => {
  const card = Decks.cards(TEST_DECK)[0];
  const p = State.preview(TEST_DECK, card, Date.now());
  for (const g of [1, 2, 3, 4]) {
    assert(p[g], 'missing preview for grade ' + g);
    assert(typeof p[g].label === 'string' && p[g].label.length > 0, 'missing label for grade ' + g);
    assert(isFinite(p[g].card.stability), 'non-finite stability in preview');
  }
});

check('integration: a full session over the deck leaves no NaN in storage', () => {
  const cards = Decks.cards(TEST_DECK);
  for (let i = 0; i < 12; i++) {
    State.grade({
      deckId: TEST_DECK, card: cards[i], grade: (i % 4) + 1,
      correct: i % 4 !== 0, elapsedMs: 900 + i * 120, combo: i % 3
    });
  }
  const d = State.deckState(TEST_DECK);
  for (const [id, packed] of Object.entries(d.cards)) {
    for (const v of packed) {
      assert(typeof v === 'number' && isFinite(v), 'non-finite value stored for ' + id);
    }
  }
  const summary = State.deckSummary(TEST_DECK);
  assert(isFinite(summary.efficiency), 'efficiency is not finite');
  assert(isFinite(summary.accuracy), 'accuracy is not finite');
  assert(summary.reviews === 12, 'review count wrong');
  State.resetDeck(TEST_DECK);
});

/* ================================================================== *
 * Randomisation
 * ================================================================== */

/** Deterministic PRNG so the shuffle tests are reproducible. */
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

check('random: shuffle keeps every element and changes the order', () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const out = State.shuffle(input, seeded(1));
  assertEqual(out.length, 50, 'length changed');
  assertEqual(new Set(out).size, 50, 'elements lost or duplicated');
  assert(input.every((v, i) => v === i), 'input array was mutated');
  assert(out.some((v, i) => v !== input[i]), 'order did not change');
});

check('random: shuffle is reproducible with the same seed', () => {
  const input = Array.from({ length: 30 }, (_, i) => i);
  assertEqual(
    State.shuffle(input, seeded(42)).join(','),
    State.shuffle(input, seeded(42)).join(','),
    'same seed gave different results'
  );
});

check('random: different seeds give different orders', () => {
  const input = Array.from({ length: 30 }, (_, i) => i);
  assert(
    State.shuffle(input, seeded(1)).join(',') !== State.shuffle(input, seeded(2)).join(','),
    'different seeds gave the same order'
  );
});

check('random: sample picks distinct elements from the whole pool', () => {
  const pool = Array.from({ length: 100 }, (_, i) => i);
  const picked = State.sample(pool, 20, seeded(7));
  assertEqual(picked.length, 20);
  assertEqual(new Set(picked).size, 20, 'sample contained duplicates');
  for (const v of picked) assert(v >= 0 && v < 100, 'sample element out of range');
});

check('random: sample never returns more than the pool holds', () => {
  const pool = [1, 2, 3];
  assertEqual(State.sample(pool, 10, seeded(3)).length, 3);
});

check('random: the queue does not start from the top of the table', () => {
  // The whole point: new cards must be drawn from the entire unseen pool,
  // not taken as the first N in deck order (which would be 1x1, 1x2, 1x3...).
  State.settings().randomOrder = true;
  const cards = Decks.cards(TEST_DECK);
  const firstIds = new Set(cards.slice(0, 5).map(c => c.id));

  let sawDeeperCard = false;
  for (let seed = 1; seed <= 40 && !sawDeeperCard; seed++) {
    const built = State.buildQueue(TEST_DECK, Date.now(), seeded(seed));
    // Look at the new cards that were selected.
    const fresh = built.queue.filter(c => firstIds.has(c.id));
    // If every draw consisted only of the first five cards, the learner
    // would never leave the top of the table.
    if (built.queue.some(c => !firstIds.has(c.id))) sawDeeperCard = true;
  }
  assert(sawDeeperCard, 'every queue contained only the first cards of the deck');
  State.resetDeck(TEST_DECK);
});

check('random: repeated builds produce different card selections', () => {
  State.settings().randomOrder = true;
  const sigs = new Set();
  for (let seed = 1; seed <= 25; seed++) {
    const built = State.buildQueue(TEST_DECK, Date.now(), seeded(seed));
    sigs.add(built.queue.map(c => c.id).join(','));
  }
  assert(sigs.size > 15, `expected varied queues, got ${sigs.size} distinct orders out of 25`);
  State.resetDeck(TEST_DECK);
});

check('random: randomOrder off restores deck order', () => {
  State.settings().randomOrder = false;
  const built = State.buildQueue(TEST_DECK, Date.now(), seeded(5));
  const cards = Decks.cards(TEST_DECK);
  const expected = cards.slice(0, built.queue.length).map(c => c.id);
  assertEqual(built.queue.map(c => c.id).join(','), expected.join(','), 'not deck order');
  State.settings().randomOrder = true;
  State.resetDeck(TEST_DECK);
});

check('random: the queue still contains no duplicates when randomised', () => {
  State.settings().randomOrder = true;
  const cards = Decks.cards(TEST_DECK);
  for (let i = 0; i < 8; i++) {
    State.grade({ deckId: TEST_DECK, card: cards[i], grade: 3, correct: true, elapsedMs: 1000, combo: 0 });
  }
  for (let seed = 1; seed <= 20; seed++) {
    const built = State.buildQueue(TEST_DECK, Date.now(), seeded(seed));
    assertEqual(new Set(built.queue.map(c => c.id)).size, built.queue.length, 'duplicate cards queued');
  }
  State.resetDeck(TEST_DECK);
});

check('random: the daily allowance still caps the queue when randomised', () => {
  const prev = State.settings().newPerDay;
  State.settings().newPerDay = 7;
  State.settings().randomOrder = true;
  const built = State.buildQueue(TEST_DECK, Date.now(), seeded(9));
  assertEqual(built.queue.length, 7, 'queue not capped by the daily allowance');
  assertEqual(built.counts.newAllowed, 7);
  State.settings().newPerDay = prev;
  State.resetDeck(TEST_DECK);
});

check('random: learning cards still come first', () => {
  State.settings().randomOrder = true;
  const cards = Decks.cards(TEST_DECK);
  // Grade one card as "Again" so it enters a learning step and comes due
  // within minutes.
  State.grade({ deckId: TEST_DECK, card: cards[0], grade: 1, correct: false, elapsedMs: 4000, combo: 0 });
  const built = State.buildQueue(TEST_DECK, Date.now() + 120000, seeded(11));
  assert(built.counts.learning >= 1, 'no learning card found');
  // It must be the first card served, or it would be lost for the session.
  assertEqual(built.queue[0].id, cards[0].id, 'learning card was not served first');
  State.resetDeck(TEST_DECK);
});

/* ================================================================== *
 * A different subject
 *
 * The point of these tests: nothing in the engine may assume the subject
 * is arithmetic. Here a deck of Serbian words is registered at runtime and
 * driven through the whole engine — queue, grading, scoring, statistics,
 * undo, map — with no change to any shared module.
 * ================================================================== */

/** A deck of Serbian words: text answers, a different map, its own par. */
const WORDS_DECK = {
  id: 'test-words',
  name: 'Reči',
  subtitle: 'srpski jezik',
  description: 'Test paket.',
  inputMode: 'text',
  build() {
    return [
      { id: 'w:1', front: 'reka', back: 'reč' },
      { id: 'w:2', front: 'misao', back: 'misal' },
      { id: 'w:3', front: 'zima', back: 'zima' }
    ];
  },
  tag(card) { return 'reč'; },
  question(card) { return 'Kako se piše: ' + card.front + '?'; },
  parMs() { return 5000; }
};

// Registered through the public API, exactly as a deck in another file
// would be.
Decks.register(WORDS_DECK);

check('deck contract: a new subject registers and builds cards', () => {
  const cards = Decks.cards('test-words');
  assertEqual(cards.length, 3, 'wrong card count');
  assertEqual(cards[0].front, 'reka');
  assertEqual(cards[0].back, 'reč');
});

check('deck contract: the engine validates every deck', () => {
  const problems = Decks.validate();
  assert(Array.isArray(problems), 'validate() did not return a list');
  assertEqual(problems.length, 0, 'problems found: ' + problems.join('; '));
});

check('deck contract: the deck supplies the question and the tag', () => {
  const card = Decks.cards('test-words')[0];
  assertEqual(Decks.questionFor('test-words', card), 'Kako se piše: reka?');
  assertEqual(Decks.tagFor('test-words', card), 'reč');
  // The multiplication decks keep their own wording.
  const mult = Decks.cards('tablica-mnozenje')[0];
  assertEqual(Decks.tagFor('tablica-mnozenje', mult), 'množenje');
  assertEqual(Decks.questionFor('tablica-mnozenje', mult), mult.front + ' =');
});

check('deck contract: the deck supplies the par time', () => {
  const card = Decks.cards('test-words')[0];
  assertEqual(Decks.parMsFor('test-words', card), 5000);
  // The multiplication deck keeps its own content-based estimate.
  const mult = Decks.cards('tablica-mnozenje').find((c) => c.a === 7 && c.b === 8);
  assertEqual(Decks.parMsFor('tablica-mnozenje', mult), 4200);
  const div = Decks.cards('tablica-deljenje')[0];
  assertEqual(Decks.parMsFor('tablica-deljenje', div), 4600);
});

check('deck contract: a text answer is matched, and case does not matter', () => {
  const card = Decks.cards('test-words')[0];
  assert(Decks.matches('test-words', 'reč', card), 'exact answer rejected');
  assert(Decks.matches('test-words', 'REČ', card), 'case-sensitive match');
  assert(Decks.matches('test-words', '  reč  ', card), 'whitespace not trimmed');
  assert(!Decks.matches('test-words', 'druga', card), 'wrong answer accepted');
  assert(!Decks.matches('test-words', '', card), 'empty answer accepted');
});

check('deck contract: numeric answers still match numerically', () => {
  const card = Decks.cards('tablica-mnozenje').find((c) => c.a === 7 && c.b === 8);
  assert(Decks.matches('tablica-mnozenje', '56', card), 'exact number rejected');
  assert(Decks.matches('tablica-mnozenje', ' 56 ', card), 'untrimmed number rejected');
  assert(Decks.matches('tablica-mnozenje', '56.0', card), 'decimal form rejected');
  assert(!Decks.matches('tablica-mnozenje', '65', card), 'wrong product accepted');
});

check('deck contract: the par time reaches the scorer through the deck', () => {
  const card = Decks.cards('test-words')[0];
  const par = State.parFor('test-words', card);
  assert(isFinite(par) && par > 0, 'par not finite');
  // No personal best yet, so the deck's estimate is the target.
  assertClose(par, 5000, 1);
});

check('engine: a non-arithmetic deck queues, grades and scores', () => {
  const card = Decks.cards('test-words')[0];
  const res = State.grade({
    deckId: 'test-words', card, grade: 3, correct: true, elapsedMs: 2500, combo: 0
  });
  assert(res.points > 0, 'no points awarded');
  assert(isFinite(res.next.stability) && res.next.stability > 0, 'stability not finite');
  assertEqual(State.deckSummary('test-words').reviews, 1);
  assertEqual(State.deckSummary('test-words').correct, 1);
  State.resetDeck('test-words');
});

check('engine: undo works the same for a non-arithmetic deck', () => {
  const card = Decks.cards('test-words')[1];
  const before = State.deckSummary('test-words');
  const xpBefore = State.raw.global.xp;

  const res = State.grade({
    deckId: 'test-words', card, grade: 3, correct: true, elapsedMs: 2000, combo: 0
  });
  State.undo('test-words', res.snapshot);

  const after = State.deckSummary('test-words');
  assertEqual(after.reviews, before.reviews, 'reviews not restored');
  assertEqual(after.points, before.points, 'points not restored');
  assertEqual(State.raw.global.xp, xpBefore, 'xp not restored');
  State.resetDeck('test-words');
});

check('engine: the queue and the allowance work for any deck', () => {
  const built = State.buildQueue('test-words');
  assertEqual(built.counts.new, 3, 'wrong number of new cards');
  assertEqual(new Set(built.queue.map((c) => c.id)).size, built.queue.length, 'duplicates');
  State.resetDeck('test-words');
});

check('map: a deck without its own map still gets a usable grid', () => {
  const spec = State.deckMap('test-words');
  assert(spec, 'no map produced');
  assert(spec.cells.length >= 1, 'map has no rows');
  assertEqual(spec.cells.flat().filter(Boolean).length, 3, 'map does not hold every card');
  // Every cell carries a tone, so the renderer can always colour it.
  for (const cell of spec.cells.flat()) {
    if (!cell) continue;
    assert(typeof cell.tone === 'string' && cell.tone.length > 0, 'cell without a tone');
  }
});

check('map: the multiplication deck keeps its ten-by-ten shape', () => {
  const spec = State.deckMap('tablica-mnozenje');
  assertEqual(spec.rows, 10);
  assertEqual(spec.cols, 10);
  assertEqual(spec.cells.length, 10);
  assertEqual(spec.cells[0].length, 10);
  assertEqual(spec.title, 'Mapa množenja');
  assertEqual(spec.label, 'svaka ćelija je jedan proizvod');
});

check('map: the division deck keeps its own heading and labels', () => {
  const spec = State.deckMap('tablica-deljenje');
  assertEqual(spec.title, 'Mapa deljenja');
  assertEqual(spec.label, 'svaka ćelija je jedan deljivi broj');
  // The combined deck shows the multiplication map.
  assertEqual(State.deckMap('tablica').title, 'Mapa množenja');
});

check('map: the progress of a card shows up in the map', () => {
  const card = Decks.cards('tablica-mnozenje').find((c) => c.a === 3 && c.b === 3);
  State.grade({
    deckId: 'tablica-mnozenje', card, grade: 3, correct: true, elapsedMs: 1200, combo: 0
  });
  const spec = State.deckMap('tablica-mnozenje');
  const cell = spec.cells[2][2];
  assertEqual(cell.tone, 'learning', 'wrong tone');
  assertEqual(cell.attempts, 1, 'attempts not counted');
  assertEqual(cell.correct, 1, 'correct count wrong');
  assertClose(cell.accuracy, 100, 0.01);
  assert(cell.bestMs > 0, 'best time not recorded');
  State.resetDeck('tablica-mnozenje');
});

check('engine: the overview counts decks by their cards, not by hard-coded numbers', () => {
  // Counted from the decks themselves: a card shared by two decks counts
  // once, so the total is the number of distinct cards.
  const distinct = new Set();
  for (const deck of Decks.all) {
    for (const card of Decks.cards(deck.id)) distinct.add(card.id);
  }
  assertEqual(State.uniqueCardCount(), distinct.size, 'wrong unique card count');
});

/* ================================================================== *
 * The guitar chord deck
 *
 * These tests are the guarantee that every chord in the deck is a real
 * chord: the shapes are played back on a fretboard and checked against the
 * chord's own intervals, and the open shapes are compared with the ones
 * printed on every chord chart.
 * ================================================================== */

const CHORD_DECK = 'akordi';

/** Standard tuning, low E -> high e, as pitch classes (C = 0). */
const TUNING = [4, 9, 2, 7, 11, 4];

/** The notes a fingering actually sounds. */
function chordNotes(frets) {
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    if (frets[i] === null) continue;
    seen.add((TUNING[i] + frets[i]) % 12);
  }
  return seen;
}

/** The pitch class of a root note name. */
const ROOT_PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/**
 * The intervals that make each family, above the root.
 *
 * "required" is what makes the chord; "allowed" also permits the fifth,
 * which real chord charts drop in the four-note families (the standard C7,
 * x32310, has no G at all).
 */
const FAMILY_INTERVALS = {
  '':     { required: [0, 4, 7],      allowed: [0, 4, 7] },
  m:     { required: [0, 3, 7],      allowed: [0, 3, 7] },
  7:     { required: [0, 4, 10],     allowed: [0, 4, 7, 10] },
  m7:    { required: [0, 3, 10],     allowed: [0, 3, 7, 10] },
  maj7:  { required: [0, 4, 11],     allowed: [0, 4, 7, 11] },
  sus2:  { required: [0, 2, 7],      allowed: [0, 2, 7] },
  sus4:  { required: [0, 5, 7],      allowed: [0, 5, 7] },
  dim:   { required: [0, 3, 6],      allowed: [0, 3, 6] },
  dim7:  { required: [0, 3, 6, 9],   allowed: [0, 3, 6, 9] },
  m7b5:  { required: [0, 3, 6, 10],  allowed: [0, 3, 6, 10] },
  aug:   { required: [0, 4, 8],      allowed: [0, 4, 8] },
  6:     { required: [0, 4, 9],      allowed: [0, 4, 7, 9] },
  m6:    { required: [0, 3, 9],      allowed: [0, 3, 7, 9] },
  9:     { required: [0, 4, 10, 14], allowed: [0, 4, 7, 10, 14] },
  m9:    { required: [0, 3, 10, 14], allowed: [0, 3, 7, 10, 14] },
  add9:  { required: [0, 4, 14],     allowed: [0, 4, 7, 14] },
  13:    { required: [0, 4, 10, 9],  allowed: [0, 4, 7, 10, 9] },
  5:     { required: [0, 7],         allowed: [0, 7] }
};

/** Split a chord symbol into its root and its family. */
function splitChord(symbol) {
  for (const root of Object.keys(ROOT_PC)) {
    if (symbol.indexOf(root) !== 0) continue;
    const suffix = symbol.slice(root.length);
    if (FAMILY_INTERVALS[suffix] !== undefined) return { root, family: suffix };
  }
  return { root: symbol, family: '' };
}

check('chords: the deck registers and holds every chord', () => {
  const deck = Decks.get(CHORD_DECK);
  assert(deck, 'the chord deck is missing');
  const cards = Decks.cards(CHORD_DECK);
  assert(cards.length > 200, `only ${cards.length} chords`);
  assertEqual(new Set(cards.map(c => c.id)).size, cards.length, 'duplicate chord ids');
});

check('chords: every deck passes validation', () => {
  const problems = Decks.validate();
  assertEqual(problems.length, 0, 'problems: ' + problems.join('; '));
});

check('chords: every shape sounds exactly its chord', () => {
  const cards = Decks.cards(CHORD_DECK);
  let checked = 0;
  for (const card of cards) {
    const { root, family } = splitChord(card.symbol);
    const intervals = FAMILY_INTERVALS[family];
    assert(intervals !== undefined, `unknown family in ${card.symbol}`);

    const rootPc = ROOT_PC[root];
    const notes = chordNotes(card.frets);

    // Every note of the shape must belong to the chord.
    const allowed = intervals.allowed.map(i => (rootPc + i) % 12);
    for (const n of notes) {
      assert(
        allowed.includes(n),
        `${card.symbol} sounds a note outside the chord (${n})`
      );
    }

    // The root must be in the bass, or the chord is not that chord.
    const bass = card.frets.findIndex(f => f !== null);
    assert(bass !== -1, `${card.symbol} has no played string`);
    const bassPc = (TUNING[bass] + card.frets[bass]) % 12;
    assertEqual(bassPc, rootPc, `${card.symbol} does not have its root in the bass`);

    // The chord's own notes must all be there.
    const required = intervals.required.map(i => (rootPc + i) % 12);
    for (const n of required) {
      assert(notes.has(n), `${card.symbol} is missing a note of the chord`);
    }

    checked++;
  }
  assert(checked > 200, `only ${checked} chords checked`);
});

check('chords: every shape is comfortably playable', () => {
  for (const card of Decks.cards(CHORD_DECK)) {
    const played = card.frets.filter(f => f !== null);
    assert(played.length >= 2, `${card.symbol} plays fewer than two strings`);
    const lo = Math.min(...played);
    const hi = Math.max(...played);
    assert(hi - lo <= 4, `${card.symbol} stretches further than four frets`);
    assert(hi <= 15, `${card.symbol} goes past the 15th fret`);
  }
});

check('chords: the open shapes are the ones on every chord chart', () => {
  // The shapes a guitarist learns first, written as they appear in print.
  const known = {
    C: [null, 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3],
    D: [null, null, 0, 2, 3, 2], A: [null, 0, 2, 2, 2, 0],
    E: [0, 2, 2, 1, 0, 0], F: [1, 3, 3, 2, 1, 1],
    Am: [null, 0, 2, 2, 1, 0], Em: [0, 2, 2, 0, 0, 0],
    Dm: [null, null, 0, 2, 3, 1], Bm: [null, 2, 4, 4, 3, 2],
    Fm: [1, 3, 3, 1, 1, 1], C7: [null, 3, 2, 3, 1, 0],
    G7: [3, 2, 0, 0, 0, 1], D7: [null, null, 0, 2, 1, 2],
    A7: [null, 0, 2, 0, 2, 0], E7: [0, 2, 0, 1, 0, 0],
    B7: [null, 2, 1, 2, 0, 2], F7: [1, 3, 1, 2, 1, 1],
    Am7: [null, 0, 2, 0, 1, 0], Em7: [0, 2, 0, 0, 0, 0],
    Dm7: [null, null, 0, 2, 1, 1], Bm7: [null, 2, 4, 2, 3, 2],
    Cmaj7: [null, 3, 2, 0, 0, 0], Amaj7: [null, 0, 2, 1, 2, 0],
    Emaj7: [0, 2, 1, 1, 0, 0], Dmaj7: [null, null, 0, 2, 2, 2]
  };
  const cards = Decks.cards(CHORD_DECK);
  for (const [symbol, shape] of Object.entries(known)) {
    const card = cards.find(c => c.symbol === symbol);
    assert(card, `${symbol} is not in the deck`);
    assertEqual(
      card.frets.join(','), shape.join(','),
      `${symbol} has the wrong shape`
    );
  }
});

check('chords: the deck is taught from the easy to the hard', () => {
  const cards = Decks.cards(CHORD_DECK);

  // The first eight are the chords every beginner is given first, in
  // the order the guitar methods teach them: the two simplest, then
  // the three that carry the most songs, then their siblings.
  const first = cards.slice(0, 8).map(c => c.symbol);
  assertEqual(first.join(' '), 'Em Am C G D A E Dm', 'wrong teaching order');

  // Then the two hardest of the classic ten, which every method saves
  // for last of the open shapes.
  const next = cards.slice(8, 10).map(c => c.symbol);
  assertEqual(next.join(' '), 'F Bm', 'wrong second group');

  // Then the dominant sevenths — the sound of blues and of most songs
  // with a guitar in them.
  const sevens = cards.slice(10, 16).map(c => c.symbol);
  assertEqual(sevens.join(' '), 'E7 A7 D7 G7 C7 B7', 'wrong dominant sevenths');

  // And then the minor sevenths.
  const minorSevens = cards.slice(16, 20).map(c => c.symbol);
  assertEqual(minorSevens.join(' '), 'Em7 Am7 Dm7 Bm7', 'wrong minor sevenths');

  // The open shapes a beginner holds: everything in the first
  // eighteen except F and Bm, which in this deck are the barre shapes
  // — which is exactly why every method saves them for last.
  for (const c of cards.slice(0, 18)) {
    if (c.symbol === 'F' || c.symbol === 'Bm') continue;
    assert(c.frets.includes(0), `${c.symbol} is not an open shape`);
  }
  assert(!cards[8].frets.includes(0), 'F is not a barre shape');
  assert(!cards[9].frets.includes(0), 'Bm is not a barre shape');

  // The ranking never goes backwards.
  const rank = c => {
    const i = cards.indexOf(c);
    return i;
  };
  for (let i = 1; i < cards.length; i++) {
    assert(rank(cards[i]) > rank(cards[i - 1]), 'the order is not stable');
  }
});

check('chords: the beginner chords come before the exotic ones', () => {
  const cards = Decks.cards(CHORD_DECK);
  const index = sym => cards.findIndex(c => c.symbol === sym);

  // A barre chord of an unusual root must not come before the open
  // chords a beginner actually meets.
  const exotic = ['Cdim', 'A#dim7', 'Eaug', 'D#13', 'A#m9'];
  for (const sym of exotic) {
    assert(index(sym) > index('Em7'), `${sym} comes before the minor sevenths`);
  }

  // And the open sevenths come before the barre sevenths.
  assert(index('E7') < index('F7'), 'a barre seventh comes before an open one');
  assert(index('Em7') < index('Bm7'), 'a barre minor seventh comes first');

  // The last chords are the exotic ones.
  const last = cards[cards.length - 1];
  assert(['dim', 'dim7', 'm7b5', 'aug', '9', 'm9', 'add9', '13'].includes(last.family),
    `the last chord is ${last.symbol}, which is not an exotic family`);
});

check('chords: a beginner meets only a few new chords a day', () => {
  // The global setting is twenty new cards a day. For chords that is far
  // too many: each shape takes days to learn cleanly. The deck caps it.
  assert(Decks.newPerDayLimit(CHORD_DECK) > 0, 'the chord deck has no daily limit');
  assert(Decks.newPerDayLimit(CHORD_DECK) < 20, 'the chord limit is not lower than the global one');

  const built = State.buildQueue(CHORD_DECK);
  assertEqual(built.counts.newAllowed, Decks.newPerDayLimit(CHORD_DECK),
    'the queue does not respect the deck limit');

  // The cap can only lower the global setting, never raise it.
  const before = State.settings().newPerDay;
  const s = State.raw.global.settings;

  s.newPerDay = 2;
  const small = State.buildQueue(CHORD_DECK);
  assertEqual(small.counts.newAllowed, 2, 'a smaller global setting was ignored');

  s.newPerDay = 50;
  const big = State.buildQueue(CHORD_DECK);
  assertEqual(big.counts.newAllowed, Decks.newPerDayLimit(CHORD_DECK),
    'the deck limit did not hold against a bigger global setting');

  s.newPerDay = before;

  // The tables keep the global setting — they have no opinion of their own.
  assertEqual(Decks.newPerDayLimit('tablica-mnozenje'), 0, 'the table deck has a limit');
  const table = State.buildQueue('tablica-mnozenje');
  assertEqual(table.counts.newAllowed, Math.min(20, before),
    'the table deck does not follow the global setting');
  State.resetDeck(CHORD_DECK);
});

check('chords: the deck is ordered, so the easy ones come first', () => {
  assert(Decks.isOrdered(CHORD_DECK), 'the chord deck is not marked ordered');
  // The multiplication decks keep their random order.
  assert(!Decks.isOrdered('tablica-mnozenje'), 'the table deck became ordered');
});

check('chords: an ordered deck hands out its cards in deck order', () => {
  const cards = Decks.cards(CHORD_DECK);
  const built = State.buildQueue(CHORD_DECK);
  // The first new cards must be the first cards of the deck.
  const expected = cards.slice(0, built.counts.newAllowed).map(c => c.id);
  const got = built.queue.filter(c => expected.includes(c.id)).map(c => c.id);
  assertEqual(got.join(','), expected.join(','), 'the queue is not in deck order');
  State.resetDeck(CHORD_DECK);
});

check('chords: the answer accepts the ways a guitarist writes a chord', () => {
  const cards = Decks.cards(CHORD_DECK);
  const find = s => cards.find(c => c.symbol === s);
  assert(Decks.matches(CHORD_DECK, 'Am7', find('Am7')), 'exact answer rejected');
  assert(Decks.matches(CHORD_DECK, 'am7', find('Am7')), 'case not ignored');
  assert(Decks.matches(CHORD_DECK, 'Amin7', find('Am7')), '"Amin7" rejected');
  assert(Decks.matches(CHORD_DECK, 'A-7', find('Am7')), '"A-7" rejected');
  assert(Decks.matches(CHORD_DECK, 'Bb', find('A#')), 'the flat spelling rejected');
  assert(Decks.matches(CHORD_DECK, 'CM7', find('Cmaj7')), '"CM7" rejected');
  assert(Decks.matches(CHORD_DECK, 'C maj7', find('Cmaj7')), '"C maj7" rejected');
  assert(!Decks.matches(CHORD_DECK, 'C7', find('Cmaj7')), 'a different chord accepted');
  assert(!Decks.matches(CHORD_DECK, 'nonsense', find('C')), 'nonsense accepted');
});

check('chords: the card shows the shape in the standard text format', () => {
  const cards = Decks.cards(CHORD_DECK);
  const c = cards.find(x => x.symbol === 'C');
  const picture = Decks.questionFor(CHORD_DECK, c);
  const lines = picture.split('\n');
  assertEqual(lines.length, 6, 'the diagram does not have six strings');
  assert(lines[0].startsWith('e|'), 'the high e is not on top');
  assert(lines[5].startsWith('E|'), 'the low E is not at the bottom');
  assert(lines[5].includes('x'), 'the muted string is not marked');
  // The fret numbers must sit in the columns of the frets they are on.
  assert(lines[1].includes('1'), 'the B string fret is missing');
});

check('chords: a barre shape shows where it starts on the neck', () => {
  const cards = Decks.cards(CHORD_DECK);
  const bm = cards.find(c => c.symbol === 'Bm');
  const lines = Decks.questionFor(CHORD_DECK, bm).split('\n');
  // A barre above the nut needs the fret numbers written above it.
  assertEqual(lines.length, 7, 'the fret numbers are missing');
  assert(lines[0].trim().startsWith('1'), 'the starting fret is not marked');
});

check('engine: a deck nobody has opened still has a proper summary', () => {
  // Before this was fixed the statistics screen of a fresh deck read
  // "undefined kartica", because the summary of an untouched deck was
  // returned without a card count.
  for (const id of Decks.all.map(d => d.id)) {
    const s = State.deckSummary(id);
    assert(typeof s.cardsTotal === 'number',
      `${id}: the card count is ${s.cardsTotal}`);
    assertEqual(s.cardsTotal, Decks.cards(id).length, `${id}: wrong card count`);
    assertEqual(s.reviews, 0, `${id}: a fresh deck has reviews`);
    assertEqual(s.accuracy, 0, `${id}: a fresh deck has no accuracy`);
  }
});

check('chords: the map shows every chord of the deck', () => {
  const spec = State.deckMap(CHORD_DECK);
  assert(spec, 'no map');
  const cards = Decks.cards(CHORD_DECK);
  const shown = new Set(spec.cells.flat().filter(Boolean).map(c => c.id));
  for (const card of cards) {
    assert(shown.has(card.id), `${card.symbol} is missing from the map`);
  }
  assertEqual(shown.size, cards.length, 'the map shows a different number of chords');
});

check('chords: the map learns the tone of a chord that was graded', () => {
  const cards = Decks.cards(CHORD_DECK);
  const card = cards.find(c => c.symbol === 'Em');
  State.grade({ deckId: CHORD_DECK, card, grade: 3, correct: true, elapsedMs: 1500, combo: 0 });
  const spec = State.deckMap(CHORD_DECK);
  const cell = spec.cells.flat().filter(Boolean).find(c => c.id === card.id);
  assert(cell, 'the chord is not in the map');
  assertEqual(cell.tone, 'learning', 'wrong tone');
  assertEqual(cell.attempts, 1, 'attempts not counted');
  State.resetDeck(CHORD_DECK);
});

check('chords: grading a chord works like any other deck', () => {
  const card = Decks.cards(CHORD_DECK)[0];
  const before = State.deckSummary(CHORD_DECK);
  const res = State.grade({
    deckId: CHORD_DECK, card, grade: 3, correct: true, elapsedMs: 1200, combo: 0
  });
  assert(res.points > 0, 'no points awarded');
  assertEqual(State.deckSummary(CHORD_DECK).reviews, before.reviews + 1);
  // And the undo takes it back.
  State.undo(CHORD_DECK, res.snapshot);
  assertEqual(State.deckSummary(CHORD_DECK).reviews, before.reviews, 'undo failed');
  State.resetDeck(CHORD_DECK);
});

/* ================================================================== *
 * The help
 *
 * "Pomoć" shows the answer outright. There is no nudge and no
 * description — the learner asks and is told. That is exactly why such
 * an answer earns no points: it was read, not recalled. The card is
 * still scheduled, because the learner did review it.
 * ================================================================== */

/** Every deck, and one card from each. */
const ALL_DECKS = ['tablica-mnozenje', 'tablica-deljenje', 'tablica', CHORD_DECK];

check('help: every card has an answer to show', () => {
  for (const deckId of ALL_DECKS) {
    const cards = Decks.cards(deckId);
    assert(cards.length > 0, `${deckId} has no cards`);
    for (const card of cards) {
      const back = card.back;
      assert(
        back !== null && back !== undefined && String(back).length > 0,
        `${deckId}/${card.id} has no answer to show`
      );
    }
  }
});

check('help: the answer shown is the answer the deck accepts', () => {
  // What "Pomoć" shows must be what the deck itself would call correct.
  for (const deckId of ALL_DECKS) {
    for (const card of Decks.cards(deckId)) {
      assert(
        Decks.matches(deckId, String(card.back), card),
        `${deckId}/${card.id} shows "${card.back}" but does not accept it`
      );
    }
  }
});

check('help: using help costs the points of that answer', () => {
  const card = Decks.cards('tablica-mnozenje')[0];

  const without = State.grade({
    deckId: 'tablica-mnozenje', card, grade: 3, correct: true,
    elapsedMs: 1000, combo: 0, helpUsed: false
  });
  const with_ = State.grade({
    deckId: 'tablica-mnozenje', card, grade: 3, correct: true,
    elapsedMs: 1000, combo: 0, helpUsed: true
  });

  assert(without.points > 0, 'no points without help');
  assertEqual(with_.points, 0, 'an answer shown by help still earns points');

  // The scoring model records that help was used, so the answer can
  // be explained later.
  const scored = Scoring.answer({
    grade: 3, correct: true, elapsedMs: 1000, parMs: 2000, combo: 0, helpUsed: true
  });
  assertEqual(scored.breakdown.helped, true, 'the breakdown does not record the help');
  assertEqual(
    Scoring.answer({
      grade: 3, correct: true, elapsedMs: 1000, parMs: 2000, combo: 0, helpUsed: false
    }).breakdown.helped,
    false,
    'the breakdown records help that was not asked for'
  );

  State.resetDeck('tablica-mnozenje');
});

check('help: an answer shown by help is scheduled, it just earns nothing', () => {
  const card = Decks.cards('tablica-mnozenje')[0];
  const before = State.deckSummary('tablica-mnozenje');
  State.grade({
    deckId: 'tablica-mnozenje', card, grade: 3, correct: true,
    elapsedMs: 1000, combo: 0, helpUsed: true
  });
  const after = State.deckSummary('tablica-mnozenje');
  assertEqual(after.reviews, before.reviews + 1, 'the review was not counted');
  assertEqual(after.points, before.points, 'points were added for an answer shown by help');
  State.resetDeck('tablica-mnozenje');
});

/* ================================================================== *
 * The quiz
 * ================================================================== */

check('quiz: only the chord deck is a quiz deck', () => {
  assertEqual(Decks.isQuiz(CHORD_DECK), true, 'the chord deck is not a quiz deck');
  for (const deckId of ['tablica-mnozenje', 'tablica-deljenje', 'tablica']) {
    assertEqual(Decks.isQuiz(deckId), false, `${deckId} should be typed, not a quiz`);
  }
});

check('quiz: every chord offers exactly four answers', () => {
  const cards = Decks.cards(CHORD_DECK);
  for (const card of cards) {
    const list = Decks.choicesFor(CHORD_DECK, card);
    assert(Array.isArray(list), `${card.id} offers no choices`);
    assertEqual(list.length, 4, `${card.id} does not offer four answers`);
    assertEqual(new Set(list).size, 4, `${card.id} offers the same answer twice`);
  }
});

check('quiz: exactly one of the offered answers is correct', () => {
  const cards = Decks.cards(CHORD_DECK);
  for (const card of cards) {
    const list = Decks.choicesFor(CHORD_DECK, card);
    const right = list.filter(a => Decks.matches(CHORD_DECK, a, card));
    assertEqual(right.length, 1, `${card.id} has ${right.length} correct answers`);
    assert(right[0] === card.symbol, `${card.id} does not offer its own answer`);
  }
});

check('quiz: the wrong answers catch a real mistake', () => {
  // The wrong answers must not be interchangeable with the right one:
  // the matcher says "wrong", so the learner is not let off.
  const cards = Decks.cards(CHORD_DECK);
  for (const card of cards) {
    const list = Decks.choicesFor(CHORD_DECK, card);
    for (const answer of list) {
      if (answer === card.symbol) continue;
      assertEqual(
        Decks.matches(CHORD_DECK, answer, card), false,
        `${card.id}: "${answer}" is wrongly accepted`
      );
    }
  }
});

check('quiz: the answers of a card do not change between renders', () => {
  const card = Decks.cards(CHORD_DECK)[0];
  const first = Decks.choicesFor(CHORD_DECK, card);
  const second = Decks.choicesFor(CHORD_DECK, card);
  assertEqual(JSON.stringify(first), JSON.stringify(second), 'the quiz reshuffled itself');
});

check('quiz: the chord label is hidden, because it is half the answer', () => {
  assertEqual(Decks.labelHidden(CHORD_DECK), true, 'the chord label is still shown in the quiz');
  for (const deckId of ['tablica-mnozenje', 'tablica-deljenje', 'tablica']) {
    assertEqual(Decks.labelHidden(deckId), false, `${deckId} hides its label needlessly`);
  }
});

check('quiz: the answer of a chord is its own symbol', () => {
  const cards = Decks.cards(CHORD_DECK);
  for (const card of cards) {
    assertEqual(card.back, card.symbol, `${card.id} has a different answer and symbol`);
    assert(Decks.matches(CHORD_DECK, card.symbol, card), `${card.id} does not accept its own answer`);
  }
});

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

if (failures.length) {
  console.error('APP UNIT TESTS FAILED\n');
  for (const f of failures) console.error('  ✗ ' + f);
  console.error(`\n${failures.length} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`App unit tests PASSED — ${passed} assertions groups, 0 failures.`);
