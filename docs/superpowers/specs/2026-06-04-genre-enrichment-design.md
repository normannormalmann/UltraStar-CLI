# Design: Genre-Anreicherung über Online-Songdatenbanken

**Datum:** 2026-06-04
**Status:** Entwurf genehmigt
**Ausgangslage:** 12.657 von 27.965 Bestandseinträgen ohne Genre (45%). Die zuvor vertagte „Stufe 1"-Online-Anreicherung wird umgesetzt — mit wählbarer Quelle.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Quellen | **Alle drei**, wählbar in den Einstellungen: Deezer (Default, kein Key), Last.fm (Key nötig), MusicBrainz (kein Key, 1 req/s) |
| Schreibziel | **App-DB + song.txt** (`#GENRE`-Header wird in die Song-Dateien geschrieben) |
| Zusatzdaten | `year` (nur wenn lokal leer), `realBpm` und `explicit` (Deezer) werden aus denselben Antworten mitgespeichert — keine Extra-Anfragen |
| Mood/Stimmung | Bewusst NICHT (einzige strukturierte Quelle — Spotify Audio-Features — wurde 2024 eingestellt; Community-Tags zu unstrukturiert) |

## Core: Provider (`src/core/api/genres/`)

Gemeinsamer Vertrag:
```ts
export type GenreLookupResult = {
  genre: string;        // normalisiert
  year?: number;        // Release-Jahr, falls die Quelle es liefert
  realBpm?: number;     // echtes Audio-Tempo (nur Deezer)
  explicit?: boolean;   // nur Deezer
} | null;               // null = kein verlässlicher Treffer

export type GenreProviderId = "deezer" | "lastfm" | "musicbrainz";
// pro Provider: lookup(artist, title, opts) → Effect<GenreLookupResult, Error>
// plus minDelayMs (Rate-Limit): deezer 250, lastfm 250, musicbrainz 1100
```

- **Deezer** (`deezer.ts`): `GET api.deezer.com/search?q=artist:"…" track:"…"` → bester Track (erster Treffer mit übereinstimmendem, normalisiertem Artist) → `GET /album/{id}` → `genres.data[0].name`; `year` aus `release_date`, `realBpm` aus `track.bpm` (>0), `explicit` aus `explicit_lyrics`. 2 Requests pro Song.
- **Last.fm** (`lastfm.ts`): `track.getTopTags` mit API-Key; bestes Tag, das nach Normalisierung einem Genre entspricht (Tag-Blockliste für Nicht-Genres wie „favorites", „seen live"); kein year/bpm.
- **MusicBrainz** (`musicbrainz.ts`): `GET musicbrainz.org/ws/2/recording?query=artist:"…" AND recording:"…"&fmt=json&inc=genres` (bzw. genres aus dem Suchergebnis); Pflicht-Header `User-Agent: ultrastar-dlh/1.2.0 (https://github.com/normannormalmann/ultrastar-dlh)`; `year` aus `first-release-date`; striktes 1-req/s-Limit.
- **Normalisierung** (`normalize.ts`, pur + getestet): Mapping-Tabelle („rap/hip hop"→„Hip-Hop", „hip hop"→„Hip-Hop", „r&b/soul"→„R&B", „electro"→„Electronic", „alternative rock"→„Rock" …), sonst Title-Case des Rohwerts. Treffer-Validierung: normalisierter Artist-Vergleich (lowercase, sanitize-ähnlich) — kein Match → `null` statt falscher Daten.

## Core: Job (`src/core/download/enrichGenres.ts`)

```ts
enrichGenres(entriesProvider, lookup, opts): Effect<EnrichResult, Error>
// opts: { onProgress?, shouldCancel?: () => boolean, persistEvery?: number (50) }
// EnrichResult: { processed, enriched, notFound, txtPatched, txtFailed, cancelled }
```
- Iteriert alle Tracking-Einträge **ohne `genre`**, sequenziell mit `minDelayMs` des Providers.
- Pro Treffer: Eintrag aktualisieren (`genre` immer; `year` nur wenn leer; `realBpm`/`explicit` wenn geliefert) und `#GENRE` in die song.txt patchen — über das aus `applyVideoGap` verallgemeinerte **`applyHeader(txt, key, value)`** (EOL-erhaltend; `applyVideoGap` wird zum Wrapper). txt-Fehler → `txtFailed++`, Lauf geht weiter.
- **Persistenz alle 50 Einträge** (`saveDownloadedEntries`) und am Ende → Abbruch verliert max. 49; erneuter Lauf überspringt Angereichertes (resumierbar by design).
- **Abbruchlogik:** `shouldCancel` zwischen Einträgen; 5 harte Fehler in Folge (Netz/HTTP 5xx/429) → Abbruch mit Fehler.
- `DownloadedEntry` += `realBpm?: number; explicit?: boolean;` (rückwärtskompatibel).

## Desktop

- **Config:** `AppConfig` += `genreProvider?: GenreProviderId` (Default „deezer"), `lastfmApiKey?: string`.
- **IPC:** `genres:enrich` (Start; verweigert mit Fehlermeldung, wenn Downloads/Import/Reparatur laufen oder Last.fm ohne Key gewählt ist), `genres:cancel`; Events `event:genreEnrichProgress` (`{current,total,enriched} | null`) und Ergebnis über Rückgabewert. Guard-Flag wie gehabt; Gegen-Guards: Import/Reparatur verweigern während des Genre-Laufs (gleiche downloaded.json-Schreibfamilie).
- **Einstellungen:** Sektion „Genre-Quelle": Select (Deezer/Last.fm/MusicBrainz) + Key-Feld (nur bei Last.fm eingeblendet), gespeichert über den bestehenden Speichern-Flow.
- **Bibliothek (DownloadedView):** Button „Genres nachtragen" (lucide `Tags`) neben Aktualisieren; während des Laufs Fortschritt „Suche Genres… (x/12.657 · y gefunden)" + Abbrechen-Button; Ergebnis-Meldung wie beim Import. Facetten aktualisieren sich über die Zwischenspeicher-Broadcasts (`event:downloadedChanged` nach jedem Persist-Batch).

## Tests

- Provider-Parsing mit JSON-Fixtures (Deezer Track+Album, Last.fm TopTags, MusicBrainz Recording) inkl. Artist-Mismatch → null.
- `normalize`-Tabelle (Mapping + Title-Case-Fallback).
- `applyHeader`-Charakterisierung (ersetzt `applyVideoGap`-Tests bleiben über den Wrapper grün).
- `enrichGenres` mit Fake-Lookup: Treffer/Miss/Fehlerserie→Abbruch/Cancel/persistEvery-Batching (Fake-Persist zählt Aufrufe).

## Live-Verifikation

Kurzer Lauf mit Abbruch nach ~20–50 Songs: Trefferquote plausibel, Genres normalisiert, song.txt-Stichprobe enthält `#GENRE`, Facetten-Dropdown wächst. Danach Volllauf nach Belieben des Nutzers.

## Bewusst nicht enthalten

- Mood/Stimmungs-Felder (Datenlage), Tempo-/Explicit-FILTER in der UI (Felder werden nur erfasst; Filter ist trivialer Folgeschritt, sobald Datenabdeckung sichtbar ist), Multi-Provider-Fallback-Kaskade (eine Quelle pro Lauf; erneuter Lauf mit anderer Quelle ergänzt nur weiterhin Fehlendes).
