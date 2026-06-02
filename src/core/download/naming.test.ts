import { expect, test } from "bun:test";
import { sanitizeForPath } from "./naming.ts";

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
