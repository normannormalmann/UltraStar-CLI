# Core-Extraktion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die bestehende CLI-Logik in einen geteilten Kern (`src/core/`) extrahieren, auf dem die Ink-TUI (`src/tui/`) und später die Electron-GUI aufsetzen — bei unverändertem TUI-Verhalten.

**Architecture:** Reine Umstrukturierung plus Charakterisierungs-Tests. `src/api/`, `src/storage/`, `src/platform.ts`, `src/session.ts` wandern nach `src/core/`; `downloadSong.ts`/`repairSongs.ts` (UI-frei) wandern nach `src/core/download/`; `src/ui/` wird zu `src/tui/`. Jede Task hinterlässt einen kompilierenden Stand (`bunx tsc --noEmit` grün) und endet mit einem Commit.

**Tech Stack:** Bun (Runtime, Build, Test via `bun:test`), TypeScript strict, Effect, Ink/React, Biome.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-02-desktop-gui-design.md`

---

### Task 0: Bun installieren und Umgebung verifizieren

Auf dieser Maschine ist Bun aktuell **nicht** installiert (Projekt wurde zwischenzeitlich mit npm-node_modules betrieben). Das Projekt ist aber ein Bun-Projekt (`bun.lock`, `build.ts` nutzt `Bun.build`).

**Files:** keine Code-Änderungen.

- [ ] **Step 1: Bun installieren**

Run (PowerShell):
```powershell
winget install --id Oven-sh.Bun -e --accept-source-agreements --accept-package-agreements
```
Expected: Installation erfolgreich. Danach **neue Shell** nötig oder PATH aktualisieren:
```powershell
$env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
bun --version
```
Expected: Versionsnummer (z.B. `1.2.x`).

- [ ] **Step 2: npm-Artefakte entfernen und mit Bun installieren**

```powershell
Remove-Item -Recurse -Force node_modules
bun install
```
Expected: `bun install` läuft gegen `bun.lock` durch, installiert u.a. Biome **2.1.4** (behebt die Schema-Versionswarnung der npm-Installation).

- [ ] **Step 3: Baseline verifizieren**

```powershell
bunx tsc --noEmit
bunx biome lint .
```
Expected: beide ohne Fehler (Stand nach Commit `fc1341d`).

- [ ] **Step 4: Kein Commit nötig** (keine Repo-Änderungen).

---

### Task 1: `api/`, `storage/`, `platform.ts`, `session.ts` nach `src/core/` verschieben

Die internen Relativ-Imports dieser Module bleiben gültig, weil alle gemeinsam unter `core/` landen (gleiche relative Tiefe zueinander). Brechen werden nur die Imports aus `src/ui/*` — die werden im selben Task gefixt.

**Files:**
- Move: `src/api/` → `src/core/api/` (alle 9 Dateien)
- Move: `src/storage/` → `src/core/storage/` (alle 6 Dateien)
- Move: `src/platform.ts` → `src/core/platform.ts`
- Move: `src/session.ts` → `src/core/session.ts`
- Modify: `src/ui/App.tsx` (Imports), `src/ui/components/DownloadedList.tsx` (Import), `src/ui/downloadSong.ts` (Imports), `src/ui/repairSongs.ts` (Imports)

- [ ] **Step 1: Verschieben mit git mv**

```powershell
New-Item -ItemType Directory src/core | Out-Null
git mv src/api src/core/api
git mv src/storage src/core/storage
git mv src/platform.ts src/core/platform.ts
git mv src/session.ts src/core/session.ts
```

- [ ] **Step 2: Imports in `src/ui/App.tsx` anpassen**

Die betroffenen Import-Zeilen (oben in der Datei) ändern sich so:

```ts
import { type Page, type Song, searchSongs } from "../core/api/usdb/search.ts";
import {
  checkFfmpegAvailable,
  checkYtDlpAvailable,
} from "../core/api/youtube/check.ts";
import { ffmpegInstallHint, ytDlpInstallHint } from "../core/platform.ts";
import { ensureSession } from "../core/session.ts";
import { type AppConfig, loadConfig, saveConfig } from "../core/storage/config.ts";
import {
  appendDownloadedEntry,
  type DownloadedEntry,
  loadDownloadedEntries,
} from "../core/storage/downloaded.ts";
import { appendFailedDownload } from "../core/storage/failedDownloads.ts";
import { loadQueue, saveQueue } from "../core/storage/queue.ts";
```

Die Imports auf `./components/*`, `./downloadSong.ts`, `./repairSongs.ts` bleiben in diesem Task unverändert.

- [ ] **Step 3: Import in `src/ui/components/DownloadedList.tsx` anpassen**

```ts
import type { DownloadedEntry } from "../../core/storage/downloaded.ts";
```

- [ ] **Step 4: Imports in `src/ui/downloadSong.ts` anpassen**

```ts
import { downloadCoverById } from "../core/api/usdb/cover.ts";
import { getLyricsById } from "../core/api/usdb/lyrics.ts";
import type { Song } from "../core/api/usdb/search.ts";
import type { YoutubeLink } from "../core/api/usdb/youtube.ts";
import { getYoutubeLinksById } from "../core/api/usdb/youtube.ts";
import { downloadYoutubeVideoWithProgress } from "../core/api/youtube/download.ts";
import type { YoutubeVideo } from "../core/api/youtube/search.ts";
import { searchYoutubeVideos } from "../core/api/youtube/search.ts";
```

- [ ] **Step 5: Imports in `src/ui/repairSongs.ts` anpassen**

```ts
import type { YoutubeLink } from "../core/api/usdb/youtube.ts";
import { getYoutubeLinksById } from "../core/api/usdb/youtube.ts";
import { downloadYoutubeVideoWithProgress } from "../core/api/youtube/download.ts";
import type { YoutubeVideo } from "../core/api/youtube/search.ts";
import { searchYoutubeVideos } from "../core/api/youtube/search.ts";
import type { DownloadedEntry } from "../core/storage/downloaded.ts";
import {
  appendDownloadedEntry,
  loadDownloadedEntries,
  saveDownloadedEntries,
} from "../core/storage/downloaded.ts";
```

- [ ] **Step 6: Kompilieren**

```powershell
bunx tsc --noEmit
```
Expected: keine Fehler. Falls Fehler: Es ist genau ein vergessener Import-Pfad — Fehlermeldung nennt Datei + Zeile.

- [ ] **Step 7: Commit**

```powershell
git add -A src
git commit -m "refactor: move api, storage, platform, session into src/core"
```

---

### Task 2: `downloadSong.ts` und `repairSongs.ts` nach `src/core/download/` verschieben

Beide Dateien haben keine UI-Abhängigkeiten (kein Ink/React-Import) und gehören in den Kern. Nach dem Move zeigen ihre `../core/...`-Imports aus Task 1 ins Leere — sie werden wieder zu `../api/...`/`../storage/...` (relative Tiefe innerhalb von `core/` ist identisch zu vorher).

**Files:**
- Move: `src/ui/downloadSong.ts` → `src/core/download/downloadSong.ts`
- Move: `src/ui/repairSongs.ts` → `src/core/download/repairSongs.ts`
- Modify: Imports in beiden verschobenen Dateien, plus `src/ui/App.tsx`

- [ ] **Step 1: Verschieben**

```powershell
New-Item -ItemType Directory src/core/download | Out-Null
git mv src/ui/downloadSong.ts src/core/download/downloadSong.ts
git mv src/ui/repairSongs.ts src/core/download/repairSongs.ts
```

- [ ] **Step 2: Imports in `src/core/download/downloadSong.ts` zurück auf core-interne Pfade**

```ts
import { downloadCoverById } from "../api/usdb/cover.ts";
import { getLyricsById } from "../api/usdb/lyrics.ts";
import type { Song } from "../api/usdb/search.ts";
import type { YoutubeLink } from "../api/usdb/youtube.ts";
import { getYoutubeLinksById } from "../api/usdb/youtube.ts";
import { downloadYoutubeVideoWithProgress } from "../api/youtube/download.ts";
import type { YoutubeVideo } from "../api/youtube/search.ts";
import { searchYoutubeVideos } from "../api/youtube/search.ts";
```

- [ ] **Step 3: Imports in `src/core/download/repairSongs.ts` zurück auf core-interne Pfade**

```ts
import type { YoutubeLink } from "../api/usdb/youtube.ts";
import { getYoutubeLinksById } from "../api/usdb/youtube.ts";
import { downloadYoutubeVideoWithProgress } from "../api/youtube/download.ts";
import type { YoutubeVideo } from "../api/youtube/search.ts";
import { searchYoutubeVideos } from "../api/youtube/search.ts";
import type { DownloadedEntry } from "../storage/downloaded.ts";
import {
  appendDownloadedEntry,
  loadDownloadedEntries,
  saveDownloadedEntries,
} from "../storage/downloaded.ts";
```

- [ ] **Step 4: Imports in `src/ui/App.tsx` anpassen**

```ts
import { downloadSong } from "../core/download/downloadSong.ts";
import {
  type RepairProgress,
  type RepairResult,
  scanAndRepairVideos,
} from "../core/download/repairSongs.ts";
```

- [ ] **Step 5: Kompilieren**

```powershell
bunx tsc --noEmit
```
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```powershell
git add -A src
git commit -m "refactor: move downloadSong and repairSongs into src/core/download"
```

---

### Task 3: `src/ui/` → `src/tui/` umbenennen

**Files:**
- Move: `src/ui/` → `src/tui/` (App.tsx + components/)
- Modify: `src/index.tsx:2`

- [ ] **Step 1: Umbenennen**

```powershell
git mv src/ui src/tui
```

Alle Imports innerhalb von `tui/` sind relativ (`./components/...`, `../core/...`) und bleiben gültig.

- [ ] **Step 2: `src/index.tsx` anpassen**

```ts
import App from "./tui/App.tsx";
```

- [ ] **Step 3: Kompilieren und Build prüfen**

```powershell
bunx tsc --noEmit
bun run build
```
Expected: tsc ohne Fehler; Build endet mit `CLI Build completed successfully` und erzeugt `build/dist/index.js`.

- [ ] **Step 4: Commit**

```powershell
git add -A src
git commit -m "refactor: rename src/ui to src/tui"
```

---

### Task 4: `parseTxtHeaders` exportieren und testen

Erster Charakterisierungs-Test; sichert das Verhalten des Song-Header-Parsers ab, den die Reparatur-Funktion nutzt.

**Files:**
- Modify: `src/core/download/repairSongs.ts` (eine Zeile: `function` → `export function`)
- Test: `src/core/download/repairSongs.test.ts` (neu)

- [ ] **Step 1: Failing Test schreiben** — `src/core/download/repairSongs.test.ts`:

```ts
import { expect, test } from "bun:test";
import { parseTxtHeaders } from "./repairSongs.ts";

test("parses ARTIST and TITLE headers", () => {
  const content = "#ARTIST:ABBA\n#TITLE:Waterloo\n#MP3:song.mp3\n: 0 4 0 Wa";
  expect(parseTxtHeaders(content)).toEqual({
    artist: "ABBA",
    title: "Waterloo",
  });
});

test("uppercases header keys (lowercase headers in file)", () => {
  const content = "#artist:Nena\n#title:99 Luftballons";
  expect(parseTxtHeaders(content)).toEqual({
    artist: "Nena",
    title: "99 Luftballons",
  });
});

test("handles CRLF line endings and surrounding whitespace", () => {
  const content = "#ARTIST:Falco\r\n#TITLE:Rock Me Amadeus\r\n";
  expect(parseTxtHeaders(content)).toEqual({
    artist: "Falco",
    title: "Rock Me Amadeus",
  });
});

test("returns empty object when headers are missing", () => {
  expect(parseTxtHeaders("no headers here")).toEqual({});
});
```

- [ ] **Step 2: Test laufen lassen — er muss fehlschlagen**

```powershell
bun test src/core/download/repairSongs.test.ts
```
Expected: FAIL — `parseTxtHeaders` wird nicht exportiert (SyntaxError/undefined import).

- [ ] **Step 3: Export ergänzen** — in `src/core/download/repairSongs.ts` die Zeile

```ts
function parseTxtHeaders(content: string): { artist?: string; title?: string } {
```

ändern zu:

```ts
export function parseTxtHeaders(content: string): {
  artist?: string;
  title?: string;
} {
```

- [ ] **Step 4: Test laufen lassen — jetzt grün**

```powershell
bun test src/core/download/repairSongs.test.ts
```
Expected: 4 pass, 0 fail.

Hinweis: Der CRLF-Test besteht, weil `parseTxtHeaders` jede Zeile mit `.trim()` bereinigt, bevor die Regex `^#(\w+):(.*)$` angewendet wird — sonst würde `\r` am Zeilenende das Match verhindern.

- [ ] **Step 5: Commit**

```powershell
git add src/core/download
git commit -m "test: characterize parseTxtHeaders and export it"
```

---

### Task 5: USDB-Such-Parser testen

Charakterisierungs-Tests für `parseSongFromTable` und `parseSongsFromSearch` mit Inline-HTML-Fixtures, die der echten USDB-Tabellenstruktur entsprechen (8 `<td>`-Zellen, Sprache an Index 6, `show_detail(<id>)` als Klick-Handler).

**Files:**
- Test: `src/core/api/usdb/search.test.ts` (neu)
- Keine Implementierungs-Änderung (Tests müssen sofort grün sein — sonst ist es ein echter Befund, nicht der Test anpassen!)

- [ ] **Step 1: Test schreiben** — `src/core/api/usdb/search.test.ts`:

```ts
import { expect, test } from "bun:test";
import { parseSongFromTable, parseSongsFromSearch } from "./search.ts";

/**
 * Inner-HTML einer USDB-Ergebniszeile (Inhalt eines <tr>).
 * Hinweis: Das <a> in der Artist-Zelle ist bewusst UNGESCHLOSSEN — die
 * Parser-Regex `(?:<a.*?>)?(.*)<\/td>` würde ein `</a>` mit ins Capture
 * nehmen; USDBs reales HTML schließt diese Tags nicht.
 */
const songRow = (
  id: number,
  artist: string,
  title: string,
  language: string,
) => `
  <td onclick="show_detail(${id})" class="c"><a href="#">${artist}</td>
  <td class="c">${title}</td>
  <td class="c">Edition</td>
  <td class="c">yes</td>
  <td class="c">no</td>
  <td class="c">30.05.26</td>
  <td class="c">${language}</td>
  <td class="c">1080p</td>
`;

test("parses a single song row", () => {
  expect(parseSongFromTable(songRow(1234, "ABBA", "Dancing Queen", "English"))).toEqual({
    apiId: 1234,
    artist: "ABBA",
    title: "Dancing Queen",
    languages: ["english"],
  });
});

test("splits multiple languages and lowercases them", () => {
  const song = parseSongFromTable(
    songRow(7, "Nena", "99 Luftballons", "German, English"),
  );
  expect(song?.languages).toEqual(["german", "english"]);
});

test("decodes HTML entities in artist and title", () => {
  const song = parseSongFromTable(
    songRow(42, "Simon &amp; Garfunkel", "Don&#39;t Stop", "English"),
  );
  expect(song?.artist).toBe("Simon & Garfunkel");
  expect(song?.title).toBe("Don't Stop");
});

test("returns null for unparseable input", () => {
  expect(parseSongFromTable(undefined)).toBeNull();
  expect(parseSongFromTable("")).toBeNull();
  expect(parseSongFromTable("<td class=\"c\">only one cell</td>")).toBeNull();
});

test("parses a full search page with total pages", () => {
  const html = `
    <br>There are 412 results on 21 pages
    <table>
      <tr class="list_tr1" id="r1">${songRow(1, "ABBA", "Waterloo", "English")}</tr>
      <tr class="list_tr2" id="r2">${songRow(2, "Toto", "Africa", "English")}</tr>
    </table>`;
  const page = parseSongsFromSearch(html);
  expect(page.totalPages).toBe(21);
  expect(page.songs).toHaveLength(2);
  expect(page.songs[0]?.apiId).toBe(1);
  expect(page.songs[1]?.title).toBe("Africa");
});

test("returns totalPages 0 when summary line is missing", () => {
  expect(parseSongsFromSearch("<table></table>").totalPages).toBe(0);
});
```

- [ ] **Step 2: Test laufen lassen**

```powershell
bun test src/core/api/usdb/search.test.ts
```
Expected: 6 pass, 0 fail. **Falls ein Test fehlschlägt:** Fixture gegen die Regexes in `search.ts` prüfen (nicht blind die Assertion ändern) — die Fixtures oben sind exakt auf die bestehenden Regexes abgestimmt.

- [ ] **Step 3: Commit**

```powershell
git add src/core/api/usdb/search.test.ts
git commit -m "test: characterize USDB search result parsing"
```

---

### Task 6: Queue-Persistenz und Pfad-Auflösung testen

Nutzt die bestehende `ULTRASTAR_APP_NAME`-Umgebungsvariable, um Testdaten in ein isoliertes Cache-Verzeichnis zu schreiben (wird nach den Tests gelöscht).

**Files:**
- Test: `src/core/storage/queue.test.ts` (neu)

- [ ] **Step 1: Test schreiben** — `src/core/storage/queue.test.ts`:

```ts
import { rm } from "node:fs/promises";
import { afterAll, expect, test } from "bun:test";
import { Effect } from "effect";
import { getCacheDir, resolveDataFilePath } from "./paths.ts";
import { loadQueue, saveQueue } from "./queue.ts";

// Isoliertes Cache-Verzeichnis pro Testlauf; getAppName() liest die Variable
// bei jedem Aufruf, daher reicht das Setzen vor dem ersten Effect-Run.
process.env.ULTRASTAR_APP_NAME = `ultrastar-cli-test-${process.pid}`;

afterAll(async () => {
  const dir = await Effect.runPromise(getCacheDir());
  await rm(dir, { recursive: true, force: true });
});

test("resolveDataFilePath respects ULTRASTAR_APP_NAME and file name", async () => {
  const p = await Effect.runPromise(resolveDataFilePath("queue.json"));
  expect(p).toContain(`ultrastar-cli-test-${process.pid}`);
  expect(p.endsWith("queue.json")).toBe(true);
});

test("saveQueue then loadQueue round-trips songs", async () => {
  const songs = [
    { apiId: 1, artist: "ABBA", title: "Waterloo", languages: ["english"] },
    { apiId: 2, artist: "Toto", title: "Africa", languages: ["english"] },
  ];
  await Effect.runPromise(saveQueue(songs));
  const loaded = await Effect.runPromise(loadQueue);
  expect(loaded).toEqual(songs);
});

test("loadQueue returns empty array when file is missing", async () => {
  const dir = await Effect.runPromise(getCacheDir());
  await rm(dir, { recursive: true, force: true });
  const loaded = await Effect.runPromise(loadQueue);
  expect(loaded).toEqual([]);
});

test("loadQueue returns empty array for corrupt JSON", async () => {
  const p = await Effect.runPromise(resolveDataFilePath("queue.json"));
  await Bun.write(p, "{not json");
  const loaded = await Effect.runPromise(loadQueue);
  expect(loaded).toEqual([]);
});
```

- [ ] **Step 2: Test laufen lassen**

```powershell
bun test src/core/storage/queue.test.ts
```
Expected: 4 pass, 0 fail.

- [ ] **Step 3: Commit**

```powershell
git add src/core/storage/queue.test.ts
git commit -m "test: characterize queue persistence and path resolution"
```

---

### Task 7: Test-Script, Gesamtverifikation, Abschluss

**Files:**
- Modify: `package.json` (scripts)

- [ ] **Step 1: `test`-Script ergänzen** — in `package.json` im `scripts`-Block:

```json
"scripts": {
  "build": "bun run --cwd src build.ts",
  "start": "bun run src/index.tsx",
  "test": "bun test src",
  "format": "biome format --write .",
  "clean": "git clean -xdf .turbo build",
  "lint": "biome lint --write .",
  "bump": "bumpp"
},
```

- [ ] **Step 2: Gesamtverifikation**

```powershell
bun run test
bunx tsc --noEmit
bunx biome check --write .
bun run build
```
Expected: alle Tests grün (14 pass), tsc ohne Fehler, Biome ohne Fehler (ggf. Auto-Format der neuen Testdateien), Build erfolgreich (`CLI Build completed successfully`).

- [ ] **Step 3: TUI-Smoke-Test (manuell)**

```powershell
bun run start
```
Expected: TUI startet, zeigt „Login: Logged in" / yt-dlp / ffmpeg-Status, Suche funktioniert. Mit `Esc` beenden. (Dieser Schritt braucht ein interaktives Terminal — beim Ausführen durch einen Agenten den Nutzer bitten, das kurz selbst zu prüfen.)

- [ ] **Step 4: Commit**

```powershell
git add package.json
git commit -m "chore: add bun test script for core characterization tests"
```

---

## Endzustand nach diesem Plan

```
src/
  core/
    api/usdb/        (+ search.test.ts)
    api/youtube/
    storage/         (+ queue.test.ts)
    download/        (downloadSong.ts, repairSongs.ts + repairSongs.test.ts)
    platform.ts
    session.ts
  tui/
    App.tsx
    components/
  index.tsx
  build.ts
```

Damit ist die Grundlage für Plan 2 (Electron-Desktop-App) gelegt: `src/desktop/` wird ausschließlich aus `src/core/` importieren.
