# Archiv-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bestehende Songs-Ordner ohne Netzzugriff in das Tracking übernehmen („Heruntergeladen"-Liste), ausgelöst per Button in der DownloadedView.

**Architecture:** Neue pure Core-Funktion `importArchive` (Effect, kein Netz) in `src/core/download/`, die `parseTxtHeaders`/`stableHash` aus `repairSongs.ts` wiederverwendet und gesammelt über `saveDownloadedEntries` persistiert. Ein neuer IPC-Kanal `archive:import` (mit Doppelstart-Guard) führt sie im Main-Prozess aus und stößt danach `reloadDownloadedEntries()` an. Die DownloadedView bekommt Button, Ergebnis-Meldung und Leer-Zustands-Hinweis.

**Tech Stack:** Effect, bun:test, Electron IPC (bestehender typisierter Contract), React 19 + lucide-react.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-02-archive-import-design.md`
**Branch:** `feat/desktop-gui` (Feature gehört zur laufenden Desktop-Arbeit)
**Umgebung:** Bun-PATH-Prefix wie in den anderen Plänen; `bun x` statt `bunx`.

---

### Task 1: Core `importArchive` (TDD)

**Files:**
- Modify: `src/core/download/repairSongs.ts` (eine Zeile: `stableHash` exportieren)
- Create: `src/core/download/importArchive.ts`
- Test: `src/core/download/importArchive.test.ts`

- [ ] **Step 1: Failing Test schreiben** — `src/core/download/importArchive.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  loadDownloadedEntries,
  saveDownloadedEntries,
} from "../storage/downloaded.ts";
import { getCacheDir } from "../storage/paths.ts";
import { importArchive } from "./importArchive.ts";

// Isoliertes Datenverzeichnis (gleiche Technik wie queue.test.ts)
process.env.ULTRASTAR_APP_NAME = `ultrastar-cli-import-test-${process.pid}`;

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
  const cache = await Effect.runPromise(getCacheDir());
  await rm(join(cache, ".."), { recursive: true, force: true });
});

const makeArchive = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ultrastar-archive-"));
  dirs.push(root);
  return root;
};

const makeSong = async (
  root: string,
  dirName: string,
  opts: { txt?: string | null; video?: boolean },
): Promise<void> => {
  const dir = join(root, dirName);
  await mkdir(dir, { recursive: true });
  if (opts.txt !== null) {
    await writeFile(
      join(dir, "song.txt"),
      opts.txt ?? `#ARTIST:${dirName}-Artist\n#TITLE:${dirName}-Title\n`,
      "utf8",
    );
  }
  if (opts.video) {
    await writeFile(join(dir, "video.mp4"), "fake-video-bytes", "utf8");
  }
};

test("imports songs, counts missing videos, skips tracked, ignores non-song folders", async () => {
  const root = await makeArchive();
  await makeSong(root, "ABBA - Waterloo", { video: true });
  await makeSong(root, "Toto - Africa", { video: false });
  await makeSong(root, "Kein Song", { txt: null, video: false });
  await makeSong(root, "Bereits Da", { video: true });

  // "Bereits Da" vorab als getrackt markieren
  await Effect.runPromise(
    saveDownloadedEntries([
      {
        apiId: -1,
        artist: "x",
        title: "y",
        dirName: "Bereits Da",
        songDir: join(root, "Bereits Da"),
        downloadedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );

  const result = await Effect.runPromise(importArchive(root));
  expect(result).toEqual({ imported: 2, importedWithoutVideo: 1, skipped: 1 });

  const entries = await Effect.runPromise(loadDownloadedEntries);
  expect(entries).toHaveLength(3);
  const abba = entries.find((e) => e.dirName === "ABBA - Waterloo");
  expect(abba?.artist).toBe("ABBA - Waterloo-Artist");
  expect(abba?.title).toBe("ABBA - Waterloo-Title");
  expect(abba?.apiId).toBeLessThan(0);
  expect(abba?.songDir).toBe(join(root, "ABBA - Waterloo"));
});

test("falls back to folder name when headers are missing", async () => {
  const root = await makeArchive();
  await makeSong(root, "Nur Noten", { txt: ": 0 4 0 La\n", video: true });

  const result = await Effect.runPromise(importArchive(root));
  expect(result.imported).toBe(1);
  const entries = await Effect.runPromise(loadDownloadedEntries);
  const e = entries.find((x) => x.dirName === "Nur Noten");
  expect(e?.artist).toBe("Nur Noten");
  expect(e?.title).toBe("Nur Noten");
});

test("fails with Error when the directory does not exist", async () => {
  await expect(
    Effect.runPromise(importArchive(join(tmpdir(), "does-not-exist-xyz"))),
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Rot sehen**

```powershell
bun test src/core/download/importArchive.test.ts
```
Expected: FAIL — Modul `./importArchive.ts` existiert nicht.

- [ ] **Step 3: `stableHash` exportieren** — in `src/core/download/repairSongs.ts`:

```ts
/** Stable negative hash so songs without a USDB apiId get a unique tracking id. */
export function stableHash(s: string): number {
```
(nur das `export`-Keyword ergänzen; Körper unverändert)

- [ ] **Step 4: `src/core/download/importArchive.ts` anlegen:**

```ts
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import {
  type DownloadedEntry,
  loadDownloadedEntries,
  saveDownloadedEntries,
} from "../storage/downloaded.ts";
import { parseTxtHeaders, stableHash } from "./repairSongs.ts";

export type ImportResult = {
  imported: number;
  importedWithoutVideo: number;
  skipped: number;
};

/**
 * Bestehendes Archiv in das Tracking übernehmen — ohne Netzzugriff.
 * Ein Unterordner gilt als Song, wenn er eine song.txt enthält.
 * Bereits getrackte Ordner (per dirName) zählen als skipped;
 * Ordner ohne song.txt werden ignoriert (zählen gar nicht).
 */
export const importArchive = (
  downloadDir: string,
): Effect.Effect<ImportResult, Error> =>
  Effect.gen(function* () {
    const folders = yield* Effect.tryPromise({
      try: async () => {
        const dirents = await readdir(downloadDir, { withFileTypes: true });
        return dirents.filter((d) => d.isDirectory()).map((d) => d.name);
      },
      catch: (e) =>
        e instanceof Error ? e : new Error("Failed to read download dir"),
    });

    const existing = yield* loadDownloadedEntries;
    const tracked = new Set(existing.map((e) => e.dirName));

    let importedWithoutVideo = 0;
    let skipped = 0;
    const newEntries: DownloadedEntry[] = [];

    for (const name of folders) {
      if (tracked.has(name)) {
        skipped++;
        continue;
      }
      const songDir = join(downloadDir, name);

      const txt = yield* Effect.tryPromise({
        try: async () => readFile(join(songDir, "song.txt"), "utf8"),
        catch: (e) => (e instanceof Error ? e : new Error("read failed")),
      }).pipe(Effect.catchAll(() => Effect.succeed<string | null>(null)));
      if (txt === null) continue; // keine song.txt → kein Song-Ordner

      const { artist, title } = parseTxtHeaders(txt);

      const hasVideo = yield* Effect.tryPromise({
        try: async () => (await stat(join(songDir, "video.mp4"))).size > 0,
        catch: (e) => (e instanceof Error ? e : new Error("stat failed")),
      }).pipe(Effect.catchAll(() => Effect.succeed(false)));
      if (!hasVideo) importedWithoutVideo++;

      newEntries.push({
        apiId: stableHash(name),
        artist: artist || name,
        title: title || name,
        dirName: name,
        songDir,
        downloadedAt: new Date().toISOString(),
      });
    }

    if (newEntries.length > 0) {
      yield* saveDownloadedEntries([...existing, ...newEntries]);
    }

    return { imported: newEntries.length, importedWithoutVideo, skipped };
  });
```

- [ ] **Step 5: Grün sehen + Gesamtchecks**

```powershell
bun test src/core/download/importArchive.test.ts   # 3 pass
bun test src                                        # 25 pass (22 + 3)
bun x tsc --noEmit                                  # 0
bun x biome lint src/core                           # 0
```

- [ ] **Step 6: Commit**

```powershell
git add src/core/download
git commit -m "feat(core): archive import without re-downloads"
```

---

### Task 2: IPC-Kanal `archive:import`

**Files:**
- Modify: `src/desktop/shared/ipc-contract.ts`
- Modify: `src/desktop/main/ipc.ts`
- Modify: `src/desktop/preload/index.ts`

- [ ] **Step 1: Contract erweitern** — in `src/desktop/shared/ipc-contract.ts`:

Re-Export ergänzen (bei den anderen Core-Typ-Re-Exports):
```ts
export type { ImportResult as ArchiveImportResult } from "../../core/download/importArchive.ts";
```

In `INVOKE_CHANNELS` nach `"downloads:failedList"` einfügen:
```ts
  "archive:import",
```

In `UltrastarApi` nach `failedList` einfügen:
```ts
  archiveImport: () => Promise<ArchiveImportResult>;
```
(dafür oben `import type { ImportResult as ArchiveImportResult } from "../../core/download/importArchive.ts";` als type-only Import nutzen — der Re-Export alleine macht den Namen in der Datei nicht verfügbar; beide Zeilen sind nötig bzw. der Re-Export kann via `export type { ... }` + lokalem Import kombiniert werden.)

- [ ] **Step 2: Handler in `src/desktop/main/ipc.ts`** — Import ergänzen (`import { importArchive } from "../../core/download/importArchive.ts";`), Modul-Flag neben `repairRunning`:

```ts
let archiveImportRunning = false;
```

Handler-Eintrag (nach `"downloads:failedList"`):

```ts
    "archive:import": async () => {
      if (archiveImportRunning) {
        return { imported: 0, importedWithoutVideo: 0, skipped: 0 };
      }
      archiveImportRunning = true;
      try {
        const result = await Effect.runPromise(
          importArchive(state.downloadDir),
        );
        await reloadDownloadedEntries();
        return result;
      } finally {
        archiveImportRunning = false;
      }
    },
```

Hinweis: Der bestehende Vertragstest (`ipc.test.ts`) erzwingt automatisch, dass der neue Kanal einen Handler hat (Record-Typ + Key-Vergleich) — er schlägt fehl, solange Contract und Handler nicht synchron sind. Kein neuer Test nötig.

- [ ] **Step 3: Preload** — in `src/desktop/preload/index.ts` nach `failedList`:

```ts
  archiveImport: () => ipcRenderer.invoke("archive:import"),
```

- [ ] **Step 4: Verifizieren & committen**

```powershell
bun test src/desktop          # 7 pass (Vertragstest deckt den neuen Kanal ab)
bun x tsc --noEmit            # 0
bun x electron-vite build     # ok
bun x biome lint src/desktop  # 0
git add src/desktop
git commit -m "feat(desktop): archive:import ipc channel"
```

---

### Task 3: DownloadedView-Anbindung

**Files:**
- Replace: `src/desktop/renderer/views/DownloadedView.tsx`

- [ ] **Step 1: Datei ersetzen durch:**

```tsx
import { FolderOpen, FolderSearch } from "lucide-react";
import type { FC } from "react";
import { useMemo, useState } from "react";
import type {
  ArchiveImportResult,
  DownloadedEntry,
} from "../../shared/ipc-contract.ts";
import CoverThumb from "../components/CoverThumb.tsx";

const importMessage = (r: ArchiveImportResult): string => {
  const parts = [`${r.imported} Songs importiert`];
  if (r.importedWithoutVideo > 0) {
    parts.push(
      `davon ${r.importedWithoutVideo} ohne Video — Reparatur ausführen, damit sie hier erscheinen`,
    );
  }
  if (r.skipped > 0) parts.push(`${r.skipped} bereits vorhanden`);
  return parts.join(" · ");
};

export const DownloadedView: FC<{ entries: DownloadedEntry[] }> = ({
  entries,
}) => {
  const [filter, setFilter] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ArchiveImportResult | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);

  const runImport = async (): Promise<void> => {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      setImportResult(await window.ultrastar.archiveImport());
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const importButton = (
    <button
      className="btn"
      type="button"
      disabled={importing}
      onClick={() => void runImport()}
    >
      <FolderSearch size={14} aria-hidden />
      {importing ? "Importiere…" : "Archiv importieren"}
    </button>
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const sorted = [...entries].sort((a, b) =>
      b.downloadedAt.localeCompare(a.downloadedAt),
    );
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.artist.toLowerCase().includes(q) || e.title.toLowerCase().includes(q),
    );
  }, [entries, filter]);

  return (
    <div>
      <h2>Heruntergeladen ({entries.length})</h2>
      <div className="row" style={{ marginBottom: 14 }}>
        <input
          className="input"
          style={{ width: 320 }}
          placeholder="Filtern…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {importButton}
      </div>
      {importError && <div className="error-banner">{importError}</div>}
      {importResult && <p className="muted">{importMessage(importResult)}</p>}

      {entries.length === 0 ? (
        <div style={{ marginTop: 8 }}>
          <p className="muted" style={{ maxWidth: 520 }}>
            Noch keine Einträge. Du hast bereits Songs auf der Platte?
            Importiere dein bestehendes Archiv aus dem Download-Ordner — ganz
            ohne erneute Downloads.
          </p>
          {importButton}
        </div>
      ) : filtered.length === 0 ? (
        <p className="muted">Keine Treffer für den Filter.</p>
      ) : (
        <table className="song-table">
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th>Interpret</th>
              <th>Titel</th>
              <th>Datum</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.apiId}>
                <td>
                  {/* Negative apiIds = rekonstruierte/importierte Einträge ohne USDB-Cover */}
                  {e.apiId > 0 ? (
                    <CoverThumb apiId={e.apiId} />
                  ) : (
                    <div className="cover-thumb" />
                  )}
                </td>
                <td style={{ color: "var(--green)" }}>{e.artist}</td>
                <td>{e.title}</td>
                <td className="muted">{e.downloadedAt.slice(0, 10)}</td>
                <td>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => void window.ultrastar.openFolder(e.songDir)}
                  >
                    <FolderOpen size={14} aria-hidden />
                    Ordner
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DownloadedView;
```

- [ ] **Step 2: Verifizieren & committen**

```powershell
bun x tsc --noEmit            # 0
bun x electron-vite build     # ok
bun x biome lint src/desktop  # 0
bun test src                  # 25 pass
git add src/desktop/renderer
git commit -m "feat(desktop): archive import button in downloaded view"
```

- [ ] **Step 3: Manueller Test** — den Menschen bitten: `bun run desktop:dev`, View „Heruntergeladen": Button „Archiv importieren" klicken → Meldung „N Songs importiert …"; importierte Songs mit Video erscheinen sofort in der Liste; Suche zeigt sie als ✓.

---

## Verhaltens-Erinnerung aus der Spec

Importierte Einträge ohne `video.mp4` erscheinen erst nach einer Reparatur in der Liste (bestehender UI-Filter in `reloadDownloadedEntries`); die Ergebnis-Meldung weist darauf hin. Tracking-seitig wirken sie sofort (Dedupe in Suche/Queue).

---

# Nachtrag: Dedupe/✓ über Ordnernamen (Spec-Nachtrag vom 2026-06-02)

### Task N1: `sanitizeForPath` als pures Modul extrahieren (TDD)

**Files:**
- Create: `src/core/download/naming.ts`
- Test: `src/core/download/naming.test.ts`
- Modify: `src/core/download/downloadSong.ts` (Funktion + UMLAUT_MAP entfernen, Import ergänzen, `basename` aus dem node:path-Import streichen)

- [ ] **Step 1: Failing Test** — `src/core/download/naming.test.ts`:

```ts
import { expect, test } from "bun:test";
import { sanitizeForPath } from "./naming.ts";

test("replaces umlauts and collapses spaces to underscores", () => {
  expect(sanitizeForPath("Grönemeyer - Männer")).toBe("Groenemeyer_-_Maenner");
});

test("replaces dangerous characters with underscores", () => {
  expect(sanitizeForPath('AC/DC: "Back?"')).toBe("AC_DC_Back_");
});

test("strips parent-directory traversal sequences", () => {
  expect(sanitizeForPath("../../etc")).toBe("_etc");
});

test("caps the input at 100 characters", () => {
  expect(sanitizeForPath("a".repeat(150))).toBe("a".repeat(100));
});

test("falls back to 'unnamed' when nothing survives", () => {
  expect(sanitizeForPath("")).toBe("unnamed");
  expect(sanitizeForPath("...")).toBe("unnamed");
});
```

- [ ] **Step 2: Rot sehen** — `bun test src/core/download/naming.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: `src/core/download/naming.ts` anlegen** — Funktionskörper 1:1 aus `downloadSong.ts` übernehmen, mit EINER Änderung: das node:path-`basename` wird durch ein pures Äquivalent ersetzt (nach den Ersetzungen können keine Separatoren mehr vorkommen; reines Sicherheitsnetz), damit das Modul ohne node:-Imports auskommt und im Renderer importierbar ist:

```ts
const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  Ä: "Ae",
  ö: "oe",
  Ö: "Oe",
  ü: "ue",
  Ü: "Ue",
  ß: "ss",
};

/**
 * Securely sanitizes a string for use in file paths.
 * Prevents path traversal, injection, and other attacks.
 * Pure (keine node:-Imports) — auch im Renderer nutzbar, um aus
 * "Artist - Titel" den Download-Ordnernamen abzuleiten.
 */
export const sanitizeForPath = (name: string): string => {
  // Remove NUL-bytes and control characters (0x00-0x1f and 0x80-0x9f)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional - stripping control chars for path safety
  let cleaned = name.replace(/[\x00-\x1f\x80-\x9f]/g, "");

  // Limit length to prevent buffer overflow attacks (Windows MAX_PATH is 260, but we're conservative)
  const MAX_LENGTH = 100;
  cleaned = cleaned.slice(0, MAX_LENGTH);

  // Replace Umlaute
  cleaned = cleaned.replace(/[äÄöÖüÜß]/g, (c) => UMLAUT_MAP[c] ?? c);

  // Replace dangerous characters with underscore (instead of space)
  // This prevents: directory traversal, command injection, etc.
  cleaned = cleaned.replace(/[\\/:"*?<>|]/g, "_");

  // Remove parent directory traversal sequences explicitly
  cleaned = cleaned.replace(/\.\./g, "");

  // Remove leading/trailing dots and spaces
  cleaned = cleaned.trim().replace(/^\.+|\.+$/g, "");

  // Collapse multiple underscores/spaces into single underscore
  cleaned = cleaned.replace(/[_\s]+/g, "_");

  // Pure basename equivalent (separators are already replaced above; safety net)
  let sanitized = cleaned.split(/[\\/]/).pop() ?? "";

  // Final safety check: if empty after sanitization, use a default name
  if (!sanitized || sanitized.length === 0) {
    sanitized = "unnamed";
  }

  return sanitized;
};
```

In `downloadSong.ts`: `UMLAUT_MAP` + `sanitizeForPath` löschen, oben `import { sanitizeForPath } from "./naming.ts";` ergänzen, Import-Zeile zu `import { join } from "node:path";` ändern.

- [ ] **Step 4: Grün sehen + Checks**

```powershell
bun test src/core/download/naming.test.ts   # 5 pass
bun test src                                 # 30 pass (25 + 5)
bun x tsc --noEmit                           # 0
bun run build                                # CLI-Build ok (downloadSong-Pfad unverändert)
```

- [ ] **Step 5: Commit**

```powershell
git add src/core/download
git commit -m "refactor(core): extract pure sanitizeForPath into naming module"
```

### Task N2: Dedupe/✓ per dirName in Main und SearchView

**Files:**
- Modify: `src/desktop/main/state.ts`
- Modify: `src/desktop/main/downloads.ts`
- Modify: `src/desktop/renderer/views/SearchView.tsx`

- [ ] **Step 1: `state.ts`** — Import ergänzen (`import { sanitizeForPath } from "../../core/download/naming.ts";`), nach dem `downloadedApiIds`-Getter:

```ts
  get downloadedDirNames(): Set<string> {
    return new Set(this.downloaded.map((e) => e.dirName));
  }

  /** Bereits vorhanden? — per USDB-apiId ODER abgeleitetem Ordnernamen (Archiv-Import). */
  isDownloadedSong(song: Pick<Song, "apiId" | "artist" | "title">): boolean {
    return (
      this.downloadedApiIds.has(song.apiId) ||
      this.downloadedDirNames.has(
        sanitizeForPath(`${song.artist} - ${song.title}`),
      )
    );
  }
```

`addToQueue`-Filter ersetzen durch:

```ts
  addToQueue(songs: Song[]): number {
    const existing = new Set(this.queue.map((s) => s.apiId));
    const fresh = songs.filter(
      (s) => !existing.has(s.apiId) && !this.isDownloadedSong(s),
    );
    if (fresh.length > 0) this.setQueue([...this.queue, ...fresh]);
    return fresh.length;
  }
```

- [ ] **Step 2: `downloads.ts`** — in `downloadSongItem` die Zeile `if (state.downloadedApiIds.has(song.apiId)) return;` ersetzen durch `if (state.isDownloadedSong(song)) return;`. In `processQueue` BEIDE Filterstellen `(s) => !state.downloadedApiIds.has(s.apiId)` bzw. `(song) => !state.downloadedApiIds.has(song.apiId)` ersetzen durch `(s) => !state.isDownloadedSong(s)`.

- [ ] **Step 3: `SearchView.tsx`** — Import ergänzen (`import { sanitizeForPath } from "../../../core/download/naming.ts";` — Achtung: drei Ebenen hoch aus `views/`), nach dem `downloadedIds`-Memo:

```ts
  const downloadedDirs = useMemo(
    () => new Set(downloaded.map((e) => e.dirName)),
    [downloaded],
  );
```

und in der Tabellen-Map die Zeile `const isDownloaded = downloadedIds.has(s.apiId);` ersetzen durch:

```ts
                const isDownloaded =
                  downloadedIds.has(s.apiId) ||
                  downloadedDirs.has(
                    sanitizeForPath(`${s.artist} - ${s.title}`),
                  );
```

- [ ] **Step 4: Verifizieren & committen**

```powershell
bun test src                  # 30 pass
bun x tsc --noEmit            # 0
bun x electron-vite build     # ok
bun x biome lint src          # 0
git add src/desktop
git commit -m "feat(desktop): dedupe and downloaded marker via derived dir names"
```

- [ ] **Step 5: Manueller Test** — App starten, Archiv importieren, dann nach einem importierten Song suchen: ✓ erscheint, ⬇/＋-Buttons fehlen; „Seite in Queue" überspringt ihn (Badge zählt entsprechend weniger hoch).
