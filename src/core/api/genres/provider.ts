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
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const na = norm(a);
  const nb = norm(b);
  return na.length > 0 && (na === nb || na.includes(nb) || nb.includes(na));
};
