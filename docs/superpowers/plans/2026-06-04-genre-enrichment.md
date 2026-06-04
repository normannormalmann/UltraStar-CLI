# Genre-Anreicherung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fehlende Genres (12.657 Einträge) über wählbare Online-Quellen (Deezer/Last.fm/MusicBrainz) nachtragen — in App-DB und song.txt, mit Zusatzdaten year/realBpm/explicit.

**Architecture:** Provider-Abstraktion in `src/core/api/genres/` (gemeinsamer `GenreLookupResult`-Vertrag, pure Normalisierung), resumierbarer sequenzieller Job `enrichGenres` in `src/core/download/` (persistiert alle 50, abbrechbar, 5-Fehler-Abbruch), Desktop-Anbindung über die etablierten Muster (Guard-Flags, Progress-Events, Settings-Felder).

**Tech Stack:** Effect, bun:test (Fixtures als Inline-JSON), Electron IPC, React 19 + lucide-react.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-04-genre-enrichment-design.md`
**Branch:** `feat/genre-enrichment` · **Umgebung:** Bun-PATH-Prefix wie gehabt; `bun x` statt `bunx`.

---

### Task G1: `applyHeader`-Verallgemeinerung + Genre-Normalisierung (TDD)

**Files:**
- Modify: `src/core/download/repairSongs.ts` (`applyVideoGap` → Wrapper um neues `applyHeader`)
- Create: `src/core/api/genres/normalize.ts`
- Test: `src/core/api/genres/normalize.test.ts`; `src/core/download/repairSongs.test.ts` (eine Ergänzung)

- [ ] **Step 1: Failing Tests.** `normalize.test.ts`:

```ts
import { expect, test } from "bun:test";
import { normalizeGenre } from "./normalize.ts";

test("maps known variants to canonical genres", () => {
  expect(normalizeGenre("rap/hip hop")).toBe("Hip-Hop");
  expect(normalizeGenre("Hip Hop")).toBe("Hip-Hop");
  expect(normalizeGenre("R&B/Soul")).toBe("R&B");
  expect(normalizeGenre("electro")).toBe("Electronic");
  expect(normalizeGenre("alternative rock")).toBe("Rock");
  expect(normalizeGenre("singer-songwriter")).toBe("Folk");
  expect(normalizeGenre("films/games")).toBe("Soundtrack");
});

test("title-cases unknown genres", () => {
  expect(normalizeGenre("synthwave")).toBe("Synthwave");
  expect(normalizeGenre("NEW WAVE")).toBe("New Wave");
});

test("rejects empty and non-genre noise", () => {
  expect(normalizeGenre("")).toBeNull();
  expect(normalizeGenre("   ")).toBeNull();
  expect(normalizeGenre("seen live")).toBeNull();
  expect(normalizeGenre("favorites")).toBeNull();
});
```

`repairSongs.test.ts` ergänzen:
```ts
test("applyHeader replaces and inserts arbitrary headers", () => {
  const txt = "#ARTIST:X\n#GENRE:Old\n: 0 4 0 La\n";
  expect(applyHeader(txt, "GENRE", "Pop")).toBe(
    "#ARTIST:X\n#GENRE:Pop\n: 0 4 0 La\n",
  );
  const noGenre = "#ARTIST:X\r\n: 0 4 0 La\r\n";
  expect(applyHeader(noGenre, "GENRE", "Pop")).toBe(
    "#ARTIST:X\r\n#GENRE:Pop\r\n: 0 4 0 La\r\n",
  );
});
```

- [ ] **Step 2: Rot sehen.**

- [ ] **Step 3: Implementieren.** In `repairSongs.ts` `applyVideoGap` umbauen:

```ts
/** Ersetzt einen Header (oder fügt ihn nach der ersten Header-Zeile ein); EOL-erhaltend. */
export const applyHeader = (txt: string, key: string, value: string): string => {
  const line = `#${key.toUpperCase()}:${value}`;
  const pattern = new RegExp(`^#${key.toUpperCase()}:.*$`, "m");
  if (pattern.test(txt)) return txt.replace(pattern, line);
  const eol = txt.includes("\r\n") ? "\r\n" : "\n";
  return txt.replace(/^(#[^\n]*\n)/, `$1${line}${eol}`);
};

export const applyVideoGap = (txt: string, gap: string): string =>
  applyHeader(txt, "VIDEOGAP", gap);
```
(bestehende applyVideoGap-Tests bleiben grün; `applyHeader` zusätzlich aus repairSongs.ts exportieren.)

`src/core/api/genres/normalize.ts`:

```ts
/** Nicht-Genres (v.a. Last.fm-Tags), die nie als Genre gelten dürfen. */
const BLOCKLIST = new Set([
  "seen live", "favorites", "favourite", "favourites", "spotify",
  "my music", "awesome", "beautiful", "love", "german", "english",
  "deutsch", "00s", "10s", "60s", "70s", "80s", "90s", "2000s",
]);

/** Varianten → kanonisches Genre (Schlüssel lowercase). */
const CANONICAL: Record<string, string> = {
  "hip hop": "Hip-Hop",
  "hip-hop": "Hip-Hop",
  "hiphop": "Hip-Hop",
  "rap/hip hop": "Hip-Hop",
  "rap": "Rap",
  "r&b": "R&B",
  "rnb": "R&B",
  "r&b/soul": "R&B",
  "soul & funk": "Soul",
  "electro": "Electronic",
  "electronica": "Electronic",
  "dance & edm": "Dance",
  "edm": "Dance",
  "alternative rock": "Rock",
  "alternative": "Rock",
  "indie rock": "Rock",
  "hard rock": "Rock",
  "heavy metal": "Metal",
  "singer-songwriter": "Folk",
  "singer/songwriter": "Folk",
  "films/games": "Soundtrack",
  "film scores": "Soundtrack",
  "musicals": "Musical",
  "comédies musicales": "Musical",
  "chanson française": "Chanson",
  "country & folk": "Country",
  "kids & family": "Kinderlieder",
  "christmas": "Christmas",
  "weihnachten": "Christmas",
};

const titleCase = (s: string): string =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(" ");

/** Roh-Genre einer Quelle normalisieren; null = unbrauchbar. */
export const normalizeGenre = (raw: string): string | null => {
  const cleaned = raw.trim().toLowerCase();
  if (cleaned.length === 0) return null;
  if (BLOCKLIST.has(cleaned)) return null;
  return CANONICAL[cleaned] ?? titleCase(cleaned);
};
```

- [ ] **Step 4: Grün + Gates** (`bun test src` → 47 pass: 43 + 3 normalize + 1 applyHeader; tsc 0; biome 0).

- [ ] **Step 5: Commit** `feat(core): generic header patcher and genre normalization`

---

### Task G2: Provider-Vertrag + Deezer (TDD)

**Files:**
- Create: `src/core/api/genres/provider.ts`
- Create: `src/core/api/genres/deezer.ts`
- Test: `src/core/api/genres/deezer.test.ts`

- [ ] **Step 1: Vertrag** — `provider.ts`:

```ts
import type { Effect } from "effect";

export type GenreLookupResult = {
  genre: string;
  year?: number;
  realBpm?: number;
  explicit?: boolean;
} | null;

export type GenreProviderId = "deezer" | "lastfm" | "musicbrainz";

export type GenreProvider = {
  id: GenreProviderId;
  name: string;
  /** Mindestabstand zwischen Lookups (Rate-Limit). */
  minDelayMs: number;
  lookup: (
    artist: string,
    title: string,
  ) => Effect.Effect<GenreLookupResult, Error>;
};

/** Artist-Vergleich für Treffer-Validierung: lowercase, ohne Sonderzeichen. */
export const artistMatches = (a: string, b: string): boolean => {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const na = norm(a);
  const nb = norm(b);
  return na.length > 0 && (na === nb || na.includes(nb) || nb.includes(na));
};
```

- [ ] **Step 2: Failing Tests** — `deezer.test.ts` testet die EXPORTIERTEN puren Parser (Netz-Funktionen werden nicht unit-getestet):

```ts
import { expect, test } from "bun:test";
import { pickDeezerTrack, parseDeezerAlbum } from "./deezer.ts";

const SEARCH_FIXTURE = {
  data: [
    {
      id: 3135556,
      title: "Fledermausland",
      bpm: 0,
      explicit_lyrics: true,
      artist: { name: "Trailerpark" },
      album: { id: 302127 },
    },
    {
      id: 999,
      title: "Fledermausland (Karaoke Version)",
      bpm: 120.5,
      explicit_lyrics: false,
      artist: { name: "Karaoke Crew" },
      album: { id: 1 },
    },
  ],
};

test("picks first track whose artist matches", () => {
  const t = pickDeezerTrack(SEARCH_FIXTURE, "Trailerpark");
  expect(t?.albumId).toBe(302127);
  expect(t?.explicit).toBe(true);
  expect(t?.realBpm).toBeUndefined(); // bpm 0 → kein Wert
});

test("returns null when no artist matches", () => {
  expect(pickDeezerTrack(SEARCH_FIXTURE, "Rammstein")).toBeNull();
});

const ALBUM_FIXTURE = {
  release_date: "2012-06-15",
  genres: { data: [{ name: "Rap/Hip Hop" }] },
};

test("parses album genre (normalized) and year", () => {
  const r = parseDeezerAlbum(ALBUM_FIXTURE);
  expect(r?.genre).toBe("Hip-Hop");
  expect(r?.year).toBe(2012);
});

test("returns null when album has no genres", () => {
  expect(parseDeezerAlbum({ release_date: "2012-06-15", genres: { data: [] } })).toBeNull();
});
```

- [ ] **Step 3: Implementieren** — `deezer.ts`:

```ts
import { Effect } from "effect";
import { normalizeGenre } from "./normalize.ts";
import {
  type GenreLookupResult,
  type GenreProvider,
  artistMatches,
} from "./provider.ts";

type DeezerSearch = {
  data?: Array<{
    id: number;
    title: string;
    bpm?: number;
    explicit_lyrics?: boolean;
    artist?: { name?: string };
    album?: { id?: number };
  }>;
};

type DeezerAlbum = {
  release_date?: string;
  genres?: { data?: Array<{ name?: string }> };
};

export type DeezerTrackPick = {
  albumId: number;
  realBpm?: number;
  explicit?: boolean;
} | null;

export const pickDeezerTrack = (
  res: DeezerSearch,
  artist: string,
): DeezerTrackPick => {
  for (const t of res.data ?? []) {
    if (!t.album?.id || !t.artist?.name) continue;
    if (!artistMatches(t.artist.name, artist)) continue;
    return {
      albumId: t.album.id,
      ...(t.bpm && t.bpm > 0 ? { realBpm: t.bpm } : {}),
      ...(t.explicit_lyrics !== undefined ? { explicit: t.explicit_lyrics } : {}),
    };
  }
  return null;
};

export const parseDeezerAlbum = (
  album: DeezerAlbum,
): { genre: string; year?: number } | null => {
  const rawGenre = album.genres?.data?.[0]?.name;
  if (!rawGenre) return null;
  const genre = normalizeGenre(rawGenre);
  if (!genre) return null;
  const year = album.release_date
    ? Number.parseInt(album.release_date.slice(0, 4), 10)
    : Number.NaN;
  return { genre, ...(Number.isNaN(year) ? {} : { year }) };
};

const fetchJson = (url: string): Effect.Effect<unknown, Error> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Deezer ${res.status} for ${url}`);
      return res.json();
    },
    catch: (e) => (e instanceof Error ? e : new Error("Deezer request failed")),
  });

export const deezerProvider: GenreProvider = {
  id: "deezer",
  name: "Deezer",
  minDelayMs: 250,
  lookup: (artist, title) =>
    Effect.gen(function* () {
      const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
      const search = (yield* fetchJson(
        `https://api.deezer.com/search?q=${q}&limit=5`,
      )) as DeezerSearch;
      const pick = pickDeezerTrack(search, artist);
      if (!pick) return null as GenreLookupResult;
      const album = (yield* fetchJson(
        `https://api.deezer.com/album/${pick.albumId}`,
      )) as DeezerAlbum;
      const parsed = parseDeezerAlbum(album);
      if (!parsed) return null as GenreLookupResult;
      return {
        ...parsed,
        ...(pick.realBpm !== undefined ? { realBpm: pick.realBpm } : {}),
        ...(pick.explicit !== undefined ? { explicit: pick.explicit } : {}),
      } as GenreLookupResult;
    }),
};
```

- [ ] **Step 4: Grün + Gates.** **Step 5: Commit** `feat(core): deezer genre provider`

---

### Task G3: Last.fm + MusicBrainz Provider (TDD)

**Files:**
- Create: `src/core/api/genres/lastfm.ts` + `lastfm.test.ts`
- Create: `src/core/api/genres/musicbrainz.ts` + `musicbrainz.test.ts`

- [ ] **Step 1: Failing Tests.** `lastfm.test.ts`:

```ts
import { expect, test } from "bun:test";
import { pickLastfmGenre } from "./lastfm.ts";

const FIXTURE = {
  toptags: {
    tag: [
      { name: "seen live", count: 100 },
      { name: "Hip-Hop", count: 80 },
      { name: "german", count: 60 },
    ],
  },
};

test("picks the first tag that normalizes to a genre", () => {
  expect(pickLastfmGenre(FIXTURE)).toBe("Hip-Hop");
});

test("returns null when no tag survives normalization", () => {
  expect(
    pickLastfmGenre({ toptags: { tag: [{ name: "favorites", count: 5 }] } }),
  ).toBeNull();
  expect(pickLastfmGenre({})).toBeNull();
});
```

`musicbrainz.test.ts`:

```ts
import { expect, test } from "bun:test";
import { pickMusicbrainzResult } from "./musicbrainz.ts";

const FIXTURE = {
  recordings: [
    {
      title: "Waterloo",
      "artist-credit": [{ name: "ABBA" }],
      "first-release-date": "1974-03-04",
      tags: [
        { name: "europop", count: 3 },
        { name: "pop", count: 8 },
      ],
    },
  ],
};

test("picks genre by highest tag count and parses year", () => {
  const r = pickMusicbrainzResult(FIXTURE, "ABBA");
  expect(r?.genre).toBe("Pop");
  expect(r?.year).toBe(1974);
});

test("returns null on artist mismatch or missing tags", () => {
  expect(pickMusicbrainzResult(FIXTURE, "Queen")).toBeNull();
  expect(
    pickMusicbrainzResult(
      { recordings: [{ title: "X", "artist-credit": [{ name: "ABBA" }], tags: [] }] },
      "ABBA",
    ),
  ).toBeNull();
});
```

- [ ] **Step 2: Implementieren.** `lastfm.ts`:

```ts
import { Effect } from "effect";
import { normalizeGenre } from "./normalize.ts";
import type { GenreLookupResult, GenreProvider } from "./provider.ts";

type LastfmTopTags = {
  toptags?: { tag?: Array<{ name?: string; count?: number }> };
};

export const pickLastfmGenre = (res: LastfmTopTags): string | null => {
  for (const t of res.toptags?.tag ?? []) {
    if (!t.name) continue;
    const genre = normalizeGenre(t.name);
    if (genre) return genre;
  }
  return null;
};

export const makeLastfmProvider = (apiKey: string): GenreProvider => ({
  id: "lastfm",
  name: "Last.fm",
  minDelayMs: 250,
  lookup: (artist, title) =>
    Effect.gen(function* () {
      const url =
        `https://ws.audioscrobbler.com/2.0/?method=track.gettoptags` +
        `&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}` +
        `&api_key=${encodeURIComponent(apiKey)}&format=json&autocorrect=1`;
      const res = yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`Last.fm ${r.status}`);
          return (await r.json()) as LastfmTopTags;
        },
        catch: (e) =>
          e instanceof Error ? e : new Error("Last.fm request failed"),
      });
      const genre = pickLastfmGenre(res);
      return (genre ? { genre } : null) as GenreLookupResult;
    }),
});
```

`musicbrainz.ts` (Pflicht-User-Agent!):

```ts
import { Effect } from "effect";
import { normalizeGenre } from "./normalize.ts";
import {
  type GenreLookupResult,
  type GenreProvider,
  artistMatches,
} from "./provider.ts";

const USER_AGENT =
  "ultrastar-dlh/1.2.0 (https://github.com/normannormalmann/ultrastar-dlh)";

type MbSearch = {
  recordings?: Array<{
    title?: string;
    "artist-credit"?: Array<{ name?: string }>;
    "first-release-date"?: string;
    tags?: Array<{ name?: string; count?: number }>;
  }>;
};

export const pickMusicbrainzResult = (
  res: MbSearch,
  artist: string,
): { genre: string; year?: number } | null => {
  for (const rec of res.recordings ?? []) {
    const credit = rec["artist-credit"]?.[0]?.name;
    if (!credit || !artistMatches(credit, artist)) continue;
    const tags = [...(rec.tags ?? [])].sort(
      (a, b) => (b.count ?? 0) - (a.count ?? 0),
    );
    for (const t of tags) {
      if (!t.name) continue;
      const genre = normalizeGenre(t.name);
      if (genre) {
        const year = rec["first-release-date"]
          ? Number.parseInt(rec["first-release-date"].slice(0, 4), 10)
          : Number.NaN;
        return { genre, ...(Number.isNaN(year) ? {} : { year }) };
      }
    }
  }
  return null;
};

export const musicbrainzProvider: GenreProvider = {
  id: "musicbrainz",
  name: "MusicBrainz",
  minDelayMs: 1100,
  lookup: (artist, title) =>
    Effect.gen(function* () {
      const query = encodeURIComponent(
        `artist:"${artist}" AND recording:"${title}"`,
      );
      const res = yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(
            `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=5`,
            { headers: { "User-Agent": USER_AGENT } },
          );
          if (!r.ok) throw new Error(`MusicBrainz ${r.status}`);
          return (await r.json()) as MbSearch;
        },
        catch: (e) =>
          e instanceof Error ? e : new Error("MusicBrainz request failed"),
      });
      return pickMusicbrainzResult(res, artist) as GenreLookupResult;
    }),
};
```

- [ ] **Step 3: Grün + Gates.** **Step 4: Commit** `feat(core): lastfm and musicbrainz genre providers`

---

### Task G4: `enrichGenres`-Job (TDD)

**Files:**
- Create: `src/core/download/enrichGenres.ts`
- Test: `src/core/download/enrichGenres.test.ts`
- Modify: `src/core/storage/downloaded.ts` (`realBpm?: number; explicit?: boolean;` am Typ)

- [ ] **Step 1: Failing Tests** — Fake-Lookup, isolierter Store (ULTRASTAR_APP_NAME-Muster wie queue.test.ts; Einträge vorab via saveDownloadedEntries seeden, songDirs als Temp-Ordner mit song.txt):

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  loadDownloadedEntries,
  saveDownloadedEntries,
} from "../storage/downloaded.ts";
import { getCacheDir } from "../storage/paths.ts";
import { enrichGenres } from "./enrichGenres.ts";

process.env.ULTRASTAR_APP_NAME = `ultrastar-cli-enrich-test-${process.pid}`;

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
  const cache = await Effect.runPromise(getCacheDir());
  await rm(join(cache, ".."), { recursive: true, force: true });
});

const seed = async (n: number, withGenreEvery?: number) => {
  const root = await mkdtemp(join(tmpdir(), "enrich-"));
  dirs.push(root);
  const entries = [];
  for (let i = 0; i < n; i++) {
    const dirName = `Song_${i}`;
    const songDir = join(root, dirName);
    await mkdir(songDir, { recursive: true });
    await writeFile(join(songDir, "song.txt"), `#ARTIST:A${i}\n#TITLE:T${i}\n: 0 4 0 La\n`, "utf8");
    entries.push({
      apiId: -(i + 1),
      artist: `A${i}`,
      title: `T${i}`,
      dirName,
      songDir,
      downloadedAt: "2026-01-01T00:00:00.000Z",
      ...(withGenreEvery && i % withGenreEvery === 0 ? { genre: "Pop" } : {}),
    });
  }
  await Effect.runPromise(saveDownloadedEntries(entries));
  return root;
};

test("enriches missing genres, patches song.txt, fills year only when empty", async () => {
  await seed(4, 2); // Einträge 0 und 2 haben schon Genre
  const result = await Effect.runPromise(
    enrichGenres(
      (artist) =>
        Effect.succeed(
          artist === "A3"
            ? null
            : { genre: "Rock", year: 1999, realBpm: 128, explicit: false },
        ),
      { minDelayMs: 0 },
    ),
  );
  expect(result).toMatchObject({
    processed: 2, // nur 1 und 3 (ohne Genre)
    enriched: 1, // A1
    notFound: 1, // A3
    txtPatched: 1,
    txtFailed: 0,
    cancelled: false,
  });
  const entries = await Effect.runPromise(loadDownloadedEntries);
  const e1 = entries.find((e) => e.artist === "A1");
  expect(e1?.genre).toBe("Rock");
  expect(e1?.year).toBe(1999);
  expect(e1?.realBpm).toBe(128);
  const txt = await readFile(join(e1!.songDir, "song.txt"), "utf8");
  expect(txt).toContain("#GENRE:Rock");
});

test("cancel stops between entries and persists progress", async () => {
  await seed(6);
  let calls = 0;
  const result = await Effect.runPromise(
    enrichGenres(() => Effect.succeed({ genre: "Pop" }), {
      minDelayMs: 0,
      persistEvery: 2,
      shouldCancel: () => calls++ >= 2,
    }),
  );
  expect(result.cancelled).toBe(true);
  expect(result.enriched).toBe(2);
  const entries = await Effect.runPromise(loadDownloadedEntries);
  expect(entries.filter((e) => e.genre === "Pop").length).toBe(2);
});

test("aborts after 5 consecutive hard errors", async () => {
  await seed(10);
  await expect(
    Effect.runPromise(
      enrichGenres(() => Effect.fail(new Error("boom")), { minDelayMs: 0 }),
    ),
  ).rejects.toThrow(/5 Fehler in Folge/);
});
```

- [ ] **Step 2: Implementieren** — `enrichGenres.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import type { GenreLookupResult } from "../api/genres/provider.ts";
import {
  type DownloadedEntry,
  loadDownloadedEntries,
  saveDownloadedEntries,
} from "../storage/downloaded.ts";
import { applyHeader } from "./repairSongs.ts";

export type EnrichProgress = {
  current: number;
  total: number;
  enriched: number;
};

export type EnrichResult = {
  processed: number;
  enriched: number;
  notFound: number;
  txtPatched: number;
  txtFailed: number;
  cancelled: boolean;
};

export type EnrichOptions = {
  minDelayMs?: number;
  persistEvery?: number;
  onProgress?: (p: EnrichProgress) => void;
  shouldCancel?: () => boolean;
};

const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Trägt fehlende Genres (und year/realBpm/explicit, wo geliefert) nach.
 * Resumierbar: bereits angereicherte Einträge werden übersprungen;
 * Persistenz alle persistEvery (Default 50) Einträge.
 */
export const enrichGenres = (
  lookup: (
    artist: string,
    title: string,
  ) => Effect.Effect<GenreLookupResult, Error>,
  opts: EnrichOptions = {},
): Effect.Effect<EnrichResult, Error> =>
  Effect.gen(function* () {
    const persistEvery = opts.persistEvery ?? 50;
    const all = yield* loadDownloadedEntries;
    const todo = all.filter((e) => !e.genre);
    const byApiId = new Map(all.map((e) => [e.apiId, e]));

    let processed = 0;
    let enriched = 0;
    let notFound = 0;
    let txtPatched = 0;
    let txtFailed = 0;
    let consecutiveErrors = 0;
    let dirtySinceSave = 0;
    let cancelled = false;

    const persist = () =>
      saveDownloadedEntries([...byApiId.values()]);

    for (const entry of todo) {
      if (opts.shouldCancel?.()) {
        cancelled = true;
        break;
      }

      const result = yield* lookup(entry.artist, entry.title).pipe(
        Effect.map((r) => ({ ok: true as const, r })),
        Effect.catchAll((e) => Effect.succeed({ ok: false as const, e })),
      );
      processed++;

      if (!result.ok) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          yield* persist();
          return yield* Effect.fail(
            new Error(
              `Anreicherung abgebrochen: ${MAX_CONSECUTIVE_ERRORS} Fehler in Folge (zuletzt: ${result.e.message})`,
            ),
          );
        }
      } else {
        consecutiveErrors = 0;
        if (result.r === null) {
          notFound++;
        } else {
          const updated: DownloadedEntry = {
            ...entry,
            genre: result.r.genre,
            ...(entry.year === undefined && result.r.year !== undefined
              ? { year: result.r.year }
              : {}),
            ...(result.r.realBpm !== undefined
              ? { realBpm: result.r.realBpm }
              : {}),
            ...(result.r.explicit !== undefined
              ? { explicit: result.r.explicit }
              : {}),
          };
          byApiId.set(entry.apiId, updated);
          enriched++;
          dirtySinceSave++;

          // song.txt best-effort patchen
          const patched = yield* Effect.tryPromise({
            try: async () => {
              const p = join(entry.songDir, "song.txt");
              const txt = await readFile(p, "utf8");
              await writeFile(p, applyHeader(txt, "GENRE", result.r.genre), "utf8");
              return true;
            },
            catch: (e) => (e instanceof Error ? e : new Error("txt patch failed")),
          }).pipe(Effect.catchAll(() => Effect.succeed(false)));
          if (patched) txtPatched++;
          else txtFailed++;

          if (dirtySinceSave >= persistEvery) {
            yield* persist();
            dirtySinceSave = 0;
          }
        }
      }

      opts.onProgress?.({ current: processed, total: todo.length, enriched });

      if (opts.minDelayMs && opts.minDelayMs > 0) {
        yield* Effect.promise(
          () => new Promise((r) => setTimeout(r, opts.minDelayMs)),
        );
      }
    }

    if (dirtySinceSave > 0) yield* persist();

    return { processed, enriched, notFound, txtPatched, txtFailed, cancelled };
  });
```

`downloaded.ts`: `DownloadedEntry` += `realBpm?: number; explicit?: boolean;`

- [ ] **Step 3: Grün + Gates.** **Step 4: Commit** `feat(core): resumable genre enrichment job`

---

### Task G5: Desktop — Config, IPC, Settings, Bibliothek

**Files:**
- Modify: `src/core/storage/config.ts` (AppConfig += `genreProvider?: string; lastfmApiKey?: string;`)
- Modify: `src/desktop/shared/ipc-contract.ts`, `src/desktop/main/ipc.ts`, `src/desktop/preload/index.ts`
- Modify: `src/desktop/renderer/views/SettingsView.tsx`, `src/desktop/renderer/views/DownloadedView.tsx`
- Modify: `src/desktop/main/state.ts` (saveConfigAndApply unverändert nutzbar; keine Änderung nötig, prüfen)

- [ ] **Step 1: Contract.**
- Invoke: `"genres:enrich"` (→ `Promise<EnrichResult>`), `"genres:cancel"` (→ void). Re-Exports: `EnrichResult as GenreEnrichResult` aus core, `GenreProviderId`.
- Event: `"event:genreEnrichProgress"` mit Payload `{ current: number; total: number; enriched: number } | null`.
- UltrastarApi: `genresEnrich: () => Promise<GenreEnrichResult>; genresCancel: () => Promise<void>;`

- [ ] **Step 2: Main-Handler** (`ipc.ts`):

```ts
let genreEnrichRunning = false;
let genreEnrichCancel = false;
```

```ts
    "genres:enrich": async () => {
      if (genreEnrichRunning) {
        throw new Error("Genre-Anreicherung läuft bereits.");
      }
      if (
        state.queueRunning ||
        state.activeDownloads.length > 0 ||
        repairRunning ||
        archiveImportRunning
      ) {
        throw new Error(
          "Anreicherung nicht möglich, während Downloads, Import oder Reparatur laufen.",
        );
      }
      const providerId = (state.config?.genreProvider ?? "deezer") as GenreProviderId;
      let provider: GenreProvider;
      if (providerId === "lastfm") {
        const key = state.config?.lastfmApiKey?.trim();
        if (!key) {
          throw new Error(
            "Last.fm benötigt einen API-Key (Einstellungen → Genre-Quelle).",
          );
        }
        provider = makeLastfmProvider(key);
      } else if (providerId === "musicbrainz") {
        provider = musicbrainzProvider;
      } else {
        provider = deezerProvider;
      }

      genreEnrichRunning = true;
      genreEnrichCancel = false;
      try {
        const result = await Effect.runPromise(
          enrichGenres(provider.lookup, {
            minDelayMs: provider.minDelayMs,
            onProgress: (p) => broadcast("event:genreEnrichProgress", p),
            shouldCancel: () => genreEnrichCancel,
          }),
        );
        await reloadDownloadedEntries();
        return result;
      } finally {
        genreEnrichRunning = false;
        broadcast("event:genreEnrichProgress", null);
      }
    },

    "genres:cancel": async () => {
      genreEnrichCancel = true;
    },
```
Gegen-Guards ergänzen: `archive:import` und `repair:start` verweigern zusätzlich, wenn `genreEnrichRunning` (Meldungstexte analog). Imports entsprechend (deezerProvider, makeLastfmProvider, musicbrainzProvider, enrichGenres, GenreProvider/GenreProviderId-Typen).

- [ ] **Step 3: Preload** — `genresEnrich`/`genresCancel` Mappings.

- [ ] **Step 4: SettingsView** — neue Sektion nach „Browser für YouTube-Cookies":

```tsx
      <h3>Genre-Quelle</h3>
      <p className="muted" style={{ maxWidth: 560 }}>
        Quelle für das Nachtragen fehlender Genres (Bibliothek → „Genres
        nachtragen"). Deezer braucht keinen Key.
      </p>
      <select
        className="input"
        style={{ width: 240, marginBottom: 8 }}
        value={genreProvider}
        onChange={(e) => setGenreProvider(e.target.value)}
      >
        <option value="deezer">Deezer (empfohlen)</option>
        <option value="lastfm">Last.fm (API-Key nötig)</option>
        <option value="musicbrainz">MusicBrainz (langsam, 1/s)</option>
      </select>
      {genreProvider === "lastfm" && (
        <input
          className="input"
          style={{ width: 360, display: "block", marginBottom: 8 }}
          placeholder="Last.fm API-Key"
          value={lastfmApiKey}
          onChange={(e) => setLastfmApiKey(e.target.value)}
        />
      )}
```
State aus `initialConfig` initialisieren (`genreProvider ?? "deezer"`, `lastfmApiKey ?? ""`); der bestehende `save()` schreibt beide Felder mit (`settingsSave({ downloadDir, browser, genreProvider, lastfmApiKey: lastfmApiKey || undefined })` — AppConfig-Felder optional).

- [ ] **Step 5: DownloadedView** — Button „Genres nachtragen" (lucide `Tags`) neben „Aktualisieren", disabled während des Laufs; Progress-Subscription `event:genreEnrichProgress` mit Zeile `Suche Genres… (x/y · z gefunden)` + Abbrechen-Button (ruft `genresCancel`); Ergebnis-Meldung nach Abschluss: `"{enriched} Genres nachgetragen · {notFound} nicht gefunden · {txtPatched} song.txt aktualisiert{txtFailed > 0 ? ` · ${txtFailed} Dateien fehlgeschlagen` : ""}{cancelled ? " · abgebrochen" : ""}"`; Fehler in den bestehenden Error-Banner.

- [ ] **Step 6: Gates + Commit** (`bun test src`, tsc, biome, electron-vite build, test:e2e) → `feat(desktop): genre enrichment job with provider selection`

---

### Task G6: Live-Kurzlauf (manuell)

- App starten, Einstellungen → Quelle Deezer (Default) prüfen → Bibliothek → „Genres nachtragen" starten, nach ~30–60 Songs **Abbrechen**. Prüfen: Trefferquote plausibel (>60%), Genres normalisiert (keine „Rap/Hip Hop"-Rohwerte), `Select-String`-Stichprobe einer gepatchten song.txt zeigt `#GENRE:`, Facetten-Dropdown gewachsen, erneuter Start macht beim nächsten Eintrag weiter. Optional denselben Kurztest mit MusicBrainz.

## Selbstcheck Spec-Abdeckung
Provider-Vertrag+Normalisierung → G1/G2/G3 · Job mit Persist/Cancel/Fehlerserie → G4 · Zusatzfelder year/realBpm/explicit → G2/G4 · Config/Settings/IPC/UI/Guards → G5 · Live-Verifikation → G6 · applyHeader-Verallgemeinerung → G1.
