import { expect, test } from "bun:test";
import { cleanupSearchQuery, normalizeGenre } from "./normalize.ts";

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

test("cleanupSearchQuery strips trailing bracket groups from titles", () => {
  expect(cleanupSearchQuery("X", "Tarzan & Jane [DUET]").title).toBe(
    "Tarzan & Jane",
  );
  expect(cleanupSearchQuery("X", "No Good (Start The Dance)").title).toBe(
    "No Good",
  );
  expect(cleanupSearchQuery("X", "Harvest (TV) [SC]").title).toBe("Harvest");
  // Klammern MITTEN im Titel bleiben:
  expect(cleanupSearchQuery("X", "(I Can't Get No) Satisfaction").title).toBe(
    "(I Can't Get No) Satisfaction",
  );
});

test("cleanupSearchQuery normalizes typographic quotes", () => {
  expect(cleanupSearchQuery("X", "Scatman’s World").title).toBe(
    "Scatman's World",
  );
  expect(cleanupSearchQuery("Beyoncé", "„Halo“").title).toBe('"Halo"');
});

test("cleanupSearchQuery cuts featuring chains from artists only", () => {
  expect(
    cleanupSearchQuery("Stereoact & Jacques Raupé feat. Peter Schilling", "Y")
      .artist,
  ).toBe("Stereoact & Jacques Raupé");
  expect(cleanupSearchQuery("3OH!3 ft. Katy Perry", "Y").artist).toBe("3OH!3");
  expect(cleanupSearchQuery("A Featuring B", "Y").artist).toBe("A");
  // echte &-Bands bleiben:
  expect(cleanupSearchQuery("Simon & Garfunkel", "Y").artist).toBe(
    "Simon & Garfunkel",
  );
});
