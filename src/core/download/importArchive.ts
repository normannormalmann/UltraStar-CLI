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

export type ImportProgress = { current: number; total: number };

/** Parallel geprüfte Ordner pro Welle — I/O-bound, beschleunigt große Archive deutlich. */
const SCAN_CONCURRENCY = 32;

type ProbeResult =
  | { kind: "song"; entry: DownloadedEntry; hasVideo: boolean }
  | { kind: "not-a-song" };

const probeFolder = async (
  downloadDir: string,
  name: string,
): Promise<ProbeResult> => {
  const songDir = join(downloadDir, name);
  let txt: string;
  try {
    txt = await readFile(join(songDir, "song.txt"), "utf8");
  } catch {
    return { kind: "not-a-song" };
  }
  const { artist, title } = parseTxtHeaders(txt);

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
      artist: artist || name,
      title: title || name,
      dirName: name,
      songDir,
      downloadedAt: new Date().toISOString(),
    },
  };
};

/**
 * Bestehendes Archiv in das Tracking übernehmen — ohne Netzzugriff.
 * Ein Unterordner gilt als Song, wenn er eine song.txt enthält.
 * Bereits getrackte Ordner (per dirName) zählen als skipped;
 * Ordner ohne song.txt werden ignoriert (zählen gar nicht).
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
    const tracked = new Set(existing.map((e) => e.dirName));

    const total = folders.length;
    let importedWithoutVideo = 0;
    let skipped = 0;
    const newEntries: DownloadedEntry[] = [];

    for (let i = 0; i < folders.length; i += SCAN_CONCURRENCY) {
      const chunk = folders.slice(i, i + SCAN_CONCURRENCY);
      const results = yield* Effect.tryPromise({
        try: () =>
          Promise.all(
            chunk.map(async (name) => {
              if (tracked.has(name)) return "tracked" as const;
              return probeFolder(downloadDir, name);
            }),
          ),
        catch: (e) =>
          e instanceof Error ? e : new Error("Failed to scan archive"),
      });

      for (const r of results) {
        if (r === "tracked") {
          skipped++;
        } else if (r.kind === "song") {
          if (!r.hasVideo) importedWithoutVideo++;
          newEntries.push(r.entry);
        }
      }
      onProgress?.({ current: Math.min(i + SCAN_CONCURRENCY, total), total });
    }

    if (newEntries.length > 0) {
      yield* saveDownloadedEntries([...existing, ...newEntries]);
    }

    return { imported: newEntries.length, importedWithoutVideo, skipped };
  });
