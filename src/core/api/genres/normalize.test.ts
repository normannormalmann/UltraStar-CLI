import { expect, test } from "bun:test";
import { normalizeGenre } from "./normalize.ts";

test("maps known variants to canonical genres", () => {
  expect(normalizeGenre("rap/hip hop")).toBe("Hip-Hop");
  expect(normalizeGenre("Hip Hop")).toBe("Hip-Hop");
  expect(normalizeGenre("R&B/Soul")).toBe("R&B");
  expect(normalizeGenre("electro")).toBe("Electronic");
  expect(normalizeGenre("alternative rock")).toBe("Rock");
  expect(normalizeGenre("singer-songwriter")).toBe("Folk");
  expect(normalizeGenre("films/games")).toBe("Soundtrack");
});

test("title-cases unknown genres", () => {
  expect(normalizeGenre("synthwave")).toBe("Synthwave");
  expect(normalizeGenre("NEW WAVE")).toBe("New Wave");
});

test("rejects empty and non-genre noise", () => {
  expect(normalizeGenre("")).toBeNull();
  expect(normalizeGenre("   ")).toBeNull();
  expect(normalizeGenre("seen live")).toBeNull();
  expect(normalizeGenre("favorites")).toBeNull();
});
