import { expect, test } from "bun:test";
import { parseTxtHeaders } from "./repairSongs.ts";

test("parses ARTIST and TITLE headers", () => {
  const content = "#ARTIST:ABBA\n#TITLE:Waterloo\n#MP3:song.mp3\n: 0 4 0 Wa";
  expect(parseTxtHeaders(content)).toEqual({
    artist: "ABBA",
    title: "Waterloo",
  });
});

test("uppercases header keys (lowercase headers in file)", () => {
  const content = "#artist:Nena\n#title:99 Luftballons";
  expect(parseTxtHeaders(content)).toEqual({
    artist: "Nena",
    title: "99 Luftballons",
  });
});

test("handles CRLF line endings and surrounding whitespace", () => {
  const content = "#ARTIST:Falco\r\n#TITLE:Rock Me Amadeus\r\n";
  expect(parseTxtHeaders(content)).toEqual({
    artist: "Falco",
    title: "Rock Me Amadeus",
  });
});

test("returns empty object when headers are missing", () => {
  expect(parseTxtHeaders("no headers here")).toEqual({});
});

test("parses extended metadata headers", () => {
  const content = [
    "#ARTIST:ABBA",
    "#TITLE:Waterloo",
    "#LANGUAGE:English",
    "#GENRE:Pop",
    "#EDITION:SingStar",
    "#CREATOR:someone",
    "#YEAR:1974",
    "#BPM:294,5",
    ": 0 4 0 Wa",
  ].join("\n");
  expect(parseTxtHeaders(content)).toEqual({
    artist: "ABBA",
    title: "Waterloo",
    language: "English",
    genre: "Pop",
    edition: "SingStar",
    creator: "someone",
    year: 1974,
    bpm: 294.5,
  });
});

test("ignores invalid numbers and stops at the note block", () => {
  const content = "#ARTIST:X\n#YEAR:unknown\n: 0 4 0 La\n#GENRE:Pop";
  expect(parseTxtHeaders(content)).toEqual({ artist: "X" });
});
