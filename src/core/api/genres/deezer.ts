import { Effect } from "effect";
import { normalizeGenre } from "./normalize.ts";
import {
  type GenreLookupResult,
  type GenreProvider,
  artistMatches,
} from "./provider.ts";

type DeezerSearch = {
  data?: Array<{
    id: number;
    title: string;
    bpm?: number;
    explicit_lyrics?: boolean;
    artist?: { name?: string };
    album?: { id?: number };
  }>;
};

type DeezerAlbum = {
  release_date?: string;
  genres?: { data?: Array<{ name?: string }> };
};

export type DeezerTrackPick = {
  albumId: number;
  realBpm?: number;
  explicit?: boolean;
} | null;

export const pickDeezerTrack = (
  res: DeezerSearch,
  artist: string,
): DeezerTrackPick => {
  for (const t of res.data ?? []) {
    if (!t.album?.id || !t.artist?.name) continue;
    if (!artistMatches(t.artist.name, artist)) continue;
    return {
      albumId: t.album.id,
      ...(t.bpm && t.bpm > 0 ? { realBpm: t.bpm } : {}),
      ...(t.explicit_lyrics !== undefined ? { explicit: t.explicit_lyrics } : {}),
    };
  }
  return null;
};

export const parseDeezerAlbum = (
  album: DeezerAlbum,
): { genre: string; year?: number } | null => {
  const rawGenre = album.genres?.data?.[0]?.name;
  if (!rawGenre) return null;
  const genre = normalizeGenre(rawGenre);
  if (!genre) return null;
  const year = album.release_date
    ? Number.parseInt(album.release_date.slice(0, 4), 10)
    : Number.NaN;
  return { genre, ...(Number.isNaN(year) ? {} : { year }) };
};

const fetchJson = (url: string): Effect.Effect<unknown, Error> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Deezer ${res.status} for ${url}`);
      return res.json();
    },
    catch: (e) => (e instanceof Error ? e : new Error("Deezer request failed")),
  });

export const deezerProvider: GenreProvider = {
  id: "deezer",
  name: "Deezer",
  minDelayMs: 250,
  lookup: (artist, title) =>
    Effect.gen(function* () {
      const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
      const search = (yield* fetchJson(
        `https://api.deezer.com/search?q=${q}&limit=5`,
      )) as DeezerSearch;
      const pick = pickDeezerTrack(search, artist);
      if (!pick) return null as GenreLookupResult;
      const album = (yield* fetchJson(
        `https://api.deezer.com/album/${pick.albumId}`,
      )) as DeezerAlbum;
      const parsed = parseDeezerAlbum(album);
      if (!parsed) return null as GenreLookupResult;
      return {
        ...parsed,
        ...(pick.realBpm !== undefined ? { realBpm: pick.realBpm } : {}),
        ...(pick.explicit !== undefined ? { explicit: pick.explicit } : {}),
      } as GenreLookupResult;
    }),
};
