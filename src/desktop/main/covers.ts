import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { app } from "electron";
import { downloadCoverById } from "../../core/api/usdb/cover.ts";
import { state } from "./state.ts";

const DISK_LIMIT_BYTES = 200 * 1024 * 1024; // 200 MB (Spec)
const MEMORY_LIMIT_ENTRIES = 200;

export type CacheFile = { path: string; size: number; mtimeMs: number };

/** Pure: wählt die ältesten Dateien zur Löschung, bis das Limit eingehalten ist. */
export const selectEvictions = (
  files: CacheFile[],
  limitBytes: number,
): string[] => {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total <= limitBytes) return [];
  const sorted = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs);
  const evict: string[] = [];
  let remaining = total;
  for (const f of sorted) {
    if (remaining <= limitBytes) break;
    evict.push(f.path);
    remaining -= f.size;
  }
  return evict;
};

const coversDir = (): string => join(app.getPath("userData"), "covers");

// Einfacher Memory-LRU über Map-Einfügereihenfolge
const memoryCache = new Map<number, string>();

const remember = (apiId: number, dataUrl: string): void => {
  memoryCache.delete(apiId);
  memoryCache.set(apiId, dataUrl);
  if (memoryCache.size > MEMORY_LIMIT_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
};

const enforceDiskLimit = async (dir: string): Promise<void> => {
  try {
    const names = await readdir(dir);
    const files: CacheFile[] = [];
    for (const name of names) {
      const p = join(dir, name);
      const s = await stat(p);
      if (s.isFile()) files.push({ path: p, size: s.size, mtimeMs: s.mtimeMs });
    }
    for (const p of selectEvictions(files, DISK_LIMIT_BYTES)) {
      await rm(p, { force: true });
    }
  } catch {
    // Cache-Pflege darf nie die Anfrage scheitern lassen
  }
};

/** Cover als JPEG-data-URL liefern (Memory → Disk → Netz), null wenn keins existiert. */
export const getCoverDataUrl = async (apiId: number): Promise<string | null> => {
  const cached = memoryCache.get(apiId);
  if (cached) {
    remember(apiId, cached); // LRU-Touch
    return cached;
  }

  const dir = coversDir();
  const file = join(dir, `${apiId}.jpg`);

  try {
    const bytes = await readFile(file);
    const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    remember(apiId, dataUrl);
    return dataUrl;
  } catch {
    // nicht auf Disk → Netz
  }

  const fetched = await Effect.runPromise(
    downloadCoverById(apiId, state.cookie),
  ).catch(() => null);
  if (!fetched) return null;

  const dataUrl = `data:image/jpeg;base64,${Buffer.from(fetched).toString("base64")}`;
  remember(apiId, dataUrl);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, fetched);
    void enforceDiskLimit(dir);
  } catch {
    // Disk-Cache ist Best-Effort
  }
  return dataUrl;
};

/** Disk- und Memory-Cover-Caches leeren. Gibt die Zahl gelöschter Dateien zurück. */
export const clearCoverCaches = async (): Promise<{ deletedFiles: number }> => {
  memoryCache.clear();
  localMemoryCache.clear();
  let deletedFiles = 0;
  try {
    const dir = coversDir();
    for (const name of await readdir(dir)) {
      await rm(join(dir, name), { force: true });
      deletedFiles++;
    }
  } catch {
    // Verzeichnis existiert nicht → 0
  }
  return { deletedFiles };
};

const localMemoryCache = new Map<string, string>();

/**
 * Cover aus dem Song-Ordner (cover.jpg) als data-URL.
 * Sicherheit: songDir muss exakt einem getrackten Eintrag entsprechen —
 * kein beliebiger Dateizugriff aus dem Renderer.
 */
export const getLocalCoverDataUrl = async (
  songDir: string,
): Promise<string | null> => {
  if (!state.downloaded.some((e) => e.songDir === songDir)) return null;

  const cached = localMemoryCache.get(songDir);
  if (cached) {
    localMemoryCache.delete(songDir);
    localMemoryCache.set(songDir, cached); // LRU-Touch
    return cached;
  }

  try {
    const bytes = await readFile(join(songDir, "cover.jpg"));
    const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    localMemoryCache.set(songDir, dataUrl);
    if (localMemoryCache.size > MEMORY_LIMIT_ENTRIES) {
      const oldest = localMemoryCache.keys().next().value;
      if (oldest !== undefined) localMemoryCache.delete(oldest);
    }
    return dataUrl;
  } catch {
    return null;
  }
};
