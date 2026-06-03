# Design: Echte Filter für Suche und Bibliothek (+ lokale Anreicherung)

**Datum:** 2026-06-03
**Status:** Entwurf genehmigt
**Kontext:** Ergänzung zur Desktop-GUI. Bisher gibt es nur Interpret/Titel-Suche (USDB) und einen Namens-Textfilter (Heruntergeladen). Gewünscht: echte Filter nach Sprache, Genre, Jahr und wählbare Sortierung — in beiden Bereichen. Zusätzlich (genehmigte „Stufe 0"-Anreicherung): lokale Cover anzeigen und weitere song.txt-Header erfassen.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| USDB-Filter | **Serverseitig** über die USDB-Formularparameter (`language`, `genre`, `year`, `order`, `ud`) — Pagination und Bulk-Queueing bleiben korrekt |
| Lokale Filter | Clientseitig über neue optionale Metadaten-Felder am `DownloadedEntry` |
| Metadaten-Quelle | `song.txt`-Header (`#LANGUAGE`, `#GENRE`, `#YEAR`, `#BPM`, `#EDITION`, `#CREATOR`) |
| Backfill bestehender Einträge | Erneutes „Archiv importieren" aktualisiert getrackte Einträge ohne `language` (Ergebnis: `refreshed`-Zähler) |
| Lokale Cover | Importierte/rekonstruierte Einträge (negative apiId) zeigen `cover.jpg` aus dem Song-Ordner |
| Online-Anreicherung | **Vertagt** (MusicBrainz/Spotify etc. als eigenes späteres Feature) |

## Core-Änderungen

### `parseTxtHeaders` (repairSongs.ts) — erweitert

Rückgabe neu:
```ts
{
  artist?: string;  title?: string;
  language?: string; genre?: string; edition?: string; creator?: string;
  year?: number;    bpm?: number;
}
```
- Scannt den zusammenhängenden Header-Block am Dateianfang (Abbruch bei der ersten nicht-leeren Zeile, die nicht mit `#` beginnt) — der bisherige Früh-Abbruch nach ARTIST+TITLE entfällt.
- `year`: `Number.parseInt(..., 10)`, nur gesetzt wenn gültige Zahl.
- `bpm`: Komma wird als Dezimaltrenner akzeptiert (`"294,5"` → 294.5), nur gesetzt wenn gültige Zahl.
- Bestehende Aufrufer (Reparatur) bleiben kompatibel (nutzen weiter nur artist/title).

### `DownloadedEntry` (downloaded.ts) — optionale Felder

```ts
language?: string; genre?: string; edition?: string; creator?: string;
year?: number; bpm?: number;
```
Rückwärtskompatibel: alte JSON-Einträge bleiben gültig.

### `importArchive` — Metadaten + Backfill

- Neue Einträge erhalten die geparsten Metadaten-Felder.
- **Backfill:** Bereits getrackte Ordner, deren Eintrag **kein `language`-Feld** hat, werden ebenfalls geprobt; vorhandene Felder werden NICHT überschrieben, fehlende ergänzt. Solche Einträge zählen als `refreshed` (statt `skipped`).
- `ImportResult` neu: `{ imported, importedWithoutVideo, skipped, refreshed }`.

### `SearchParams`/`buildFormBody` (search.ts) — neue Parameter

```ts
language?: string; genre?: string; year?: number;
order?: "lastchange" | "interpret" | "title" | "year" | "rating";
ud?: "asc" | "desc";
```
- Defaults unverändert (`order=lastchange`, `ud=desc`); leere Filter werden nicht gesendet.
- **Risiko/Verifikation:** Die exakten USDB-Parameternamen und akzeptierten Werte (Dropdown-Vokabulare) werden beim Live-Test verifiziert; bei Abweichung wird nur `buildFormBody` angepasst.

### Download-Pfad

Nach erfolgreichem Download liest der Main-Prozess (`downloadSongItem`) die geschriebene `song.txt` und übergibt die geparsten Metadaten an `appendDownloadedEntry` — frisch geladene Songs sind damit sofort filterbar.

## IPC

- `queue:fetchAllPages`-Payload erweitert um `language?/genre?/year?/order?/ud?` (gleiche Filter wie die Suche; „Ganze Datenbank" bleibt bewusst ungefiltert).
- Neuer Kanal `covers:getLocal` (`songDir: string`) → data-URL von `<songDir>/cover.jpg` oder `null`.
  **Sicherheit:** Der Handler akzeptiert nur `songDir`-Werte, die exakt einem Eintrag in `state.downloaded` entsprechen (autoritativer Lookup), und liest ausschließlich die Datei `cover.jpg` darin — kein beliebiger Dateizugriff aus dem Renderer. Memory-Cache wie bei USDB-Covern (LRU 200), kein Disk-Cache (Datei liegt bereits lokal).

## UI

### SearchView — aufklappbare Filterzeile

Unter den Suchfeldern ein „Filter"-Toggle (ChevronDown/Up + `SlidersHorizontal`-Icon). Aufgeklappt:
- **Sprache:** Select mit kuratierter USDB-Liste + „Alle" (Initial: English, German, Spanish, French, Italian, Portuguese, Dutch, Polish, Swedish, Norwegian, Danish, Finnish, Russian, Japanese, Korean, Chinese, Turkish, Czech, Hungarian, Slovak, Croatian, Serbian, Greek, Other)
- **Genre:** Select + „Alle" (Initial: Pop, Rock, Schlager, Musical, Soundtrack, Disney, Metal, Punk, Country, Folk, Rap, Hip-Hop, R&B, Soul, Reggae, Electronic, Dance, Jazz, Blues, Christmas, Anime, Game, Volksmusik, Other)
- **Jahr:** Zahlenfeld (exakt — USDB unterstützt keine Bereiche)
- **Sortierung:** Select (Zuletzt geändert [Standard], Interpret, Titel, Jahr, Bewertung) + Richtungs-Button (auf-/absteigend)

Filter fließen in jede Suche und in „Alle Seiten in Queue". Aktive Filter werden am Toggle als Zähler-Badge angezeigt.

### DownloadedView — Filterleiste

Neben dem Textfilter:
- **Sprache:** Select aus den distinkten Werten der Einträge, mit Zählern (z.B. „German (12.480)"); Eintrag „Unbekannt" für Einträge ohne Feld
- **Genre:** Select, distinkt + „Unbekannt"
- **Jahr:** von/bis (zwei Zahlenfelder; Einträge ohne Jahr fallen bei aktivem Jahresfilter heraus)
- Alle Kriterien kombiniert per UND; Anzeige-Cap (500) und Zähler bleiben.
- Die Import-Ergebnismeldung nennt zusätzlich `refreshed`: „… · N Einträge um Metadaten ergänzt".

**Nachtrag (Nutzer-Feedback 2026-06-03):**
- **Facetten-Zähler:** Die Optionen/Zähler eines Dropdowns berechnen sich aus den Einträgen, die alle ANDEREN aktiven Filter erfüllen (klassisches Faceting) — nicht aus der Gesamtmenge.
- **Mehrwertige Felder:** `language`/`genre` werden für Faceting UND Matching an `,`/`;`/`/` gesplittet (getrimmt) — ein Song „Japanese, German" erscheint unter beiden Sprachen.
- **Dropdown-Optionen alphabetisch** (de-Locale, „Unbekannt" am Ende) statt nach Häufigkeit.
- **Listen-Sortierung:** Dropdown „Neueste zuerst" (Standard) / „Interpret A–Z" / „Titel A–Z" / „Jahr aufsteigend" (Einträge ohne Jahr am Ende).
- **Infinite Scroll statt 500er-Cap:** Beim Scrollen ans Listenende werden jeweils 500 weitere Zeilen nachgeladen (IntersectionObserver-Sentinel). Der sichtbare Umfang springt bei Änderung von Filtern/Sortierung auf 500 zurück; der „nutze den Filter"-Hinweis entfällt.

### Lokale Cover

`CoverThumb` erhält optional `songDir`; bei `apiId <= 0` und vorhandenem `songDir` wird `covers:getLocal` genutzt. DownloadedView übergibt `songDir` statt des leeren Platzhalters.

## Tests

- `parseTxtHeaders`-Erweiterung: TDD (Sprache/Genre/Jahr/BPM mit Komma/Edition/Creator; Header-Block-Ende; Abwärtskompatibilität artist/title).
- `importArchive`: TDD für Metadaten-Übernahme + Backfill (`refreshed`-Zählung, kein Überschreiben vorhandener Felder).
- `buildFormBody`: Charakterisierungs-Tests für die neuen Parameter (gesetzt/nicht gesetzt) — dafür wird `buildFormBody` exportiert.
- Bestehende Tests bleiben grün (parseTxtHeaders-Aufrufer kompatibel).

## Bewusst nicht enthalten

- **Tempo-Filter trotz erfasstem BPM:** UltraStar-`#BPM` ist nicht das reale Lied-Tempo (häufig ×2/×4-Notenraster). Ein Filter darauf würde falsch einordnen. BPM wird erfasst und gespeichert; ein Tempo-Filter folgt erst mit sauberer Normalisierung.
- Online-Anreicherung (MusicBrainz, Spotify, iTunes/Deezer) — eigenes späteres Feature.
- Edition/Creator-Filter in der UI (Felder werden erfasst, Filter bei Bedarf später trivial ergänzbar).
- TUI-Anbindung der neuen Filter.
