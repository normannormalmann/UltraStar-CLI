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

let memoryCache: DownloadedEntry[] | null = null;
let writePromise = Promise.resolve<DownloadedEntry[]>([]);

export const loadDownloadedEntries: Effect.Effect<DownloadedEntry[], Error> =
  Effect.gen(function* () {
    if (memoryCache) return memoryCache;
    const filePath = yield* resolveDataFilePath("downloaded.json");
    const entries = yield* Effect.catchAll(
      Effect.tryPromise({
        try: async () => {
          const text = await readFile(filePath, "utf8");
          const json = JSON.parse(text);
          return Array.isArray(json) ? (json as DownloadedEntry[]) : [];
        },
        catch: (e) =>
          e instanceof Error
            ? e
            : new Error("Failed to load downloaded entries"),
      }),
      () => Effect.succeed([] as DownloadedEntry[]),
    );
    memoryCache = entries;
    return entries;
  });

export const saveDownloadedEntries = (
  entries: DownloadedEntry[],
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    memoryCache = entries;
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
  Effect.tryPromise({
    try: () => {
      writePromise = writePromise
        .then(async () => {
          const existing = await Effect.runPromise(loadDownloadedEntries);
          const filtered = existing.filter((e) => e.apiId !== entry.apiId);
          const updated = [entry, ...filtered];
          
          memoryCache = updated;
          
          const filePath = await Effect.runPromise(
            resolveDataFilePath("downloaded.json"),
          );
          await writeFile(filePath, JSON.stringify(updated, null, 2));
          
          return updated;
        })
        .catch((e) => {
          throw e;
        });
      return writePromise;
    },
    catch: (e) =>
      e instanceof Error ? e : new Error("Failed to append downloaded entry"),
  });
