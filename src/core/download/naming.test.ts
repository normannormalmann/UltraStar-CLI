import { expect, test } from "bun:test";
import { sanitizeForPath, songRelativePath } from "./naming.ts";

test("replaces umlauts and collapses spaces to underscores", () => {
  expect(sanitizeForPath("Grönemeyer - Männer")).toBe("Groenemeyer_-_Maenner");
});

test("replaces dangerous characters with underscores", () => {
  expect(sanitizeForPath('AC/DC: "Back?"')).toBe("AC_DC_Back_");
});

test("strips parent-directory traversal sequences", () => {
  expect(sanitizeForPath("../../etc")).toBe("_etc");
});

test("caps the input at 100 characters", () => {
  expect(sanitizeForPath("a".repeat(150))).toBe("a".repeat(100));
});

test("falls back to 'unnamed' when nothing survives", () => {
  expect(sanitizeForPath("")).toBe("unnamed");
  expect(sanitizeForPath("...")).toBe("unnamed");
});

test("songRelativePath builds flat, artist and letter layouts", () => {
  expect(songRelativePath("ABBA", "Waterloo", "flat")).toBe("ABBA_-_Waterloo");
  expect(songRelativePath("ABBA", "Waterloo", "artist")).toBe(
    "ABBA/ABBA_-_Waterloo",
  );
  expect(songRelativePath("ABBA", "Waterloo", "letter")).toBe(
    "A/ABBA_-_Waterloo",
  );
});

test("letter layout buckets non-letters under # and transliterates umlauts", () => {
  expect(songRelativePath("!!! (Chk Chk Chk)", "X", "letter")).toBe(
    "#/!!!_(Chk_Chk_Chk)_-_X",
  );
  expect(songRelativePath("Ärzte", "Y", "letter")).toBe("A/Aerzte_-_Y");
});

test("leaf folder name is identical across layouts (dedupe invariant)", () => {
  const leaf = "Die_Aerzte_-_Maenner_sind_Schweine";
  for (const layout of ["flat", "artist", "letter"] as const) {
    const rel = songRelativePath("Die Ärzte", "Männer sind Schweine", layout);
    expect(rel.split("/").pop()).toBe(leaf);
  }
});
