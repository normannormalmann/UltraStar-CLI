# Such-/Bibliotheksfilter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echte Filter (Sprache, Genre, Jahr, Sortierung) für USDB-Suche und lokale Bibliothek, plus lokale Anreicherung (song.txt-Metadaten, lokale Cover).

**Architecture:** Serverseitige USDB-Filter über erweiterte `SearchParams`/`buildFormBody`; lokale Filter über neue optionale Metadaten-Felder am `DownloadedEntry`, befüllt durch erweitertes `parseTxtHeaders` (Import, Backfill via Re-Import, Download-Pfad). Lokale Cover über neuen IPC-Kanal `covers:getLocal` mit autoritativem songDir-Lookup.

**Tech Stack:** Effect, bun:test, Electron IPC (typisierter Contract), React 19, lucide-react.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-03-library-filters-design.md`
**Branch:** `feat/desktop-gui` · **Umgebung:** Bun-PATH-Prefix wie gehabt; `bun x` statt `bunx`.

---

### Task F1: `parseTxtHeaders` erweitern (TDD)

**Files:**
- Modify: `src/core/download/repairSongs.ts` (Funktion ersetzen, `TxtHeaders`-Typ exportieren)
- Modify: `src/core/download/repairSongs.test.ts` (2 neue Tests)

- [ ] **Step 1: Failing Tests** — an `repairSongs.test.ts` anhängen:

```ts
test("parses extended metadata headers", () => {
  const content = [
    "#ARTIST:ABBA",
    "#TITLE:Waterloo",
    "#LANGUAGE:English",
    "#GENRE:Pop",
    "#EDITION:SingStar",
    "#CREATOR:someone",
    "#YEAR:1974",
    "#BPM:294,5",
    ": 0 4 0 Wa",
  ].join("\n");
  expect(parseTxtHeaders(content)).toEqual({
    artist: "ABBA",
    title: "Waterloo",
    language: "English",
    genre: "Pop",
    edition: "SingStar",
    creator: "someone",
    year: 1974,
    bpm: 294.5,
  });
});

test("ignores invalid numbers and stops at the note block", () => {
  const content = "#ARTIST:X\n#YEAR:unknown\n: 0 4 0 La\n#GENRE:Pop";
  expect(parseTxtHeaders(content)).toEqual({ artist: "X" });
});
```

- [ ] **Step 2: Rot sehen** — `bun test src/core/download/repairSongs.test.ts` → die 2 neuen Tests FAILen.

- [ ] **Step 3: `parseTxtHeaders` in `repairSongs.ts` ersetzen** durch:

```ts
export type TxtHeaders = {
  artist?: string;
  title?: string;
  language?: string;
  genre?: string;
  edition?: string;
  creator?: string;
  year?: number;
  bpm?: number;
};

export function parseTxtHeaders(content: string): TxtHeaders {
  const result: TxtHeaders = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (!trimmed.startsWith("#")) break; // Header-Block ist zusammenhängend am Dateianfang
    const match = /^#(\w+):(.*)$/.exec(trimmed);
    if (!match) continue;
    const key = match[1]?.toUpperCase();
    const value = match[2]?.trim() ?? "";
    if (value.length === 0) continue;
    switch (key) {
      case "ARTIST":
        result.artist = value;
        break;
      case "TITLE":
        result.title = value;
        break;
      case "LANGUAGE":
        result.language = value;
        break;
      case "GENRE":
        result.genre = value;
        break;
      case "EDITION":
        result.edition = value;
        break;
      case "CREATOR":
        result.creator = value;
        break;
      case "YEAR": {
        const y = Number.parseInt(value, 10);
        if (!Number.isNaN(y)) result.year = y;
        break;
      }
      case "BPM": {
        // Deutsche Dateien nutzen Komma als Dezimaltrenner ("294,5")
        const b = Number.parseFloat(value.replace(",", "."));
        if (!Number.isNaN(b)) result.bpm = b;
        break;
      }
      default:
        break;
    }
  }
  return result;
}
```

Bewusste Verhaltensänderungen (abgedeckt durch Bestands-Tests): leerer Header-Wert setzt das Feld nicht mehr (vorher `artist=""` — alle Aufrufer nutzen `||`/Falsy-Checks, identisches Endverhalten); Abbruch am ersten Nicht-`#`-Block statt Früh-Abbruch nach ARTIST+TITLE.

- [ ] **Step 4: Grün sehen** — `bun test src/core/download/repairSongs.test.ts` → 6 pass (4 alte + 2 neue). Dann `bun test src` → 33 pass; `bun x tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```powershell
git add src/core/download
git commit -m "feat(core): parse extended song.txt metadata headers"
```

---

### Task F2: `DownloadedEntry`-Metadaten + Import-Backfill (TDD)

**Files:**
- Modify: `src/core/storage/downloaded.ts` (Typ-Felder)
- Modify: `src/core/download/importArchive.ts` (Metadaten, Backfill, `refreshed`)
- Modify: `src/core/download/importArchive.test.ts` (neuer Test + bestehende Assertions)

- [ ] **Step 1: `DownloadedEntry` erweitern** — in `downloaded.ts`:

```ts
export type DownloadedEntry = {
  apiId: number;
  artist: string;
  title: string;
  dirName: string;
  songDir: string;
  downloadedAt: string; // ISO
  language?: string;
  genre?: string;
  edition?: string;
  creator?: string;
  year?: number;
  bpm?: number;
};
```

- [ ] **Step 2: Failing Test** — an `importArchive.test.ts` anhängen:

```ts
test("stores metadata and backfills tracked entries missing language", async () => {
  const root = await makeArchive();
  await makeSong(root, "Meta Song", {
    txt: "#ARTIST:Meta\n#TITLE:Song\n#LANGUAGE:German\n#GENRE:Pop\n#YEAR:1999\n",
    video: true,
  });
  await makeSong(root, "Old Tracked", {
    txt: "#ARTIST:Old\n#TITLE:Tracked\n#LANGUAGE:English\n",
    video: true,
  });
  await Effect.runPromise(
    saveDownloadedEntries([
      {
        apiId: -5,
        artist: "Old",
        title: "Tracked",
        dirName: "Old Tracked",
        songDir: join(root, "Old Tracked"),
        downloadedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );

  const result = await Effect.runPromise(importArchive(root));
  expect(result.imported).toBe(1);
  expect(result.refreshed).toBe(1);
  expect(result.skipped).toBe(0);

  const entries = await Effect.runPromise(loadDownloadedEntries);
  const meta = entries.find((e) => e.dirName === "Meta Song");
  expect(meta?.language).toBe("German");
  expect(meta?.genre).toBe("Pop");
  expect(meta?.year).toBe(1999);
  const old = entries.find((e) => e.dirName === "Old Tracked");
  expect(old?.language).toBe("English");
  expect(old?.artist).toBe("Old"); // vorhandene Felder nicht überschrieben
});
```

ZUSÄTZLICH die bestehenden `toEqual`-Assertions anpassen: im ersten Test `{ imported: 2, importedWithoutVideo: 1, skipped: 1 }` → `{ imported: 2, importedWithoutVideo: 1, skipped: 1, refreshed: 0 }`. (Achtung: der vorab getrackte Eintrag „Bereits Da" im ersten Test hat kein `language` — damit er weiterhin als `skipped` zählt, dort dem Seed-Eintrag `language: "x"` hinzufügen.)

- [ ] **Step 3: Rot sehen** — `bun test src/core/download/importArchive.test.ts` → FAIL.

- [ ] **Step 4: `importArchive.ts` umbauen:**

```ts
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import {
  type DownloadedEntry,
  loadDownloadedEntries,
  saveDownloadedEntries,
} from "../storage/downloaded.ts";
import { parseTxtHeaders, stableHash, type TxtHeaders } from "./repairSongs.ts";

export type ImportResult = {
  imported: number;
  importedWithoutVideo: number;
  skipped: number;
  refreshed: number;
};

export type ImportProgress = { current: number; total: number };

/** Parallel geprüfte Ordner pro Welle — I/O-bound, beschleunigt große Archive deutlich. */
const SCAN_CONCURRENCY = 32;

/** Nur die Metadaten-Felder eines Header-Satzes (ohne artist/title). */
export const entryMetadata = (h: TxtHeaders): Partial<DownloadedEntry> => ({
  ...(h.language ? { language: h.language } : {}),
  ...(h.genre ? { genre: h.genre } : {}),
  ...(h.edition ? { edition: h.edition } : {}),
  ...(h.creator ? { creator: h.creator } : {}),
  ...(h.year !== undefined ? { year: h.year } : {}),
  ...(h.bpm !== undefined ? { bpm: h.bpm } : {}),
});

type ProbeResult =
  | { kind: "song"; entry: DownloadedEntry; hasVideo: boolean }
  | { kind: "refresh"; dirName: string; meta: TxtHeaders }
  | { kind: "skipped" }
  | { kind: "not-a-song" };

const readHeaders = async (songDir: string): Promise<TxtHeaders | null> => {
  try {
    return parseTxtHeaders(await readFile(join(songDir, "song.txt"), "utf8"));
  } catch {
    return null;
  }
};

const probeNewFolder = async (
  downloadDir: string,
  name: string,
): Promise<ProbeResult> => {
  const songDir = join(downloadDir, name);
  const meta = await readHeaders(songDir);
  if (meta === null) return { kind: "not-a-song" };

  let hasVideo = false;
  try {
    hasVideo = (await stat(join(songDir, "video.mp4"))).size > 0;
  } catch {
    // kein Video → hasVideo bleibt false
  }

  return {
    kind: "song",
    hasVideo,
    entry: {
      apiId: stableHash(name),
      artist: meta.artist || name,
      title: meta.title || name,
      dirName: name,
      songDir,
      downloadedAt: new Date().toISOString(),
      ...entryMetadata(meta),
    },
  };
};

/**
 * Bestehendes Archiv in das Tracking übernehmen — ohne Netzzugriff.
 * Neue Song-Ordner werden importiert; bereits getrackte Einträge OHNE
 * language-Feld werden um Metadaten ergänzt (Backfill, zählt als refreshed).
 */
export const importArchive = (
  downloadDir: string,
  onProgress?: (p: ImportProgress) => void,
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
    const trackedByName = new Map(existing.map((e) => [e.dirName, e]));

    const total = folders.length;
    let importedWithoutVideo = 0;
    let skipped = 0;
    const newEntries: DownloadedEntry[] = [];
    const refreshMeta = new Map<string, TxtHeaders>();

    for (let i = 0; i < folders.length; i += SCAN_CONCURRENCY) {
      const chunk = folders.slice(i, i + SCAN_CONCURRENCY);
      const results = yield* Effect.tryPromise({
        try: () =>
          Promise.all(
            chunk.map(async (name): Promise<ProbeResult> => {
              const tracked = trackedByName.get(name);
              if (tracked) {
                if (tracked.language) return { kind: "skipped" };
                const meta = await readHeaders(join(downloadDir, name));
                if (meta === null) return { kind: "skipped" };
                return { kind: "refresh", dirName: name, meta };
              }
              return probeNewFolder(downloadDir, name);
            }),
          ),
        catch: (e) =>
          e instanceof Error ? e : new Error("Failed to scan archive"),
      });

      for (const r of results) {
        if (r.kind === "skipped") {
          skipped++;
        } else if (r.kind === "refresh") {
          refreshMeta.set(r.dirName, r.meta);
        } else if (r.kind === "song") {
          if (!r.hasVideo) importedWithoutVideo++;
          newEntries.push(r.entry);
        }
      }
      onProgress?.({ current: Math.min(i + SCAN_CONCURRENCY, total), total });
    }

    if (newEntries.length > 0 || refreshMeta.size > 0) {
      const updated = existing.map((e) => {
        const meta = refreshMeta.get(e.dirName);
        // Vorhandene Felder gewinnen: erst Metadaten, dann der Eintrag darüber
        return meta ? { ...entryMetadata(meta), ...e } : e;
      });
      yield* saveDownloadedEntries([...updated, ...newEntries]);
    }

    return {
      imported: newEntries.length,
      importedWithoutVideo,
      skipped,
      refreshed: refreshMeta.size,
    };
  });
```

- [ ] **Step 5: Grün sehen** — `bun test src` → 34 pass; `bun x tsc --noEmit` → 0; `bun x biome lint src/core` → 0.

- [ ] **Step 6: Commit**

```powershell
git add src/core
git commit -m "feat(core): import metadata and backfill via re-import"
```

---

### Task F3: USDB-Suchparameter (TDD)

**Files:**
- Modify: `src/core/api/usdb/search.ts` (`SearchOrder`, `SearchParams`, `buildFormBody` exportieren/erweitern)
- Modify: `src/core/api/usdb/search.test.ts` (neuer Test)

- [ ] **Step 1: Failing Test** — an `search.test.ts` anhängen (Import oben um `buildFormBody` erweitern):

```ts
test("buildFormBody includes filters only when set", () => {
  const base = buildFormBody({});
  expect(base.get("order")).toBe("lastchange");
  expect(base.get("ud")).toBe("desc");
  expect(base.get("language")).toBeNull();
  expect(base.get("genre")).toBeNull();
  expect(base.get("year")).toBeNull();

  const filtered = buildFormBody({
    language: "German",
    genre: "Pop",
    year: 1999,
    order: "year",
    ud: "asc",
  });
  expect(filtered.get("language")).toBe("German");
  expect(filtered.get("genre")).toBe("Pop");
  expect(filtered.get("year")).toBe("1999");
  expect(filtered.get("order")).toBe("year");
  expect(filtered.get("ud")).toBe("asc");
});
```

- [ ] **Step 2: Rot sehen** — FAIL (buildFormBody nicht exportiert / Params unbekannt).

- [ ] **Step 3: `search.ts` erweitern:**

```ts
export type SearchOrder =
  | "lastchange"
  | "interpret"
  | "title"
  | "year"
  | "rating";

export type SearchParams = {
  interpret?: string; // artist name
  title?: string; // song title
  language?: string;
  genre?: string;
  year?: number;
  order?: SearchOrder; // default: lastchange
  ud?: "asc" | "desc"; // default: desc
  limit?: number; // max 100
  start?: number; // pagination offset
};
```

`buildFormBody` wird exportiert und erweitert (Statik-Teil ersetzt):

```ts
export const buildFormBody = (params: SearchParams): URLSearchParams => {
  const form = new URLSearchParams();
  form.set("order", params.order ?? "lastchange");
  form.set("ud", params.ud ?? "desc");

  if (params.interpret && params.interpret.trim().length > 0) {
    form.set("interpret", params.interpret.trim());
  }
  if (params.title && params.title.trim().length > 0) {
    form.set("title", params.title.trim());
  }
  if (params.language && params.language.trim().length > 0) {
    form.set("language", params.language.trim());
  }
  if (params.genre && params.genre.trim().length > 0) {
    form.set("genre", params.genre.trim());
  }
  if (params.year != null && Number.isFinite(params.year)) {
    form.set("year", String(Math.floor(params.year)));
  }
  form.set("limit", String(clampLimit(params.limit)));
  form.set("start", String(normalizeStart(params.start)));

  return form;
};
```

- [ ] **Step 4: Grün** — `bun test src` → 35 pass; tsc 0; biome 0.

- [ ] **Step 5: Commit**

```powershell
git add src/core/api/usdb
git commit -m "feat(core): usdb search filters for language, genre, year, order"
```

---

### Task F4: IPC + Main — Filter durchreichen, Download-Metadaten, lokale Cover

**Files:**
- Modify: `src/desktop/shared/ipc-contract.ts`
- Modify: `src/desktop/main/ipc.ts`
- Modify: `src/desktop/main/downloads.ts`
- Modify: `src/desktop/main/covers.ts`
- Modify: `src/desktop/preload/index.ts`

- [ ] **Step 1: Contract** — `SearchRequest` ersetzen + `BulkQueueRequest` einführen; `SearchOrder` als Typ-Re-Export von core search ergänzen:

```ts
export type SearchRequest = {
  artist: string;
  title: string;
  page: number;
  language?: string;
  genre?: string;
  year?: number;
  order?: SearchOrder;
  ud?: "asc" | "desc";
};

export type BulkQueueRequest = Omit<SearchRequest, "page">;
```

(`import type { SearchOrder } from "../../core/api/usdb/search.ts";` + zum `export type {...}` hinzufügen.) `INVOKE_CHANNELS` += `"covers:getLocal",` (nach "covers:get"). `UltrastarApi`: `queueFetchAllPages: (req: BulkQueueRequest) => Promise<void>;` (Signatur ersetzen) und neu `coverGetLocal: (songDir: string) => Promise<string | null>;`.

- [ ] **Step 2: `downloads.ts`** — `fetchAllIntoQueue` nimmt das Request-Objekt:

```ts
export const fetchAllIntoQueue = async (
  req: BulkQueueRequest,
): Promise<void> => {
```
und im `searchSongs`-Aufruf:
```ts
          {
            interpret: req.artist.trim() || undefined,
            title: req.title.trim() || undefined,
            language: req.language,
            genre: req.genre,
            year: req.year,
            order: req.order,
            ud: req.ud,
            limit,
            start: (page - 1) * limit,
          },
```
(Import: `import type { BulkQueueRequest } from "../shared/ipc-contract.ts";` — bestehender Song-Import bleibt.)

Außerdem in `downloadSongItem` nach erfolgreichem Download Metadaten lesen — der `appendDownloadedEntry`-Aufruf wird zu:

```ts
    const headers = await readFile(join(result.songDir, "song.txt"), "utf8")
      .then((txt) => parseTxtHeaders(txt))
      .catch(() => ({}) as TxtHeaders);

    await Effect.runPromise(
      appendDownloadedEntry({
        apiId: song.apiId,
        artist: song.artist,
        title: song.title,
        dirName: result.dirName,
        songDir: result.songDir,
        downloadedAt: new Date().toISOString(),
        ...entryMetadata(headers),
      }),
    ).catch((e) => { /* bestehender catch-Block unverändert */ });
```
(Imports ergänzen: `import { readFile } from "node:fs/promises";`, `import { join } from "node:path";`, `import { entryMetadata } from "../../core/download/importArchive.ts";`, `import { parseTxtHeaders, type TxtHeaders } from "../../core/download/repairSongs.ts";`)

- [ ] **Step 3: `ipc.ts`** — `usdb:search` reicht die Filter durch:

```ts
    "usdb:search": async (req: SearchRequest) => {
      const start = (req.page - 1) * SEARCH_PAGE_SIZE;
      return Effect.runPromise(
        searchSongs(
          {
            interpret: req.artist.trim() || undefined,
            title: req.title.trim() || undefined,
            language: req.language,
            genre: req.genre,
            year: req.year,
            order: req.order,
            ud: req.ud,
            limit: SEARCH_PAGE_SIZE,
            start,
          },
          state.cookie,
        ),
      );
    },
```
`queue:fetchAllPages` wird zu `async (req: BulkQueueRequest) => { void fetchAllIntoQueue(req); }`; `queue:entireDatabase` zu `void fetchAllIntoQueue({ artist: "", title: "" });`. Neuer Handler `"covers:getLocal": async (songDir: string) => getLocalCoverDataUrl(songDir),` (Import aus ./covers.ts ergänzen). AUSSERDEM: der Früh-Return im `archive:import`-Handler (`archiveImportRunning`) wird zu `return { imported: 0, importedWithoutVideo: 0, skipped: 0, refreshed: 0 };` (neues Pflichtfeld).

- [ ] **Step 4: `covers.ts`** — lokalen Cover-Loader ergänzen (am Dateiende):

```ts
const localMemoryCache = new Map<string, string>();

/**
 * Cover aus dem Song-Ordner (cover.jpg) als data-URL.
 * Sicherheit: songDir muss exakt einem getrackten Eintrag entsprechen —
 * kein beliebiger Dateizugriff aus dem Renderer.
 */
export const getLocalCoverDataUrl = async (
  songDir: string,
): Promise<string | null> => {
  if (!state.downloaded.some((e) => e.songDir === songDir)) return null;

  const cached = localMemoryCache.get(songDir);
  if (cached) {
    localMemoryCache.delete(songDir);
    localMemoryCache.set(songDir, cached); // LRU-Touch
    return cached;
  }

  try {
    const bytes = await readFile(join(songDir, "cover.jpg"));
    const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    localMemoryCache.set(songDir, dataUrl);
    if (localMemoryCache.size > MEMORY_LIMIT_ENTRIES) {
      const oldest = localMemoryCache.keys().next().value;
      if (oldest !== undefined) localMemoryCache.delete(oldest);
    }
    return dataUrl;
  } catch {
    return null;
  }
};
```

- [ ] **Step 5: Preload** — `queueFetchAllPages` bleibt (Payload-Typ ändert sich nur im Contract), neu: `coverGetLocal: (songDir) => ipcRenderer.invoke("covers:getLocal", songDir),`

- [ ] **Step 6: Verifizieren & committen** — WICHTIG: `SearchView.tsx` ruft `queueFetchAllPages({artist, title})` auf — das bleibt typkompatibel (optionale Felder). 

```powershell
bun test src                  # 35 pass (ipc-Vertragstest deckt covers:getLocal)
bun x tsc --noEmit            # 0
bun x electron-vite build     # ok
bun x biome lint src          # 0
git add src/desktop src/core
git commit -m "feat(desktop): filter passthrough, download metadata, local covers ipc"
```

---

### Task F5: SearchView-Filterzeile

**Files:**
- Modify: `src/desktop/renderer/views/SearchView.tsx`

- [ ] **Step 1: Konstanten + State ergänzen** (nach den bestehenden Imports; lucide-Import um `ChevronDown, ChevronUp, SlidersHorizontal` erweitern, contract-Import um `BulkQueueRequest`):

```ts
const USDB_LANGUAGES = [
  "English", "German", "Spanish", "French", "Italian", "Portuguese",
  "Dutch", "Polish", "Swedish", "Norwegian", "Danish", "Finnish",
  "Russian", "Japanese", "Korean", "Chinese", "Turkish", "Czech",
  "Hungarian", "Slovak", "Croatian", "Serbian", "Greek", "Other",
] as const;

const USDB_GENRES = [
  "Pop", "Rock", "Schlager", "Musical", "Soundtrack", "Disney", "Metal",
  "Punk", "Country", "Folk", "Rap", "Hip-Hop", "R&B", "Soul", "Reggae",
  "Electronic", "Dance", "Jazz", "Blues", "Christmas", "Anime", "Game",
  "Volksmusik", "Other",
] as const;

const ORDER_OPTIONS = [
  { value: "lastchange", label: "Zuletzt geändert" },
  { value: "interpret", label: "Interpret" },
  { value: "title", label: "Titel" },
  { value: "year", label: "Jahr" },
  { value: "rating", label: "Bewertung" },
] as const;
```

Im Component-Body (nach den bestehenden useState-Zeilen):

```ts
  const [showFilters, setShowFilters] = useState(false);
  const [language, setLanguage] = useState("");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [order, setOrder] = useState<string>("lastchange");
  const [ud, setUd] = useState<"asc" | "desc">("desc");

  const activeFilterCount =
    (language ? 1 : 0) + (genre ? 1 : 0) + (year ? 1 : 0) +
    (order !== "lastchange" || ud !== "desc" ? 1 : 0);

  const filterRequest = (): BulkQueueRequest => ({
    artist,
    title,
    language: language || undefined,
    genre: genre || undefined,
    year: year ? Number.parseInt(year, 10) : undefined,
    order: order === "lastchange" ? undefined : (order as BulkQueueRequest["order"]),
    ud: ud === "desc" ? undefined : ud,
  });
```

- [ ] **Step 2: `fetchPage` nutzt die Filter** — der search-Aufruf wird zu:

```ts
      const result = await window.ultrastar.search({
        ...filterRequest(),
        page: p,
      });
```

und der „Alle Seiten"-Button zu `onClick={() => void window.ultrastar.queueFetchAllPages(filterRequest())}`.

- [ ] **Step 3: Filter-UI** — direkt NACH dem `</form>` der Suchzeile einfügen:

```tsx
      <div style={{ marginBottom: 12 }}>
        <button
          className="btn small"
          type="button"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal size={14} aria-hidden />
          Filter
          {activeFilterCount > 0 && (
            <span className="badge" style={{ marginLeft: 6 }}>
              {activeFilterCount}
            </span>
          )}
          {showFilters ? (
            <ChevronUp size={14} aria-hidden />
          ) : (
            <ChevronDown size={14} aria-hidden />
          )}
        </button>
        {showFilters && (
          <div className="row" style={{ marginTop: 8, flexWrap: "wrap" }}>
            <select
              className="input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="">Sprache: Alle</option>
              {USDB_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            >
              <option value="">Genre: Alle</option>
              {USDB_GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <input
              className="input"
              style={{ width: 110 }}
              type="number"
              placeholder="Jahr"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            <select
              className="input"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              {ORDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Sortierung: {o.label}
                </option>
              ))}
            </select>
            <button
              className="btn small"
              type="button"
              onClick={() => setUd((d) => (d === "desc" ? "asc" : "desc"))}
              title={ud === "desc" ? "absteigend" : "aufsteigend"}
            >
              {ud === "desc" ? "▾ absteigend" : "▴ aufsteigend"}
            </button>
          </div>
        )}
      </div>
```

WICHTIG (Icon-Konvention): `▾/▴` sind hier Text in einem beschrifteten Button — ERSETZEN durch lucide `ArrowDown`/`ArrowUp` (size 14, aria-hidden) vor „absteigend"/„aufsteigend"; Import ergänzen.

- [ ] **Step 4: Verifizieren & committen**

```powershell
bun x tsc --noEmit; bun x electron-vite build; bun x biome lint src/desktop; bun test src/desktop
git add src/desktop/renderer
git commit -m "feat(desktop): search filter row with language, genre, year, order"
```

---

### Task F6: DownloadedView-Filterleiste + lokale Cover + refreshed-Meldung

**Files:**
- Modify: `src/desktop/renderer/components/CoverThumb.tsx`
- Modify: `src/desktop/renderer/views/DownloadedView.tsx`

- [ ] **Step 1: `CoverThumb` um lokale Cover erweitern** — Datei ersetzen durch:

```tsx
import type { FC } from "react";
import { useEffect, useState } from "react";

/**
 * Cover-Thumbnail: USDB-Cover für echte apiIds, lokales cover.jpg
 * (über covers:getLocal) für importierte/rekonstruierte Einträge.
 */
export const CoverThumb: FC<{ apiId: number; songDir?: string }> = ({
  apiId,
  songDir,
}) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load =
      apiId > 0
        ? window.ultrastar.coverGet(apiId)
        : songDir
          ? window.ultrastar.coverGetLocal(songDir)
          : Promise.resolve(null);
    void load.then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [apiId, songDir]);
  return src ? (
    <img className="cover-thumb" src={src} alt="" />
  ) : (
    <div className="cover-thumb" />
  );
};

export default CoverThumb;
```

- [ ] **Step 2: DownloadedView** — (a) Tabellenzelle: der `apiId > 0`-Ternary wird ersetzt durch `<CoverThumb apiId={e.apiId} songDir={e.songDir} />` (eine Zeile, kein Platzhalter-div mehr). (b) `importMessage` erweitern — nach dem skipped-Teil:

```ts
  if (r.refreshed > 0) {
    parts.push(`${r.refreshed} Einträge um Metadaten ergänzt`);
  }
```

(c) Filterleiste — State + Memos nach dem bestehenden `filter`-State:

```ts
  const [langFilter, setLangFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");

  const languageOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const key = e.language ?? "Unbekannt";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const genreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const key = e.genre ?? "Unbekannt";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);
```

Das `filtered`-Memo wird erweitert (nach dem Text-Filter, vor dem return):

```ts
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const from = yearFrom ? Number.parseInt(yearFrom, 10) : null;
    const to = yearTo ? Number.parseInt(yearTo, 10) : null;
    const sorted = [...entries].sort((a, b) =>
      b.downloadedAt.localeCompare(a.downloadedAt),
    );
    return sorted.filter((e) => {
      if (
        q &&
        !e.artist.toLowerCase().includes(q) &&
        !e.title.toLowerCase().includes(q)
      )
        return false;
      if (langFilter && (e.language ?? "Unbekannt") !== langFilter)
        return false;
      if (genreFilter && (e.genre ?? "Unbekannt") !== genreFilter) return false;
      if (from !== null && (e.year === undefined || e.year < from))
        return false;
      if (to !== null && (e.year === undefined || e.year > to)) return false;
      return true;
    });
  }, [entries, filter, langFilter, genreFilter, yearFrom, yearTo]);
```

UI — die bestehende Filter-Zeile (`.row` mit Text-Input + importButton) wird erweitert um (zwischen Text-Input und importButton):

```tsx
        <select
          className="input"
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
        >
          <option value="">Sprache: Alle</option>
          {languageOptions.map(([lang, count]) => (
            <option key={lang} value={lang}>
              {lang} ({count.toLocaleString("de-DE")})
            </option>
          ))}
        </select>
        <select
          className="input"
          value={genreFilter}
          onChange={(e) => setGenreFilter(e.target.value)}
        >
          <option value="">Genre: Alle</option>
          {genreOptions.map(([g, count]) => (
            <option key={g} value={g}>
              {g} ({count.toLocaleString("de-DE")})
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ width: 90 }}
          type="number"
          placeholder="Jahr von"
          value={yearFrom}
          onChange={(e) => setYearFrom(e.target.value)}
        />
        <input
          className="input"
          style={{ width: 90 }}
          type="number"
          placeholder="bis"
          value={yearTo}
          onChange={(e) => setYearTo(e.target.value)}
        />
```

Und unter der Überschrift einen Treffer-Zähler: `<h2>` bleibt; direkt nach der Filter-`.row` (wenn Filter aktiv): 

```tsx
      {(langFilter || genreFilter || yearFrom || yearTo || filter) && (
        <p className="muted">
          {filtered.length.toLocaleString("de-DE")} Treffer
        </p>
      )}
```

- [ ] **Step 3: Verifizieren & committen**

```powershell
bun x tsc --noEmit; bun x electron-vite build; bun x biome lint src/desktop; bun test src
git add src/desktop/renderer
git commit -m "feat(desktop): library filter bar, local covers, refreshed message"
```

- [ ] **Step 4: Manueller Test** — App starten: (1) „Archiv importieren" erneut → Meldung „… 27.96x Einträge um Metadaten ergänzt"; (2) Sprache-Dropdown zeigt danach echte Sprachen mit Zählern, Filtern wirkt; (3) lokale Cover erscheinen in der Liste; (4) Suche: Filter aufklappen, Sprache=German, Genre=Pop → Ergebnisse prüfen (LIVE-VERIFIKATION der USDB-Parameter!); Sortierung Jahr aufsteigend prüfen; „Alle Seiten in Queue" respektiert Filter (Seitenzahl im Fortschritt deutlich kleiner als 21.000).

---

## Selbstcheck Spec-Abdeckung

- parseTxtHeaders erweitert → F1 · DownloadedEntry-Felder + Backfill/refreshed → F2 · SearchParams/buildFormBody → F3 · IPC-Durchreichung + Download-Metadaten + covers:getLocal (Sicherheits-Lookup) → F4 · Suche-Filter-UI inkl. Badge → F5 · Bibliotheks-Filter + lokale Cover + refreshed-Meldung → F6 · Tempo-Filter bewusst NICHT (Spec) · Live-Verifikation USDB-Parameter → F6 Step 4.
