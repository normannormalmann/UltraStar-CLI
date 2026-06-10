import { expect, test } from "bun:test";
import { parseDeezerAlbum, pickDeezerTrack } from "./deezer.ts";

const SEARCH_FIXTURE = {
  data: [
    {
      id: 3135556,
      title: "Fledermausland",
      bpm: 0,
      explicit_lyrics: true,
      artist: { name: "Trailerpark" },
      album: { id: 302127 },
    },
    {
      id: 999,
      title: "Fledermausland (Karaoke Version)",
      bpm: 120.5,
      explicit_lyrics: false,
      artist: { name: "Karaoke Crew" },
      album: { id: 1 },
    },
  ],
};

test("picks first track whose artist matches", () => {
  const t = pickDeezerTrack(SEARCH_FIXTURE, "Trailerpark");
  expect(t?.albumId).toBe(302127);
  expect(t?.explicit).toBe(true);
  expect(t?.realBpm).toBeUndefined(); // bpm 0 → kein Wert
});

test("returns null when no artist matches", () => {
  expect(pickDeezerTrack(SEARCH_FIXTURE, "Rammstein")).toBeNull();
});

const ALBUM_FIXTURE = {
  release_date: "2012-06-15",
  genres: { data: [{ name: "Rap/Hip Hop" }] },
};

test("parses album genre (normalized) and year", () => {
  const r = parseDeezerAlbum(ALBUM_FIXTURE);
  expect(r?.genre).toBe("Hip-Hop");
  expect(r?.year).toBe(2012);
});

test("returns null when album has no genres", () => {
  expect(
    parseDeezerAlbum({ release_date: "2012-06-15", genres: { data: [] } }),
  ).toBeNull();
});
