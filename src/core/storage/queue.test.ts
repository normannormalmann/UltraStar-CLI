import { rm } from "node:fs/promises";
import { afterAll, expect, test } from "bun:test";
import { Effect } from "effect";
import { getCacheDir, resolveDataFilePath } from "./paths.ts";
import { loadQueue, saveQueue } from "./queue.ts";

// Isoliertes Cache-Verzeichnis pro Testlauf; getAppName() liest die Variable
// bei jedem Aufruf, daher reicht das Setzen vor dem ersten Effect-Run.
process.env.ULTRASTAR_APP_NAME = `ultrastar-cli-test-${process.pid}`;

afterAll(async () => {
  const dir = await Effect.runPromise(getCacheDir());
  await rm(dir, { recursive: true, force: true });
});

test("resolveDataFilePath respects ULTRASTAR_APP_NAME and file name", async () => {
  const p = await Effect.runPromise(resolveDataFilePath("queue.json"));
  expect(p).toContain(`ultrastar-cli-test-${process.pid}`);
  expect(p.endsWith("queue.json")).toBe(true);
});

test("saveQueue then loadQueue round-trips songs", async () => {
  const songs = [
    { apiId: 1, artist: "ABBA", title: "Waterloo", languages: ["english"] },
    { apiId: 2, artist: "Toto", title: "Africa", languages: ["english"] },
  ];
  await Effect.runPromise(saveQueue(songs));
  const loaded = await Effect.runPromise(loadQueue);
  expect(loaded).toEqual(songs);
});

test("loadQueue returns empty array when file is missing", async () => {
  const dir = await Effect.runPromise(getCacheDir());
  await rm(dir, { recursive: true, force: true });
  const loaded = await Effect.runPromise(loadQueue);
  expect(loaded).toEqual([]);
});

test("loadQueue returns empty array for corrupt JSON", async () => {
  const p = await Effect.runPromise(resolveDataFilePath("queue.json"));
  await Bun.write(p, "{not json");
  const loaded = await Effect.runPromise(loadQueue);
  expect(loaded).toEqual([]);
});
