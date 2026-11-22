/*
 * deck-tablica.js — Množenje i deljenje
 *
 * One deck, one file. The engine (deck-registry.js) knows only the
 * contract; everything about this subject lives here.
 *
 * Loaded by index.html after deck-registry.js, and it registers itself:
 * the order of the deck list is the order of the script tags.
 */
(function (global) {
  'use strict';

  var Decks = global.Decks;

  /* ------------------------------------------------------------------ *
   * The cards
   *
   * Both halves of the table in one deck: every product and every
   * quotient.
   * ------------------------------------------------------------------ */

  function generateMultiplicationCards() {
    var cards = [];
    var i, j;

    // 1..10 × 1..10 — every distinct product fact.
    for (i = 1; i <= 10; i++) {
      for (j = 1; j <= 10; j++) {
        cards.push({
          id: 'mult:' + i + 'x' + j,
          front: i + ' × ' + j,
          back: String(i * j),
          type: 'mult',
          a: i,
          b: j,
          tags: ['mnozenje', 'tablica']
        });
      }
    }

    // Division, derived from the same facts (reverse of the table).
    for (i = 1; i <= 10; i++) {
      for (j = 1; j <= 10; j++) {
        cards.push({
          id: 'div:' + i + 'x' + j,
          front: (i * j) + ' ÷ ' + j,
          back: String(i),
          type: 'div',
          a: i,
          b: j,
          tags: ['deljenje', 'tablica']
        });
      }
    }

    return cards;
  }


  /**
   * The multiplication map: row = first factor, column = second, cell holds
   * the product. "7 × 8 = 56".
   */
  function multiplicationMap(cards) {
    var heads = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    return Decks.buildGrid(cards, {
      rows: 10,
      cols: 10,
      rowHeaders: heads,
      colHeaders: heads,
      title: 'Mapa množenja',
      label: 'svaka ćelija je jedan proizvod',
      place: function (card) {
        return { row: card.a - 1, col: card.b - 1 };
      },
      cell: function (card) {
        return {
          label: card.front,
          answer: card.back,
          tip: card.front + ' = ' + card.back
        };
      }
    });
  }


  var DECK = {
    id: 'tablica',
    name: 'Množenje i deljenje',
    subtitle: 'potpuna tablica',
    description: 'Kompletna tablica množenja i deljenja u jednom paketu.',
    icon: '✕',
    accent: 'violet',
    inputMode: 'numeric',
    tags: ['tablica'],
    build: generateMultiplicationCards,
    tag: function (card) {
      return card.type === 'div' ? 'deljenje' : 'množenje';
    },
    parMs: function (card) {
      if (card.type === 'div') return 4600;
      var maxAB = Math.max(card.a, card.b);
      var trivial = (card.a === 1 || card.b === 1 || card.a === 10 || card.b === 10);
      if (trivial) return 1600;
      if (maxAB >= 7) return 4200;
      if (maxAB >= 5) return 3000;
      return 2200;
    },
    // The combined deck shows the multiplication map: the division facts
    // are derived from it, so it is the table that explains the other one.
    map: function () {
      return multiplicationMap(
        Decks.cards('tablica').filter(function (c) { return c.type === 'mult'; })
      );
    }
  };
  Decks.register(DECK);
})(typeof window !== 'undefined' ? window : this);
