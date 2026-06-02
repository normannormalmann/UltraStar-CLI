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
