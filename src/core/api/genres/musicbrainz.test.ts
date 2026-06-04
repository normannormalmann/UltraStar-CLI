import { expect, test } from "bun:test";
import { pickMusicbrainzResult } from "./musicbrainz.ts";

const FIXTURE = {
  recordings: [
    {
      title: "Waterloo",
      "artist-credit": [{ name: "ABBA" }],
      "first-release-date": "1974-03-04",
      tags: [
        { name: "europop", count: 3 },
        { name: "pop", count: 8 },
      ],
    },
  ],
};

test("picks genre by highest tag count and parses year", () => {
  const r = pickMusicbrainzResult(FIXTURE, "ABBA");
  expect(r?.genre).toBe("Pop");
  expect(r?.year).toBe(1974);
});

test("returns null on artist mismatch or missing tags", () => {
  expect(pickMusicbrainzResult(FIXTURE, "Queen")).toBeNull();
  expect(
    pickMusicbrainzResult(
      { recordings: [{ title: "X", "artist-credit": [{ name: "ABBA" }], tags: [] }] },
      "ABBA",
    ),
  ).toBeNull();
});
