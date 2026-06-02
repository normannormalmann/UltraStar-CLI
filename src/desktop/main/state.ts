import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { BrowserWindow } from "electron";
import { sanitizeForPath } from "../../core/download/naming.ts";
import {
  checkFfmpegAvailable,
  checkYtDlpAvailable,
} from "../../core/api/youtube/check.ts";
import { ensureSession } from "../../core/session.ts";
import {
  type AppConfig,
  loadConfig,
  saveConfig,
} from "../../core/storage/config.ts";
import {
  type DownloadedEntry,
  loadDownloadedEntries,
} from "../../core/storage/downloaded.ts";
import { loadQueue, saveQueue } from "../../core/storage/queue.ts";
import type { Song } from "../../core/api/usdb/search.ts";
import type {
  ActiveDownload,
  AppStatus,
  EventChannel,
  EventPayloads,
} from "../shared/ipc-contract.ts";

const QUEUE_SAVE_DEBOUNCE_MS = 2000;

export const broadcast = <C extends EventChannel>(
  channel: C,
  payload: EventPayloads[C],
): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
};

class AppState {
  cookie = "";
  config: AppConfig | null = null;
  status: AppStatus = {
    loggedIn: null,
    ytDlpAvailable: null,
    ffmpegAvailable: null,
  };
  queue: Song[] = [];
  activeDownloads: ActiveDownload[] = [];
  downloaded: DownloadedEntry[] = [];
  queueRunning = false;

  #queueSaveTimer: ReturnType<typeof setTimeout> | null = null;

  get downloadDir(): string {
    return this.config?.downloadDir ?? join(process.cwd(), "songs");
  }
  get browser(): string {
    return this.config?.browser ?? "edge";
  }
  get downloadedApiIds(): Set<number> {
    return new Set(this.downloaded.map((e) => e.apiId));
  }
  /**
   * Baut EINMALIG ein Prädikat „bereits vorhanden?" (apiId ODER abgeleiteter
   * Ordnername, case-insensitiv wegen NTFS). Vor .filter()-Läufen hoisten —
   * pro Aufruf werden die Sets nur einmal gebaut.
   */
  makeIsDownloadedSong(): (
    song: Pick<Song, "apiId" | "artist" | "title">,
  ) => boolean {
    const ids = this.downloadedApiIds;
    const dirs = new Set(this.downloaded.map((e) => e.dirName.toLowerCase()));
    return (song) =>
      ids.has(song.apiId) ||
      dirs.has(sanitizeForPath(`${song.artist} - ${song.title}`).toLowerCase());
  }

  /** Einzelabfrage; für Filter-Läufe makeIsDownloadedSong() hoisten. */
  isDownloadedSong(song: Pick<Song, "apiId" | "artist" | "title">): boolean {
    return this.makeIsDownloadedSong()(song);
  }

  setStatus(patch: Partial<AppStatus>): void {
    this.status = { ...this.status, ...patch };
    broadcast("event:status", this.status);
  }

  setQueue(next: Song[]): void {
    this.queue = next;
    broadcast("event:queueChanged", this.queue);
    // Debounce-Persistenz wie in der TUI (verhindert Massen-Schreiben bei Bulk-Adds)
    if (this.#queueSaveTimer) clearTimeout(this.#queueSaveTimer);
    this.#queueSaveTimer = setTimeout(() => {
      Effect.runPromise(saveQueue(this.queue)).catch((e) =>
        console.error("Failed to persist queue:", e),
      );
    }, QUEUE_SAVE_DEBOUNCE_MS);
  }

  /** Fügt Songs dedupliziert hinzu (gegen Queue UND Verlauf). Gibt Anzahl neuer Songs zurück. */
  addToQueue(songs: Song[]): number {
    const existing = new Set(this.queue.map((s) => s.apiId));
    const isDownloaded = this.makeIsDownloadedSong();
    const fresh = songs.filter(
      (s) => !existing.has(s.apiId) && !isDownloaded(s),
    );
    if (fresh.length > 0) this.setQueue([...this.queue, ...fresh]);
    return fresh.length;
  }

  setActiveDownloads(next: ActiveDownload[]): void {
    this.activeDownloads = next;
    broadcast("event:activeDownloads", this.activeDownloads);
  }

  patchActiveDownload(apiId: number, patch: Partial<ActiveDownload>): void {
    this.setActiveDownloads(
      this.activeDownloads.map((d) =>
        d.apiId === apiId ? { ...d, ...patch } : d,
      ),
    );
  }

  removeActiveDownload(apiId: number): void {
    this.setActiveDownloads(
      this.activeDownloads.filter((d) => d.apiId !== apiId),
    );
  }

  setDownloaded(entries: DownloadedEntry[]): void {
    this.downloaded = entries;
    broadcast("event:downloadedChanged", this.downloaded);
  }

  setQueueRunning(running: boolean): void {
    this.queueRunning = running;
    broadcast("event:queueRunning", running);
  }

  async saveConfigAndApply(config: AppConfig): Promise<void> {
    await Effect.runPromise(saveConfig(config));
    this.config = config;
  }
}

export const state = new AppState();

/** Verlauf laden und Einträge ohne video.mp4 für die UI ausfiltern (wie TUI). */
export const reloadDownloadedEntries = async (): Promise<void> => {
  try {
    const entries = await Effect.runPromise(loadDownloadedEntries);
    const valid: DownloadedEntry[] = [];
    await Promise.all(
      entries.map(async (e) => {
        try {
          await stat(join(e.songDir, "video.mp4"));
          valid.push(e);
        } catch {
          // Datei fehlt – Eintrag bleibt in downloaded.json für die Reparatur,
          // wird aber nicht in der UI gelistet (gleiches Verhalten wie TUI).
        }
      }),
    );
    state.setDownloaded(valid);
  } catch (e) {
    console.error("Failed to load downloaded entries:", e);
  }
};

/** Beim App-Start: Session, Config, Queue, Verlauf, Tool-Checks. */
export const initializeState = async (): Promise<void> => {
  try {
    const session = await Effect.runPromise(ensureSession);
    state.cookie = session.cookie;
    state.setStatus({ loggedIn: true });
  } catch (e) {
    console.error("USDB session failed:", e);
    state.setStatus({ loggedIn: false });
  }

  state.config = await Effect.runPromise(loadConfig).catch(() => null);

  const savedQueue = await Effect.runPromise(loadQueue).catch(
    () => [] as Song[],
  );
  if (savedQueue.length > 0) state.setQueue(savedQueue);

  await reloadDownloadedEntries();

  const [yt, ff] = await Promise.all([
    Effect.runPromise(checkYtDlpAvailable),
    Effect.runPromise(checkFfmpegAvailable),
  ]);
  state.setStatus({ ytDlpAvailable: yt, ffmpegAvailable: ff });
};
