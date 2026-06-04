# Design: VIDEOGAP-Korrektur aus Kommentaren + Suchfilter-Extras

**Datum:** 2026-06-04
**Status:** Entwurf genehmigt

## Teil 1: VIDEOGAP aus USDB-Kommentaren

**Problem:** Video-Links stehen in USDB-Kommentaren; manche Kommentare enthalten zusätzlich eine Korrektur wie `#VIDEOGAP:37.5` (das verlinkte Video startet versetzt). Die song.txt aus `gettxt` kennt diesen Wert nicht → Video und Text laufen auseinander (realer Fall: Trailerpark – Fledermausland, id 27002).

**Lösung:**
- `parseYoutubeLinks` (core/api/usdb/youtube.ts): pro Kommentar-Block zusätzlich `#VIDEOGAP:\s*(\d+(?:[.,]\d+)?)` erfassen → `YoutubeLink.videoGap?: string` (Wert verbatim, Punkt/Komma wie gepostet). Der Gap gehört zum Link **desselben** Kommentars.
- `downloadSong`: Hat der gewählte Link (`links[0]`, neuester Kommentar) einen `videoGap`, wird im Header-Objekt der song.txt `videogap` überschrieben/ergänzt (vor dem mp3/video/cover-Override).
- `repairSongs` (`repairSingleSong`): Kommt das Ersatz-Video aus einem Link mit `videoGap`, wird die bestehende song.txt gepatcht — `^#VIDEOGAP:`-Zeile ersetzen, sonst nach der ersten Header-Zeile einfügen. Best-effort (Fehler beim Patchen bricht die Reparatur nicht ab).
- Tests (TDD): Fixture aus dem realen Fledermausland-HTML (gekürzt auf den Kommentar-Abschnitt): Kommentar 1 mit Video `EAC-2ttHCyk` + `#VIDEOGAP:37.5`, Kommentar 2 (`fpJ0VJGNXgY`) ohne Gap → links[0].videoGap === "37.5", links[1].videoGap undefined.

**Bewusst nicht:** Rückwirkende Massen-Korrektur bereits geladener Songs (28k Detail-Abrufe). Einzelfall-Weg: Song-Ordner löschen → neu herunterladen.

## Teil 2: Suchfilter & Anzeige (Golden Notes, Songcheck, Rating, Views)

**Live verifiziert (2026-06-04):** Das USDB-Suchformular kennt `golden` und `songcheck` als Filterfelder; Rating/Views sind nicht filterbar, stehen aber als Spalten in der Ergebnis-Tabelle. Reale Zellreihenfolge: [0] Artist, [1] Title, [2] Genre, [3] Year, [4] Edition, [5] Golden Notes (Yes/No), [6] Language, [7] Creator, [8] Rating (`images/star.png` voll, `images/half_star.png` halb, `images/star2.png` leer), [9] Views; die Zip-Zelle [10] hat keine Attribute und wird von der bestehenden td-Regex nicht erfasst.

**Core (search.ts):**
- `Song` optional erweitert: `genre?`, `year?` (number), `edition?`, `goldenNotes?` (boolean, Zelle[5]==="Yes" case-insensitiv), `creator?`, `rating?` (number 0–5: Anzahl `images/star.png` + 0,5×`half_star.png`), `views?` (number).
- `parseSongFromTable` mappt die Zellen entsprechend (Entities dekodiert; ungültige Zahlen → Feld weglassen). Pflichtfelder/Null-Verhalten unverändert.
- `SearchParams` += `golden?: boolean`, `songcheck?: boolean`; `buildFormBody` sendet die Parameter nur bei `true` (Wert „1"; exakte Akzeptanz wird beim Live-Test verifiziert und ggf. nur hier angepasst).
- Bestehende Test-Fixtures werden auf die reale 10-Zellen-Struktur umgestellt; neue Assertions für golden/rating/views.

**Desktop:**
- `SearchRequest`/`BulkQueueRequest` += `golden?`, `songcheck?` (fließt damit auch in „Alle Seiten in Queue"); `usdb:search`/`fetchAllIntoQueue` reichen durch.
- SearchView-Filterzeile: Checkboxen „Nur Golden Notes" und „Nur Songcheck" (zählen im Filter-Badge mit).
- Ergebnis-Tabelle: zwei schlanke Spalten — Bewertung (`★ 4,5`-Text, leer wenn ohne Rating) und Views (de-formatiert). 
- Sortierung: Option „Views" zusätzlich, NUR falls USDB `order=views` akzeptiert (Live-Test; sonst entfällt die Option ersatzlos).

## Verifikation

- Unit-Tests: youtube-Kommentar-Parsing (realer Fixture-Fall), parseSongFromTable (neue Zellen), buildFormBody (golden/songcheck).
- Live (manuell): (1) Fledermausland-Ordner löschen → neu laden → song.txt enthält `#VIDEOGAP:37.5`, Video synchron; (2) Checkboxen reduzieren Trefferzahl plausibel; (3) Views-Sortierung prüfen.
