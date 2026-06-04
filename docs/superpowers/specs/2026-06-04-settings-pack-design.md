# Design: Settings-Paket — Ordnerstruktur, Parallelität, Video-Qualität, Cache

**Datum:** 2026-06-04
**Status:** Entwurf genehmigt
**Recherche-Grundlage:** USDX scannt `SongDir`s rekursiv nach `.txt`; keine Pflicht-Struktur, „Artist – Title"-Ordner sind Konvention; gemischte/verschachtelte Strukturen sind unkritisch ([USDX README](https://github.com/UltraStar-Deluxe/USDX/blob/master/README.md), [usdx.eu/format](https://usdx.eu/format/)). Das Syncer-Dateinamen-Schema kommt als **eigenes Folgepaket** (separate Spec).

## Neue Einstellungen (alle in `config.json`, Merge-Save vorhanden)

| Feld | Werte | Default | Wirkung |
|---|---|---|---|
| `folderLayout` | `"flat" \| "artist" \| "letter"` | `flat` | Unterordner-Schema NEUER Downloads |
| `downloadConcurrency` | 1–5 | 3 | Queue-Batch-Größe |
| `videoQuality` | `"720" \| "1080" \| "best"` | `1080` | yt-dlp `-S`-Sortierung (Download UND Reparatur) |

## Core

### Ordnerstruktur (`naming.ts`)

```ts
export type FolderLayout = "flat" | "artist" | "letter";
/** Relativer Song-Pfad unter dem Download-Ordner; jedes Segment einzeln sanitisiert. */
export const songRelativePath = (artist: string, title: string, layout: FolderLayout): string
```
- `flat` → `Artist_-_Title`
- `artist` → `Artist/Artist_-_Title`
- `letter` → `A/Artist_-_Title` (Großbuchstabe des ersten Zeichens des sanitisierten Artists; außerhalb A–Z → `#`)
- **Invariante:** Der Leaf-Ordnername ist in allen Layouts identisch (`sanitizeForPath("Artist - Title")`) → dirName-Dedupe, ✓-Marker und Archiv-Import-Logik bleiben layoutunabhängig korrekt.

### downloadSong

`DownloadSongParams` += `folderLayout?: FolderLayout` (Default flat) und `videoQuality?: "720" | "1080" | "best"`. `songDir = join(baseDir, songRelativePath(...))`; `dirName` bleibt der Leaf-Name (Rückgabe unverändert). Zwischensegmente werden per `mkdir recursive` angelegt (existiert bereits).

### Video-Qualität (`api/youtube/download.ts`)

`downloadYoutubeVideoWithProgress` erhält optionalen Qualitätsparameter; `-S`-Argument wird `"ext,res:720"` / `"ext,res:1080"` / `"ext"` (best). Alle bestehenden Aufrufer ohne Parameter behalten 1080-Verhalten. Reparatur reicht die konfigurierte Qualität durch (Desktop); TUI bleibt beim Default.

### Archiv-Import rekursiv (Tiefe 2)

`importArchive`: Top-Level-Ordner ohne `song.txt` werden nicht mehr ignoriert, sondern ihre direkten Unterordner werden zusätzlich geprobt (ein Level — deckt `artist`/`letter`-Layouts). `dirName` = Leaf-Name, `songDir` = voller Pfad. Bereits-getrackt-Abgleich weiterhin per Leaf-`dirName`. Zähler unverändert; Tiefe-2-Funde fließen in dieselben Kategorien.

## Desktop

- **IPC:** `covers:clearCache` (löscht `userData/covers`-Inhalt + lokalen und USDB-Memory-Cache; Rückgabe `{ deletedFiles: number }`). Download-/Repair-Pfade lesen `folderLayout`/`downloadConcurrency`/`videoQuality` aus `state.config` (Clamps: Concurrency 1–5, unbekannte Layout-/Qualitätswerte → Default).
- **Queue:** `processQueue` nutzt die konfigurierte Batch-Größe statt der Konstante.
- **SettingsView:** Neue Sektion „Downloads": Ordnerstruktur-Select **mit Beispielpfad-Vorschau** (z.B. „D:\Ultrastar\A\ABBA_-_Waterloo"), Parallelität-Select (1–5), Qualität-Select. Bei „Tools": Button „Cover-Cache leeren" mit Ergebnis-Meldung („N Dateien gelöscht"). Speichern über den bestehenden Save-Flow (Merge).

## Tests

- `songRelativePath`: alle drei Layouts, Sonderzeichen-Artist („!!! (Chk Chk Chk)" → letter `#`), Umlaut-Artist („Ärzte" → „Aerzte" → `A`), Leaf-Invariante.
- `importArchive`: Tiefe-2-Fixture (`Artist/Artist - Title/song.txt` wird gefunden; Tiefe 3 wird NICHT gescannt; Mischung flat+nested).
- `downloadYoutubeVideoWithProgress`: Argument-Bau pur testbar? Die `-S`-Auswahl wird als exportierte pure Funktion `videoSortArg(quality)` umgesetzt und getestet.
- Settings-Roundtrip über bestehenden config-Merge-Test-Stil.

## Bewusst nicht enthalten

- Migration/Umstrukturierung des Bestands (USDX kommt mit gemischten Strukturen klar; bei Bedarf späteres Feature).
- Syncer-Dateinamen-Schema (Folgepaket mit eigener Spec).
- TUI-Anbindung der neuen Einstellungen (liest Defaults; Werte aus config.json wirken dort, wo die Core-Funktionen sie ohne Parameter defaulten, bewusst nicht).
- Leaf-Namens-Kollisionen über physische Ordner hinweg (z.B. flacher Bestand "X_-_Y" UND verschachteltes "A/X_-_Y") werden bewusst zusammengefasst — der Import kennt nur den Leaf-Namen; doppelte physische Kopien desselben Songs bleiben unsichtbar.
