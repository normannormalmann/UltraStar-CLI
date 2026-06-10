import { Effect } from "effect";
import { cleanupSearchQuery, normalizeGenre } from "./normalize.ts";
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
      const cleaned = cleanupSearchQuery(artist, title);
      const url =
        "https://ws.audioscrobbler.com/2.0/?method=track.gettoptags" +
        `&artist=${encodeURIComponent(cleaned.artist)}&track=${encodeURIComponent(cleaned.title)}` +
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
