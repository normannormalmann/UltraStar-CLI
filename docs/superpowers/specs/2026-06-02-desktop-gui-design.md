# Design: UltraStar Desktop-GUI

**Datum:** 2026-06-02
**Status:** Entwurf genehmigt

## Ziel

Eine Desktop-App (Windows zuerst) für das Suchen und Herunterladen von UltraStar-Songs von USDB — mit voller Funktions-Parität zur bestehenden Ink-Terminal-UI. Die App wird über GitHub Releases an andere Nutzer verteilt. Die TUI bleibt parallel bestehen; beide teilen sich denselben Logik-Kern.

## Entscheidungen (Zusammenfassung)

| Thema | Entscheidung |
|---|---|
| App-Typ | Desktop-App |
| Framework | Electron + React (maximale Wiederverwendung der Node-/TS-Logik) |
| Zielgruppe | Auch andere Nutzer (GitHub Releases, Installer) |
| Plattform v1 | Windows; macOS/Linux später über electron-builder nachrüstbar |
| Umfang v1 | Volle CLI-Parität (Suche, Download, Queue inkl. ganze DB, Verlauf, Reparatur, Setup) |
| TUI | Bleibt bestehen, nutzt denselben Kern |
| Layout | Sidebar-Navigation (Spotify-Stil) + persistente Download-Leiste unten |
| Ergebnis-Ansicht | Kompakte Tabelle mit Cover-Thumbnails und Seiten-Navigation |
| Theme | Dunkel (Catppuccin Mocha) + Violett-Akzent, gezielte Neon-Glow-Akzente |
| yt-dlp/ffmpeg | Werden beim ersten Start automatisch heruntergeladen (Bundling per Download) |

## Architektur & Repo-Struktur

Die bestehende Logik wird zum geteilten Kern extrahiert:

```
src/
  core/                  # geteilter Kern (aus bestehendem Code extrahiert)
    api/usdb/            # Suche, Auth, Lyrics, Cover (unverändert)
    api/youtube/         # yt-dlp/ffmpeg-Aufrufe
    storage/             # Config, Queue, Downloaded, Credentials
    download/            # downloadSong.ts, repairSongs.ts (aus ui/ verschoben,
                         # keine UI-Abhängigkeiten)
  tui/                   # bisheriges src/ui/ (Ink), importiert aus core/
  desktop/               # Electron-App
    main/                # Hauptprozess: hostet core/, IPC-Handler
    preload/             # contextBridge: typsichere API für den Renderer
    renderer/            # React-UI: Sidebar, Views, Komponenten
```

### Electron-Aufteilung

- **Main-Prozess** = Backend: führt die komplette `core/`-Logik aus (Node-APIs, Effect, yt-dlp-Spawning). Kein Logik-Rewrite.
- **Renderer** = reine React-Oberfläche; spricht über eine schmale, typisierte IPC-API mit dem Main-Prozess (z.B. `search(params)`, `queueAdd(songs)`, `onDownloadProgress(callback)`).
- **Preload-Script** mit `contextBridge`; Renderer hat keinen direkten Node-Zugriff (`contextIsolation: true`, `nodeIntegration: false`).

### Gebündelte Binaries

yt-dlp + ffmpeg werden beim ersten Start in das App-Datenverzeichnis heruntergeladen (plattformrichtige Builds, mit Fortschrittsanzeige) — nicht in den Installer gepackt. Das hält den Installer klein und erlaubt yt-dlp-Updates per Knopfdruck in den Einstellungen. Bereits systemweit installierte Binaries werden bevorzugt genutzt.

### Build & Verteilung

- **electron-vite** für Entwicklung und Build
- **electron-builder** für den Windows-Installer (NSIS)
- **GitHub Releases** als Verteilkanal

## Oberfläche & Views

### Rahmen (immer sichtbar)

- **Sidebar links:** Suche, Queue (mit Zähler-Badge), Heruntergeladen, Reparatur, Einstellungen. Unten: Status-Indikatoren (USDB-Login, yt-dlp, ffmpeg) als Ampel-Punkte mit Tooltip.
- **Download-Leiste unten:** sichtbar sobald Downloads aktiv sind; zeigt aktive Downloads (max. 3 parallel, wie heute) mit Titel + Fortschrittsbalken (Neon-Glow); aufklappbar für Details/Fehler.

### Views

1. **Suche** (Startansicht): Suchfelder Interpret/Titel oben; darunter kompakte Ergebnis-Tabelle (Cover-Thumbnail, Interpret, Titel, Sprach-Tags, ⬇/＋-Aktionen pro Zeile; ✓ für bereits Heruntergeladenes). Fußzeile: Seiten-Navigation ◀ 1/21 ▶, Buttons „Seite in Queue", „Alle Seiten in Queue", „Ganze Datenbank in Queue" (mit Bestätigungsdialog + Fortschrittsanzeige).
2. **Queue:** Liste wartender Songs mit Entfernen pro Eintrag und „Queue leeren"; großer „Start"-Button (entspricht Ctrl+D); während der Verarbeitung Fortschritt x/n, Pause/Abbrechen. Einklappbarer „Fehlgeschlagen"-Bereich (aus `failedDownloads`) mit „Erneut versuchen".
3. **Heruntergeladen:** durchsuchbare Liste aller Einträge aus `downloaded.json` mit Cover, Datum, „Ordner öffnen".
4. **Reparatur:** kurze Erklärung, „Scan starten", Live-Fortschritt (aktueller Song, x/n, Video-Fortschritt), Ergebnisbericht (repariert/rebuilt/fehlgeschlagen) — funktional identisch zur TUI-Reparatur.
5. **Einstellungen:** Download-Ordner (nativer Ordner-Dialog), Cookie-Browser-Auswahl, yt-dlp/ffmpeg-Status mit „Jetzt aktualisieren", App-Version.

### Theme

Dunkel (Catppuccin-Mocha-Basis) mit violettem Primärakzent. Neon-Akzente gezielt: Glow auf aktiven Sidebar-Einträgen, Fortschrittsbalken und Primär-Buttons. Kein Light Mode in v1.

## Datenfluss

- **Eine Quelle der Wahrheit im Main-Prozess:** Queue, aktive Downloads, Verlauf und Konfiguration leben dort (bestehende `core/`-Logik samt Disk-Persistenz inkl. Debounce-Schreiben).
- Der Renderer ist zustandsarm: er abonniert Änderungen per IPC-Events (`queue:changed`, `download:progress`, `repair:progress`, …) und rendert sie.
- Vorteil: TUI und GUI verhalten sich identisch; ein Renderer-Absturz verliert keinen Zustand.
- **Cover-Thumbnails:** über bestehende `cover.ts`-API geladen, im App-Datenverzeichnis gecacht (max. 10 MB pro Bild wie bisher, Cache-Limit ~200 MB, LRU-Verdrängung).

## Fehlerbehandlung

- Fehler erscheinen pro Kontext statt global: Suchfehler in der Such-View, Download-Fehler am jeweiligen Eintrag in Download-Leiste/Queue, Setup-Probleme (Login, yt-dlp fehlt) als Banner.
- Fehlgeschlagene Downloads: wie heute in `failedDownloads` protokolliert + in der Queue-View sichtbar mit Retry.
- Erststart-Download von yt-dlp/ffmpeg: bei Fehlschlag klare Meldung mit manueller Alternative (Link + „Erneut versuchen").

## Tests

- **`core/`:** Unit-Tests für kritische Teile (USDB-HTML-Parsing mit Fixture-Dateien, Queue-Persistenz, Pfad-Logik) — nützt TUI und GUI.
- **IPC-Schicht:** Vertragstest, dass jeder Renderer-Aufruf einen registrierten Handler hat.
- **UI:** Smoke-Test, dass die App startet und die Such-View rendert (Playwright für Electron). Keine umfassende UI-Testabdeckung in v1.

## Bewusst nicht in v1

- Auto-Update der App (Nutzer laden neue Releases manuell)
- macOS/Linux-Builds
- Light Mode
- Song-Vorschau/Player, Bibliotheksverwaltung, Duplikat-Erkennung
