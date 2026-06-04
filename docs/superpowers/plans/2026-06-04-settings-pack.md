# Settings-Paket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wählbare Ordnerstruktur für neue Downloads (flat/artist/letter), konfigurierbare Download-Parallelität (1–5) und Video-Qualität (720/1080/best), Cover-Cache-leeren-Button — plus rekursiver (Tiefe-2-)Archiv-Import.

**Architecture:** Pure Pfad-Logik (`songRelativePath`) und Qualitäts-Argument (`videoSortArg`) im Core mit Charakterisierungs-Tests; `downloadSong`/`importArchive` parametrisiert; Desktop liest die drei neuen `config.json`-Felder (Merge-Save existiert) und reicht sie durch; Settings-UI in der bestehenden View.

**Tech Stack:** Effect, bun:test, Electron IPC, React 19.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-04-settings-pack-design.md`
**Branch:** `feat/genre-enrichment` (gestapelt) · **Umgebung:** Bun-PATH-Prefix wie gehabt; `bun x` statt `bunx`.

---

### Task S1: Core — Pfad-Layout, Qualitäts-Argument, Download-Parameter (TDD)

**Files:**
- Modify: `src/core/download/naming.ts` (+ `FolderLayout`, `songRelativePath`)
- Modify: `src/core/download/naming.test.ts`
- Modify: `src/core/api/youtube/download.ts` (`videoSortArg` exportiert; Qualitätsparameter)
- Create: `src/core/api/youtube/download.test.ts`
- Modify: `src/core/download/downloadSong.ts` (Params + Pfadbau + Durchreichen)

- [ ] **Step 1: Failing Tests.** An `naming.test.ts` anhängen:

```ts
test("songRelativePath builds flat, artist and letter layouts", () => {
  expect(songRelativePath("ABBA", "Waterloo", "flat")).toBe("ABBA_-_Waterloo");
  expect(songRelativePath("ABBA", "Waterloo", "artist")).toBe(
    "ABBA/ABBA_-_Waterloo",
  );
  expect(songRelativePath("ABBA", "Waterloo", "letter")).toBe(
    "A/ABBA_-_Waterloo",
  );
});

test("letter layout buckets non-letters under # and transliterates umlauts", () => {
  expect(songRelativePath("!!! (Chk Chk Chk)", "X", "letter")).toBe(
    "#/!!!_(Chk_Chk_Chk)_-_X",
  );
  expect(songRelativePath("Ärzte", "Y", "letter")).toBe("A/Aerzte_-_Y");
});

test("leaf folder name is identical across layouts (dedupe invariant)", () => {
  const leaf = "Die_Aerzte_-_Maenner_sind_Schweine";
  for (const layout of ["flat", "artist", "letter"] as const) {
    const rel = songRelativePath("Die Ärzte", "Männer sind Schweine", layout);
    expect(rel.split("/").pop()).toBe(leaf);
  }
});
```

Neue Datei `src/core/api/youtube/download.test.ts`:

```ts
import { expect, test } from "bun:test";
import { videoSortArg } from "./download.ts";

test("maps quality settings to yt-dlp -S arguments", () => {
  expect(videoSortArg("720")).toBe("ext,res:720");
  expect(videoSortArg("1080")).toBe("ext,res:1080");
  expect(videoSortArg("best")).toBe("ext");
  expect(videoSortArg(undefined)).toBe("ext,res:1080"); // Default unverändert
});
```

- [ ] **Step 2: Rot sehen.**

- [ ] **Step 3: Implementieren.** `naming.ts` ergänzen:

```ts
export type FolderLayout = "flat" | "artist" | "letter";

/** Buchstaben-Bucket des sanitisierten Artists: A–Z, sonst "#". */
const letterBucket = (artist: string): string => {
  const first = sanitizeForPath(artist).charAt(0).toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
};

/**
 * Relativer Song-Pfad unter dem Download-Ordner (mit "/" als Trenner;
 * node:path join normalisiert plattformspezifisch). Der Leaf-Name ist in
 * allen Layouts identisch — Invariante für dirName-Dedupe und ✓-Marker.
 */
export const songRelativePath = (
  artist: string,
  title: string,
  layout: FolderLayout,
): string => {
  const leaf = sanitizeForPath(`${artist} - ${title}`);
  switch (layout) {
    case "artist":
      return `${sanitizeForPath(artist)}/${leaf}`;
    case "letter":
      return `${letterBucket(artist)}/${leaf}`;
    default:
      return leaf;
  }
};
```

`download.ts`: neuen Typ + pure Funktion + Parameter:

```ts
export type VideoQuality = "720" | "1080" | "best";

/** yt-dlp -S Sortierausdruck für die gewählte Maximal-Qualität. */
export const videoSortArg = (quality?: VideoQuality): string =>
  quality === "720" ? "ext,res:720" : quality === "best" ? "ext" : "ext,res:1080";
```
`downloadYoutubeVideoWithProgress(link, path, onProgress, cookiesBrowser?, quality?: VideoQuality)` — fünfter optionaler Parameter; in `baseArgs` wird `"-S", "ext,res:1080"` zu `"-S", videoSortArg(quality)`. (`downloadYoutubeVideo` bleibt unverändert.)

`downloadSong.ts`: `DownloadSongParams` += `folderLayout?: FolderLayout; videoQuality?: VideoQuality;` — Imports aus `./naming.ts` bzw. `../api/youtube/download.ts`. Pfadbau:
```ts
    const relPath = songRelativePath(song.artist, song.title, params.folderLayout ?? "flat");
    const dirName = relPath.split("/").pop() as string;
    const songDir = join(baseDir, relPath);
```
(die alte `sanitizeForPath`-Zeile entfällt; mkdir recursive deckt Zwischenebenen ab). Im `videoEff` wird `params.videoQuality` als fünfter Parameter an `downloadYoutubeVideoWithProgress` gereicht.

- [ ] **Step 4: Grün + Gates** (`bun test src` → 64 pass: 60 + 3 naming + 1 quality; tsc 0; biome 0; `bun run build` CLI ok).

- [ ] **Step 5: Commit** `feat(core): folder layouts, video quality arg, parameterized download paths`

---

### Task S2: Core — Archiv-Import rekursiv (Tiefe 2) (TDD)

**Files:**
- Modify: `src/core/download/importArchive.ts`
- Modify: `src/core/download/importArchive.test.ts`

- [ ] **Step 1: Failing Test** anhängen (nutzt die bestehenden Helfer `makeArchive`/`makeSong`; `makeSong` akzeptiert verschachtelte dirNames, da `mkdir recursive` — prüfen, sonst minimal anpassen):

```ts
test("finds songs nested one level deep (artist/letter layouts)", async () => {
  const root = await makeArchive();
  await makeSong(root, "Flat_-_Song", { video: true });
  await makeSong(root, join("ABBA", "ABBA_-_Nested"), { video: true });
  await makeSong(root, join("A", "Deep", "Too_-_Deep"), { video: true }); // Tiefe 3 → ignoriert

  const result = await Effect.runPromise(importArchive(root));
  expect(result.imported).toBe(2);

  const entries = await Effect.runPromise(loadDownloadedEntries);
  const nested = entries.find((e) => e.dirName === "ABBA_-_Nested");
  expect(nested?.songDir).toBe(join(root, "ABBA", "ABBA_-_Nested"));
  expect(entries.find((e) => e.dirName === "Too_-_Deep")).toBeUndefined();
});
```
(`join` aus node:path ist im Testfile bereits importiert; `makeSong`-dirName mit Separator erzeugt die Verschachtelung über `mkdir(join(root, dirName), {recursive:true})` — verifizieren.)

- [ ] **Step 2: Rot sehen** (Tiefe-2-Song wird heute ignoriert → imported wäre 1).

- [ ] **Step 3: Implementieren.** In `importArchive` die Ordner-Aufzählung ersetzen: statt nur Top-Level-Namen wird eine Liste `{ name: leafName, songDir }` gebaut:

```ts
    const candidates = yield* Effect.tryPromise({
      try: async () => {
        const result: Array<{ name: string; songDir: string }> = [];
        const top = await readdir(downloadDir, { withFileTypes: true });
        for (const d of top.filter((x) => x.isDirectory())) {
          const dir = join(downloadDir, d.name);
          if (await hasSongTxt(dir)) {
            result.push({ name: d.name, songDir: dir });
            continue;
          }
          // Eine Ebene tiefer suchen (artist/letter-Layouts)
          const sub = await readdir(dir, { withFileTypes: true });
          for (const s of sub.filter((x) => x.isDirectory())) {
            const subDir = join(dir, s.name);
            if (await hasSongTxt(subDir)) {
              result.push({ name: s.name, songDir: subDir });
            }
          }
        }
        return result;
      },
      catch: (e) =>
        e instanceof Error ? e : new Error("Failed to read download dir"),
    });
```
mit Helfer:
```ts
const hasSongTxt = async (dir: string): Promise<boolean> => {
  try {
    await stat(join(dir, "song.txt"));
    return true;
  } catch {
    return false;
  }
};
```
Die Schleife iteriert dann über `candidates` (Chunks wie bisher); `tracked`-Abgleich und `probeNewFolder` arbeiten mit `candidate.name`/`candidate.songDir` (probeNewFolder-Signatur auf `(songDir, name)` umstellen statt `(downloadDir, name)` — Aufrufer anpassen; refresh-Pfad ebenso). `total = candidates.length` (Progress).

WICHTIG: `probeNewFolder` prüft song.txt erneut (readHeaders) — das bleibt als Sicherheitsnetz; Doppel-stat ist akzeptabel.

- [ ] **Step 4: Grün + Gates** (`bun test src` → 65 pass; tsc 0; biome 0).

- [ ] **Step 5: Commit** `feat(core): archive import scans one level deep for nested layouts`

---

### Task S3: Desktop — Config-Felder, Durchreichen, clearCache, Settings-UI

**Files:**
- Modify: `src/core/storage/config.ts` (AppConfig += `folderLayout?: string; downloadConcurrency?: number; videoQuality?: string;`)
- Modify: `src/desktop/main/state.ts` (Getter)
- Modify: `src/desktop/main/downloads.ts` (Durchreichen + dynamische Batch-Größe)
- Modify: `src/desktop/main/ipc.ts` (Repair-Qualität; `covers:clearCache`)
- Modify: `src/desktop/main/covers.ts` (`clearCoverCaches`)
- Modify: `src/desktop/shared/ipc-contract.ts`, `src/desktop/preload/index.ts`
- Modify: `src/desktop/renderer/views/SettingsView.tsx`

- [ ] **Step 1: Config + State.** AppConfig-Felder ergänzen. In `state.ts` (AppState) Getter:

```ts
  get folderLayout(): FolderLayout {
    const v = this.config?.folderLayout;
    return v === "artist" || v === "letter" ? v : "flat";
  }
  get downloadConcurrency(): number {
    const v = this.config?.downloadConcurrency;
    return typeof v === "number" && v >= 1 && v <= 5 ? Math.floor(v) : 3;
  }
  get videoQuality(): VideoQuality {
    const v = this.config?.videoQuality;
    return v === "720" || v === "best" ? v : "1080";
  }
```
(Imports: `FolderLayout` aus core naming, `VideoQuality` aus core download.)

- [ ] **Step 2: downloads.ts.** `downloadSong({ ... })`-Aufruf += `folderLayout: state.folderLayout, videoQuality: state.videoQuality,`. In `processQueue` ersetzt `state.downloadConcurrency` die Konstante (`DOWNLOAD_CONCURRENCY` löschen oder als Fallback-Kommentar entfernen; batch-Slices nutzen den Getter EINMAL pro Lauf: `const concurrency = state.downloadConcurrency;`).

- [ ] **Step 3: Repair-Qualität.** `repairSongs.ts`-Signatur NICHT anfassen — stattdessen prüfen: `repairSingleSong` ruft `downloadYoutubeVideoWithProgress(normalizedLink, videoPath, cb, cookiesBrowser)` — vierter Param vorhanden, fünfter (quality) fehlt. `scanAndRepairVideos`/`repairSingleSong` erhalten optionalen `videoQuality?: VideoQuality`-Parameter (an die bestehenden optionalen Parameter angehängt), Desktop-`repair:start` reicht `state.videoQuality` durch; TUI-Aufrufer bleibt unverändert (Default).

- [ ] **Step 4: clearCache.** `covers.ts`:

```ts
/** Disk- und Memory-Cover-Caches leeren. Gibt die Zahl gelöschter Dateien zurück. */
export const clearCoverCaches = async (): Promise<{ deletedFiles: number }> => {
  memoryCache.clear();
  localMemoryCache.clear();
  let deletedFiles = 0;
  try {
    const dir = coversDir();
    for (const name of await readdir(dir)) {
      await rm(join(dir, name), { force: true });
      deletedFiles++;
    }
  } catch {
    // Verzeichnis existiert nicht → 0
  }
  return { deletedFiles };
};
```
Contract: Invoke `"covers:clearCache"` → `Promise<{ deletedFiles: number }>`; UltrastarApi `coversClearCache`; Handler + Preload-Mapping. (Vertragstest deckt die Registrierung automatisch.)

- [ ] **Step 5: SettingsView.** Neue Sektion „Downloads" zwischen „Browser…" und „Genre-Quelle" (States aus initialConfig mit Defaults; save() schreibt die drei Felder mit):

```tsx
      <h3>Downloads</h3>
      <label className="muted" htmlFor="folder-layout">Ordnerstruktur neuer Downloads</label>
      <select
        id="folder-layout"
        className="input"
        style={{ width: 360, display: "block", marginBottom: 4 }}
        value={folderLayout}
        onChange={(e) => setFolderLayout(e.target.value)}
      >
        <option value="flat">Artist - Titel (flach)</option>
        <option value="artist">Artist / Artist - Titel</option>
        <option value="letter">A / Artist - Titel (Anfangsbuchstabe)</option>
      </select>
      <p className="muted" style={{ marginTop: 0 }}>
        Beispiel: {downloadDir || "…"}\
        {folderLayout === "artist"
          ? "ABBA\\ABBA_-_Waterloo"
          : folderLayout === "letter"
            ? "A\\ABBA_-_Waterloo"
            : "ABBA_-_Waterloo"}
      </p>
      <div className="row" style={{ marginBottom: 18 }}>
        <label className="row-inline muted" style={{ gap: 6 }}>
          Parallele Downloads
          <select
            className="input"
            value={String(downloadConcurrency)}
            onChange={(e) => setDownloadConcurrency(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="row-inline muted" style={{ gap: 6 }}>
          Video-Qualität
          <select
            className="input"
            value={videoQuality}
            onChange={(e) => setVideoQuality(e.target.value)}
          >
            <option value="720">max. 720p</option>
            <option value="1080">max. 1080p</option>
            <option value="best">Beste verfügbare</option>
          </select>
        </label>
      </div>
```
Im Tools-Bereich zusätzlich:
```tsx
          <button
            className="btn"
            type="button"
            disabled={clearingCache}
            onClick={() => {
              setClearingCache(true);
              void window.ultrastar
                .coversClearCache()
                .then((r) =>
                  setCacheMessage(`${r.deletedFiles} Cover-Dateien gelöscht`),
                )
                .finally(() => setClearingCache(false));
            }}
          >
            <Trash2 size={14} aria-hidden />
            Cover-Cache leeren
          </button>
```
(+ `Trash2` in den lucide-Import; `clearingCache`/`cacheMessage` States; `cacheMessage` als muted-Text daneben.) `save()` erweitert um `folderLayout, downloadConcurrency, videoQuality`.

- [ ] **Step 6: Gates + Commit**

```powershell
bun test src         # 65 pass
bun x tsc --noEmit   # 0
bun x biome lint src # 0
bun x electron-vite build  # ok
bun run test:e2e     # 1 passed
git add src
git commit -m "feat(desktop): folder layout, concurrency, quality settings and cover cache clear"
```

---

### Task S4: Gemeinsamer Live-Test (manuell, zusammen mit Genre-G6)

1. Einstellungen: Ordnerstruktur „A / Artist - Titel", Qualität „max. 720p", Parallelität 2 → Speichern → App-Neustart → Werte persistiert?
2. Einen fehlenden Song laden → landet unter `D:\Ultrastar\<Buchstabe>\Artist_-_Titel\`? (kleinere Videodatei als üblich = 720p wirkt). Suche zeigt ihn danach als ✓ (Leaf-Dedupe über Layouts).
3. „Archiv importieren" → der verschachtelte Song wird gefunden (kein Duplikat, `skipped`/`refreshed` plausibel).
4. „Cover-Cache leeren" → Meldung „N Cover-Dateien gelöscht"; Suche lädt Cover neu.
5. **Genre-G6:** „Genres nachtragen" (Deezer) → nach ~30–60 Songs abbrechen → Trefferquote, normalisierte Genres, song.txt-Stichprobe `#GENRE:`, Wiederaufnahme funktioniert.

## Selbstcheck Spec-Abdeckung
songRelativePath/Leaf-Invariante → S1 · videoSortArg/Durchreichen inkl. Reparatur → S1/S3 · Import Tiefe 2 → S2 · Config-Felder/Clamps/Getter → S3 · Queue-Batchgröße → S3 · clearCache → S3 · Settings-UI mit Beispielpfad → S3 · Live → S4.
