import type { Page, Song, SearchOrder } from "../../core/api/usdb/search.ts";
import type {
  RepairErrorType,
  RepairProgress,
} from "../../core/download/repairSongs.ts";
import type {
  ImportResult as ArchiveImportResult,
  ImportProgress as ArchiveImportProgress,
} from "../../core/download/importArchive.ts";
import type { AppConfig } from "../../core/storage/config.ts";
import type { DownloadedEntry } from "../../core/storage/downloaded.ts";
import type { FailedDownload } from "../../core/storage/failedDownloads.ts";

export type { ArchiveImportResult, ArchiveImportProgress, AppConfig, DownloadedEntry, FailedDownload, Page, Song, SearchOrder };

export type SearchRequest = {
  artist: string;
  title: string;
  page: number;
  language?: string;
  genre?: string;
  year?: number;
  order?: SearchOrder;
  ud?: "asc" | "desc";
};

export type BulkQueueRequest = Omit<SearchRequest, "page">;

export type DownloadStatus = "downloading" | "completed" | "failed";

export type ActiveDownload = {
  apiId: number;
  artist: string;
  title: string;
  progress: number; // 0..1
  status: DownloadStatus;
  error?: string;
};

export type AppStatus = {
  loggedIn: boolean | null; // null = checking
  ytDlpAvailable: boolean | null;
  ffmpegAvailable: boolean | null;
};

export type InitialState = {
  config: AppConfig | null;
  status: AppStatus;
  queue: Song[];
  downloaded: DownloadedEntry[];
  version: string;
};

export type BinarySource = "system" | "managed" | "missing";
export type BinariesStatus = { ytDlp: BinarySource; ffmpeg: BinarySource };
export type BinariesProgress = {
  name: "yt-dlp" | "ffmpeg";
  percent: number; // 0..1
} | null;

export type FetchAllProgress = { current: number; total: number } | null;

/** RepairResult mit IPC-tauglichem errors-Feld (Map → Array). */
export type RepairResultWire = {
  total: number;
  fixed: number;
  rebuilt: number;
  failed: string[];
  errors: Array<[string, { type: RepairErrorType; message: string }]>;
};

export type RepairState = {
  running: boolean;
  progress: RepairProgress | null;
  result: RepairResultWire | null;
};

export type AppError = { context: string; message: string };

/** Renderer → Main (ipcRenderer.invoke). */
export const INVOKE_CHANNELS = [
  "app:getInitialState",
  "usdb:search",
  "download:single",
  "downloads:failedList",
  "archive:import",
  "queue:add",
  "queue:remove",
  "queue:clear",
  "queue:start",
  "queue:cancel",
  "queue:fetchAllPages",
  "queue:entireDatabase",
  "repair:start",
  "settings:get",
  "settings:save",
  "settings:chooseDirectory",
  "binaries:status",
  "binaries:install",
  "covers:get",
  "covers:getLocal",
  "shell:openFolder",
] as const;
export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];

/** Main → Renderer (webContents.send). */
export const EVENT_CHANNELS = [
  "event:status",
  "event:queueChanged",
  "event:activeDownloads",
  "event:downloadedChanged",
  "event:fetchAllProgress",
  "event:archiveImportProgress",
  "event:queueRunning",
  "event:repair",
  "event:binariesProgress",
  "event:binariesStatus",
  "event:error",
] as const;
export type EventChannel = (typeof EVENT_CHANNELS)[number];

/** Payload-Typen je Event-Kanal. */
export type EventPayloads = {
  "event:status": AppStatus;
  "event:queueChanged": Song[];
  "event:activeDownloads": ActiveDownload[];
  "event:downloadedChanged": DownloadedEntry[];
  "event:fetchAllProgress": FetchAllProgress;
  "event:archiveImportProgress": ArchiveImportProgress | null;
  "event:queueRunning": boolean;
  "event:repair": RepairState;
  "event:binariesProgress": BinariesProgress;
  "event:binariesStatus": BinariesStatus;
  "event:error": AppError;
};

/** Von preload im Renderer als window.ultrastar bereitgestellt. */
export type UltrastarApi = {
  getInitialState: () => Promise<InitialState>;
  search: (req: SearchRequest) => Promise<Page>;
  downloadSingle: (song: Song) => Promise<void>;
  failedList: () => Promise<FailedDownload[]>;
  archiveImport: () => Promise<ArchiveImportResult>;
  queueAdd: (songs: Song[]) => Promise<number>;
  queueRemove: (apiId: number) => Promise<void>;
  queueClear: () => Promise<void>;
  queueStart: () => Promise<void>;
  queueCancel: () => Promise<void>; // stoppt nach dem aktuellen Batch
  queueFetchAllPages: (req: BulkQueueRequest) => Promise<void>;
  queueEntireDatabase: () => Promise<void>;
  repairStart: () => Promise<void>;
  settingsGet: () => Promise<AppConfig | null>;
  settingsSave: (config: AppConfig) => Promise<void>;
  chooseDirectory: () => Promise<string | null>;
  binariesStatus: () => Promise<BinariesStatus>;
  /** force=true lädt auch app-verwaltete Binaries neu (Update). */
  binariesInstall: (force?: boolean) => Promise<void>;
  coverGet: (apiId: number) => Promise<string | null>; // data-URL oder null
  coverGetLocal: (songDir: string) => Promise<string | null>;
  openFolder: (path: string) => Promise<void>;
  on: <C extends EventChannel>(
    channel: C,
    listener: (payload: EventPayloads[C]) => void,
  ) => () => void; // returns unsubscribe
};
