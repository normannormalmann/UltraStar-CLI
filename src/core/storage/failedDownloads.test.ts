import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";
import { loadFailedDownloads } from "./failedDownloads.ts";

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

test("returns empty array when no xlsx exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ultrastar-failed-"));
  dirs.push(dir);
  expect(await loadFailedDownloads(dir)).toEqual([]);
});
