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
 *
 * Merge-on-persist: nur geänderte Einträge werden in `changed` gehalten.
 * Beim Persist wird die aktuelle Dateiliste neu geladen und die Änderungen
 * darüber gelegt — so gehen parallel heruntergeladene Songs nicht verloren.
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

    // Only changed entries live here; persist merges them onto the live store.
    const changed = new Map<number, DownloadedEntry>();

    let processed = 0;
    let enriched = 0;
    let notFound = 0;
    let txtPatched = 0;
    let txtFailed = 0;
    let consecutiveErrors = 0;
    let dirtySinceSave = 0;
    let cancelled = false;

    const persist = () =>
      Effect.gen(function* () {
        const live = yield* loadDownloadedEntries;
        const liveIds = new Set(live.map((e) => e.apiId));
        const merged = live.map((e) => changed.get(e.apiId) ?? e);
        // If an enriched entry was externally removed, do not re-insert it.
        yield* saveDownloadedEntries(merged.filter((e) => liveIds.has(e.apiId)));
      });

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
          changed.set(entry.apiId, updated);
          enriched++;
          dirtySinceSave++;

          // song.txt best-effort patchen
          const genre = result.r.genre;
          const patched = yield* Effect.tryPromise({
            try: async () => {
              const p = join(entry.songDir, "song.txt");
              const txt = await readFile(p, "utf8");
              await writeFile(p, applyHeader(txt, "GENRE", genre), "utf8");
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
