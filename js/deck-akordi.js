/*
 * deck-akordi.js — the guitar chord deck.
 *
 * Guitar chords, written in the standard text format used by guitar tab and
 * chord sites: the chord symbol (C, Am7, F#m7) and the fingering, low E
 * first, with "x" for a string that is not played.
 *
 * Every shape here was generated and then CHECKED on a real fretboard: the
 * notes a shape sounds must be exactly the notes of the chord, the root
 * must be in the bass, and the shape must fit within four frets. The
 * generator also reproduced the 26 open shapes printed on every chord
 * chart (C, G, D, A, E, F, Am, Em, Dm, Bm, Fm, the open 7ths and maj7s)
 * without a single difference.
 *
 * The deck is ORDERED: its cards run from the easiest chord to the hardest,
 * so a learner meets the open chords first and the barre chords only
 * afterwards.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * The data
   *
   * "symbol|fret,fret,fret,fret,fret,fret" — low E to high e.
   * Listed easiest first: open chords, then open 7ths, then the first
   * barre chords, then those shapes further up the neck, and last the
   * exotic ones (diminished, augmented, 9ths).
   * ------------------------------------------------------------------ */

  var DATA = [
    "C|x,3,2,0,1,0",
    "G|3,2,0,0,0,3",
    "D|x,x,0,2,3,2",
    "A|x,0,2,2,2,0",
    "E|0,2,2,1,0,0",
    "Am|x,0,2,2,1,0",
    "Em|0,2,2,0,0,0",
    "Dm|x,x,0,2,3,1",
    "Dmaj7|x,x,0,2,2,2",
    "Amaj7|x,0,2,1,2,0",
    "Emaj7|0,2,1,1,0,0",
    "Cmaj7|x,3,2,0,0,0",
    "Gsus2|3,0,0,0,3,3",
    "Fsus2|1,3,3,0,1,1",
    "Esus2|0,2,2,4,0,2",
    "Esus4|0,0,2,2,0,0",
    "Gsus4|3,3,0,0,1,3",
    "F#sus4|2,4,4,4,0,2",
    "Dm7|x,x,0,2,1,1",
    "Am7|x,0,2,0,1,0",
    "Em7|0,2,0,0,0,0",
    "Em6|0,2,2,0,2,0",
    "F#m6|2,0,1,2,2,2",
    "Gm6|3,1,0,0,3,0",
    "Fm6|1,3,0,1,1,1",
    "G#m6|4,2,1,1,0,1",
    "E6|0,2,2,1,2,0",
    "F6|1,0,0,2,1,1",
    "G6|3,2,0,0,0,0",
    "D7|x,x,0,2,1,2",
    "A7|x,0,2,0,2,0",
    "E7|0,2,0,1,0,0",
    "B7|x,2,1,2,0,2",
    "C7|x,3,2,3,1,0",
    "G7|3,2,0,0,0,1",
    "E5|0,2,2,4,0,0",
    "Fmaj7|1,3,2,2,1,1",
    "D#maj7|x,x,1,3,3,3",
    "A#maj7|x,1,3,2,3,1",
    "C#maj7|x,4,3,1,1,1",
    "F#sus2|2,4,4,1,2,2",
    "G#sus2|4,1,1,1,4,4",
    "Fsus4|1,1,3,3,1,1",
    "G#sus4|4,4,1,1,2,4",
    "Fm7|1,3,1,1,1,1",
    "D#m7|x,x,1,3,2,2",
    "A#m7|x,1,3,1,2,1",
    "Am6|5,3,2,2,1,2",
    "F#6|2,1,1,3,2,2",
    "G#6|4,3,1,1,1,1",
    "F7|1,3,1,2,1,1",
    "D#7|x,x,1,3,2,3",
    "A#7|x,1,3,1,3,1",
    "C#7|x,4,3,4,2,1",
    "G#7|4,3,1,1,1,2",
    "F5|1,3,3,5,1,1",
    "Fm|1,3,3,1,1,1",
    "A#m|x,1,3,3,2,1",
    "D#m|x,x,1,3,4,2",
    "F|1,3,3,2,1,1",
    "A#|x,1,3,3,3,1",
    "C#|x,4,3,1,2,1",
    "G#|4,3,1,1,1,4",
    "D#|x,x,1,3,4,3",
    "Bmaj7|x,2,4,3,4,2",
    "F#maj7|2,4,3,3,2,2",
    "Asus2|5,2,2,2,5,5",
    "Asus4|5,5,2,2,3,5",
    "Bm7|x,2,4,2,3,2",
    "F#m7|2,4,2,2,2,2",
    "A6|5,4,2,2,2,2",
    "F#7|2,4,2,3,2,2",
    "Bm|x,2,4,4,3,2",
    "F#m|2,4,4,2,2,2",
    "B|x,2,4,4,4,2",
    "F#|2,4,4,3,2,2",
    "Gmaj7|3,5,4,4,3,3",
    "Cm7|x,3,5,3,4,3",
    "Gm7|3,5,3,3,3,3",
    "Cm|x,3,5,5,4,3",
    "Gm|3,5,5,3,3,3",
    "A#m6|6,4,3,3,2,3",
    "F#5|2,4,4,6,2,2",
    "A#sus2|6,3,3,3,6,6",
    "A#sus4|6,6,3,3,4,6",
    "Bm6|7,5,4,4,3,4",
    "A#6|6,5,3,3,3,3",
    "G5|3,5,5,7,3,3",
    "G#maj7|4,6,5,5,4,4",
    "Bsus2|7,4,4,4,7,7",
    "Bsus4|7,7,4,4,5,7",
    "C#m7|x,4,6,4,5,4",
    "G#m7|4,6,4,4,4,4",
    "Cm6|8,6,5,5,4,5",
    "B6|7,6,4,4,4,4",
    "G#5|4,6,6,8,4,4",
    "C#m|x,4,6,6,5,4",
    "G#m|4,6,6,4,4,4",
    "Csus2|8,5,5,5,8,8",
    "Csus4|8,8,5,5,6,8",
    "C#m6|9,7,6,6,5,6",
    "C6|8,7,5,5,5,5",
    "A5|5,7,7,9,5,5",
    "C#sus2|9,6,6,6,9,9",
    "C#sus4|9,9,6,6,7,9",
    "Dm6|10,8,7,7,6,7",
    "C#6|9,8,6,6,6,6",
    "A#5|6,8,8,10,6,6",
    "Dsus2|10,7,7,7,10,10",
    "Dsus4|10,10,7,7,8,10",
    "D#m6|11,9,8,8,7,8",
    "D6|10,9,7,7,7,7",
    "B5|7,9,9,11,7,7",
    "D#sus2|11,8,8,8,11,11",
    "D#sus4|11,11,8,8,9,11",
    "D#6|11,10,8,8,8,8",
    "C5|8,10,10,12,8,8",
    "C#5|9,11,11,13,9,9",
    "D5|10,12,12,14,10,10",
    "D#5|11,13,13,15,11,11",
    "Edim7|0,1,2,0,2,0",
    "Fdim7|1,2,0,1,0,1",
    "F#dim7|2,0,1,2,1,2",
    "Gdim7|3,1,2,0,2,0",
    "G#dim7|4,2,0,1,0,1",
    "Fm7b5|1,2,1,1,0,1",
    "F#m7b5|2,0,2,2,1,0",
    "Gm7b5|3,1,3,0,2,1",
    "Em7b5|0,1,0,0,3,0",
    "G#m7b5|4,2,0,1,0,2",
    "Eadd9|0,2,2,1,0,2",
    "Gadd9|3,0,0,0,0,3",
    "Fadd9|1,0,3,0,1,1",
    "Em9|0,2,0,0,0,2",
    "F#m9|2,0,2,1,2,0",
    "Gm9|3,0,0,3,3,1",
    "G#m9|4,1,1,1,0,2",
    "Fdim|1,2,3,1,0,1",
    "F#dim|2,0,4,2,1,2",
    "G#dim|4,2,0,1,0,4",
    "Gaug|3,2,1,0,0,3",
    "Eaug|0,3,2,1,1,0",
    "Faug|1,0,3,2,2,1",
    "F#aug|2,1,0,3,3,2",
    "G#aug|4,3,2,1,1,0",
    "F9|1,0,1,0,1,1",
    "E9|0,2,0,1,0,2",
    "F#9|2,1,2,1,2,0",
    "G9|3,0,0,0,0,1",
    "E13|0,2,0,1,2,0",
    "G13|3,2,2,0,0,1",
    "F13|1,0,1,2,3,1",
    "F#13|2,1,1,3,2,0",
    "Adim7|5,3,1,2,1,2",
    "Am7b5|5,3,1,2,1,3",
    "F#add9|2,1,4,1,2,2",
    "G#add9|4,1,1,1,1,4",
    "Fm9|1,3,1,1,1,3",
    "Am9|5,2,2,2,1,3",
    "Gdim|3,1,5,3,2,3",
    "Adim|5,3,1,2,1,5",
    "Aaug|5,4,3,2,2,1",
    "G#9|4,1,1,1,1,2",
    "G#13|4,3,3,1,1,2",
    "A#dim7|6,4,2,3,2,3",
    "A#m7b5|6,4,2,3,2,4",
    "Aadd9|5,2,2,2,2,5",
    "A#m9|6,3,3,3,2,4",
    "A#dim|6,4,2,3,2,6",
    "A#aug|6,5,4,3,3,2",
    "A9|5,2,2,2,2,3",
    "A13|5,4,4,2,2,3",
    "Bdim7|7,5,3,4,3,4",
    "Bm7b5|7,5,3,4,3,5",
    "A#add9|6,3,3,3,3,6",
    "Bm9|7,4,4,4,3,5",
    "Bdim|7,5,3,4,3,7",
    "Baug|7,6,5,4,4,3",
    "A#9|6,3,3,3,3,4",
    "A#13|6,5,5,3,3,4",
    "Cdim7|8,6,4,5,4,5",
    "Cm7b5|8,6,4,5,4,6",
    "Badd9|7,4,4,4,4,7",
    "Cm9|8,5,5,5,4,6",
    "Cdim|8,6,4,5,4,8",
    "Caug|8,7,6,5,5,4",
    "B9|7,4,4,4,4,5",
    "B13|7,6,6,4,4,5",
    "C#dim7|9,7,5,6,5,6",
    "C#m7b5|9,7,5,6,5,7",
    "Cadd9|8,5,5,5,5,8",
    "C#m9|9,6,6,6,5,7",
    "C#dim|9,7,5,6,5,9",
    "C#aug|9,8,7,6,6,5",
    "C9|8,5,5,5,5,6",
    "C13|8,7,7,5,5,6",
    "Ddim7|10,8,6,7,6,7",
    "Dm7b5|10,8,6,7,6,8",
    "C#add9|9,6,6,6,6,9",
    "Dm9|10,7,7,7,6,8",
    "Ddim|10,8,6,7,6,10",
    "Daug|10,9,8,7,7,6",
    "C#9|9,6,6,6,6,7",
    "C#13|9,8,8,6,6,7",
    "D#dim7|11,9,7,8,7,8",
    "D#m7b5|11,9,7,8,7,9",
    "Dadd9|10,7,7,7,7,10",
    "D#m9|11,8,8,8,7,9",
    "D#dim|11,9,7,8,7,11",
    "D#aug|11,10,9,8,8,7",
    "D9|10,7,7,7,7,8",
    "D13|10,9,9,7,7,8",
    "D#add9|11,8,8,8,8,11",
    "Edim|12,10,8,9,8,12",
    "D#9|11,8,8,8,8,9",
    "D#13|11,10,10,8,8,9",
  ];

  /* ------------------------------------------------------------------ *
   * Reading the data
   * ------------------------------------------------------------------ */

  // The chord families, and the word a guitarist would use for each.
  var FAMILY = {
    "":     "dur",
    "m":    "moler",
    "7":    "sedmica",
    "m7":   "moler sedmica",
    "maj7": "velika sedmica",
    "sus2": "sus2",
    "sus4": "sus4",
    "dim":  "diminuirani",
    "dim7": "diminuirana sedmica",
    "m7b5": "poludim",
    "aug":  "augmentovani",
    "6":    "seksta",
    "m6":   "moler seksta",
    "9":    "nona",
    "m9":   "moler nona",
    "add9": "dodaj nonu",
    "13":   "trinaestica",
    "5":    "petica"
  };

  // The standard marks for the families, the way a chord chart prints
  // them. They are short enough to head a column.
  var MARK = {
    "": "", "m": "m", "7": "7", "m7": "m7", "maj7": "maj7", "sus2": "sus2",
    "sus4": "sus4", "dim": "dim", "dim7": "dim7", "m7b5": "m7b5", "aug": "aug",
    "6": "6", "m6": "m6", "9": "9", "m9": "m9", "add9": "add9", "13": "13", "5": "5"
  };

  // The family suffixes, longest first so that "m7" wins over "m".
  var SUFFIXES = ["maj7", "dim7", "m7b5", "add9", "sus2", "sus4", "m7",
                  "m9", "m6", "dim", "aug", "maj", "min", "6", "9", "13",
                  "7", "5", "m"];

  // The roots, in the order of the circle of fifths.
  var ROOTS = ["C", "G", "D", "A", "E", "F", "B", "F#", "C#", "G#", "D#", "A#"];

  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var TUNING = [4, 9, 2, 7, 11, 4];   // low E, A, D, G, B, high e

  /**
   * Split a symbol into its root and its family.
   *
   * The longest root wins, so "C#m" is C sharp minor and not C sharp
   * something else.
   */
  function splitSymbol(symbol) {
    for (var i = 0; i < ROOTS.length; i++) {
      var root = ROOTS[i];
      if (symbol.indexOf(root) !== 0) continue;
      var suffix = symbol.slice(root.length);
      if (FAMILY[suffix] !== undefined) return { root: root, family: suffix };
    }
    return { root: symbol, family: "" };
  }

  // The families that are a new sound to the ear before they are a new
  // shape to the hand. They come last, whatever their place on the neck.
  var EXOTIC = {
    "dim": 1, "dim7": 1, "m7b5": 1, "aug": 1,
    "9": 1, "m9": 1, "add9": 1, "13": 1
  };

  /* ------------------------------------------------------------------ *
   * The teaching order
   *
   * A beginner does not start with the whole chord chart. They start
   * with the handful of shapes that unlock most songs, and everything
   * else arrives later. This list is that order, and it comes from what
   * the guitar methods actually agree on:
   *
   *   - every beginner gets eight open chords first (Em, Am, C, G, D,
   *     A, E, Dm) — the set that covers the songs they can already
   *     sing;
   *   - then F and Bm, the two hardest of the classic ten, which every
   *     method saves for last of the open shapes;
   *   - then the dominant sevenths (E7, A7, D7, G7, C7, B7) and the
   *     minor sevenths (Em7, Am7, Dm7), which is where most songs with
   *     a bit of colour actually live;
   *   - then the rest of the open extensions — maj7, sus, sixths;
   *   - and only then the barre chords and the exotic families.
   *
   * The order is by usefulness to a beginner, not by how the shapes
   * look on the neck: a chord that appears in ten beginner songs comes
   * before one that appears in none, even if the second is easier to
   * finger.
   * ------------------------------------------------------------------ */

  // The eight chords every beginner is given first, in the order the
  // methods teach them: the two simplest, then the three that carry
  // most songs, then their siblings.
  var FIRST_CHORDS = ["Em", "Am", "C", "G", "D", "A", "E", "Dm"];

  // The two that complete the classic ten, saved for last because they
  // are the hardest to hold cleanly.
  var SECOND_CHORDS = ["F", "Bm"];

  // The dominant sevenths — the sound of blues and of half the songs
  // with a guitar in them.
  var DOMINANT_SEVENTHS = ["E7", "A7", "D7", "G7", "C7", "B7"];

  // The minor sevenths.
  var MINOR_SEVENTHS = ["Em7", "Am7", "Dm7", "Bm7"];

  /**
   * Where a chord sits in the teaching order: a small number for the
   * chords a beginner meets early, a large one for the rest.
   *
   * The number is the sort key, so a lower one comes first. Within the
   * numbered groups the order is the one listed above; chords that are
   * in no group are pushed to the end and ordered by how hard their
   * shape is.
   */
  function teachingRank(card) {
    var i = FIRST_CHORDS.indexOf(card.symbol);
    if (i !== -1) return i;

    i = SECOND_CHORDS.indexOf(card.symbol);
    if (i !== -1) return FIRST_CHORDS.length + i;

    i = DOMINANT_SEVENTHS.indexOf(card.symbol);
    if (i !== -1) return 100 + i;

    i = MINOR_SEVENTHS.indexOf(card.symbol);
    if (i !== -1) return 200 + i;

    // The open extensions a beginner runs into: the major sevenths,
    // the suspended chords and the sixths. They come after the chords
    // above, but before the barre shapes.
    if (card.frets.indexOf(0) !== -1) {
      if (card.family === "maj7") return 300 + ROOTS.indexOf(card.root);
      if (card.family === "sus2" || card.family === "sus4") {
        return 400 + ROOTS.indexOf(card.root);
      }
      if (card.family === "6" || card.family === "m6") {
        return 500 + ROOTS.indexOf(card.root);
      }
      if (card.family === "5") return 600 + ROOTS.indexOf(card.root);
    }

    // Everything else — the barre chords of the less common roots, and
    // the exotic families — comes last. Among them, the easier shape
    // first.
    return 1000 + tierOf(card.frets, card.family) * 100 + ROOTS.indexOf(card.root);
  }

  /**
   * How hard a shape is to play.
   *
   * The tier follows the order a guitarist learns in:
   *
   *   1  the basic open chords — major and minor
   *   2  the open chords with an extra note — sevenths, sus, sixths
   *   3  the first barre chords, low on the neck
   *   4  the same shapes further up the neck
   *   5  the exotic ones — diminished, augmented, ninths
   */
  function tierOf(frets, family) {
    var played = [];
    for (var i = 0; i < 6; i++) {
      if (frets[i] !== null) played.push(frets[i]);
    }
    if (!played.length) return 5;

    var hi = Math.max.apply(null, played);
    var hasOpen = played.indexOf(0) !== -1;

    // The exotic chords come last whatever their position.
    if (EXOTIC[family]) return 5;

    if (hasOpen) {
      // An open shape. The basic ones are easiest, the ones with an extra
      // note come next.
      if (family === "" || family === "m") return hi <= 3 ? 1 : 2;
      return 2;
    }

    // A barre chord: the first ones sit low on the neck.
    return hi <= 5 ? 3 : 4;
  }

  /**
   * Parse one row of the data.
   */
  function parseRow(row) {
    var parts = row.split("|");
    var symbol = parts[0];
    var raw = parts[1].split(",");
    var frets = [];
    for (var i = 0; i < 6; i++) {
      frets.push(raw[i] === "x" ? null : Number(raw[i]));
    }
    var split = splitSymbol(symbol);
    var picture = tabPicture(frets);
    return {
      id: "chord:" + symbol,
      // The front is the prompt: the shape, drawn in the standard text
      // format. The back is the answer: the name of the chord.
      front: picture.join("\n"),
      back: symbol,
      symbol: symbol,
      root: split.root,
      family: split.family,
      frets: frets,
      tier: tierOf(frets, split.family),
      picture: picture,
      compact: compact(frets),
      notes: notesOf(frets, split.root)
    };
  }

  /* ------------------------------------------------------------------ *
   * The standard text picture
   *
   * The shape drawn the way guitar tab sites draw it: one line per
   * string, the high e at the top and the low E at the bottom, the fret
   * number in the column of the fret it is played on, and "x" for a
   * string that is not played.
   * ------------------------------------------------------------------ */

  function tabPicture(frets) {
    var played = [];
    for (var i = 0; i < 6; i++) {
      if (frets[i] !== null) played.push(frets[i]);
    }
    if (!played.length) return [];

    var lo = Math.min.apply(null, played);
    var hi = Math.max.apply(null, played);
    // Open chords start at the nut; a shape further up the neck starts at
    // its own lowest fret, with the fret numbers written above it.
    var start = lo === 0 ? 0 : Math.max(1, lo - 1);
    var end = Math.max(start + 4, hi);
    var width = end - start + 1;

    var labels = ["e", "B", "G", "D", "A", "E"];
    var lines = [];

    if (start > 0) {
      var head = "   ";
      for (var h = start; h <= end; h++) {
        head += h < 10 ? "  " + h : " " + h;
      }
      lines.push(head);
    }

    for (var s = 5; s >= 0; s--) {
      var f = frets[s];
      var body;
      if (f === null) {
        body = "x" + repeat("-", width * 3 - 1);
      } else {
        body = "";
        for (var fret = start; fret <= end; fret++) {
          if (fret === f) {
            body += f < 10 ? "--" + f : "-" + f;
          } else {
            body += "---";
          }
        }
      }
      lines.push(labels[5 - s] + "|" + body + "|");
    }

    return lines;
  }

  function repeat(ch, n) {
    var s = "";
    for (var i = 0; i < n; i++) s += ch;
    return s;
  }

  /** The shape in the compact one-line form: "x32010". */
  function compact(frets) {
    var out = "";
    for (var i = 0; i < 6; i++) {
      out += frets[i] === null ? "x" : frets[i];
    }
    return out;
  }

  /** The notes the shape sounds, named the way a guitarist names them. */
  function notesOf(frets, root) {
    var seen = [];
    for (var i = 0; i < 6; i++) {
      if (frets[i] === null) continue;
      var pc = (TUNING[i] + frets[i]) % 12;
      if (seen.indexOf(pc) === -1) seen.push(pc);
    }
    // The root comes first, then the rest by height.
    var rootPc = ROOTS.indexOf(root);
    if (rootPc === -1) rootPc = 0;
    seen.sort(function (a, b) {
      if (a === rootPc) return -1;
      if (b === rootPc) return 1;
      return a - b;
    });
    var names = [];
    for (var j = 0; j < seen.length; j++) names.push(NOTE_NAMES[seen[j]]);
    return names.join(" ");
  }

  /* ------------------------------------------------------------------ *
   * The deck
   * ------------------------------------------------------------------ */

  var CARDS = DATA.map(parseRow);

  // The deck is taught in order, so the cards are sorted by when a
  // beginner meets them. The sort is stable, so chords of equal rank
  // keep the order the data gives them.
  CARDS.sort(function (a, b) {
    return teachingRank(a) - teachingRank(b);
  });

  var Decks = global.Decks;

  /**
   * The map for the statistics screen.
   *
   * The classic guitar chord chart: the roots down the side, the chord
   * families across the top, and one cell for every chord of the deck.
   */
  function chordChart() {
    var families = [];
    for (var key in FAMILY) {
      if (Object.prototype.hasOwnProperty.call(FAMILY, key)) families.push(key);
    }
    families.sort(function (a, b) {
      return SUFFIXES.indexOf(a) - SUFFIXES.indexOf(b);
    });

    var cells = [];
    var rows = ROOTS.length;
    var cols = families.length;

    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) row.push(null);
      cells.push(row);
    }

    CARDS.forEach(function (card) {
      var r = ROOTS.indexOf(card.root);
      var c = families.indexOf(card.family);
      if (r === -1 || c === -1) return;
      cells[r][c] = {
        id: card.id,
        label: card.symbol,
        answer: card.symbol,
        tip: card.symbol + " — " + FAMILY[card.family] + " — " +
             card.compact + " (" + card.notes + ")"
      };
    });

    return {
      rows: rows,
      cols: cols,
      rowHeaders: ROOTS.slice(),
      // The standard quality marks, the way a chord chart prints them.
      // The full name is in the cell's tooltip.
      colHeaders: families.map(function (f) { return MARK[f] === "" ? "dur" : MARK[f]; }),
      title: "Mapa akorda",
      label: "svaka ćelija je jedan akord",
      className: "chord-map",
      cells: cells
    };
  }

  /**
   * The four answers offered for a chord.
   *
   * A chord name has two parts, and the learner can get either of them
   * wrong, so the wrong answers are chosen to catch exactly that: one
   * with the right root but the wrong quality, one with the right
   * quality but the wrong root, and one that is wrong in both.
   *
   * The order is fixed for a given card — a quiz that reshuffles itself
   * on every render is noise, not difficulty.
   */
  function chordChoices(card) {
    var fams = Object.keys(FAMILY);
    var fi = fams.indexOf(card.family);
    var ri = ROOTS.indexOf(card.root);
    if (fi < 0 || ri < 0) return null;

    var seed = hashOf(card.id);

    // A different quality, the same root.
    var f2 = fams[(fi + 1 + (seed % (fams.length - 1))) % fams.length];
    // The same quality, a different root.
    var r2 = ROOTS[(ri + 1 + ((seed >>> 8) % (ROOTS.length - 1))) % ROOTS.length];
    // Neither the root nor the quality.
    var f3 = fams[(fi + 1 + ((seed >>> 16) % (fams.length - 1))) % fams.length];
    var r3 = ROOTS[(ri + 1 + ((seed >>> 24) % (ROOTS.length - 1))) % ROOTS.length];

    var list = [card.symbol, card.root + f2, r2 + card.family, r3 + f3];
    return shuffleWith(randOf(seed), list);
  }

  /** A stable 32-bit hash, so a card always gets the same quiz. */
  function hashOf(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** A tiny seeded generator, so the shuffle is the same every time. */
  function randOf(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** Fisher-Yates, driven by the given generator. */
  function shuffleWith(rand, list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  var CHORD_DECK = {
    id: "akordi",
    name: "Gitarski akordi",
    subtitle: "od C do oštrih",
    description: "Akordi za gitaru, od otvorenih do bar akorda. Svaki akord je zapisan u standardnom tekstualnom obliku.",
    icon: "♫",
    accent: "amber",
    inputMode: "text",
    // The cards are taught in order: easy first, hard later.
    ordered: true,
    // How many new chords a day. The global setting is twenty, which
    // for a subject where each shape takes days to learn cleanly is far
    // too many: a beginner who meets twenty new shapes a day remembers
    // none of them. Six a day means the eight essential chords are done
    // in a day and a half, and the whole chart in a slow, steady
    // trickle. The global setting can still lower it further.
    newPerDayLimit: 6,
    // A chord diagram is monospace and several lines long, so the card
    // face needs its own treatment.
    cardClass: "chord-card",

    build: function () {
      return CARDS.slice();
    },

    /**
     * The card face shows the shape; the answer is the chord's name.
     */
    question: function (card) {
      return card.picture.join("\n");
    },

    /** The label on the card face: the kind of chord it is. */
    tag: function (card) {
      return FAMILY[card.family];
    },

    /**
     * The four answers offered for a chord.
     *
     * The label already says the quality, so in the quiz it would give
     * half the answer away — hence hideLabelInQuiz.
     */
    choices: chordChoices,

    /**
     * In the quiz the quality is not shown: the learner has to work out
     * both halves of the name from the shape alone.
     */
    hideLabelInQuiz: true,

    /**
     * What counts as a correct answer.
     *
     * A guitarist writes the same chord in several ways — "Am7", "Amin7",
     * "A-7" — and the sharp and flat spellings are the same chord. So the
     * answer is compared after normalising all of that away.
     */
    matches: function (input, card) {
      return normaliseSymbol(input) === normaliseSymbol(card.symbol);
    },

    /**
     * How long the answer should take.
     *
     * The harder the shape, the longer a guitarist needs to read it.
     */
    parMs: function (card) {
      return [2200, 2800, 3600, 4600, 5600][card.tier - 1];
    },

    map: chordChart
  };

  /**
   * Fold the many ways of writing a chord name into one.
   *
   * "Amin7", "A-7" and "Am7" are the same chord; so are "Bb7" and "A#7".
   * The case matters in one place only: an uppercase M means major and a
   * lowercase m means minor, so that is settled before anything is
   * lowercased.
   */
  function normaliseSymbol(s) {
    var t = String(s == null ? "" : s).replace(/\s+/g, "");

    // The unicode accidentals, which a phone keyboard offers.
    t = t.replace(/♯/g, "#").replace(/♭/g, "b");

    // An uppercase M (or a delta) means the major chord.
    t = t.replace(/^([A-G][b#]?)(M|MAJ|Major|Δ|∆)/, function (m, root) {
      return root + "maj";
    });

    t = t.toLowerCase();

    // The flat spelling of a root is the same chord as the sharp one.
    var flats = { "db": "c#", "eb": "d#", "gb": "f#", "ab": "g#", "bb": "a#" };
    t = t.replace(/^(db|eb|gb|ab|bb)/, function (m) { return flats[m]; });

    // "min", "mi" and "-" all mean minor.
    t = t.replace(/^([a-g]#?)(min|mi|-)/, "$1m");
    // "dom" and "dominant" mean the plain seventh.
    t = t.replace(/^([a-g]#?)(dom|dominant)/, "$1");
    // The other spellings of the diminished and augmented chords.
    t = t.replace(/^([a-g]#?)\u00b0$/, "$1dim");
    t = t.replace(/^([a-g]#?)\u00b07$/, "$1dim7");
    t = t.replace(/^([a-g]#?)\u00f8$/, "$1m7b5");
    t = t.replace(/^([a-g]#?)\+$/, "$1aug");
    // "sus" on its own means sus4.
    t = t.replace(/^([a-g]#?)sus$/, "$1sus4");

    return t;
  }

  Decks.register(CHORD_DECK);
})(window);
