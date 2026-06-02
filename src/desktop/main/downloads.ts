import { Effect } from "effect";
import { searchSongs, type Song } from "../../core/api/usdb/search.ts";
import { downloadSong } from "../../core/download/downloadSong.ts";
import { appendDownloadedEntry } from "../../core/storage/downloaded.ts";
import { appendFailedDownload } from "../../core/storage/failedDownloads.ts";
import { broadcast, reloadDownloadedEntries, state } from "./state.ts";

const DOWNLOAD_CONCURRENCY = 3; // wie TUI
const COMPLETED_REMOVE_DELAY_MS = 1500;
const FAILED_REMOVE_DELAY_MS = 8000;
const BULK_FETCH_YIELD_MS = 10;

/**
 * Lädt einen Song herunter und pflegt activeDownloads/Verlauf/Fehl-Log.
 * Wirft nie — Fehler landen als status:"failed" im UI-Event und im Log.
 */
export const downloadSongItem = async (song: Song): Promise<void> => {
  if (!state.cookie) return;
  if (
    state.status.ytDlpAvailable === false ||
    state.status.ffmpegAvailable === false
  ) {
    broadcast("event:error", {
      context: "download",
      message:
        "yt-dlp oder ffmpeg ist nicht installiert. Downloads sind deaktiviert (Einstellungen → Tools).",
    });
    return;
  }
  if (state.activeDownloads.some((d) => d.apiId === song.apiId)) return;
  if (state.isDownloadedSong(song)) return;

  state.setActiveDownloads([
    ...state.activeDownloads,
    {
      apiId: song.apiId,
      artist: song.artist,
      title: song.title,
      progress: 0,
      status: "downloading",
    },
  ]);

  try {
    const result = await Effect.runPromise(
      downloadSong({
        song,
        cookie: state.cookie,
        baseDir: state.downloadDir,
        cookiesBrowser: state.browser,
        onProgress: (p) => state.patchActiveDownload(song.apiId, { progress: p }),
        onWarning: (warnings) => {
          broadcast("event:error", {
            context: "warnung",
            message: `"${song.title}": ${warnings.join(" | ")}`,
          });
        },
      }),
    );

    await Effect.runPromise(
      appendDownloadedEntry({
        apiId: song.apiId,
        artist: song.artist,
        title: song.title,
        dirName: result.dirName,
        songDir: result.songDir,
        downloadedAt: new Date().toISOString(),
      }),
    ).catch((e) => {
      broadcast("event:error", {
        context: "tracking",
        message: `Download ok, Tracking fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      });
    });
    await reloadDownloadedEntries();

    state.patchActiveDownload(song.apiId, { progress: 1, status: "completed" });
    setTimeout(
      () => state.removeActiveDownload(song.apiId),
      COMPLETED_REMOVE_DELAY_MS,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendFailedDownload(state.downloadDir, song, message).catch(() => {});
    state.patchActiveDownload(song.apiId, { status: "failed", error: message });
    broadcast("event:error", {
      context: "download",
      message: `"${song.title}": ${message}`,
    });
    setTimeout(
      () => state.removeActiveDownload(song.apiId),
      FAILED_REMOVE_DELAY_MS,
    );
  }
};

let queueCancelRequested = false;

/** Stoppt die Queue-Verarbeitung nach dem aktuell laufenden Batch. */
export const requestQueueCancel = (): void => {
  queueCancelRequested = true;
};

/** Queue abarbeiten: Batches à DOWNLOAD_CONCURRENCY, wie die TUI. Abbrechbar. */
export const processQueue = async (): Promise<void> => {
  if (state.queueRunning || state.queue.length === 0) return;
  if (
    state.status.ytDlpAvailable === false ||
    state.status.ffmpegAvailable === false
  ) {
    broadcast("event:error", {
      context: "download",
      message:
        "yt-dlp oder ffmpeg ist nicht installiert. Downloads sind deaktiviert (Einstellungen → Tools).",
    });
    return;
  }
  state.setQueueRunning(true);
  queueCancelRequested = false;
  try {
    let isDownloaded = state.makeIsDownloadedSong();
    let current = state.queue.filter((s) => !isDownloaded(s));
    while (current.length > 0 && !queueCancelRequested) {
      const batch = current.slice(0, DOWNLOAD_CONCURRENCY);
      await Promise.all(batch.map((song) => downloadSongItem(song)));
      state.setQueue(
        state.queue.filter((s) => !batch.some((b) => b.apiId === s.apiId)),
      );
      isDownloaded = state.makeIsDownloadedSong();
      current = current.slice(batch.length).filter((s) => !isDownloaded(s));
    }
  } finally {
    state.setQueueRunning(false);
  }
};

let bulkFetchRunning = false;

/**
 * Alle Seiten einer Suche (oder bei leeren Feldern: der ganzen Datenbank)
 * seitenweise in die Queue laden. totalPages wird dynamisch nachgeführt.
 */
export const fetchAllIntoQueue = async (
  artist: string,
  title: string,
): Promise<void> => {
  if (!state.cookie || bulkFetchRunning) return;
  bulkFetchRunning = true;
  try {
    const limit = 20;
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      broadcast("event:fetchAllProgress", { current: page, total: totalPages });
      const result = await Effect.runPromise(
        searchSongs(
          {
            interpret: artist.trim() || undefined,
            title: title.trim() || undefined,
            limit,
            start: (page - 1) * limit,
          },
          state.cookie,
        ),
      );
      if (result.totalPages > totalPages) totalPages = result.totalPages;
      state.addToQueue(result.songs);
      // Event-Loop atmen lassen (Speicher/IPC), wie TUI
      await new Promise((r) => setTimeout(r, BULK_FETCH_YIELD_MS));
      page++;
    }
  } catch (err) {
    broadcast("event:error", {
      context: "bulk-fetch",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    bulkFetchRunning = false;
    broadcast("event:fetchAllProgress", null);
  }
};
