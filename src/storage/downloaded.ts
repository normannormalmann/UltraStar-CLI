import { readFile, writeFile } from "node:fs/promises";
import { Effect } from "effect";
import { resolveDataFilePath } from "./paths.ts";

export type DownloadedEntry = {
  apiId: number;
  artist: string;
  title: string;
  dirName: string;
  songDir: string;
  downloadedAt: string; // ISO
};

export const loadDownloadedEntries: Effect.Effect<DownloadedEntry[], Error> =
  Effect.gen(function* () {
    const filePath = yield* resolveDataFilePath("downloaded.json");
    return yield* Effect.catchAll(
      Effect.tryPromise({
        try: async () => {
          const text = await readFile(filePath, "utf8");
          const json = JSON.parse(text);
          return Array.isArray(json) ? (json as DownloadedEntry[]) : [];
        },
        catch: (e) =>
          e instanceof Error ? e : new Error("Failed to load downloaded entries"),
      }),
      () => Effect.succeed([] as DownloadedEntry[]),
    );
  });

export const saveDownloadedEntries = (
  entries: DownloadedEntry[],
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const filePath = yield* resolveDataFilePath("downloaded.json");
    yield* Effect.tryPromise({
      try: async () => writeFile(filePath, JSON.stringify(entries, null, 2)),
      catch: (e) =>
        e instanceof Error ? e : new Error("Failed to save downloaded entries"),
    });
  });

export const appendDownloadedEntry = (
  entry: DownloadedEntry,
): Effect.Effect<DownloadedEntry[], Error> =>
  Effect.gen(function* () {
    const existing = yield* loadDownloadedEntries;
    const filtered = existing.filter((e) => e.apiId !== entry.apiId);
    const updated = [entry, ...filtered];
    yield* saveDownloadedEntries(updated);
    return updated;
  });
