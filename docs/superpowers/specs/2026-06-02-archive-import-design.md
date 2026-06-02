# Design: Archiv-Import für die Desktop-App

**Datum:** 2026-06-02
**Status:** Entwurf genehmigt
**Kontext:** Ergänzung zur Desktop-GUI (`2026-06-02-desktop-gui-design.md`). Nutzer mit bestehendem Songs-Ordner (z.B. aus der TUI-Zeit oder fremden Quellen) sollen ihren Bestand ohne Neu-Downloads in die App übernehmen können.

## Entscheidung

Reiner **Bestandsimport ohne Netzzugriff** („Nur importieren"), ausgelöst per **Button in der „Heruntergeladen"-View** plus **Hinweis im Leer-Zustand** (immer wenn die Liste leer ist — ohne vorheriges Ordner-Probing; der Import selbst meldet, ob etwas gefunden wurde).

## Komponenten

### Core: `src/core/download/importArchive.ts`

```
importArchive(downloadDir): Effect<{ imported: number; importedWithoutVideo: number; skipped: number }, Error>
```

- Liest die Unterordner von `downloadDir` (nur Verzeichnisse).
- Ein Unterordner gilt als Song, wenn er eine `song.txt` enthält.
- Artist/Titel aus den `#ARTIST`/`#TITLE`-Headern via `parseTxtHeaders` (bereits exportiert); Fallback ist der Ordnername.
- Dedupe gegen `loadDownloadedEntries` per `dirName` → bereits getrackte Ordner zählen als `skipped`.
- Neue Einträge erhalten eine negative Stable-Hash-ID (`stableHash(dirName)`, wird dafür aus `repairSongs.ts` exportiert), `downloadedAt = jetzt`.
- Einträge ohne `video.mp4` werden ebenfalls importiert und in `importedWithoutVideo` gezählt.
- Persistenz gesammelt über `saveDownloadedEntries` (ein Schreibvorgang).
- Kein Netzzugriff. Unit-Tests mit Temp-Verzeichnissen (Ordner mit/ohne song.txt, mit/ohne video.mp4, bereits getrackt).

### IPC

- Neuer Invoke-Kanal `archive:import` (Contract, Preload `archiveImport()`, Handler).
- Handler: Guard gegen Doppelstart (Modul-Flag wie `repairRunning`), führt `importArchive(state.downloadDir)` aus, ruft danach `reloadDownloadedEntries()` (UI-Event), gibt das Ergebnis-Objekt zurück.

### UI: DownloadedView

- Kopfbereich: Button **„Archiv importieren"** (lucide `FolderSearch`), disabled während des Imports.
- Ergebnis als kurze Meldung unter dem Button: „N Songs importiert (davon X ohne Video — Reparatur ausführen), M übersprungen". Bei X > 0 dezenter Hinweis auf die Reparatur-View.
- Leer-Zustand: Ist `entries` leer, ersetzt ein Hinweis-Panel die Tabelle: „Bereits Songs auf der Platte? Importiere dein Archiv." + derselbe Button.

## Verhaltens-Hinweis (bewusst)

Importierte Einträge ohne `video.mp4` erscheinen wegen des bestehenden UI-Filters (nur Einträge mit Video werden gelistet) erst nach einer Reparatur in der Liste — der Ergebnistext macht das transparent. Tracking-seitig sind sie sofort vorhanden (Dedupe in Suche/Queue greift).

## Nicht enthalten (YAGNI)

- Kein Import in der TUI (Core-Funktion ist wiederverwendbar, Anbindung später möglich).
- Keine USDB-Verknüpfung/Metadaten-Anreicherung beim Import (IDs bleiben negativ).
- Kein Datei-Watcher/Auto-Sync.
