/*
 * deck-tablica-mnozenje.js — Tablica množenja
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
   * The classic 1..10 table, generated — never written out by hand.
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
    id: 'tablica-mnozenje',
    name: 'Tablica množenja',
    subtitle: '1–10 × 1–10',
    description: 'Isključivo množenje, bez deljenja. Za utvrđivanje same tablice.',
    icon: '×',
    accent: 'indigo',
    inputMode: 'numeric',
    tags: ['tablica'],
    build: function () {
      return generateMultiplicationCards().filter(function (c) { return c.type === 'mult'; });
    },
    tag: function () { return 'množenje'; },
    // How long the answer should take: trivial facts are quick, the hard
    // products need more time.
    parMs: function (card) {
      var maxAB = Math.max(card.a, card.b);
      var trivial = (card.a === 1 || card.b === 1 || card.a === 10 || card.b === 10);
      if (trivial) return 1600;
      if (maxAB >= 7) return 4200;
      if (maxAB >= 5) return 3000;
      return 2200;
    },
    map: function () {
      return multiplicationMap(Decks.cards('tablica-mnozenje'));
    }
  };
  Decks.register(DECK);
})(typeof window !== 'undefined' ? window : this);
