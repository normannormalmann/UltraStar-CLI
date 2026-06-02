import { Effect } from "effect";
import { app, dialog, type IpcMain, shell } from "electron";
import { searchSongs } from "../../core/api/usdb/search.ts";
import type { AppConfig } from "../../core/storage/config.ts";
import type {
  InitialState,
  InvokeChannel,
  SearchRequest,
} from "../shared/ipc-contract.ts";
import { binariesStatus, installMissingBinaries } from "./binaries.ts";
import { state } from "./state.ts";

export const SEARCH_PAGE_SIZE = 20;

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

    // ── Platzhalter: werden in den Tasks 5–8 implementiert ──
    "download:single": async () => {
      throw new Error("not implemented until task 6");
    },
    "downloads:failedList": async () => {
      throw new Error("not implemented until task 7");
    },
    "queue:add": async () => {
      throw new Error("not implemented until task 6");
    },
    "queue:remove": async () => {
      throw new Error("not implemented until task 6");
    },
    "queue:clear": async () => {
      throw new Error("not implemented until task 6");
    },
    "queue:start": async () => {
      throw new Error("not implemented until task 6");
    },
    "queue:cancel": async () => {
      throw new Error("not implemented until task 6");
    },
    "queue:fetchAllPages": async () => {
      throw new Error("not implemented until task 6");
    },
    "queue:entireDatabase": async () => {
      throw new Error("not implemented until task 6");
    },
    "repair:start": async () => {
      throw new Error("not implemented until task 7");
    },
    "binaries:status": async () => binariesStatus(),
    "binaries:install": async (force?: boolean) => {
      await installMissingBinaries(force === true);
    },
    "covers:get": async () => {
      throw new Error("not implemented until task 8");
    },
  };

export const registerIpcHandlers = (ipcMain: IpcMain): void => {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, payload) => handler(payload));
  }
};
