# VideoGap Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse `#VIDEOGAP` hints from USDB comment blocks and apply them to song.txt during download and repair.

**Architecture:** Extend `YoutubeLink` with optional `videoGap` field parsed per-comment-chunk in `parseYoutubeLinks`. Apply the gap from `links[0]` in `downloadSong` header object and in `repairSingleSong` as a best-effort txt patch after video download.

**Tech Stack:** TypeScript, Effect, Bun test, Node fs/promises

---

### Task 1: Commit 1 — videoGap parsing (TDD)

**Files:**
- Create: `src/core/api/usdb/youtube.test.ts`
- Modify: `src/core/api/usdb/youtube.ts`

- [ ] **Step 1A: Verify fixture against current parser**

Create the test file with only a length/order assertion first to confirm `parseComments` yields 2 comment chunks from the fixture:

```ts
// src/core/api/usdb/youtube.test.ts
import { expect, test } from "bun:test";
import { parseYoutubeLinks } from "./youtube.ts";

const DETAIL_HTML = `
<table border="0" width="500">
<tr class="list_head"><td>Comments by users (two cents)</td></tr>
<tr class="list_tr1"><td></td></tr>
<tr class="list_tr2"><td>13.12.23 - 04:07 | <a href="?link=profil&id=189527">Badut</a> <img src="images/neutral.png"></td></tr><tr class="list_tr1"><td>For Video:<br />
<br><center><br><iframe class="embed" width="432" height="240" src="https://www.youtube.com/embed/EAC-2ttHCyk"></iframe></center><br><br />
#VIDEOGAP:37.5<br><br></td></tr><tr class="list_tr2"><td>31.07.23 - 23:47 | <a href="?link=profil&id=149516">LilPeep1337</a> <img src="images/add.png"></td></tr><tr class="list_tr1"><td>nice!! vielen vielen dank! <img src="images/smilies/winking.png" title=";)"><br><br></td></tr><tr class="list_tr2"><td>19.02.23 - 14:00 | <b><a href="?link=profil&id=168937">BlodsveptKrigare</a></b> <img src="images/neutral.png"></td></tr><tr class="list_tr1"><td><br><center><br><iframe class="embed" width="432" height="240" src="https://www.youtube.com/embed/fpJ0VJGNXgY"></iframe></center><br><br><br></td></tr>
</table>`;

test("fixture yields 2 youtube links (length check)", () => {
  const links = parseYoutubeLinks(DETAIL_HTML);
  expect(links).toHaveLength(2);
  expect(links[0]?.link).toContain("EAC-2ttHCyk");
  expect(links[1]?.link).toContain("fpJ0VJGNXgY");
});
```

- [ ] **Step 1B: Run length/order check**

```powershell
$env:Path = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Oven-sh.Bun_Microsoft.Winget.Source_8wekyb3d8bbwe\bun-windows-x64;$env:Path"
bun test src/core/api/usdb/youtube.test.ts
```

Expected: PASS (2 links, correct order). If BLOCKED (not 2 links), stop and report.

- [ ] **Step 1C: Add failing videoGap assertions**

Replace test file with full assertions including videoGap and comma-decimal test:

```ts
// src/core/api/usdb/youtube.test.ts
import { expect, test } from "bun:test";
import { parseYoutubeLinks } from "./youtube.ts";

const DETAIL_HTML = `
<table border="0" width="500">
<tr class="list_head"><td>Comments by users (two cents)</td></tr>
<tr class="list_tr1"><td></td></tr>
<tr class="list_tr2"><td>13.12.23 - 04:07 | <a href="?link=profil&id=189527">Badut</a> <img src="images/neutral.png"></td></tr><tr class="list_tr1"><td>For Video:<br />
<br><center><br><iframe class="embed" width="432" height="240" src="https://www.youtube.com/embed/EAC-2ttHCyk"></iframe></center><br><br />
#VIDEOGAP:37.5<br><br></td></tr><tr class="list_tr2"><td>31.07.23 - 23:47 | <a href="?link=profil&id=149516">LilPeep1337</a> <img src="images/add.png"></td></tr><tr class="list_tr1"><td>nice!! vielen vielen dank! <img src="images/smilies/winking.png" title=";)"><br><br></td></tr><tr class="list_tr2"><td>19.02.23 - 14:00 | <b><a href="?link=profil&id=168937">BlodsveptKrigare</a></b> <img src="images/neutral.png"></td></tr><tr class="list_tr1"><td><br><center><br><iframe class="embed" width="432" height="240" src="https://www.youtube.com/embed/fpJ0VJGNXgY"></iframe></center><br><br><br></td></tr>
</table>`;

test("extracts videoGap from the same comment as the video link", () => {
  const links = parseYoutubeLinks(DETAIL_HTML);
  expect(links).toHaveLength(2);
  expect(links[0]?.link).toContain("EAC-2ttHCyk");
  expect(links[0]?.videoGap).toBe("37.5");
  expect(links[1]?.link).toContain("fpJ0VJGNXgY");
  expect(links[1]?.videoGap).toBeUndefined();
});

test("accepts comma decimal videogap", () => {
  const html = `<tr class="list_tr2"><td>01.01.24 - 10:00 | <a href="?x">User</a></td></tr><tr class="list_tr1"><td><iframe src="https://www.youtube.com/embed/abc12345678"></iframe> #VIDEOGAP: 12,25 </td></tr>`;
  const links = parseYoutubeLinks(html);
  expect(links[0]?.videoGap).toBe("12,25");
});
```

- [ ] **Step 1D: Run to confirm tests FAIL on videoGap**

```powershell
bun test src/core/api/usdb/youtube.test.ts
```

Expected: FAIL — `links[0]?.videoGap` is `undefined` (property doesn't exist yet).

- [ ] **Step 1E: Implement videoGap in youtube.ts**

Edit `src/core/api/usdb/youtube.ts` — add `videoGap?: string` to type and restructure `parseYoutubeLinks`:

```ts
import { Effect } from "effect";
import { API_URL } from "./config.ts";

export type YoutubeLink = {
  createdAt: Date;
  link: string;
  videoGap?: string;
};

export const parseComments = (html: string): string[] => {
  return [
    ...html.matchAll(/<td>\d+\.\d+\.\d+ - \d+:\d+.*?<\/td>[\s\S]*?<\/td>/gm),
  ].map((m) => m[0]);
};

export const parseYoutubeLinkFromComment = (
  r: RegExpMatchArray | null,
): YoutubeLink | null => {
  const dateStr = r?.[1];
  const timeStr = r?.[2];
  const linkRaw = r?.[3];

  if (!dateStr || !timeStr || !linkRaw) return null;

  const [day, month, year] = dateStr.split(".") as [string, string, string];
  const [hour, minute] = timeStr.split(":") as [string, string];

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  const link = linkRaw;
  if (!link) return null;

  return {
    createdAt: date,
    link,
  };
};

export const parseYoutubeLinks = (html: string): YoutubeLink[] =>
  parseComments(html)
    .map((c) => {
      const base = parseYoutubeLinkFromComment(
        c.match(
          /<td>(\d+\.\d+\.\d+) - (\d+:\d+)[\s\S]*src="(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[\w-]+)"/m,
        ),
      );
      if (!base) return null;
      const videoGap = c.match(/#VIDEOGAP:\s*(\d+(?:[.,]\d+)?)/i)?.[1];
      return videoGap ? { ...base, videoGap } : base;
    })
    .filter((l): l is YoutubeLink => l !== null);

export const fetchDetailPage = (id: number, cookie?: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${API_URL}/?link=detail&id=${id}`, {
        method: "GET",
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(
          `Detail request failed: ${response.status} ${response.statusText}`,
        );
      }
      return await response.text();
    },
    catch: (e) =>
      e instanceof Error ? e : new Error("Failed to fetch detail page"),
  });

export const getYoutubeLinksById = (id: number, cookie?: string) =>
  Effect.gen(function* () {
    const html = yield* fetchDetailPage(id, cookie);
    return parseYoutubeLinks(html);
  });
```

- [ ] **Step 1F: Run tests — expect GREEN**

```powershell
bun test src/core/api/usdb/youtube.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 1G: Type-check**

```powershell
bun x tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 1H: Commit**

```powershell
git add src/core/api/usdb/youtube.test.ts src/core/api/usdb/youtube.ts
git commit -m "feat(core): parse videogap hints from usdb comments"
```

---

### Task 2: Commit 2 — apply videoGap in downloadSong (TDD)

**Files:**
- Modify: `src/core/download/downloadSong.ts`

The link selection is on line 55 (`videoLink = links[0]?.link ?? null`). We capture `videoGap` at the same point and inject it into the headers object before the mp3/video/cover overrides.

- [ ] **Step 2A: Edit downloadSong.ts — capture videoGap and inject into headers**

After line 55 (`videoLink = links[0]?.link ?? null;`), add videoGap capture:

```ts
    if (links.length > 0) {
      videoLink = links[0]?.link ?? null;
    }
    const videoGapOverride = links[0]?.videoGap;
```

Then in the `headers` object inside `lyricsEff` (around line 130), change:

```ts
      const headers = {
        ...parsed.headers,
        ...(videoGapOverride ? { videogap: videoGapOverride } : {}),
        mp3: "video.mp4",
        video: "video.mp4",
        cover: "cover.jpg",
      } as Record<string, string | undefined>;
```

Note: `videoGapOverride` is defined in the outer `Effect.gen` scope, so it is accessible inside `lyricsEff`.

- [ ] **Step 2B: Type-check and run all tests**

```powershell
bun x tsc --noEmit
bun test src
```

Expected: 0 type errors, all tests pass.

- [ ] **Step 2C: Commit**

```powershell
git add src/core/download/downloadSong.ts
git commit -m "feat(core): apply comment videogap to downloaded song.txt"
```

---

### Task 3: Commit 3 — applyVideoGap helper + repairSongs patch (TDD)

**Files:**
- Modify: `src/core/download/repairSongs.ts`
- Modify: `src/core/download/repairSongs.test.ts`

- [ ] **Step 3A: Add failing tests for applyVideoGap pure helper**

Add to `src/core/download/repairSongs.test.ts`:

```ts
import { applyVideoGap } from "./repairSongs.ts";

test("applyVideoGap replaces existing #VIDEOGAP line", () => {
  const txt = "#ARTIST:X\n#VIDEOGAP:10.0\n#BPM:120\n: 0 4 0 La\n";
  expect(applyVideoGap(txt, "37.5")).toBe(
    "#ARTIST:X\n#VIDEOGAP:37.5\n#BPM:120\n: 0 4 0 La\n",
  );
});

test("applyVideoGap inserts after first header when absent", () => {
  const txt = "#ARTIST:X\n#TITLE:Y\n#BPM:120\n: 0 4 0 La\n";
  expect(applyVideoGap(txt, "37.5")).toBe(
    "#ARTIST:X\n#VIDEOGAP:37.5\n#TITLE:Y\n#BPM:120\n: 0 4 0 La\n",
  );
});
```

- [ ] **Step 3B: Run to confirm FAIL**

```powershell
bun test src/core/download/repairSongs.test.ts
```

Expected: FAIL — `applyVideoGap` not exported.

- [ ] **Step 3C: Implement applyVideoGap export in repairSongs.ts**

Add this exported function near the top of `src/core/download/repairSongs.ts` (after imports, before `stableHash`):

```ts
export function applyVideoGap(txt: string, gap: string): string {
  const line = `#VIDEOGAP:${gap}`;
  if (/^#VIDEOGAP:.*$/m.test(txt)) {
    return txt.replace(/^#VIDEOGAP:.*$/m, line);
  }
  return txt.replace(/^(#[^\n]*\n)/, `$1${line}\n`);
}
```

- [ ] **Step 3D: Run tests — expect GREEN**

```powershell
bun test src/core/download/repairSongs.test.ts
```

Expected: all tests PASS including the two new ones.

- [ ] **Step 3E: Patch repairSingleSong to capture videoGap and apply after repair**

In `repairSingleSong`, after the USDB links are fetched (around line 130–133), capture `videoGap`:

```ts
      const links = yield* Effect.catchAll(
        getYoutubeLinksById(apiId, cookie),
        () => Effect.succeed<YoutubeLink[]>([]),
      );
      if (links.length > 0) {
        videoLink = links[0]?.link ?? null;
      }
      const videoGap = links[0]?.videoGap;
```

Add `writeFile` to imports at top of file:

```ts
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
```

After the `if (!fileOk) return false;` check (after video verify), add the best-effort patch:

```ts
    // Apply videoGap from USDB comment (best-effort, does not fail repair)
    if (videoGap) {
      yield* Effect.tryPromise({
        try: async () => {
          const txtPath = join(songDir, "song.txt");
          const txt = await readFile(txtPath, "utf8");
          await writeFile(txtPath, applyVideoGap(txt, videoGap), "utf8");
        },
        catch: (e) => (e instanceof Error ? e : new Error("videogap patch failed")),
      }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
    }
```

- [ ] **Step 3F: Type-check and run all tests**

```powershell
bun x tsc --noEmit
bun test src
```

Expected: 0 type errors, all tests PASS.

- [ ] **Step 3G: Run linter**

```powershell
bun x biome lint src
```

Expected: 0 errors.

- [ ] **Step 3H: Commit**

```powershell
git add src/core/download/repairSongs.ts src/core/download/repairSongs.test.ts
git commit -m "feat(core): patch videogap during video repair"
```

---

### Final Verification Gate

- [ ] Run all tests:
```powershell
bun test src
```

- [ ] Type check:
```powershell
bun x tsc --noEmit
```

- [ ] Lint:
```powershell
bun x biome lint src
```

- [ ] Build:
```powershell
bun x electron-vite build
bun run build
```
