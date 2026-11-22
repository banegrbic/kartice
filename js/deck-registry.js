/*
 * deck-registry.js — the deck contract and the registry that holds decks.
 *
 * This file is the ENGINE side of the card system: it says what a deck is,
 * what a deck may say about itself, and what every deck gets for free when
 * it says nothing. It knows no subject at all.
 *
 * The decks themselves live in their own files, one per subject:
 *
 *     js/deck-tablica-mnozenje.js
 *     js/deck-tablica-deljenje.js
 *     js/deck-tablica.js
 *     js/deck-akordi.js
 *
 * Each of those calls `Decks.register(deck)` when it loads, so adding a
 * subject is a new file and one more line in index.html — never a change
 * in the engine.
 *
 * ---------------------------------------------------------------------------
 * The contract
 * ---------------------------------------------------------------------------
 *
 *   Required:
 *     id           string   technical key. Stable forever — it is the key
 *                          under which the saved schedule lives, so renaming
 *                          it orphans the learner's history.
 *     name         string   what the user reads.
 *     build()      fn       -> array of cards.
 *
 *   Optional, each with a working generic default:
 *     tag(card)         fn -> string  the label on the card face.
 *     question(card)    fn -> string  the prompt line, as displayed.
 *     matches(input,card) fn -> bool   is this typed answer correct?
 *     parMs(card)       fn -> number  base par time for this card, in ms.
 *     map()             fn -> mapSpec layout for the statistics screen.
 *     inputMode         string       'numeric' | 'text' — the mobile keyboard.
 *     choices(card)     fn -> [string] the answers offered as a quiz, one of
 *                                      which is correct. A deck that offers
 *                                      choices is answered by picking, not by
 *                                      typing.
 *     hideLabelInQuiz   bool         the label is part of the answer, so the
 *                                      quiz must not show it.
 *     newPerDayLimit    number       this deck's own cap on new cards per
 *                                      day. It can only LOWER the global
 *                                      setting, never raise it. Use it for
 *                                      a subject with many cards and a slow
 *                                      learning curve, where twenty new
 *                                      cards a day would swamp the learner.
 *
 *   The answer itself is `card.back` — there is no hook for it, because
 *   there is nothing subject-specific about it. The "Pomoć" button shows
 *   exactly that, and such an answer is worth no points.
 *
 * ---------------------------------------------------------------------------
 * The card shape
 * ---------------------------------------------------------------------------
 *
 *     id      string   unique within the deck (used as the schedule key).
 *     front   string   the prompt.
 *     back    string   the answer.
 *     accept  array    optional: further accepted answers.
 *     tag     string   optional: label, used by the default tag().
 *     ...     any     deck-specific extras (type, a, b, ...) — the engine
 *                      never reads them.
 *
 * ---------------------------------------------------------------------------
 * The map spec
 * ---------------------------------------------------------------------------
 *
 * A map is a grid of cells describing where each card sits, so the learner
 * can see the whole subject at once. It is pure layout: the engine adds the
 * tone (how well the card is learned) on top.
 *
 *     rows, cols          numbers
 *     rowHeaders          array of strings, or null
 *     colHeaders          array of strings, or null
 *     title, label        the heading and its sub-heading
 *     cells               rows x cols array of
 *                           { id, label, answer, tip }
 *                         or null for a cell with no card.
 */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Generic defaults — the behaviour a deck gets for free
   * ------------------------------------------------------------------ */

  /** Lowercase, trim, and collapse internal whitespace. */
  function normalise(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** Parse a number written with either decimal separator. */
  function asNumber(s) {
    var t = String(s == null ? '' : s).replace(',', '.');
    if (t === '') return NaN;
    var n = Number(t);
    return isFinite(n) ? n : NaN;
  }

  /**
   * Is a typed answer correct?
   *
   * Exact match after normalisation, or numeric equality (so "7", "7.0" and
   * "7,0" all count), or any of the card's extra accepted answers.
   */
  function defaultMatches(input, card) {
    var a = normalise(input);
    if (a === '') return false;
    if (a === normalise(card.back)) return true;
    var na = asNumber(a);
    var nb = asNumber(card.back);
    if (!isNaN(na) && !isNaN(nb) && na === nb) return true;
    if (card.accept) {
      for (var i = 0; i < card.accept.length; i++) {
        if (a === normalise(card.accept[i])) return true;
      }
    }
    return false;
  }

  /** The prompt line: the front, with room for the answer. */
  function defaultQuestion(card) {
    return card.front + ' =';
  }

  /** The label on the card face. */
  function defaultTag(card) {
    return card.tag || '';
  }

  /** A neutral base par time for a subject that does not specify one. */
  function defaultParMs() {
    return 3000;
  }

  /**
   * The default set of quiz choices for a card: the right answer and
   * three wrong ones.
   *
   * A deck that wants a proper quiz supplies its own `choices()` — the
   * distractors have to be plausible for that subject, and only the deck
   * knows what a plausible wrong answer looks like.
   */

  /** Trim a long string so it fits a grid cell. */
  function shortText(s, n) {
    var t = String(s == null ? '' : s);
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  /* ------------------------------------------------------------------ *
   * Grid assembly
   *
   * Shared by every deck that wants a map, so that only the placement
   * differs from one subject to the next.
   * ------------------------------------------------------------------ */

  /**
   * @param {Array}  cards
   * @param {object} opts
   *   cols, rows      numbers
   *   place(card, i)  -> {row, col} | null   where the card sits
   *   cell(card)      -> {label, answer, tip} what the cell shows
   *   rowHeaders, colHeaders  arrays or null
   *   title, label    headings
   */
  function buildGrid(cards, opts) {
    var cells = [];
    for (var r = 0; r < opts.rows; r++) {
      var row = [];
      for (var c = 0; c < opts.cols; c++) row.push(null);
      cells.push(row);
    }

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var at = opts.place(card, i);
      if (!at) continue;
      if (at.row < 0 || at.col < 0 || at.row >= opts.rows || at.col >= opts.cols) continue;
      var content = opts.cell(card);
      cells[at.row][at.col] = {
        id: card.id,
        label: content.label,
        answer: content.answer,
        tip: content.tip
      };
    }

    return {
      rows: opts.rows,
      cols: opts.cols,
      rowHeaders: opts.rowHeaders || null,
      colHeaders: opts.colHeaders || null,
      title: opts.title,
      label: opts.label,
      cells: cells
    };
  }

  /* ------------------------------------------------------------------ *
   * The fallback map
   *
   * Every deck gets a map even if it does not describe one: the cards in
   * deck order, coloured by how well they are learned. A subject with no
   * spatial structure of its own (a glossary, a list of procedures) still
   * shows the learner the shape of their progress.
   * ------------------------------------------------------------------ */

  var FALLBACK_COLS = 10;

  function genericMap(deck) {
    var cards = Decks.cards(deck.id);
    var rows = Math.max(1, Math.ceil(cards.length / FALLBACK_COLS));
    return buildGrid(cards, {
      rows: rows,
      cols: FALLBACK_COLS,
      rowHeaders: null,
      colHeaders: null,
      title: 'Pregled kartica',
      label: 'svaka ćelija je jedna kartica',
      place: function (card, index) {
        return { row: Math.floor(index / FALLBACK_COLS), col: index % FALLBACK_COLS };
      },
      cell: function (card) {
        return {
          label: shortText(card.front, 24),
          answer: shortText(card.back, 14),
          tip: card.front + ' = ' + card.back
        };
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Deck registry
   *
   * The list starts empty. Every deck registers itself when its file
   * loads, so the order of the list is the order of the script tags in
   * index.html — and a deck file is a self-contained thing that can be
   * added or removed without touching anything else.
   * ------------------------------------------------------------------ */

  var DECKS = [];

  var byId = {};

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  var Decks = {
    all: DECKS,

    /**
     * Add a deck at runtime.
     *
     * A new subject is normally added by editing the DECKS array above,
     * but registering it here works too — and it is how a deck can be
     * defined in another file that is loaded after this one.
     *
     * @param {object} deck a deck following the contract
     * @returns {object} the registered deck
     */
    register: function (deck) {
      if (!deck || !deck.id) throw new Error('a deck needs an id');
      if (byId[deck.id]) throw new Error('a deck with id "' + deck.id + '" already exists');
      if (typeof deck.build !== 'function') throw new Error('a deck needs a build() function');
      DECKS.push(deck);
      byId[deck.id] = deck;
      return deck;
    },

    get: function (id) {
      return byId[id] || null;
    },

    /**
     * Cards for a deck, cached per session so the generator runs once.
     */
    cards: function (id) {
      var deck = byId[id];
      if (!deck) return [];
      if (!deck._cache) deck._cache = deck.build();
      return deck._cache;
    },

    /**
     * A stable identifier for a card, used as the key in the scheduling state.
     */
    cardKey: function (deckId, card) {
      return deckId + '/' + card.id;
    },

    /**
     * An extra class for the card face, for decks whose card is not a
     * single line of prose (a chord diagram, for instance).
     */
    cardClassFor: function (deckId) {
      var deck = byId[deckId];
      return deck && deck.cardClass ? deck.cardClass : '';
    },

    /**
     * The label shown on the card face.
     */
    tagFor: function (deckId, card) {
      var deck = byId[deckId];
      if (!deck || !card) return '';
      return deck.tag ? deck.tag(card) : defaultTag(card);
    },

    /**
     * The prompt line, as displayed.
     */
    questionFor: function (deckId, card) {
      var deck = byId[deckId];
      if (!deck || !card) return '';
      return deck.question ? deck.question(card) : defaultQuestion(card);
    },

    /**
     * Is this typed answer correct?
     */
    matches: function (deckId, input, card) {
      var deck = byId[deckId];
      if (!deck || !card) return false;
      return deck.matches ? !!deck.matches(input, card) : defaultMatches(input, card);
    },

    /**
     * The base par time for a card — how long the answer should take.
     */
    parMsFor: function (deckId, card) {
      var deck = byId[deckId];
      if (!deck) return defaultParMs();
      var v = deck.parMs ? deck.parMs(card) : defaultParMs(card);
      return (typeof v === 'number' && isFinite(v) && v > 0) ? v : defaultParMs();
    },

    /**
     * A deck's own cap on new cards per day.
     *
     * Returns 0 when the deck has no opinion, in which case the global
     * setting decides. A cap can only lower the global limit, never
     * raise it.
     */
    newPerDayLimit: function (deckId) {
      var deck = byId[deckId];
      if (!deck) return 0;
      var v = deck.newPerDayLimit;
      return (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
    },

    /**
     * The answers offered for a card as a quiz — the right one and a few
     * wrong ones.
     *
     * Returns null for a deck that is answered by typing.
     */
    choicesFor: function (deckId, card) {
      var deck = byId[deckId];
      if (!deck || !card) return null;
      if (typeof deck.choices !== 'function') return null;
      var list = deck.choices(card);
      if (!Array.isArray(list) || !list.length) return null;
      return list.slice();
    },

    /**
     * Is this deck answered by picking from a list rather than by typing?
     */
    isQuiz: function (deckId) {
      var deck = byId[deckId];
      return !!(deck && typeof deck.choices === 'function');
    },

    /**
     * Must the card's label be hidden while the quiz is on screen?
     *
     * Sometimes the label is half the answer (a chord's quality, the kind
     * of operation), and showing it would give the answer away.
     */
    labelHidden: function (deckId) {
      var deck = byId[deckId];
      return !!(deck && deck.hideLabelInQuiz);
    },

    /**
     * Assemble a grid of cells.
     *
     * Shared by every deck whose map is a grid, so that only the placement
     * differs from one subject to the next.
     *
     * @param {Array}  cards
     * @param {object} opts
     *   cols, rows           numbers
     *   place(card, i)      -> {row, col} | null
     *   cell(card)           -> {label, answer, tip}
     *   rowHeaders, colHeaders  arrays or null
     *   title, label         headings
     */
    buildGrid: buildGrid,

    /**
     * Does this deck introduce its new cards in a fixed order?
     *
     * Some subjects are taught in sequence -- a beginner meets the easy
     * chords first and only then the hard ones. Such a deck says so, and
     * the queue then hands out its cards in the order the deck lists them.
     */
    isOrdered: function (deckId) {
      var deck = byId[deckId];
      return !!(deck && deck.ordered);
    },

    /**
     * The mobile keyboard hint.
     */
    inputModeFor: function (deckId) {
      var deck = byId[deckId];
      return deck && deck.inputMode ? deck.inputMode : 'text';
    },

    /**
     * The layout of the statistics map for a deck.
     */
    mapSpec: function (deckId) {
      var deck = byId[deckId];
      if (!deck) return null;
      if (deck.map) return deck.map();
      return genericMap(deck);
    },

    /**
     * Check every deck for the mistakes that would only show up at runtime:
     * duplicate ids, missing text, a broken map.
     *
     * Returns a list of problem descriptions — empty when everything is fine.
     */
    validate: function () {
      var problems = [];
      var deckIds = {};

      DECKS.forEach(function (deck) {
        var name = deck.id || '(bez id)';
        if (!deck.id) problems.push('deck bez id');
        else if (deckIds[deck.id]) problems.push('duplikat deck id: ' + deck.id);
        else deckIds[deck.id] = true;

        if (typeof deck.build !== 'function') {
          problems.push(name + ': nema build()');
          return;
        }
        if (typeof deck.name !== 'string' || !deck.name) problems.push(name + ': nema naziva');

        var cards;
        try {
          cards = deck.build();
        } catch (e) {
          problems.push(name + ': build() baca grešku: ' + e.message);
          return;
        }
        if (!Array.isArray(cards)) {
          problems.push(name + ': build() nije vracio niz');
          return;
        }
        if (!cards.length) {
          problems.push(name + ': nema kartica');
          return;
        }

        var seen = {};
        cards.forEach(function (card, i) {
          if (!card || typeof card !== 'object') {
            problems.push(name + ': kartica ' + i + ' nije objekat');
            return;
          }
          if (!card.id) problems.push(name + ': kartica ' + i + ' nema id');
          else if (seen[card.id]) problems.push(name + ': duplikat card id: ' + card.id);
          else seen[card.id] = true;
          if (typeof card.front !== 'string' || !card.front) {
            problems.push(name + '/' + (card.id || i) + ': nema front');
          }
          if (typeof card.back !== 'string' || !card.back) {
            problems.push(name + '/' + (card.id || i) + ': nema back');
          }
        });

        if (typeof deck.map === 'function') {
          try {
            var spec = deck.map();
            if (!spec || !spec.cells || !spec.cells.length) {
              problems.push(name + ': map() ne daje ćelije');
            } else {
              for (var r = 0; r < spec.cells.length; r++) {
                if (!spec.cells[r] || spec.cells[r].length !== spec.cols) {
                  problems.push(name + ': map() ima red bez ' + spec.cols + ' ćelija');
                  break;
                }
              }
            }
          } catch (e) {
            problems.push(name + ': map() baca grešku: ' + e.message);
          }
        }
      });

      return problems;
    }
  };

  global.Decks = Decks;
})(typeof window !== 'undefined' ? window : this);
