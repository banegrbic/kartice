/*
 * deck-tablica-deljenje.js — Tablica deljenja
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
   * Division is the inverse of the same table, so the facts are derived
   * from it rather than written out twice.
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
   * The division map: row = divisor, column = quotient, cell holds the
   * dividend. "72 ÷ 9 = 8".
   */
  function divisionMap(cards) {
    var heads = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    return Decks.buildGrid(cards, {
      rows: 10,
      cols: 10,
      rowHeaders: heads,
      colHeaders: heads,
      title: 'Mapa deljenja',
      label: 'svaka ćelija je jedan deljivi broj',
      place: function (card) {
        return { row: card.b - 1, col: card.a - 1 };
      },
      cell: function (card) {
        return {
          label: card.front,
          answer: String(card.a * card.b),
          tip: card.front + ' = ' + card.back
        };
      }
    });
  }


  var DECK = {
    id: 'tablica-deljenje',
    name: 'Tablica deljenja',
    subtitle: 'obrnuta tablica',
    description: 'Deljenje — obrnuta tablica. Najteži deo, a i najkorisniji za razumevanje.',
    icon: '÷',
    accent: 'emerald',
    inputMode: 'numeric',
    tags: ['tablica'],
    build: function () {
      return generateMultiplicationCards().filter(function (c) { return c.type === 'div'; });
    },
    tag: function () { return 'deljenje'; },
    // Division is the harder skill: the dividend has to be held in mind
    // and divided, so it takes longer than the multiplication it mirrors.
    parMs: function () {
      return 4600;
    },
    map: function () {
      return divisionMap(Decks.cards('tablica-deljenje'));
    }
  };
  Decks.register(DECK);
})(typeof window !== 'undefined' ? window : this);
