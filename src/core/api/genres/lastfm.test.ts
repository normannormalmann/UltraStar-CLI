import { expect, test } from "bun:test";
import { pickLastfmGenre } from "./lastfm.ts";

const FIXTURE = {
  toptags: {
    tag: [
      { name: "seen live", count: 100 },
      { name: "Hip-Hop", count: 80 },
      { name: "german", count: 60 },
    ],
  },
};

test("picks the first tag that normalizes to a genre", () => {
  expect(pickLastfmGenre(FIXTURE)).toBe("Hip-Hop");
});

test("returns null when no tag survives normalization", () => {
  expect(
    pickLastfmGenre({ toptags: { tag: [{ name: "favorites", count: 5 }] } }),
  ).toBeNull();
  expect(pickLastfmGenre({})).toBeNull();
});
