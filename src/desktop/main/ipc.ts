import { Effect } from "effect";
import { app, dialog, type IpcMain, shell } from "electron";
import { searchSongs } from "../../core/api/usdb/search.ts";
import type { AppConfig } from "../../core/storage/config.ts";
import type {
  BulkQueueRequest,
  InitialState,
  InvokeChannel,
  SearchRequest,
} from "../shared/ipc-contract.ts";
import { scanAndRepairVideos } from "../../core/download/repairSongs.ts";
import { importArchive } from "../../core/download/importArchive.ts";
import { loadFailedDownloads } from "../../core/storage/failedDownloads.ts";
import { binariesStatus, installMissingBinaries } from "./binaries.ts";
import { getCoverDataUrl, getLocalCoverDataUrl } from "./covers.ts";
import {
  downloadSongItem,
  fetchAllIntoQueue,
  processQueue,
  requestQueueCancel,
} from "./downloads.ts";
import { broadcast, reloadDownloadedEntries, state } from "./state.ts";
import type { Song } from "../shared/ipc-contract.ts";

export const SEARCH_PAGE_SIZE = 20;

let repairRunning = false;
let archiveImportRunning = false;

/**
 * Alle Invoke-Handler. Der Typ erzwingt, dass GENAU die Kanäle aus dem
 * Vertrag implementiert werden (fehlt einer, meckert tsc; ist einer zu viel,
 * auch). Handler-Signatur: (payload) => Promise<result>.
 */
// biome-ignore lint/suspicious/noExplicitAny: zentrale IPC-Grenze, Typen pro Kanal im Vertrag
export const handlers: Record<InvokeChannel, (payload?: any) => Promise<any>> =
  {
    "app:getInitialState": async (): Promise<InitialState> => ({
      config: state.config,
      status: state.status,
      queue: state.queue,
      downloaded: state.downloaded,
      version: app.getVersion(),
    }),

    "usdb:search": async (req: SearchRequest) => {
      const start = (req.page - 1) * SEARCH_PAGE_SIZE;
      return Effect.runPromise(
        searchSongs(
          {
            interpret: req.artist.trim() || undefined,
            title: req.title.trim() || undefined,
            language: req.language,
            genre: req.genre,
            year: req.year,
            order: req.order,
            ud: req.ud,
            golden: req.golden,
            songcheck: req.songcheck,
            limit: SEARCH_PAGE_SIZE,
            start,
          },
          state.cookie,
        ),
      );
    },

    "settings:get": async () => state.config,

    "settings:save": async (config: AppConfig) => {
      await state.saveConfigAndApply(config);
    },

    "settings:chooseDirectory": async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        defaultPath: state.downloadDir,
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },

    "shell:openFolder": async (path: string) => {
      await shell.openPath(path);
    },

    "download:single": async (song: Song) => {
      void downloadSongItem(song);
    },

    "downloads:failedList": async () => loadFailedDownloads(state.downloadDir),

    "library:refresh": async () => {
      await reloadDownloadedEntries();
    },

    "archive:import": async () => {
      if (archiveImportRunning) {
        return { imported: 0, importedWithoutVideo: 0, skipped: 0, refreshed: 0 };
      }
      if (state.queueRunning || state.activeDownloads.length > 0 || repairRunning) {
        throw new Error(
          "Import nicht möglich, während Downloads oder eine Reparatur laufen. Bitte warten und erneut versuchen.",
        );
      }
      archiveImportRunning = true;
      try {
        const result = await Effect.runPromise(
          importArchive(state.downloadDir, (p) =>
            broadcast("event:archiveImportProgress", p),
          ),
        );
        await reloadDownloadedEntries();
        return result;
      } finally {
        archiveImportRunning = false;
        broadcast("event:archiveImportProgress", null);
      }
    },

    "queue:add": async (songs: Song[]) => state.addToQueue(songs),

    "queue:remove": async (apiId: number) => {
      state.setQueue(state.queue.filter((s) => s.apiId !== apiId));
    },

    "queue:clear": async () => {
      state.setQueue([]);
    },

    "queue:start": async () => {
      void processQueue();
    },

    "queue:cancel": async () => {
      requestQueueCancel();
    },

    "queue:fetchAllPages": async (req: BulkQueueRequest) => {
      void fetchAllIntoQueue(req);
    },

    "queue:entireDatabase": async () => {
      void fetchAllIntoQueue({ artist: "", title: "" });
    },

    "repair:start": async () => {
      if (repairRunning) return;
      if (archiveImportRunning) {
        broadcast("event:error", {
          context: "repair",
          message:
            "Reparatur nicht möglich, während der Archiv-Import läuft. Bitte warten und erneut versuchen.",
        });
        return;
      }
      repairRunning = true;
      broadcast("event:repair", { running: true, progress: null, result: null });
      void Effect.runPromise(
        scanAndRepairVideos(state.downloadDir, state.cookie, state.browser, (p) =>
          broadcast("event:repair", { running: true, progress: p, result: null }),
        ),
      )
        .then(async (result) => {
          await reloadDownloadedEntries();
          broadcast("event:repair", {
            running: false,
            progress: null,
            result: { ...result, errors: [...result.errors.entries()] },
          });
        })
        .catch((err) => {
          broadcast("event:error", {
            context: "repair",
            message: err instanceof Error ? err.message : String(err),
          });
          broadcast("event:repair", {
            running: false,
            progress: null,
            result: null,
          });
        })
        .finally(() => {
          repairRunning = false;
        });
    },
    "binaries:status": async () => binariesStatus(),
    "binaries:install": async (force?: boolean) => {
      await installMissingBinaries(force === true);
    },
    "covers:get": async (apiId: number) => getCoverDataUrl(apiId),
    "covers:getLocal": async (songDir: string) => getLocalCoverDataUrl(songDir),
  };

export const registerIpcHandlers = (ipcMain: IpcMain): void => {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, payload) => handler(payload));
  }
};
