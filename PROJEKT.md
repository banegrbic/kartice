# Kartice — projektni fajl

> **Ovo je jedini fajl koji treba pročitati da bi se nastavilo na projektu „Kartice".**
> Sadrži sve što je potrebno za rad: stanje, arhitekturu, ugovore, pravila i otvorene zadatke.
> Ažuriranje: **22.11.2026.** Verifikovano protiv diska (testovi, brojanje kartica, ID ugovor).

---

## 1. Identitet projekta

| | |
|---|---|
| **Naziv proizvoda** | **Kartice** (podnaslov: „za pamćenje") |
| **Šta je** | Sajt sa karticama za učenje. Po uzoru na Omanki plugin (deck izbor, 4 ocene, spaced repetition, statistika), ali sa **svojim** scoring sistemom i **svojim** vizuelnim jezikom. |
| **Zašto „Kartice"** | Ime je **universalno po konceptu**, ne po sadržaju — kao Omanki (Omarchy + Anki). Sadržaj je **naziv deka** unutra („Tablica množenja" je deck, ne proizvod). |
| **Korisnik** | Traži da projekat **ne izgleda kao vibe coding**, nego kao da ga je neko napravio od nule. |
| **Preimenovanje** | 17.11.2026. sa „Tablica". Traženi razlozi: planirani dek o procedurama rada biračkih odbora u Srbiji + gitarski akordi — potpuno različite teme, isti proizvod. |
| **Jezik sajta** | Srpski, latinica (`lang="sr-Latn"`). |

### Planirani dekovi (korisnikova namera)
1. Tablica množenja / deljenja ✅ postoji
2. Gitarski akordi ✅ postoji
3. **Procedure rada biračkih odbora u Srbiji** — planirano, nije napravljen

---

## 2. Lokacija i pokretanje

```
Projekt:       <koren repozitorijuma>/tablica/
Lokalni URL:   http://127.0.0.1:8899/tablica/
Server:        python3 -m http.server 8899   (iz parent foldera projekta)
```

**Direktorijum se zove `tablica/` i to se NE menja** — ime proizvoda ne mora biti ime direktorijuma, a prebacivanje bi pokvarilo lokalni URL.

**Deploy: `https://kartice.sokak.app/`** (postavljeno 22.11.2026.). Hosting je isti
cPanel add-on domen kao `sokak.app` i `start.sokak.app` — folder `~/kartice.sokak.app/`
Pristupni podaci (server, korisnik, ključ) su u **privatnom secret-store van projekta** —
**nikad u repou, nikad u deploy sadržaju, nikad u ovom fajlu**.

Deploy je `rsync` **bez `--delete`** — folder pripada cPanel panelu i sadrži
`cgi-bin/` i `.well-known/acme-challenge/` (za obnovu SSL-a), koji bi se
izbrisali. Vidi skill `open-source-web-publishing`.

`.htaccess` je isporučen sa sajtom: no-cache za CSS/JS/HTML, 7 dana za slike.

**Domeni (provereno 17.11.2026. preko DNS SOA / RDAP):** `kartice.rs` zauzato, `kartice.com` zauzato, `kartice.app` / `kartice.io` / `kartice.dev` / `kartice.sokak.app` slobodno → **odabrano `kartice.sokak.app`**, SSL važi do 20.02.2027.

**Git: JAVNI REPO `github.com/banegrbic/kartice`** (22.11.2026.). Grana `master`,
MIT licenca. Struktura: `index.html`, `css/`, `js/`, `test/`, `docs/` (screenshotovi),
`README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `PROJEKT.md`,
`.htaccess`, `.gitignore`.

**GitHub About panel je zapravo README**; kratki `description` (142 znaka, jedan
red — GitHub odbija nove redove) ide u naslov pretraživača. `gh repo edit
--body-file` nije dostupan u ovoj verziji `gh`; GraphQL `updateRepository`
mutation radi, ali sa istim ograničenjem na nove redove.

**Pravilo (22.11.2026.):** svaka izmena projekta mora da ažurira i `PROJEKT.md`
i skill `tablica-app`, i da se zabeleži u istoriji promena.

---

## 3. Stack i arhitektura

- Čist **HTML/CSS/JS**, **bez build procesa**, bez frameworka, bez runtime zavisnosti.
- **Hash routing**: `#/` (deck picker), `#/study/<deckId>`, `#/stats/<deckId>`.
- Moduli su **IIFE-ovi** koji dodeljuju globalne varijable: `FSRS`, `Store`, `Decks`, `Scoring`, `State`, `App`.
- **FSRS-6** scheduler — portovan i diferencijalno testiran protiv `ts-fsrs` v6.0.0.
- Učitavanje skripti u `index.html` je **redosledom** (zavisnosti): `fsrs → storage → deck-registry → [paketi karata] → scoring → state → app`.
- **Svaki paket karata je u zasebnom fajlu** i sam se prijavljuje (`Decks.register()`). Redosled paketa na sajtu = redosled script tagova. Dodavanje teme = novi fajl + jedna linija u `index.html`, nikad izmena motora.

### Struktura fajlova (stanje 22.11.2026., reorganizovano)

```
index.html               338 lin.   shell: masthead + 3 viewa + settings drawer + colophon
css/style.css            900 lin.   dizajn-tokeni, tema, responsive
js/fsrs.js               553 lin.   FSRS-6 scheduler (port, bez zavisnosti)
js/storage.js            293 lin.   cookie store: base64url + chunking + fallback
js/deck-registry.js      516 lin.   UGOOVOR DEKA + registar + generički defaultovi
js/deck-tablica-mnozenje.js  114 lin.  paket „Tablica množenja" (100 kartica)
js/deck-tablica-deljenje.js  110 lin.  paket „Tablica deljenja" (100 kartica)
js/deck-tablica.js       118 lin.   paket „Množenje i deljenje" (200 kartica)
js/deck-akordi.js        802 lin.   paket „Gitarski akordi" (216 kartica) + kviz
js/scoring.js            338 lin.   scoring model (tačnost / brzina / efikasnost)
js/state.js              869 lin.   stanje, red čekanja, integracija FSRS-a, statistika
js/app.js               1028 lin.   UI kontroler, routing, renderovanje, pomoć, kviz
test/app.test.mjs       1394 lin.   unit + integracioni + randomizacija
test/fsrs.diff.test.mjs  265 lin.   diferencijalni test vs ts-fsrs v6.0.0
README.md                 157 lin.   javni landing page (About panel na GitHub-u)
CONTRIBUTING.md           94 lin.   kako doprinositi
CODE_OF_CONDUCT.md        48 lin.   kodeks ponašanja
LICENSE                            MIT © 2026 Bane Grbić
.htaccess                         cache-control + preusmerenje bez www
.gitignore                        secrets/, kljucevi, backup fajlovi
docs/                               screenshotovi (5 PNG) za README
PROJEKT.md                           ← ovaj fajl
```

### Globalne površine (javni API modula)

| Global | Ključne metode |
|---|---|
| `FSRS` | `Rating` (Again 1 / Hard 2 / Good 3 / Easy 4), `State` (New/Learning/Review/Relearning), `GRADES`, `DEFAULT_W` (21 parametar), `createEmptyCard`, `Scheduler`, `defaultParams`, `_internal` (za testove) |
| `Store` | `get(key, fallback)`, `set(key, value)`, `remove(key)`, `clearAll()`, `size(key)` |
| `Decks` | `all`, `register(deck)`, `get(id)`, `cards(id)`, `cardKey(deckId, card)`, `cardClassFor(deckId)`, `tagFor`, `questionFor`, `matches`, `parMsFor`, `buildGrid`, `isOrdered(deckId)`, `inputModeFor(deckId)`, `mapSpec(deckId)`, `choicesFor(deckId, card)`, `isQuiz(deckId)`, `labelHidden(deckId)`, `validate()` |
| `Scoring` | `answer`, `autoGrade`, `parMs`, `contentPar`, `sessionSummary`, `deckSummary`, `levelForXp`, `xpForLevel`, `updateStreak`, `todayKey`, `constants`, `_internal` |
| `State` | `settings`, `save`, `saveNow`, `deckState`, `cardState`, `cardStats`, `buildQueue`, `shuffle`, `sample`, `preview`, `parFor`, `intervalLabel`, `grade`, `undo`, `deckSummary`, `deckBreakdown`, `forecast`, `weakestCards`, `deckDueCount`, `uniqueCardCount`, `deckMap`, `resetDeck`, `resetAll`, `resetScores`, `dayKey`, `dayStart`, `plural`, `encodeCard`, `decodeCard`, `emptyCardState`, `HIST_BUCKET`, `LEECH_THRESHOLD`, `version` |
| `App` | `route`, `navigate`, `toast` |

### ID ugovor (proveriti skriptom, ne okom)

Svaki `id` iz `index.html` mora postojati; svaki `$('...')` u `js/app.js` mora imati odgovarajući element.

**Stanje 22.11.2026.: 68 ID-jeva u HTML-u, 64 reference iz JS-a, 0 nedostajućih.** ✅
(4 HTML ID-a nisu referencirana iz JS-a i to je OK: `grade-buttons`, `grade-hint`, `main`, `view-decks` — prva dva se koriste preko `data-grade` atributa, a `main`/`view-decks` su meta/selektor.)

**Kad promeniš strukturu viewa, ovo se lako razbije i tiho nestane.** Proveri skriptom.

---

## 4. UGOOVOR DEKA — kako se dodaje nova tema

**Motor (`app.js`, `state.js`, `scoring.js`, `storage.js`, `fsrs.js`) ne zna ništa o temi.** Sve što je specifično za temu živi u **jednom fajlu po temi** (`js/deck-<tema>.js`), a ugovor i registar su u `js/deck-registry.js`.

**Dodavanje nove teme = novi fajl + jedan script tag u `index.html`, BEZ ijedne izmene u motoru.** (Dokaz u praksi: paket `akordi` je dodat bez diranja motora, a reorganizacija je razbila `js/decks.js` na pet fajlova bez promene u ponašanju.)

### Kako paket postaje deo sajta

Svaki fajl paketa je IIFE koji na kraju poziva `Decks.register()`:

```js
(function (global) {
  'use strict';
  var Decks = global.Decks;
  // ...definicija paketa...
  var DECK = { id: '...', name: '...', build: function () { ... } };
  Decks.register(DECK);
})(typeof window !== 'undefined' ? window : this);
```

`register()` baca grešku na duplikat ID-a, pa se greška vidi odmah pri učitavanju, a ne kad učenik klikne paket.

**Redosled na sajtu = redosled script tagova** u `index.html`. Nema nikakvog sortiranja po imenu ili prioritetu — namera je da se lista čita istim redom kao fajlovi na disku.

**Paketi ne smeju da zavise jedan od drugog.** Svaki je samostalan: ima svoje generatore kartica, svoju mapu, svoj `parMs`. Ono što je zajedničko (ugovor, generički defaultovi, `buildGrid`) je u `deck-registry.js`.

### Obavezno

| polje | značenje |
|---|---|
| `id` | tehnički ključ. **Trajno stable** — pod njim živi sačuvani raspored u `state.decks[deckId]`. Preimenovanje ostavlja siročeću istoriju. |
| `name` | ono što korisnik čita |
| `build()` | `fn -> array` kartica |

### Opciono (svako ima radni generički podrazumevani vrednost)

| polje | značenje |
|---|---|
| `tag(card)` | oznaka na kartici („množenje", „moler sedmica") |
| `question(card)` | red pitanja kako se prikazuje |
| `matches(input, card)` | da li je ukucani odgovor tačan |
| `parMs(card)` | bazno „par vreme" za karticu, u ms |
| `map()` | raspored mape na statističkom ekranu |
| `inputMode` | `'numeric'` ili `'text'` — tastatura na mobilnom |
| `ordered` | `true` = nove kartice se izdaju **u redosledu deka**, ne nasumično |
| `cardClass` | klasa na elementu kartice (npr. `'chord-card'` za monospace dijagram) |
| `className` (u `map()`) | klasa na mapi (npr. `'chord-map'`) |
| `choices(card)` | `fn -> [string]` ponuđeni odgovori za kviz; tačno jedan je ispravan. Paket sa `choices` se odgovara **biranjem**, ne kucanjem. |
| `hideLabelInQuiz` | `true` = oznaka je deo odgovora, pa se u kvizu ne prikazuje. |
| `newPerDayLimit` | `number` — sopstvena granica novih kartica dnevno za ovaj paket. Može samo da **spusti** globalno podešavanje, nikad da ga podigne. Za temu sa mnogo kartica i sporom krivom učenja. |

**Odgovor nema ugovor** — to je uvek `card.back`. Nema `hint(card)` polja: „Pomoć" pokazuje tačan odgovor, pa nema šta tema da doprinosi.

### Pomoć i bodovi (22.11.2026., revidirano istog dana)

„Pomoć" je **dugme na svakoj kartici, u svim režimima** (taster `P`). Klik **otkriva tačan odgovor** — nema opisne pomoći, nema podskaza.

Ovo je **namerna promena semantike** (korisnik je eksplicitno tražio: „Klikom na Pomoć treba da se dobije tačan odgovor, a ne opisna pomoć"). Raniji oblik — opisni podskaz koji ne otkriva odgovor — **obrisan je**, zajedno sa `Decks.hintFor()`, `defaultHint()`, `multiplicationHint()`, `divisionHint()` i `chordHint()`.

Kako radi:
- `showHelp()` u `js/app.js` postavlja `session.helpUsed = true` i upisuje `card.back` u `#card-help` (koji je u mono fontu, kao sve vrednosti na sajtu).
- Dugme se **disable-uje** do sledeće kartice; u kvizu se dodatno **markira tačno dugme** (klasa `.correct`), da učenik ne mora da traži odgovor među ponudama.
- `session.helpUsed` se resetuje na svakoj novoj kartici (`renderStudy`).

Bodovi:
- `Scoring.answer` postavlja `points = 0` kad je `o.helpUsed` istina, a `breakdown.helped = true` to zapisuje.
- `State.grade()` prima `helpUsed` i prosleđuje ga `Scoring.answer`.
- Kartica se **i dalje rasporeduje u FSRS-u** — pregledana je, samo ne vredi poene.

Ime polja kroz kod: `helpUsed` (session, `State.grade`, `Scoring.answer`), `breakdown.helped`. Stara imena (`hintUsed`, `breakdown.hinted`) **ne postoje više**.

### Kviz (dodato 22.11.2026.)

Paket sa `choices(card)` prikazuje četiri ponuđena odgovora umesto polja za unos; klik na odgovor ocenjuje se isto kao ukucani odgovor (tačno/netačno + brzina). Tasteri `1`–`4` biraju odgovor.

Pravila:
- **Tačno jedan** ponuđeni odgovor prolazi kroz `matches()`.
- Ponuđeni odgovori moraju biti **međusobno različiti** (i ne smiju biti enharmonički ekvivalentni — „Bb7" i „A#7" su isti akord).
- Redosled je **fiksiran za karticu** (seedovani hash ID-a), ne premešava se između prikaza.
- Ako `hideLabelInQuiz` je `true`, oznaka se u kvizu skriva.

**Trenutno kviz ima samo paket `akordi`** (216 kartica × 4 odgovora). Paketi sa tablicama se i dalje odgovaraju kucanjem.

### Oblik kartice

`id` (jedinstven u deku), `front` (pitanje), `back` (odgovor), opciono `accept` (dodatni prihvaćeni odgovori), `tag`, i **bilo koji dodatni polja** koja engine nikad ne čita.

### Mapa

Mapa je **raspored**: `rows`, `cols`, `rowHeaders`, `colHeaders`, `title`, `label`, `cells` (svaka ćelija: `{id, label, answer, tip}`). Raspored daje **deck**; **napredak** (ton, broj pokušaja, tačnost, najbrže vreme) daje `State.deckMap(deckId)`. Deck bez sopstvene mape dobija generički pregled — kartice u redovima, obojene po napretku.

### Pravila koja ne smeju da se prekrše

- **Deck ID-jevi se ne menjaju.** Oni su ključevi u `state.decks[deckId]`.
- **`Decks.validate()` mora vratiti praznu listu** — hvata duplikate ID-jeva, nedostajući `front`/`back`, pokvarenu mapu. Poziva se posle svake izmene deka.
- **`Decks.register(deck)`** baca grešku na duplikat ID-a.
- **`State.deckSummary(deckId)` mora vratiti `cardsTotal` za SVAKI deck**, i za deck koji nikad nije otvoren. (Bio je to pre-existing bug za sve deke — vidi Sekcija 10.)
- **Engine ne sme da sadrži `'mult'`, `'div'`, `'množenje'`, `'deljenje'`, `card.a`, `card.b`, `mapKind` ni `tableMap`.**
  Provera (mora vratiti prazno):
  ```
  grep -nE "type === '(mult|div)'|card\.[ab]\b|mapKind|tableMap" js/app.js js/state.js js/scoring.js
  ```

### `ordered` — paketi koji se uče po redu

Početno pravilo projekta je bilo „sve se randomizuje". To ostaje važeće za tablične pakete, ali **ne važi za svaku temu**: neke se uče sekvencijalno. Za to paket deklariše `ordered: true`, a `State.buildQueue` tada uzima **prvih N kartica u redosledu deka** i ne meša ih — čak i kada je podešavanje `randomOrder` uključeno.

Ovo je jedini izuzetak od pravila o nasumičnosti i postoji zato što je eksplicitno tražen. Za paket `akordi` je bitno: prviih 8 kartica su C, G, D, A, E, Am, Em, Dm — tačno redosled kojim svaka gitarska metoda uči.

**Ne menjaj `ordered` kod tabeličnih paketa** — njihova randomizacija je namerna i testirana.

### Nasumičan redosled (obavezno za ne-`ordered` pakete)

Korisnik je eksplicitno tražio da se **sve randomizuje** — „ne može da se računa 1x1, pa 1x2, itd."

Ključni uvid: nasumično mora da važi za **IZBOR** novih kartica, ne samo za redosled. Ako uzmeš prvih N novih kartica u deck redu i samo ih pomešaš, učenik i dalje uči isti početni deo tablice (1×1, 1×2, 1×3...) — samo u drugačijem redosledu, i teški proizvodi (8×9, 7×10) nikada ne dođu na red.

Implementacija u `js/state.js` (`buildQueue`):
- `sample(fresh, allowance, rand)` — nasumičan izbor KOJE novih kartica se uvodi danas, iz celog neviđenog poola.
- `shuffle()` — Fisher-Yates, prima opcioni `rng` (za determinističke testove).
- Kartice u learning stanju idu **prve**, sortirane po roku (dospele su za minuti, bi se izgubile u sesiji).
- Podešavanje `randomOrder` (default `true`): `false` = uredan redosled.

**Pravilo: ne vraćaj na deck-redosled za nove kartice.**

---

## 5. Paketi karata (stanje 22.11.2026. — brojano iz stvarnih fajlova)

| id | Naziv | Kartica | Mapa | ordered | inputMode |
|---|---|---|---|---|---|
| `tablica-mnozenje` | Tablica množenja | 100 | mult (10×10) | false | numeric |
| `tablica-deljenje` | Tablica deljenja | 100 | div (10×10, zrcalne ose) | false | numeric |
| `tablica` | Množenje i deljenje | 200 | mult | false | numeric |
| `akordi` | Gitarski akordi | 216 | chord (root × family) | **true** | text |

**Ukupno: 4 deka, 616 kartica. `Decks.validate()` → `[]` (prazno = nema problema).** ✅

**Redosled je deo dizajna**: uski paketi prvi, kombinovani poslednji, `akordi` poslednji. Svaki paket je u **zasebnom fajlu** i sam se prijavljuje `Decks.register()`; redosled na sajtu = redosled script tagova u `index.html`.

### Paket `akordi` — gitarski akordi

Četvrti paket, u **zasebnom fajlu `js/deck-akordi.js`** (učitava se posle `deck-registry.js`, zove `Decks.register()`). 216 akorda = 12 osnovnih tonova × 18 vrsta akorda.

**Format kartice.** Prednja strana je ASCII dijagram u standardnom obliku sa sajtova za tablature — red po žici, `e B G D A E` odozgo nadole, broj praga u koloni svog praga, `x` za nemučenu žicu:

```
e|--0------------|
B|-----1---------|
G|--0------------|
D|--------2------|
A|-----------3---|
E|x--------------|
```

Bar akordi imaju i brojeve pragova iznad (`1 2 3 4 5`). Zadnja strana je naziv akorda (`Am7`). `tag` je vrsta akorda na srpskom („moler sedmica"). Klasa na kartici: `chord-card` (monospace). Mapa: `chord-map`.

**Odgovori su normalizovani** (`normaliseSymbol`), jer gitaristi pišu isto na više načina:
`Am7` = `Amin7` = `A-7`, `Bb` = `A#`, `CM7` = `Cmaj7`, `C dom7` = `C7`, `C°` = `Cdim`, `Cø7` = `Cm7b5`, `C+` = `Caug`, `Csus` = `Csus4`.
Normalizacija razlikuje **veliko M** (majaž) od **malo m** (moler) pre snižavanja velikih slova — inače bi `CM7` i `Cm7` bili isti akord. Unicode accidentals (♯ ♭) se prevode.

**Redosled učenja** — `teachingRank()` (22.11.2026., revidirano istog dana).

`DATA` red je i dalje po `tier` (fizička težina oblika), ali **kartice se sortiraju po `teachingRank`**, ne po redosledu u `DATA`. To je važna razlika: `tier` opisuje **koliko je oblik težak za prste**, a `teachingRank` opisuje **kada početnik treba da ga upozna**.

| Grupa | Akordi | Broj |
|---|---|---|
| 1 | osnovni otvoreni: **Em Am C G D A E Dm** | 8 |
| 2 | najteža dvojica klasične desetke: **F Bm** | 2 |
| 3 | dominantne sedmice: **E7 A7 D7 G7 C7 B7** | 6 |
| 4 | male sedmice: **Em7 Am7 Dm7 Bm7** | 4 |
| 5 | ostale otvorene nadogradnje (velike sedmice, sus, sekste, petice) | 19 |
| 6 | sve ostalo — bar akordi i egzotika (dim, aug, 9, 13) | 177 |
| | **UKUPNO** | **216** ✅ |

Redosled u prve četiri grupe je **istraživan na internetu** (22.11.2026.) — sve gitarske metode se slažu oko osam osnovnih otvorenih akorda, oko toga da su F i Bm najteži od klasične desetke i da ih se čuva za kraj, i oko toga da su dominantne sedmice (E7 A7 D7 G7 C7 B7) prvo mesto gde se pojavljuju akordi sa „bojom". Izvori: GuitarHabits (8 najvažnijih), GuitarZoom/Steve Stine (10 must-know, sa redosledom), FindTune Academy (dnevni/nedeljni plan), Fretwork (8-nedeljni plan), National Guitar Academy (3 partije), StringKick (6 koraka).

**Zašto po važnosti, a ne po težini oblika:** akord koji se pojavljuje u deset pesama početnika ide pre onog koji se ne pojavljuje nigde, **čak i ako je ovaj drugi lakši za prste**. F je bar akord (težak), ali je svejedno 9. na listi — jer bez njega nema ni polovine popularnih pesama.

**Nivo se određuje po vrsti akorda, ne po visini praga** — otvoreni akord je uvek lakši od bar akorda, bez obzira na položaj.

`parMs` po tieru: 2200 / 2800 / 3600 / 4600 / 5600 ms.

**Dnevni broj novih akorda: 6** (`newPerDayLimit: 6` u dek objektu).

Globalno podešavanje je 20 novih kartica dnevno, što je za tablicu množenja sasvim u redu, ali za gitarske akorde je **previše**: svaki oblik se uči danima, pa učenik koji sretne 20 novih oblika dnevno ne zapamti nijedan. Šest dnevno znači da je osam osnovnih akorda gotovo za dan i po, a ceo graf kroz nekoliko meseci.

Ovo je **novo polje u ugovoru deka** (`newPerDayLimit`): dek može samo da **spusti** globalnu granicu, nikad da je podigne. `Decks.newPerDayLimit(deckId)` čita ga, a `State.buildQueue` ga primenjuje. Tablični paketi nemaju limit (`0` = globalno podešavanje odlučuje).

**Mapa** je klasičan gitarski dijagram: osnovni tonovi niz stranu, vrste akorda preko vrha (kratke oznake: `dur`, `maj7`, `m7`, `sus4`…), po jedna ćelija za svaki akord. Na ekranu ispod 760 px ima 19 kolona pa se **mapa skroluje usvojno** (`.map-scroll` omotač u `index.html`), umesto da se ćelije squeeze-uju i prekinu tekst.

**Generator akorda** — `gen_chords.py` je bio jedini izvor istine i verifikovao je svih 216 oblika na pravoj gitari (tonovi akorda tačni, osnovni ton u basu, razmak ≤ 4 praga, max 15. praga; u četvornozvučnim vrstama peti ton je opcion — standardni `C7 = x32310` nema G). Reprodukovao je svih **26 otvorenih oblika** sa štampanih akord kartica **bez ijedne razlike**.

> ⚠️ **TRENUTNO STANJE (22.11.2026.): generator `gen_chords.py` i izlaz `chords.json` su OBRISANI iz scratch-a** (lokalni scratch folder se čisti nakon 24h). `js/deck-akordi.js` sadrži kompletan `DATA` blok (216 redova) i radi ispravno — ali **generator više ne postoji**. Ako treba menjati podatke o akordima, generator se mora obnoviti (ili se `DATA` menja direktno, uz proveru).
> **Redosled u generatoru mora biti isti kao redosled u `js/deck-akordi.js`** — oba imaju `tier_of`/`tierOf` sa istom logikom, `FAMILY_ORDER`/`FAM_ORDER` i `ROOT_ORDER`/`ROOTS` (krug petih). Ako se promeni jedno, promeni se i drugo.

**Provera neovisnom implementacijom.** Test u `app.test.mjs` proverava svih 216 oblika u JS-u, ali to je isti autor. Zato se obavezno proveri i **nezavisnom Python implementacijom** nad shipovanim fajlom (izvuče `DATA` redove regexom i prebroja tonove) — bug u testu ne bi uhvatio grešku u generatoru.

---

## 6. Scoring model (tri ose)

- **Tačnost** — % tačnih odgovora.
- **Brzina** — 0–100 u odnosu na „par" vreme. Par vreme se računa iz sadržaja kartice (težina činilaca) i **personalizovan je**: uzima tvoj najbolji rezultat za tu karticu × **1.35** (`PERSONAL_PAR_FACTOR`). Izvor istine je `State.parFor(deckId, card)` — UI i scorer MORAJU koristiti istu funkciju.
- **Efikasnost** — poen po minuti, normalizovano na referentni tempo (`REFERENCE_POINTS_PER_MIN = 90`).

**Poeni po odgovoru:** osnovni po oceni + bonus za brzinu (max **8**) × množitelj za niz tačnih (max **1.5**).

| konstanta | vrednost |
|---|---|
| `BASE_POINTS` | `{1: 0, 2: 5, 3: 10, 4: 12}` (Again/Hard/Good/Easy) |
| `MAX_SPEED_BONUS` | 8 |
| `COMBO_STEPS` | `[1.0, 1.1, 1.2, 1.35, 1.5]` |
| `REFERENCE_POINTS_PER_MIN` | 90 |
| `PERSONAL_PAR_FACTOR` | 1.35 |
| `DEFAULT_BASE_PAR` | 3000 ms |

**Pravilo 5 (iz srpskih pravila): „Vreme" i „Brzina" su različite stvari.** Vreme = medijana vremena odgovora (u sekundama). Brzina = ocena 0–100 prema par vremenu. Ne staviti ih na isto mesto.

---

## 7. Podešavanja i stanje

**Defaults** (`js/state.js`):

| podešavanje | default | opis |
|---|---|---|
| `newPerDay` | **20** | nove kartice po danu (range 5–60, step 5) |
| `retention` | **0.90** | ciljana retencija (range 0.70–0.97) |
| `typedInput` | **true** | unos sa tastature (umesto ručnog biranja ocene) |
| `showIntervals` | **true** | prikaži intervale |
| `randomOrder` | **true** | nasumičan redosled |
| `HIST_BUCKET` | 500 | bucket za histogram vremena |
| `LEECH_THRESHOLD` | 8 | prag za "leech" karticu |

**Dek nivo: `newPerDayLimit`** (`js/deck-registry.js`) — dek može da postavi
**sopstvenu** granicu novih kartica dnevno. Može samo da **spusti** globalno
podešavanje (`newPerDay`), nikad da ga podigne. `Decks.newPerDayLimit(deckId)`
čita je; `State.buildQueue` je primenjuje.

| paket | limit | zašto |
|---|---|---|
| `akordi` | **6** | svaki oblik se uči danima; 20 novih oblika dnevno se ne pamti nijedan |
| sva tri tabela paketa | 0 (nema) | globalno podešavanje odlučuje — tabela se uči brzo |

Posledica: list paketa pokazuje **„6 na čekanju"** za akorde, a **„20"** za tablice.
Granica se puni prebrojavanjem **samo novih** kartica (`newToday.count`), pa
pregledi ne troše dnevni rezervat.

**Storage:** `Store.set('state', ...)`, ključ `STATE_KEY = 'state'`. Cookie prefiks **`krt1`** (bio `mnz1` — promenjen 17.11.2026. prije prvog objavljivanja). Chunking: `CHUNK_SIZE = 3800` enkodiranih karaktera po kolačiću, `MAX_TOTAL = 200000`. Fallback redosled: **cookie → localStorage → memory**. **Ne zaobilazi `Store`** — chunking i fallback su tu.

**`dayKey`** — dan prelazi u **04:00** (`State.dayKey`). **Ne dodaj novi `dayKey()`.** `Scoring.todayKey` (kalendarski midnight) postoji samo kao fallback.

**Izvoz:** `kartice-podaci-YYYY-MM-DD.json`.

---

## 8. Srpski tekst na sajtu — obavezna pravila

Sajt je na srpskom (latinica). Ova pravila su rezultat zasebne gramatičke i semantičke provere (46 izmena, 20.11.2026.).

**Pravilo 1 — brojevi se slažu sa imenicima.** Srpski ima tri oblika: 1 → „dan", 2–4 → „dana", 5+ → „dana" (ali 21 → „dan", 11 → „dana", 12–14 → uvek „dana"). Postoji `State.plural(n, one, few, many)` u `js/state.js` — koristi ga za **SVE** brojeve uz imenice: kartica/kartice/kartica, ponavljanje/ponavljanja/ponavljanja, dan/dana/dana, minut/minuta/minuta, sat/sata/sati, mesec/meseca/mesec(i), godina/godine/godina, paket/paketa/paketa.
**NE** pisati `count === 1 ? ' dan' : ' dana'` — pogrešno za 21, 22, 101. Ni `n + ' kartica'` bez plural().

**Pravilo 2 — decimalni zarez.** Srpski piše `2,40 s`, ne `2.40 s`. `toFixed()` daje tačku. Koristiti `fmtDec(value, digits)` u `js/app.js` (poziva `toLocaleString('sr-Latn-RS')`). Sve vreme/sekunde/megabajti idu kroz `fmtDec`. **`toFixed()` je greška u srpskom tekstu.**

**Pravilo 3 — jedna reč za jedan pojam.** Za bodove je izabrana **„poen"** (ne „bod"): „Poeni", „poena po minuti", „Ukupno poena", „Resetovati poene i statistiku?". Ne mešati „bodovi" i „poeni".

**Pravilo 4 — skraćenice intervala su pune reči.** `intervalLabel()` vraća „1 minut", „6 minuta", „10 dana", „2 meseca", „1 godina" — NE „min", „h", „d", „mes", „god" (nema kvačica, nemaju jedinstven oblik, „d" je nečitko).

**Pravilo 5 — vreme je vreme, brzina je brzina.** (Vidi Sekcija 6.)

**Pravilo 6 — pitanje ocene.** „Koliko dobro si se setio?" (savršeni glagol). Ne „Koliko si se sećao?".

**Pravilo 7 — „Tablica" je ime množenja, NE oznaka za karticu.** Kartica se zove „kartica" (deljenje/množenje u `js/app.js` tag). Nasumičan redosled se opisuje kao „a ne po zadatom redosledu" (ne „ne po tablici" — netačno za deke koji nisu tablice).

**Pravilo 8 — potpune reči u dugom tekstu.** Meta opis, opis paketa i uvodni tekst su bez skraćenica; „pamćenje na razmak" se piše tako, a „FSRS-6 raspored" je ime koncepta.

**Provera posle izmene teksta:** `node --check` na svakom `js/*.js`, pa oba testa, pa u browseru preći kroz sva tri viewa i pročitati `innerText` — greške u dekoraciji se ne vide u kodu.

---

## 9. Vizuelni jezik („editorial / technical manual")

Korisnik je tražio da projekat **ne izgleda kao vibe coding**, nego kao da ga je neko napravio od nule.

- **Papir i tinta**, ne staklo i sjaj: `--paper` / `--ink` / `--rule` tokeni. Tamna tema = tamna škola (slate + bone), svetla = topla papir.
- **Jedan akcent** (`--accent`, crveno-oker) — retko i sa svrhom.
- **Tanka linija** (`--rule`) umesto okvira sa pozadinom; tabela sa `border-collapse`-logikom umesto kutija.
- **Oštri radijusi** (3–4 px). Nema pill-ova, nema `border-radius: 999px` osim na malim prekidačima.
- **Tipografija sa hijerarhijom**: serif (display) → sans (UI) → mono (brojevi). Svi brojevi `font-variant-numeric: tabular-nums`. Mikro-oznaka je uppercase + `letter-spacing: .13em`.
- **Bez gradijenta, bez `backdrop-filter` stakla, bez emoji ikona.**
- Papir tekstura: `body::before` sa mrežom 44 px, `opacity: .16`.
- **Wordmark oznaka je SVG** (`stroke: currentColor`, `fill: none`, `stroke-width: 1.7`) — bio tekstualni znak `×` dok je proizvod bio vezan za tablicu; sada je oznaka kartice univerzalna.

**Pravilo: svaka nova komponenta mora da se uklopi u ovaj jezik. Ako ne može da se opiše kao papir/ink/linija, verovatno ne pripada ovom projektu.**

### CSS tokeni (kompletna lista)

```
--accent --accent-2 --on-accent
--paper --paper-2 --paper-3
--ink --ink-2 --ink-3
--rule --rule-2 --rule-w
--c-again --c-hard --c-good --c-easy
--cell-learning --cell-young --cell-mature --cell-leech --cell-unseen
--serif --sans --mono
--t-body --t-display --t-h1 --t-small --t-micro
--maxw --r --r-lg --dur --ease
--shadow-card --shadow-pop
```

> ⚠️ `--gap` je obrisan 22.11.2026. — bio je definisan ali nigde korišćen.
> `--cell`, `--cols` i `--map-cols` nisu u listi jer ih **postavlja renderer**
> (`style.setProperty`), a ne CSS fajl.

---

## 10. Testovi — stanje 22.11.2026.

```bash
cd <koren repozitorijuma>/tablica
node test/app.test.mjs         # → App unit tests PASSED — 92 assertions groups, 0 failures
node test/fsrs.diff.test.mjs   # → FSRS differential test PASSED — 463 sequences, 0 mismatches vs ts-fsrs v6.0.0
```

**Oba moraju biti zelena pre svake isporuke.** ✅ (22.11.2026. — oba zelena)

**`fsrs.diff.test.mjs`** zahteva `ts-fsrs` instaliran u lokalni direktorijum sa `ts-fsrs` (menja se kroz `FSRS_REF_ROOT` env var).
> ⚠️ **22.11.2026.: referenca je bila obrisana** (scratch se čisti nakon 24h) → test pada sa `MODULE_NOT_FOUND`. **Obnovljeno:** `mkdir -p fsrs-ref && cd fsrs-ref && npm init -y && npm install ts-fsrs@6.0.0`. Ako padne opet — isti postupak.

**`app.test.mjs`** učitava **stvarne shipovane fajlove** u `vm` kontekstu sa minimalnim `window`/`document.cookie`/`localStorage`/`btoa` — nema paralelne kopije logike koja bi mogla da zastari. Za randomizaciju koristi deterministički PRNG (`seeded()`), pa su testovi ponovljivi.

### Regresioni brojevi koji moraju ostati isti

Provera da ništa nije pokvareno pri refaktoru (20.11.2026.):
- matcher: **5100 poređenja** (svaka kartica × 17 ulaza)
- par vremena: identično na svih **400** kartica
- `State.uniqueCardCount()` = **200** za tri tabele

**Regresioni brojevi reorganizacije (22.11.2026.)** — posle podele na fajlove po
paketu, ove brojke **moraju ostati iste**:
- 4 deka, **616** kartica (100 / 100 / 200 / 216)
- `Decks.validate()` → `[]`
- redosled na sajtu: `tablica-mnozenje`, `tablica-deljenje`, `tablica`, `akordi`
- 216 akorda, svaki sa 4 ponude i tačno jednim tačnim odgovorom
- prve 4 grupe akorda: `Em Am C G D A E Dm` / `F Bm` / `E7 A7 D7 G7 C7 B7` / `Em7 Am7 Dm7 Bm7`
- dnevni limit: `newPerDayLimit` akordi = **6**, tablice = 0 (globalno podešavanje)

### Šta je refaktorisano 20.11.2026. (pre refaktora je bilo drugačije)

| pre | posle |
|---|---|
| `Scoring.contentPar(card)` znao je za `mult`/`div` | `Scoring.parMs(card, stats, baseMs)` — bazni par daje deck |
| `State.tableMap(deckId, kind)` znao je za 10×10 i množenje/deljenje | `State.deckMap(deckId)` — raspored daje deck |
| `app.js` je sam pravio oznaku (`type === 'div' ? …`) | `Decks.tagFor(deckId, card)` |
| `app.js` je sam pravio pitanje (`card.front + ' ='`) | `Decks.questionFor(deckId, card)` |
| `app.js` je sam pravio proveru odgovora | `Decks.matches(deckId, input, card)` |
| `.grid-lg` je imao `repeat(11, …)` hardkodirano | `--map-cols` postavlja renderer |

### Reorganizacija na fajlove po paketu (22.11.2026.)

`js/decks.js` (662 lin.) je mešao engine i sva tri tabela paketa. Podeljen je na
`js/deck-registry.js` (ugovor + registar + generički defaultovi + `buildGrid`) i
**jedan fajl po paketu**. `js/decks.js` je **obrisan**.

Jedina promena u ponašanju: paketi više ne mogu da zovu `buildGrid` kao
lokalnu funkciju — zovu je preko registra (`Decks.buildGrid(cards, {...})`).
Pomoćnici moraju zato biti na **javnoj API površini** kad ih deli više fajlova.

**Mrtvi kod obrisan u istoj prilici** (svaka stavka proverena da je nekorišćena):
CSS `.grid-c`, CSS `.card-input-suffix`, CSS token `--gap`, `EXTENSION` i `FLAT`
u `js/deck-akordi.js`, `INIT_S_MAX` i `decayInfo` u `js/fsrs.js`.

---

## 11. Poznati problemi / otvoreno / bugovi

### Otvoreni zadaci (nisu rešeni)

1. **Deploy** — nema nginx/caddy na hostu. **Pitati korisnika gde želi live verziju** (poddomen `*.sokak.app`? drugi host?).
2. **Git repo** — projekat nije u zasebnom repou. Ponuđeno 17.11.2026., **odluka čeka**.
3. **Novi dek: procedure rada biračkih odbora u Srbiji** — planirano od strane korisnika. Treba mu sopstvena mapa (vremenska linija procedura, po analogiji sa chord mapom).
4. **Generator akorda obrisan** (vidi Sekcija 5) — obnoviti ako se menja podaci o akordima.

### Rešeno 22.11.2026. — arhitektura je modularna

Planirani dek (procedure biračkih odbora) **ne zahteva izmenu motora**:
napravi se `js/deck-odbornici.js` sa svojim `build()`, `map()` i `parMs()`,
doda jedan script tag u `index.html` — i to je to. Mapa više nije vezana za
tablicu: paket bez sopstvene mape dobija generički pregled kartica.

### Regresioni / popravljeni bugovi (za referencu, ne dirati)

- **Undo nije radio u normalnom toku** (17.11.) — taster `U` se obrađivao samo dok je panel ocena vidljiv, a u unosu sa tastature taj panel se nikad ne vidi. Popravljeno: `U` radi uvek dok je sesija aktivna (ali ne dok se piše u polje), vidljivo dugme „Vrati" (`#undo-btn`), `State.undo()` vraća i `streak` i `combo` (prethodna vrednost, **ne** 0).
- **Statistika „Tablica deljenja" prikazivala praznu mapu množenja** (17.11.) — `tableMap` je uvek zvao sa `'mult'`. Popravljeno kroz `map()` po decku + zrcalne ose.
- **„undefined kartica" za deke koji nikad nisu otvoreni** (20.11.) — **pre-existing bug za SVE deke**, ne samo akorde. `deckSummary` je vraćao rezultat bez broja kartica. Popravljeno + regresioni test.

### Pravilo: undo mora biti dostupan uvek

Svaka akcija koja menja stanje mora da ima **dostupan** izlaz:
- taster koji radi **van** uslova koji ga čine relevantnim;
- **vidljivo dugme** za istu akciju (mobilni nema tastature).

**Dodatno — čuvaj snapshot svega što je odgovor promenio.** `State.grade()` snima snapshot; `State.undo()` mora da vrati **svako** polje koje je odgovor dirao:
- **streak** (`state.global.streak`) — `Scoring.updateStreak` ga menja *in place*, pa snapshot mora kopirati (`count` + `lastDay`);
- **combo** — živi u `session`, ne u `State`, pa `applyGrade()` mora sačuvati `comboBefore` u entry-ju; undo vraća tačnu vrednost, **ne** `0`.

---

## 12. Kako raditi na projektu (workflow)

### Redosled rada
1. Pročitaj **ovaj fajl** (`PROJEKT.md`) — to je dovoljno za 90 % zadataka.
2. Proveri stanje na disku ako menjaš fajlove (`mtime`, `grep`).
3. Izmeni.
4. `node --check` na svakom izmenjenom `js/*.js`.
5. Oba testa moraju biti zelena.
6. Proveri u browseru ako je UI u pitanju.
7. Ažuriraj **ovaj fajl** ako se promeni ugovor, API ili stanje.

### Pravilo sinhronizacije (22.11.2026.)

**`PROJEKT.md` i skill `tablica-app` moraju da budu usklađeni sa kodom u SVAKOM
završnom ciklusu rada** — ne kad se nešto „seti" da se dopuni.

Konkretno, posle svake izmene projekta:
1. **Brojevi u ovom fajlu moraju biti izmereni, ne zapamćeni.** Redosled
   fajlova, broj linija, broj kartica, broj test grupa, broj dekova — sve
   izmeri (`wc -l`, `node` skripta, izlaz testa). Zapisana brojka koja je
   zastarela je gore od odsutne brojke.
2. **Istorija promena** (Sekcija 14) dobija stavku za svaku sesiju — šta je
   promenjeno, zašto, i koji su brojevi pre/posle.
3. **Skill `tablica-app`** dobija: novu strukturu fajlova, novo pravilo
   ugovora, i novu proceduru (npr. `references/chord-teaching-order.md`).
4. **Ako je fajl obrisan ili preimenovan** — proveri da **nigde** u oba
   dokumenta ne ostaje stara referenca (`grep -rn "stari-naziv"`).

### Čišćenje mrtvog koda

Kad se radi veća reorganizacija, **proveri i mrtvi kod** — ne samo novu
strukturu. Postupak (22.11.2026.):

1. Skripta koja prođe kroz sve fajlove i nađe **funkcije** deklarisane ali
   nigde korišćene (broj pojavljivanja ≤ 1).
2. Skripta koja nađe **CSS klase** koje nisu ni u HTML-u ni u JS-u.
3. Skripta koja nađe **CSS varijable** (`--x`) definisane ali nikad
   korišćene, i obrnuto.
4. Skripta koja nađe **`var`/`const` promenljive** deklarisane ali nekorišćene.

**Svaka stavka se proverava ručno pre brisanja** — mnogo klasa izgleda
nekorišćeno, ali se dodaje dinamički (`' ' + (ok ? 'good' : 'bad')`).
Lažni pozitiv je češći od prave greške.

### Modularnost — jedan fajl po paketu

Ovo je **arhitektonsko pravilo**, ne preferencija:

- Svaki paket karata ima **svoj fajl** `js/deck-<tema>.js`.
- `js/deck-registry.js` drži ugovor, registar i generičke defaultove —
  **ne zna nijednu temu**.
- Paketi **ne zavise jedan od drugog**: svaki ima svoje generatore kartica,
  svoju mapu, svoj `parMs`.
- Zajednički pomoćnici moraju biti na **javnoj API površini** registra
  (`Decks.buildGrid(...)`), jer ih više fajlova deli.
- Dodavanje teme = **novi fajl + jedan script tag**, bez ijedne izmene motora.

Razlog (zahtev korisnika 22.11.2026.): „da jednog dana bude mnogo više
različitih deckova, to ne utiče na brzinu učitavanja i stabilnost koda".

### Pokretanje browsera za proveru
```bash
cd <parent projekta> && python3 -m http.server 8899
# → http://127.0.0.1:8899/tablica/
```

### Browser zamke (bitno!)

- **Browser kešuje `js/*.js` po imenu fajla** — `index.html` ima `?v=` samo na URL stranice, ne na skripte. Posle izmene JS-a browser može pokazati staru verziju, i greška "se popravi" a na ekranu ostaje stara.
  Provera: `curl -s http://127.0.0.1:8899/tablica/js/<fajl> | grep <novi_tekst>`, pa u browseru `cdp('Network.setCacheDisabled', cacheDisabled=True)` i reload. Za deploy: `?v=YYYYMMDDHHMM` bump.
- **Native `confirm()` blokira headless browser** — sesija se zaglavi na `Runtime.evaluate` kad dijalog otvori (dialog handler se ne može "kliknuti" iz CDP-a). Pre svakog testa koji dira reset dugmad: `js("window.confirm = m => (window.__confirms.push(m), true)")` — i stubb-uj **pre** prvog klika. Ako se browser već zaglavi: prekini sesiju i kreni novu.
- **`capture_screenshot()` sa `captureBeyondViewport=full` vremenski istekne** u ovom okruženju. Umesto njega zovi `cdp("Page.captureScreenshot", format="png")` i zapiši `result["data"]` (base64) sam — to radi i na mobilnom prikazu.
- **Browser harness ubacuje 🐴 na početak `<title>`** — to je artefakt harnessa, ne projekta. Da se potvrdi: kontrolna HTML stranica sa `<title>TEST TITLE</title>` i pojavljuje se „🐴 TEST TITLE". **Ne „popravljaj" naslov u fajlu zbog ovoga.**

### Opšta pravila
- **Ne menjaj `js/fsrs.js` bez pokretanja diferencijalnog testa.** To je jedina stvar koja drži scheduler ispravnim.
- **Ne dodaj novi `dayKey()`** — koristi `State.dayKey` (04:00 rollover).
- **Ne vraćaj gradijente, staklo ni pill-ove.**
- **Ne zameni `border-collapse`-tabelu za grid sa kutijama** — linija je jezik.
- **Ponude (imena, opcije, variante) idu U CHAT, ne u novu web stranicu** — korisnik je to eksplicitno tražio 17.11.2026. (bio je napravljen `_imena.html`, obrisan).
- **Ne izmišljaj brojke, cene, izvore, statistiku.** Sve u ovom fajlu je mereno ili provereno — ako nešto nije, označiti kao pretpostavku.

---

## 13. Uvodni tekst na početnoj strani

Naslov je **„Kako funkcioniše"** (ne „Paketi karata"), a ispod je kratak opis rada aplikacije: izbor paketa → ocena odgovora → raspored FSRS-6 određuje kad se kartica vraća → nasumično izdavanje → podaci ostaju u pretraživaču.

Korisnik je eksplicitno tražio da na tom mestu bude **objašnjenje kako sajt funkcioniše**, umesto naziva sekcije. Zato je naglasak na mehanizmu, ne na spisku sadržaja.

**Kada se doda novi paket, tekst NE treba da ga enumeriše** — opisuje mehanizam koji je isti za sve pakete. To je i razlog zašto ime proizvoda mora da bude univerzalno.

### Hiperlinkovi i uvodni tekst (22.11.2026., revidirano istog dana)

Korisnik je tražio da se sa interneta pronađe objašnjenje šta je FSRS-6 i da se hiperlinkuje sa ovog mesta. Na kraju je zadržan **jedan link**:

| Tekst | URL | Zašto baš ovaj |
|---|---|---|
| „Free Spaced Repetition Scheduler" | `https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm` | Zvanični Anki priručnik, FAQ odeljak „What spaced repetition algorithm does Anki use?" — **objašnjenje modela pamćenja** (Retrievability / Stability / Difficulty) za čitaoca koji ne zna matematiku. |

Link ima `target="_blank" rel="noopener noreferrer"` i `title` atribut, i u `.lede p` je podvučen.

**Fraza „FSRS-6 raspored" više NIJE link** — korisnik je eksplicitno tražio da bude samo *italic* (`<em>FSRS-6 raspored</em>`). Raniji link na zvanični wiki (`.../The-Algorithm#fsrs-6`) je uklonjen iz teksta, **ali ostaje važan kao referenca za proveru**: svih 21 parametar našeg `DEFAULT_W` (`w20 = 0.1542`) identičan je parametrima iz te sekcije. To je i dalje specifikacija po kojoj je `js/fsrs.js` napisan.

**Provera URL-a je obavezna** (`curl -o /dev/null -w "%{http_code}"`):
- `docs.ankiweb.net` koristi **clean URL bez `.html`** — `/manual/deck-options.html` vraća **404**, a `/manual/deck-options` i `/faqs/what-spaced-repetition-algorithm` vraćaju 200.
- **GitHub wiki ne skoči na `#fsrs-6` u headless browseru** — ali ni eksplicitni `window.scrollTo()` ne radi tamo (stranica ima 16050px visine). To je ograničenje headless alata, ne linka: `#fsrs-6` je anchor koji **sam GitHub wiki generiše** za to poglavlje, pa radi u običnom browseru.

### Uvodni blok — bez ukupnog broja na čekanju (22.11.2026.)

U `.lede` je uklonjen blok „Na čekanju" sa ukupnim brojem kartica (`#lede-due`, klasa `.lede-meta`).

**Zašto:** ukupan broj je zbroj preko svih paketa, pa osobi koja uči tablicu množenja pokazuje i kartice gitarskih akorda — njen broj ne znači ništa za nju. Korisnik je to eksplicitno naveo.

Zato je:
- `.lede` više nije grid sa dve kolone — to je običan blok;
- `.lede p` **nema `max-width`** (ranije `62ch`) — tekst se razvlači **od leve do desne margine**, kao što je traženo;
- `#lede-due` i `.lede-meta` su obrisani iz `index.html`, `css/style.css` i `js/app.js` (uključujući nepotrebni `totalDue` u `renderDecks`).

**Per-dek broj „20 na čekanju" u listi paketa je OSTAO** — on je uz svaki paket i odnosi se na *taj* paket, pa ne vara.

---

## 14. Istorija promena

| Datum | Šta |
|---|---|
| ~13.11.2026. | Početak: FSRS-6 port (`js/fsrs.js`) + diferencijalni test protiv `ts-fsrs` v6.0.0 |
| 17.11.2026. | Preimenovanje „Tablica" → **„Kartice"**: naslov, wordmark SVG kartice (umesto `×`), favicon, meta opis, kolofon, cookie prefiks `mnz1`→`krt1`, naziv izvoza. Deck ID-jevi **nisu menjani**. Uvodni blok „Paketi karata" → **„Kako funkcioniše"**. Popravljeni bugovi: undo i prazna mapa deljenja. 46→49 test grupa. |
| 19.–20.11.2026. | **Engine refaktor na ugovor deka** — tema znanja prebačena iz motora u `js/decks.js`. Runtime-registrovan paket prošao kompletan tok **bez ijedne izmene motora**. `mapKind` uklonjen → `map()` po decku. 49→64 test grupe. |
| 20.11.2026. | **QA srpskih tekstova** — 46 izmena, 8 pravila za srpski tekst zapisana (vidi Sekcija 8). 64→79 test grupa. Popravljen pre-existing bug „undefined kartica". |
| 21.11.2026. | **Novi paket „Gitarski akordi"** — `js/decks-chords.js`, 216 kartica, `Decks.register()`, `ordered: true`, `chord-card`/`chord-map` klase, normalizacija simbola akorda. Svih 216 oblika verifikovano na pravoj gitari (0 grešaka), dva puta nezavisno (JS + Python). 79 test grupa, 0 grešaka. |
| 22.11.2026. | Ovaj fajl (`PROJEKT.md`) — kompletno stanje u jednom dokumentu. Obnovljena `ts-fsrs` referenca za diff test. Potvrđen ID ugovor (0 nedostajućih), 4 deca / 616 kartica, `validate()` prazno. |
| 22.11.2026. | ~~**Podskaz na svim paketima**~~ — **NAPRAVLJENO istog dana, vidi stavku ispod.** (Prva verzija: dugme „Podskaz", taster `H`, opisna pomoć koja ne otkriva odgovor.) |
| 22.11.2026. | **Kviz za paket `akordi`** — 4 ponuđena odgovora umesto polja za unos; klik ocenjuje se kao ukucani odgovor. Novi ugovor deka: `choices(card)` + `hideLabelInQuiz`. Distraktori: isti koren druge vrste, ista vrsta drugog korena, i pogrešan u oba. Redosled fiksiran po kartici. 79→93 test grupe. |
| 22.11.2026. | **Hiperlinkovi za FSRS-6** u uvodnom tekstu („Kako funkcioniše") — zvanični wiki (`#fsrs-6`, čiji se 21 parametar poklapa sa našim `DEFAULT_W`) i Anki FAQ (objašnjenje modela pamćenja). |
| 22.11.2026. | **Open source + javni repo** — projekat objavljen kao `github.com/banegrbic/kartice` (javno, MIT, grana `master`). Dodati `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `.htaccess`, `.gitignore`, `docs/` sa 5 screenshotova. Kolofon sajta dobio „otvoreni kod — GitHub" i „portfolio: sokak.app" (oba linka poravnata desno u drugoj grupi). |
| 22.11.2026. | **Popravljen CSS bug: kolofon uži od sadržaja** — `.colophon` je flex item u kolonskom `.app-shell`, pa je `margin: 0 auto` skupljao na 589px umesto 1160px (sadržaj je bio 1160px). Rešenje: `width: 100%` uz `max-width`, isto kao `.main`. Provereno merenjem oba bloka: 1160 = 1160. |
| 22.11.2026. | **Deploy na `https://kartice.sokak.app/`** — rsync **bez `--delete`** (folder pripada cPanel panelu: `cgi-bin/` i `.well-known/acme-challenge/` se ne smeju brisati). Sve 11 JS/CSS asseta vraćaju 200, SSL validan do 20.02.2027, browser potvrđuje 4 paketa / 616 kartica / 0 JS grešaka. |
| 22.11.2026. | **About na GitHub-u preuređen** — kratki `description` (142 znaka, jedan red) umesto 1535-znakovnog spljoštenog prosa koji je zauzimao naslov pretraživača. README dobio „Za koga je", „Kako radi, u pet koraka", opis šta se uči u svakom paketu, i pojašnjen „Pomoć"/kviz/statistika. |
| 22.11.2026. | **REORGANIZACIJA: svaki paket u zasebnom fajlu** — `js/decks.js` (662 lin., mešao engine i 3 tabela paketa) podeljen na `js/deck-registry.js` (ugovor + registar + generički defaultovi, 516 lin.) i **jedan fajl po paketu**: `js/deck-tablica-mnozenje.js` (114), `js/deck-tablica-deljenje.js` (110), `js/deck-tablica.js` (118), `js/deck-akordi.js` (preimenovan iz `js/decks-chords.js`, 802). Svaki paket se sam prijavljuje `Decks.register()`; redosled na sajtu = redosled script tagova u `index.html`. `js/decks.js` **obrisan**. Zahtev: „svi deckovi kartica u zasebnim fajlovima, da mnogo više deckova ne utiče na brzinu učitavanja i stabilnost koda". |
| 22.11.2026. | **Čišćenje mrtvog koda** — obrisano: CSS `.grid-c` (mapa koristi `.grid-lg .cell`), CSS `.card-input-suffix` (nigde se ne koristi), CSS token `--gap` (definisan, nekorišćen), `EXTENSION` u `js/deck-akordi.js` (nekorišćen), `FLAT` u `js/deck-akordi.js` (duplikat `flats` mape u `normaliseSymbol`), `INIT_S_MAX` i `decayInfo` u `js/fsrs.js` (mrtvo). Nema mrtvih funkcija ni promenljivih u celom projektu (provereno skriptom). |
| 22.11.2026. | **Revidiran „Pomoć" (korisničke korekcije): (1) „Podskaz" → **„Pomoć"** (taster `H` → `P`); (2) „Pomoć" sada **otkriva tačan odgovor** (`card.back`) umesto opisne pomoći — obrisani `Decks.hintFor()`, `defaultHint()`, `multiplicationHint()`, `divisionHint()`, `chordHint()` i polje `hint(card)` iz ugovora deka; preimenovanja `hintUsed`→`helpUsed`, `breakdown.hinted`→`breakdown.helped`; u kvizu se dodatno markira tačno dugme (`.correct`); (3) uklonjen hiperlink „FSRS-6 raspored" — fraza je sada samo *italic*; (4) uklonjen ukupan broj „Na čekanju" iz `.lede` i `max-width: 62ch` — tekst se razvlaži od leve do desne margine. 93→90 test grupa. |
| 22.11.2026. | **Kartica „Kartice" na portfoliju `sokak.app`** — projekat dodat kao 4. stavka u sekciji „// projekti" (thumbnail 600×333 iz `docs/screenshot-1-deckovi.png`, link ka `https://kartice.sokak.app/` i `github.com/banegrbic/kartice`, oznaka „open source", datum „novembar 2026"). Ovaj projekat NIJE menjan — samo portfolio. |

---

## 15. Srodni resursi

| Gde | Šta |
|---|---|
| Skill `tablica-app` | Skill projekta (procedure + pravila). **Ovaj `PROJEKT.md` je sadržajni izvor istine**; skill drži workflow pravila. |
| Skill `vanilla-browser-app` | Generičke tehnike: bez builda, cookie chunking, diferencijalni test algoritma, verifikacija u browseru. |
| `~/Documents/Obsidian Vault/Tablica-Karte-Mnozenje.md` | Beleška u Obsidian vaultu (stanje 20.11.2026.) |
| `~/Documents/Obsidian Vault/Daily/*.md` | Dnevni rezimeji — detaljna istorija rada |

---

*Stanje verifikovano 22.11.2026. (posle reorganizacije): `node test/app.test.mjs` → 92 grupe / 0 grešaka · `node test/fsrs.diff.test.mjs` → 463 sekvenci / 0 neslaganja · 4 deca / 616 kartica · `Decks.validate()` → `[]` · ID ugovor: 0 nedostajućih (71 HTML id-jeva / 67 JS referenci).*
