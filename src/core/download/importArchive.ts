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
