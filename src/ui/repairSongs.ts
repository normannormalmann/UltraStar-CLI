import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
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

export type RepairProgress = {
  current: number;
  total: number;
  currentSong: string;
  videoProgress?: number; // 0..1
};

export type RepairResult = {
  total: number;
  fixed: number;
  rebuilt: number; // songs added to tracking (already had video.mp4)
  failed: string[];
};

/** Stable negative hash so songs without a USDB apiId get a unique tracking id. */
function stableHash(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return h < 0 ? h : ~h; // always negative, never 0
}

function parseTxtHeaders(content: string): { artist?: string; title?: string } {
  const result: { artist?: string; title?: string } = {};
  for (const line of content.split("\n")) {
    const match = /^#(\w+):(.*)$/.exec(line.trim());
    if (!match) continue;
    const key = match[1].toUpperCase();
    const value = match[2].trim();
    if (key === "ARTIST") result.artist = value;
    if (key === "TITLE") result.title = value;
    if (result.artist && result.title) break;
  }
  return result;
}

const repairSingleSong = (
  songDir: string,
  dirName: string,
  cookie: string,
  apiId: number | null,
  cookiesBrowser?: string,
  onProgress?: (p: number) => void,
): Effect.Effect<boolean, Error> =>
  Effect.gen(function* () {
    // Read artist/title from song.txt for fallback search
    const txtContent = yield* Effect.catchAll(
      Effect.tryPromise({
        try: async () => readFile(join(songDir, "song.txt"), "utf8"),
        catch: (e) => (e instanceof Error ? e : new Error("read failed")),
      }),
      () => Effect.succeed(""),
    );
    const { artist, title } = parseTxtHeaders(txtContent);

    // Step 1: Try USDB API if we have an apiId
    let videoLink: string | null = null;
    if (apiId !== null && apiId > 0) {
      const links = yield* Effect.catchAll(
        getYoutubeLinksById(apiId, cookie),
        () => Effect.succeed<YoutubeLink[]>([]),
      );
      if (links.length > 0) {
        videoLink = links[0]?.link ?? null;
      }
    }

    // Step 2: Fall back to YouTube search
    if (!videoLink) {
      if (!artist && !title) return false;
      const query = [artist, title].filter(Boolean).join(" ");
      const results = yield* Effect.catchAll(searchYoutubeVideos(query), () =>
        Effect.succeed<YoutubeVideo[]>([]),
      );
      const first = results[0];
      if (!first) return false;
      videoLink = first.url || `https://youtu.be/${first.id}`;
    }

    // Normalize link (same logic as downloadSong.ts)
    const normalizedLink = /^(https?:)?\/\//.test(videoLink)
      ? videoLink
      : `https://youtu.be/${videoLink}`;

    const videoPath = join(songDir, "video.mp4");
    yield* downloadYoutubeVideoWithProgress(
      normalizedLink,
      videoPath,
      (p) => onProgress?.(p.percent ?? 0),
      cookiesBrowser,
    );

    // Verify file was written
    const fileOk = yield* Effect.tryPromise({
      try: async () => {
        const s = await stat(videoPath);
        return s.size > 0;
      },
      catch: (e) => (e instanceof Error ? e : new Error("verify failed")),
    }).pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (!fileOk) return false;

    // Update tracking – always track, use stable hash when no USDB apiId
    const trackingApiId =
      apiId !== null && apiId > 0 ? apiId : stableHash(dirName);
    yield* Effect.catchAll(
      appendDownloadedEntry({
        apiId: trackingApiId,
        artist: artist ?? dirName,
        title: title ?? dirName,
        dirName,
        songDir,
        downloadedAt: new Date().toISOString(),
      }),
      () => Effect.succeed([]),
    );

    return true;
  });

export const scanAndRepairVideos = (
  downloadDir: string,
  cookie: string,
  cookiesBrowser?: string,
  onProgress?: (p: RepairProgress) => void,
): Effect.Effect<RepairResult, Error> =>
  Effect.gen(function* () {
    const folders = yield* Effect.tryPromise({
      try: async () => {
        const dirents = await readdir(downloadDir, { withFileTypes: true });
        return dirents.filter((d) => d.isDirectory()).map((d) => d.name);
      },
      catch: (e) =>
        e instanceof Error ? e : new Error("Failed to read directory"),
    });

    // Load downloaded.json to retrieve apiIds for broken entries
    const allEntries = yield* loadDownloadedEntries;
    const entryByDirName = new Map(allEntries.map((e) => [e.dirName, e]));

    // Partition: needs repair vs already has video
    const needsRepair: string[] = [];
    const hasVideo: string[] = [];
    for (const name of folders) {
      const videoPath = join(downloadDir, name, "video.mp4");
      const missing = yield* Effect.tryPromise({
        try: async () => {
          try {
            const s = await stat(videoPath);
            return s.size <= 1024 * 1024;
          } catch {
            return true;
          }
        },
        catch: (e) => (e instanceof Error ? e : new Error("stat failed")),
      });
      if (missing) needsRepair.push(name);
      else hasVideo.push(name);
    }

    // ── Rebuild tracking for untracked songs that already have video.mp4 ──
    const untrackedWithVideo = hasVideo.filter(
      (name) => !entryByDirName.has(name),
    );
    let rebuilt = 0;
    if (untrackedWithVideo.length > 0) {
      const newEntries: DownloadedEntry[] = [];
      for (const name of untrackedWithVideo) {
        const songDir = join(downloadDir, name);
        const txtContent = yield* Effect.catchAll(
          Effect.tryPromise({
            try: async () => readFile(join(songDir, "song.txt"), "utf8"),
            catch: () => "" as string,
          }),
          () => Effect.succeed(""),
        );
        const { artist, title } = parseTxtHeaders(txtContent);
        if (!artist && !title) continue;
        newEntries.push({
          apiId: stableHash(name),
          artist: artist ?? name,
          title: title ?? name,
          dirName: name,
          songDir,
          downloadedAt: new Date().toISOString(),
        });
      }
      if (newEntries.length > 0) {
        yield* Effect.catchAll(
          Effect.gen(function* () {
            const existing = yield* loadDownloadedEntries;
            const filtered = existing.filter(
              (e) => !newEntries.some((n) => n.dirName === e.dirName),
            );
            yield* saveDownloadedEntries([...newEntries, ...filtered]);
          }),
          () => Effect.succeed(undefined),
        );
        rebuilt = newEntries.length;
      }
    }

    // ── Repair missing videos in parallel (concurrency = 3) ──
    const total = needsRepair.length;
    const repairEffects = needsRepair.map((name, idx) =>
      Effect.gen(function* () {
        const songDir = join(downloadDir, name);
        const current = idx + 1;
        onProgress?.({ current, total, currentSong: name });
        const apiId = entryByDirName.get(name)?.apiId ?? null;
        return yield* Effect.catchAll(
          repairSingleSong(
            songDir,
            name,
            cookie,
            apiId,
            cookiesBrowser,
            (videoProgress) =>
              onProgress?.({
                current,
                total,
                currentSong: name,
                videoProgress,
              }),
          ),
          () => Effect.succeed(false),
        );
      }),
    );

    const results = yield* Effect.all(repairEffects, { concurrency: 3 });
    let fixed = 0;
    const failed: string[] = [];
    for (const [i, success] of results.entries()) {
      if (success) fixed++;
      else failed.push(needsRepair[i] ?? "");
    }

    return { total, fixed, rebuilt, failed };
  });
