# Doprinosi

Voljni su i pozdravljeni. Ovaj fajl opisuje kako da doprinosiš tako da
projekt ostane čitljiv i stabilan.

## Pre nego što počneš

**Pročitaj [`PROJEKT.md`](PROJEKT.md).** On je kanonski izvor istine: opisuje
strukturu fajlova, ugovor deka, pravila za srpski tekst i istoriju promena.
Ne treba ti ni jedan drugi fajl da bi znao kako projekat funkcioniše.

## Podešavanje

Nema build procesa i nema runtime zavisnosti. Potreban je samo Node (za
testove) i bilo koji statički server:

```bash
python3 -m http.server 8000
# → http://127.0.0.1:8000/
```

Testovi:

```bash
node test/app.test.mjs         # mora proći
node test/fsrs.diff.test.mjs   # obavezno ako dirneš js/fsrs.js
```

## Pravila

### 1. Motor ne sme da sazna za temu

`js/app.js`, `js/state.js`, `js/scoring.js`, `js/storage.js` i `js/fsrs.js`
ne smeju da sadrže imena tema, tipova kartica ni naziva paketa. Sve što je
specifično za temu živi u `js/deck-<tema>.js`.

Provera:

```bash
grep -nE "type === '(mult|div)'|card\.[ab]\b|mapKind|tableMap" \
  js/app.js js/state.js js/scoring.js
```

mora vratiti prazno.

### 2. Novi paket = novi fajl

Dodavanje teme znači:

1. novi fajl `js/deck-<tema>.js` sa svojim `build()`, `map()` i `parMs()`,
2. jedan `<script>` red u `index.html`,
3. jedan red u `test/app.test.mjs` (lista fajlova koje test učitava),
4. stavka u tabeli paketa u `PROJEKT.md`.

Nemoj dodavati temu u `js/deck-registry.js` — on drži samo ugovor i defaultove.

### 3. Deck ID-jevi se ne menjaju

`id` paketa je ključ pod kojim živi sačuvani raspored u `state.decks[deckId]`.
Preimenovanje ostavlja siročeću istoriju kod korisnika. Menja se `name` (ono
što korisnik čita) i `subtitle`/`description`.

### 4. Srpski tekst

Tekst je na srpskom (latinica) i ima osam pravila — brojevi se slažu sa
imenicama (`State.plural`), decimalni zarez (`fmtDec`), „poen" a ne „bod",
pune reči umesto skraćenica intervala, „Pomoć" a ne „Podskaz", i drugo.
Pravila su ispisana u `PROJEKT.md`, sekcija 8.

Provera posle izmene teksta: `node --check`, pa oba testa, pa u browseru
preći kroz sva tri viewa i pročitati `innerText` — greške u dekoraciji se
ne vide u kodu.

### 5. Brojevi u dokumentaciji se mere

Ako promeniš broj kartica, test grupa ili linija koda, **izmeri** ga i
ažuriraj `PROJEKT.md`. Zapamćena brojka koja je zastarela je gore od
odsutne brojke.

### 6. Sinhronizacija

Posle svake izmene ažuriraj i `PROJEKT.md` (ugovor, API, stanje, istorija
promena) i `README.md` ako se promeni korisničko vidljivo ponašanje.

## Kako da pošalješ izmenu

1. Otvori issue sa opisom šta menjaš i zašto — za veće promene prvo.
2. Napravi granu: `git checkout -b moja-izmena`.
3. Piši test za novo ponašanje. Testovi u `test/app.test.mjs` učitavaju
   **stvarne shipovane fajlove**, pa ne pravi paralelnu kopiju logike.
4. `node --check` na svakom izmenjenom fajlu, pa oba testa.
5. Otvori pull request sa kratkim opisom i referencom na issue.

## Očekivano ponašanje

Kad god je moguće, prvo postavi pitanje u issue-u. Za promene u rasporedu
učenja, dnevnom limitu ili ugovoru deka, obavezno navedi **zašto** — te
odluke nisu proizvoljne i imaju posledice za učenika.

## Kredencijali

**Nikad ne commituj kredencijale.** Ako ti treba SSH ključ, token ili lozinka
za lokalni razvoj, to ide u `.gitignore` (`secrets/`, `*.pem`, `*.key`, `.env`)
i nikad u javni repo.

## Prijava bezbednosnog problema

Ako nađeš bezbednosnu grešku, prijavi je **privatno** kroz
[GitHub Security Advisories](https://github.com/banegrbic/kartice/security/advisories/new),
ne kroz javni issue.
