# UltraStar Desktop-GUI Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Electron-Desktop-App (Windows zuerst) mit voller CLI-Parität — Suche, Download, Queue, Verlauf, Reparatur, Einstellungen — auf Basis des geteilten `src/core/`, verteilt als NSIS-Installer über GitHub Releases.

**Architecture:** Der Electron-**Main-Prozess** ist das Backend und führt `src/core/` unverändert aus (Node-APIs, Effect, yt-dlp-Spawning). Der **Renderer** ist eine zustandsarme React-19-Oberfläche, die über einen typisierten IPC-Vertrag (`src/desktop/shared/ipc-contract.ts`) mit dem Main-Prozess spricht und Zustandsänderungen als Events abonniert. Gebündelte yt-dlp/ffmpeg-Binaries werden beim ersten Start in das userData-Verzeichnis geladen; ihr Verzeichnis wird dem `PATH` des Main-Prozesses vorangestellt, sodass die Core-Spawns (`spawn("yt-dlp", …)`) ohne jede Core-Änderung funktionieren.

**Tech Stack:** Electron (ESM-Main), electron-vite, React 19 + react-dom, Effect (im Main via core/), electron-builder (NSIS), Playwright (Smoke-Test), Bun als Paketmanager/Test-Runner.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-02-desktop-gui-design.md`

**Umgebungs-Hinweise für alle Tasks (Windows, PowerShell):**
- Bun-PATH-Prefix vor jedem Bun-Aufruf:
  `$env:Path = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Oven-sh.Bun_Microsoft.Winget.Source_8wekyb3d8bbwe\bun-windows-x64;$env:Path"`
- `bun x` statt `bunx` verwenden.
- Branch: `feat/desktop-gui` (von `main` abzweigen).

---

### Task 0: Dependencies, Scaffolding-Konfiguration, Branch

**Files:**
- Modify: `package.json` (deps, scripts, main-Feld, trustedDependencies)
- Create: `electron.vite.config.ts`
- Modify: `tsconfig.json` (DOM-libs)

- [ ] **Step 1: Branch erstellen**

```powershell
git checkout -b feat/desktop-gui
```

- [ ] **Step 2: `trustedDependencies` in `package.json` ergänzen** (VOR der Installation — Bun führt Electrons postinstall sonst nicht aus und das Electron-Binary fehlt). Auf oberster Ebene einfügen:

```json
"trustedDependencies": ["electron"],
```

- [ ] **Step 3: Dependencies installieren**

```powershell
bun add react-dom
bun add -d electron electron-vite electron-builder @vitejs/plugin-react @types/react-dom extract-zip @playwright/test
```

Expected: Installation ohne Fehler. Verifizieren, dass das Electron-Binary existiert:
```powershell
Test-Path node_modules\electron\dist\electron.exe
```
Expected: `True`. Falls `False`: `bun pm trust electron; bun install` erneut.

- [ ] **Step 4: `package.json` Scripts + main-Feld** — `"main"` auf oberster Ebene und vier neue Scripts:

```json
"main": "out/main/index.js",
```

Scripts-Block (neue Zeilen zusätzlich zu den bestehenden):

```json
"scripts": {
  "build": "bun run --cwd src build.ts",
  "start": "bun run src/index.tsx",
  "test": "bun test src",
  "desktop:dev": "electron-vite dev",
  "desktop:build": "electron-vite build",
  "desktop:dist": "electron-vite build && electron-builder --win",
  "test:e2e": "electron-vite build && playwright test",
  "format": "biome format --write .",
  "clean": "git clean -xdf .turbo build",
  "lint": "biome lint --write .",
  "bump": "bumpp"
},
```

- [ ] **Step 5: `electron.vite.config.ts` anlegen** (Repo-Root):

```ts
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/desktop/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/desktop/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve("src/desktop/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/desktop/renderer/index.html") },
      },
    },
  },
});
```

- [ ] **Step 6: `tsconfig.json`** — DOM-Typen für den Renderer (harmlos für TUI/Core):

```json
"lib": ["ESNext", "DOM", "DOM.Iterable"],
```

- [ ] **Step 7: Verifizieren & committen**

```powershell
bun x tsc --noEmit
git add package.json bun.lock electron.vite.config.ts tsconfig.json
git commit -m "chore(desktop): add electron toolchain and scaffolding config"
```

---

### Task 1: Typisierter IPC-Vertrag

Eine einzige Quelle der Wahrheit für alle Kanäle und Payload-Typen — von Main, Preload und Renderer gemeinsam importiert (nur Typen + String-Konstanten, kein Laufzeitverhalten außer den Kanalnamen-Listen).

**Files:**
- Create: `src/desktop/shared/ipc-contract.ts`
- Test: `src/desktop/shared/ipc-contract.test.ts`

- [ ] **Step 1: Vertrag schreiben** — `src/desktop/shared/ipc-contract.ts`:

```ts
import type { Page, Song } from "../../core/api/usdb/search.ts";
import type {
  RepairErrorType,
  RepairProgress,
} from "../../core/download/repairSongs.ts";
import type { AppConfig } from "../../core/storage/config.ts";
import type { DownloadedEntry } from "../../core/storage/downloaded.ts";
import type { FailedDownload } from "../../core/storage/failedDownloads.ts";

export type { AppConfig, DownloadedEntry, FailedDownload, Page, Song };

export type SearchRequest = { artist: string; title: string; page: number };

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
  queueAdd: (songs: Song[]) => Promise<number>;
  queueRemove: (apiId: number) => Promise<void>;
  queueClear: () => Promise<void>;
  queueStart: () => Promise<void>;
  queueCancel: () => Promise<void>; // stoppt nach dem aktuellen Batch
  queueFetchAllPages: (req: { artist: string; title: string }) => Promise<void>;
  queueEntireDatabase: () => Promise<void>;
  repairStart: () => Promise<void>;
  settingsGet: () => Promise<AppConfig | null>;
  settingsSave: (config: AppConfig) => Promise<void>;
  chooseDirectory: () => Promise<string | null>;
  binariesStatus: () => Promise<BinariesStatus>;
  /** force=true lädt auch app-verwaltete Binaries neu (Update). */
  binariesInstall: (force?: boolean) => Promise<void>;
  coverGet: (apiId: number) => Promise<string | null>; // data-URL oder null
  openFolder: (path: string) => Promise<void>;
  on: <C extends EventChannel>(
    channel: C,
    listener: (payload: EventPayloads[C]) => void,
  ) => () => void; // returns unsubscribe
};
```

- [ ] **Step 2: Vertragstest schreiben** — `src/desktop/shared/ipc-contract.test.ts` (stellt sicher, dass Kanal-Listen eindeutig und nicht leer sind; der Handler-Abgleich folgt in Task 4):

```ts
import { expect, test } from "bun:test";
import { EVENT_CHANNELS, INVOKE_CHANNELS } from "./ipc-contract.ts";

test("invoke channels are unique and namespaced", () => {
  expect(new Set(INVOKE_CHANNELS).size).toBe(INVOKE_CHANNELS.length);
  for (const c of INVOKE_CHANNELS) expect(c).toMatch(/^[a-z]+:[a-zA-Z]+$/);
});

test("event channels are unique and use the event: prefix", () => {
  expect(new Set(EVENT_CHANNELS).size).toBe(EVENT_CHANNELS.length);
  for (const c of EVENT_CHANNELS) expect(c.startsWith("event:")).toBe(true);
});
```

- [ ] **Step 3: Verifizieren & committen**

```powershell
bun test src/desktop/shared/ipc-contract.test.ts
bun x tsc --noEmit
git add src/desktop/shared
git commit -m "feat(desktop): add typed IPC contract"
```
Expected: 2 pass; tsc exit 0.

---

### Task 2: Minimale Electron-App bootet

Vertikaler Durchstich: Fenster öffnet, Preload exponiert eine Stub-API, Renderer rendert „UltraStar".

**Files:**
- Create: `src/desktop/main/index.ts`
- Create: `src/desktop/preload/index.ts` (Stub, wird in Task 9 vervollständigt)
- Create: `src/desktop/renderer/index.html`
- Create: `src/desktop/renderer/main.tsx`
- Create: `src/desktop/renderer/App.tsx` (Platzhalter, wird in Task 10 ersetzt)
- Create: `src/desktop/renderer/global.d.ts`

- [ ] **Step 1: `src/desktop/main/index.ts`:**

```ts
import { join } from "node:path";
import { BrowserWindow, app, shell } from "electron";

const createWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#1e1e2e",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // ESM-Preload benötigt sandbox:false
    },
  });

  // Externe Links im System-Browser öffnen, nicht im App-Fenster
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    // Plain <a href>-Klicks: Navigation unterbinden, extern öffnen
    if (url.startsWith("http")) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
  return win;
};

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 2: `src/desktop/preload/index.ts` (Stub):**

```ts
import { contextBridge } from "electron";

// Wird in Task 9 durch die vollständige UltrastarApi ersetzt.
contextBridge.exposeInMainWorld("ultrastar", { __stub: true });
```

- [ ] **Step 3: `src/desktop/renderer/index.html`:**

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
    <title>UltraStar</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: `src/desktop/renderer/main.tsx`:**

```tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");
createRoot(container).render(<App />);
```

- [ ] **Step 5: `src/desktop/renderer/App.tsx` (Platzhalter):**

```tsx
import type { FC } from "react";

export const App: FC = () => <h1>UltraStar</h1>;

export default App;
```

- [ ] **Step 6: `src/desktop/renderer/global.d.ts`:**

```ts
import type { UltrastarApi } from "../shared/ipc-contract.ts";

declare global {
  interface Window {
    ultrastar: UltrastarApi;
  }
}

export {};
```

- [ ] **Step 7: Build verifizieren**

```powershell
bun x electron-vite build
bun x tsc --noEmit
```
Expected: Build erzeugt `out/main/index.js`, `out/preload/index.mjs`, `out/renderer/index.html`; tsc exit 0.

- [ ] **Step 8: Manueller Boot-Test** — den Menschen bitten, in einem interaktiven Terminal auszuführen:

```powershell
bun run desktop:dev
```
Expected: Fenster öffnet (dunkel, Titel „UltraStar", Überschrift sichtbar). Fenster schließen beendet den Prozess.

- [ ] **Step 9: Commit**

```powershell
git add src/desktop
git commit -m "feat(desktop): minimal electron app boots with preload and react renderer"
```

---

### Task 3: Main-Prozess State & Event-Broadcast

Eine Quelle der Wahrheit im Main: Session, Config, Queue (mit Debounce-Persistenz wie in der TUI), aktive Downloads, Download-Verlauf. Events pushen Änderungen an den Renderer.

**Files:**
- Create: `src/desktop/main/state.ts`

- [ ] **Step 1: `src/desktop/main/state.ts`:**

```ts
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { BrowserWindow } from "electron";
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
    const downloaded = this.downloadedApiIds;
    const fresh = songs.filter(
      (s) => !existing.has(s.apiId) && !downloaded.has(s.apiId),
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
```

- [ ] **Step 2: Verifizieren & committen**

```powershell
bun x tsc --noEmit
bun x electron-vite build
git add src/desktop/main/state.ts
git commit -m "feat(desktop): main-process app state with event broadcast"
```

---

### Task 4: IPC-Handler — Suche, Settings, Initial-State

Handler-Registrierung in einem Modul, plus Vertragstest: Jeder Kanal aus dem Contract hat genau einen Handler.

**Files:**
- Create: `src/desktop/main/ipc.ts`
- Modify: `src/desktop/main/index.ts` (Registrierung + initializeState aufrufen)
- Test: `src/desktop/main/ipc.test.ts`

- [ ] **Step 1: `src/desktop/main/ipc.ts`** — Grundgerüst mit den ersten Handlern; die übrigen Kanäle werden hier in den Tasks 5–8 ergänzt, die Registry-Struktur steht ab jetzt fest:

```ts
import { Effect } from "effect";
import { type IpcMain, app, dialog, shell } from "electron";
import { searchSongs } from "../../core/api/usdb/search.ts";
import type { AppConfig } from "../../core/storage/config.ts";
import type {
  InitialState,
  InvokeChannel,
  SearchRequest,
} from "../shared/ipc-contract.ts";
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
    "binaries:status": async () => {
      throw new Error("not implemented until task 5");
    },
    "binaries:install": async () => {
      throw new Error("not implemented until task 5");
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
```

(Hinweis für spätere Tasks: „Platzhalter" oben sind KEINE Plan-Platzhalter — sie sind lauffähiger Code mit definiertem Fehlverhalten und werden in den genannten Tasks durch echte Implementierungen ersetzt. Die Tasks 5–8 ersetzen jeweils nur ihre Einträge in `handlers`.)

- [ ] **Step 2: `src/desktop/main/index.ts` erweitern** — nach den bestehenden Imports `ipcMain` importieren und vor `createWindow()` registrieren; `initializeState` nach dem Fenster starten (UI zeigt „Checking…" bis Events kommen):

```ts
import { BrowserWindow, app, ipcMain, shell } from "electron";
import { registerIpcHandlers } from "./ipc.ts";
import { initializeState } from "./state.ts";
```

und im whenReady-Block:

```ts
void app.whenReady().then(() => {
  registerIpcHandlers(ipcMain);
  createWindow();
  void initializeState();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
```

- [ ] **Step 3: Vertragstest** — `src/desktop/main/ipc.test.ts`. Electron ist im Bun-Test nicht ladbar; deshalb wird `electron` gemockt, bevor `ipc.ts` importiert wird:

```ts
import { expect, mock, test } from "bun:test";

mock.module("electron", () => ({
  app: { getVersion: () => "0.0.0-test" },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: { openPath: async () => "" },
  BrowserWindow: { getAllWindows: () => [] },
}));

const { INVOKE_CHANNELS } = await import("../shared/ipc-contract.ts");
const { handlers } = await import("./ipc.ts");

test("every invoke channel from the contract has exactly one handler", () => {
  const handlerChannels = Object.keys(handlers).sort();
  expect(handlerChannels).toEqual([...INVOKE_CHANNELS].sort());
});

test("handlers are functions", () => {
  for (const fn of Object.values(handlers)) {
    expect(typeof fn).toBe("function");
  }
});
```

- [ ] **Step 4: Verifizieren & committen**

```powershell
bun test src/desktop
bun x tsc --noEmit
bun x electron-vite build
git add src/desktop/main
git commit -m "feat(desktop): ipc handler registry with search and settings"
```
Expected: 4 Tests pass (2 contract + 2 ipc); tsc 0; Build ok.

---

### Task 5: Binary-Bootstrap (yt-dlp + ffmpeg)

Beim Start: managed-Verzeichnis (`userData/bin`) dem PATH voranstellen → Core-Spawns finden die Binaries. Install lädt yt-dlp.exe direkt und ffmpeg aus dem BtbN-Zip (Windows). System-Installationen haben Vorrang.

**Files:**
- Create: `src/desktop/main/binaries.ts`
- Modify: `src/desktop/main/ipc.ts` (2 Handler ersetzen)
- Modify: `src/desktop/main/index.ts` (PATH-Prepend vor initializeState)

- [ ] **Step 1: `src/desktop/main/binaries.ts`:**

```ts
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Effect } from "effect";
import { app } from "electron";
import extractZip from "extract-zip";
import {
  checkFfmpegAvailable,
  checkYtDlpAvailable,
} from "../../core/api/youtube/check.ts";
import type { BinariesStatus, BinarySource } from "../shared/ipc-contract.ts";
import { broadcast, state } from "./state.ts";

const YT_DLP_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const FFMPEG_ZIP_URL =
  "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip";
const FFMPEG_PATH_IN_ZIP = "ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe";

export const managedBinDir = (): string => join(app.getPath("userData"), "bin");

/** userData/bin dem PATH voranstellen, damit Core-Spawns es finden. */
export const prependManagedBinToPath = (): void => {
  process.env.PATH = `${managedBinDir()};${process.env.PATH ?? ""}`;
};

const fileExists = async (p: string): Promise<boolean> => {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
};

const classify = async (
  exeName: string,
  availableOnPath: boolean,
): Promise<BinarySource> => {
  if (await fileExists(join(managedBinDir(), exeName))) return "managed";
  if (availableOnPath) return "system";
  return "missing";
};

export const binariesStatus = async (): Promise<BinariesStatus> => {
  const [yt, ff] = await Promise.all([
    Effect.runPromise(checkYtDlpAvailable),
    Effect.runPromise(checkFfmpegAvailable),
  ]);
  return {
    ytDlp: await classify("yt-dlp.exe", yt),
    ffmpeg: await classify("ffmpeg.exe", ff),
  };
};

/** Download mit Fortschritts-Broadcast; schreibt erst nach Erfolg an den Zielort. */
const downloadFile = async (
  url: string,
  dest: string,
  name: "yt-dlp" | "ffmpeg",
): Promise<void> => {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${url}`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  let received = 0;
  const tmp = `${dest}.download`;

  const progress = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (total > 0) {
        broadcast("event:binariesProgress", {
          name,
          percent: Math.min(1, received / total),
        });
      }
      controller.enqueue(chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body.pipeThrough(progress)),
    createWriteStream(tmp),
  );
  await rename(tmp, dest);
};

/**
 * Fehlende Binaries installieren (nur Windows). Wirft bei Nicht-Windows.
 * force=true lädt auch app-verwaltete Binaries neu (Update-Funktion);
 * System-Installationen werden nie angefasst.
 */
export const installMissingBinaries = async (force = false): Promise<void> => {
  if (process.platform !== "win32") {
    throw new Error(
      "Automatic install is only supported on Windows. Please install yt-dlp and ffmpeg manually.",
    );
  }
  const bin = managedBinDir();
  await mkdir(bin, { recursive: true });
  const status = await binariesStatus();

  if (status.ytDlp === "missing" || (force && status.ytDlp === "managed")) {
    await downloadFile(YT_DLP_URL, join(bin, "yt-dlp.exe"), "yt-dlp");
  }

  if (status.ffmpeg === "missing" || (force && status.ffmpeg === "managed")) {
    const zipPath = join(bin, "ffmpeg.zip");
    await downloadFile(FFMPEG_ZIP_URL, zipPath, "ffmpeg");
    const extractDir = join(bin, "ffmpeg-extract");
    await extractZip(zipPath, { dir: extractDir });
    await rename(join(extractDir, FFMPEG_PATH_IN_ZIP), join(bin, "ffmpeg.exe"));
    await rm(extractDir, { recursive: true, force: true });
    await rm(zipPath, { force: true });
  }

  broadcast("event:binariesProgress", null);
  prependManagedBinToPath();

  // Status neu prüfen und an die UI melden
  const after = await binariesStatus();
  broadcast("event:binariesStatus", after);
  state.setStatus({
    ytDlpAvailable: after.ytDlp !== "missing",
    ffmpegAvailable: after.ffmpeg !== "missing",
  });
};
```

- [ ] **Step 2: In `src/desktop/main/ipc.ts`** die beiden Platzhalter ersetzen (Import oben ergänzen: `import { binariesStatus, installMissingBinaries } from "./binaries.ts";`):

```ts
    "binaries:status": async () => binariesStatus(),
    "binaries:install": async (force?: boolean) => {
      await installMissingBinaries(force === true);
    },
```

- [ ] **Step 3: In `src/desktop/main/index.ts`** PATH-Prepend + Erststart-Auto-Install verdrahten (Import: `import { installMissingBinaries, prependManagedBinToPath } from "./binaries.ts";` sowie `import { broadcast, initializeState, state } from "./state.ts";` — initializeState-Import entsprechend erweitern). Der whenReady-Block wird zu:

```ts
void app.whenReady().then(() => {
  registerIpcHandlers(ipcMain);
  prependManagedBinToPath();
  createWindow();
  void initializeState().then(() => {
    // Spec: fehlende Tools werden beim ersten Start automatisch geladen
    const { ytDlpAvailable, ffmpegAvailable } = state.status;
    if (
      process.platform === "win32" &&
      (ytDlpAvailable === false || ffmpegAvailable === false)
    ) {
      void installMissingBinaries().catch((err) => {
        broadcast("event:error", {
          context: "binaries",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
```

- [ ] **Step 4: Verifizieren & committen**

```powershell
bun test src/desktop
bun x tsc --noEmit
bun x electron-vite build
git add src/desktop/main
git commit -m "feat(desktop): yt-dlp/ffmpeg bootstrap with managed bin dir"
```

---

### Task 6: Download- und Queue-Orchestrierung im Main

Spiegelt die TUI-Logik: max. 3 parallele Downloads, Dedupe gegen Verlauf, Fehl-Logging in `failedDownloads`, Events statt setState.

**Files:**
- Create: `src/desktop/main/downloads.ts`
- Modify: `src/desktop/main/ipc.ts` (7 Platzhalter ersetzen)

- [ ] **Step 1: `src/desktop/main/downloads.ts`:**

```ts
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
  if (state.activeDownloads.some((d) => d.apiId === song.apiId)) return;
  if (state.downloadedApiIds.has(song.apiId)) return;

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
  state.setQueueRunning(true);
  queueCancelRequested = false;
  try {
    let current = state.queue.filter(
      (s) => !state.downloadedApiIds.has(s.apiId),
    );
    while (current.length > 0 && !queueCancelRequested) {
      const batch = current.slice(0, DOWNLOAD_CONCURRENCY);
      await Promise.all(batch.map((song) => downloadSongItem(song)));
      state.setQueue(
        state.queue.filter((s) => !batch.some((b) => b.apiId === s.apiId)),
      );
      current = current
        .slice(batch.length)
        .filter((s) => !state.downloadedApiIds.has(s.apiId));
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
```

- [ ] **Step 2: In `src/desktop/main/ipc.ts`** die Queue/Download-Platzhalter ersetzen (Import ergänzen: `import { downloadSongItem, fetchAllIntoQueue, processQueue, requestQueueCancel } from "./downloads.ts";` und `import type { Song } from "../shared/ipc-contract.ts";`):

```ts
    "download:single": async (song: Song) => {
      void downloadSongItem(song);
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

    "queue:fetchAllPages": async (req: { artist: string; title: string }) => {
      void fetchAllIntoQueue(req.artist, req.title);
    },

    "queue:entireDatabase": async () => {
      void fetchAllIntoQueue("", "");
    },
```

- [ ] **Step 3: Verifizieren & committen**

```powershell
bun test src/desktop
bun x tsc --noEmit
bun x electron-vite build
git add src/desktop/main
git commit -m "feat(desktop): download and queue orchestration in main process"
```

---

### Task 7: Reparatur-Handler + Fehlgeschlagen-Liste (kleine Core-Erweiterung)

**Files:**
- Modify: `src/core/storage/failedDownloads.ts` (eine Funktion exportieren)
- Test: `src/core/storage/failedDownloads.test.ts` (neu)
- Modify: `src/desktop/main/ipc.ts` (2 Platzhalter ersetzen)

- [ ] **Step 1 (TDD): Failing Test** — `src/core/storage/failedDownloads.test.ts`:

```ts
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
```

- [ ] **Step 2: Test rot sehen**

```powershell
bun test src/core/storage/failedDownloads.test.ts
```
Expected: FAIL — `loadFailedDownloads` wird nicht exportiert.

- [ ] **Step 3: Export ergänzen** — in `src/core/storage/failedDownloads.ts` nach `loadExistingEntries` einfügen (nutzt die bestehende private Lese-Logik):

```ts
/** Alle protokollierten Fehl-Downloads aus der XLSX lesen (leeres Array, wenn keine existiert). */
export const loadFailedDownloads = async (
  downloadDir: string,
): Promise<FailedDownload[]> =>
  loadExistingEntries(join(downloadDir, XLSX_FILE));
```

- [ ] **Step 4: Test grün sehen**

```powershell
bun test src/core/storage/failedDownloads.test.ts
bun x tsc --noEmit
```
Expected: 1 pass; tsc 0.

- [ ] **Step 5: Repair- und failedList-Handler** in `src/desktop/main/ipc.ts` ersetzen (Imports ergänzen: `import { scanAndRepairVideos } from "../../core/download/repairSongs.ts";`, `import { loadFailedDownloads } from "../../core/storage/failedDownloads.ts";`, `import { broadcast, reloadDownloadedEntries } from "./state.ts";` — broadcast/reload ggf. zu bestehendem state-Import ergänzen):

```ts
    "downloads:failedList": async () => loadFailedDownloads(state.downloadDir),

    "repair:start": async () => {
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
        });
    },
```

- [ ] **Step 6: Verifizieren & committen**

```powershell
bun test src
bun x tsc --noEmit
bun x electron-vite build
git add src/core/storage src/desktop/main
git commit -m "feat(desktop): repair handler and failed-downloads listing"
```

---

### Task 8: Cover-Cache (Memory + Disk, LRU)

Thumbnails für Such-/Verlaufslisten. Disk-Cache in `userData/covers`, Limit 200 MB, LRU per mtime; Memory-Cache der letzten 200 Data-URLs. Die Evictions-Auswahl ist eine pure, getestete Funktion.

**Files:**
- Create: `src/desktop/main/covers.ts`
- Test: `src/desktop/main/covers.test.ts`
- Modify: `src/desktop/main/ipc.ts` (1 Platzhalter ersetzen)

- [ ] **Step 1 (TDD): Failing Test** — `src/desktop/main/covers.test.ts` (pure Funktion, kein Electron nötig):

```ts
import { expect, test } from "bun:test";
import { selectEvictions } from "./covers.ts";

test("returns empty list when under the limit", () => {
  const files = [
    { path: "a.jpg", size: 100, mtimeMs: 1 },
    { path: "b.jpg", size: 100, mtimeMs: 2 },
  ];
  expect(selectEvictions(files, 1000)).toEqual([]);
});

test("evicts oldest files first until under the limit", () => {
  const files = [
    { path: "old.jpg", size: 400, mtimeMs: 1 },
    { path: "mid.jpg", size: 400, mtimeMs: 2 },
    { path: "new.jpg", size: 400, mtimeMs: 3 },
  ];
  // total 1200, limit 800 → ältester (old.jpg) fliegt
  expect(selectEvictions(files, 800)).toEqual(["old.jpg"]);
});

test("evicts multiple when one is not enough", () => {
  const files = [
    { path: "a.jpg", size: 500, mtimeMs: 1 },
    { path: "b.jpg", size: 500, mtimeMs: 2 },
    { path: "c.jpg", size: 500, mtimeMs: 3 },
  ];
  expect(selectEvictions(files, 600)).toEqual(["a.jpg", "b.jpg"]);
});
```

- [ ] **Step 2: Rot sehen** — `bun test src/desktop/main/covers.test.ts` → FAIL (Modul existiert nicht).

- [ ] **Step 3: `src/desktop/main/covers.ts`:**

```ts
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
```

- [ ] **Step 4: Grün sehen** — `bun test src/desktop/main/covers.test.ts` → 3 pass.

- [ ] **Step 5: Handler ersetzen** in `ipc.ts` (Import: `import { getCoverDataUrl } from "./covers.ts";`):

```ts
    "covers:get": async (apiId: number) => getCoverDataUrl(apiId),
```

- [ ] **Step 6: Verifizieren & committen**

```powershell
bun test src/desktop
bun x tsc --noEmit
bun x electron-vite build
git add src/desktop/main
git commit -m "feat(desktop): cover cache with disk LRU and data-url ipc"
```

---

### Task 9: Preload-Bridge (vollständig)

**Files:**
- Modify: `src/desktop/preload/index.ts` (Stub ersetzen)

- [ ] **Step 1: `src/desktop/preload/index.ts` komplett ersetzen:**

```ts
import { contextBridge, ipcRenderer } from "electron";
import {
  EVENT_CHANNELS,
  type EventChannel,
  type EventPayloads,
  type UltrastarApi,
} from "../shared/ipc-contract.ts";

const on = <C extends EventChannel>(
  channel: C,
  listener: (payload: EventPayloads[C]) => void,
): (() => void) => {
  if (!EVENT_CHANNELS.includes(channel)) {
    throw new Error(`Unknown event channel: ${channel}`);
  }
  const wrapped = (_event: Electron.IpcRendererEvent, payload: EventPayloads[C]) =>
    listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

const api: UltrastarApi = {
  getInitialState: () => ipcRenderer.invoke("app:getInitialState"),
  search: (req) => ipcRenderer.invoke("usdb:search", req),
  downloadSingle: (song) => ipcRenderer.invoke("download:single", song),
  failedList: () => ipcRenderer.invoke("downloads:failedList"),
  queueAdd: (songs) => ipcRenderer.invoke("queue:add", songs),
  queueRemove: (apiId) => ipcRenderer.invoke("queue:remove", apiId),
  queueClear: () => ipcRenderer.invoke("queue:clear"),
  queueStart: () => ipcRenderer.invoke("queue:start"),
  queueCancel: () => ipcRenderer.invoke("queue:cancel"),
  queueFetchAllPages: (req) => ipcRenderer.invoke("queue:fetchAllPages", req),
  queueEntireDatabase: () => ipcRenderer.invoke("queue:entireDatabase"),
  repairStart: () => ipcRenderer.invoke("repair:start"),
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSave: (config) => ipcRenderer.invoke("settings:save", config),
  chooseDirectory: () => ipcRenderer.invoke("settings:chooseDirectory"),
  binariesStatus: () => ipcRenderer.invoke("binaries:status"),
  binariesInstall: (force) => ipcRenderer.invoke("binaries:install", force),
  coverGet: (apiId) => ipcRenderer.invoke("covers:get", apiId),
  openFolder: (path) => ipcRenderer.invoke("shell:openFolder", path),
  on,
};

contextBridge.exposeInMainWorld("ultrastar", api);
```

- [ ] **Step 2: Verifizieren & committen**

```powershell
bun x tsc --noEmit
bun x electron-vite build
git add src/desktop/preload
git commit -m "feat(desktop): complete typed preload bridge"
```

---

### Task 10: Renderer-Grundgerüst — Theme, Sidebar, Download-Leiste, App-Shell

**Files:**
- Create: `src/desktop/renderer/theme.css`
- Create: `src/desktop/renderer/hooks.ts`
- Create: `src/desktop/renderer/components/Sidebar.tsx`
- Create: `src/desktop/renderer/components/DownloadBar.tsx`
- Create: `src/desktop/renderer/components/StatusDots.tsx`
- Modify: `src/desktop/renderer/App.tsx` (Platzhalter ersetzen)
- Modify: `src/desktop/renderer/main.tsx` (CSS-Import)

- [ ] **Step 1: `src/desktop/renderer/theme.css`** — Catppuccin Mocha + Violett-Primär + gezielte Neon-Akzente:

```css
:root {
  /* Catppuccin Mocha */
  --base: #1e1e2e;
  --mantle: #181825;
  --crust: #11111b;
  --surface0: #313244;
  --surface1: #45475a;
  --surface2: #585b70;
  --text: #cdd6f4;
  --subtext: #a6adc8;
  --overlay: #6c7086;
  --mauve: #cba6f7;   /* Primär */
  --green: #a6e3a1;
  --red: #f38ba8;
  --yellow: #f9e2af;
  --blue: #89b4fa;
  --cyan: #89dceb;
  --neon: #e879ff;    /* Neon-Akzent für Glow */
}

* { box-sizing: border-box; }

html, body, #root {
  margin: 0;
  height: 100%;
  background: var(--base);
  color: var(--text);
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 14px;
}

.app-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: 1fr auto;
  height: 100%;
}

/* ── Sidebar ── */
.sidebar {
  grid-row: 1 / 3;
  background: var(--mantle);
  display: flex;
  flex-direction: column;
  padding: 16px 10px;
  gap: 4px;
}
.sidebar .brand {
  font-size: 18px;
  font-weight: 700;
  color: var(--mauve);
  padding: 0 10px 16px;
  text-shadow: 0 0 12px rgba(232, 121, 255, 0.5);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--subtext);
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.nav-item:hover { background: var(--surface0); color: var(--text); }
.nav-item.active {
  background: var(--surface0);
  color: var(--mauve);
  box-shadow: inset 2px 0 0 var(--neon), 0 0 14px rgba(232, 121, 255, 0.18);
}
.nav-item .badge {
  margin-left: auto;
  background: var(--mauve);
  color: var(--crust);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
}
.sidebar .spacer { flex: 1; }

/* ── Status-Punkte ── */
.status-dots { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; }
.status-dot { display: flex; align-items: center; gap: 8px; color: var(--subtext); font-size: 12px; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.ok { background: var(--green); box-shadow: 0 0 6px var(--green); }
.dot.bad { background: var(--red); box-shadow: 0 0 6px var(--red); }
.dot.pending { background: var(--yellow); }

/* ── Hauptfläche ── */
.main-view { padding: 20px 24px; overflow-y: auto; }
.main-view h2 { margin: 0 0 16px; font-size: 20px; }

/* ── Download-Leiste ── */
.download-bar {
  background: var(--mantle);
  border-top: 1px solid var(--surface0);
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}
.download-row { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.download-row .name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.download-row.failed .name { color: var(--red); }

/* ── Allgemeine Bausteine ── */
.progress-track {
  flex: 0 0 220px; height: 8px; border-radius: 4px; background: var(--surface0);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--mauve), var(--neon));
  box-shadow: 0 0 10px rgba(232, 121, 255, 0.6);
  transition: width 120ms linear;
}
.btn {
  background: var(--surface0); color: var(--text);
  border: none; border-radius: 6px; padding: 7px 14px;
  font-size: 13px; cursor: pointer;
}
.btn:hover { background: var(--surface1); }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn.primary {
  background: var(--mauve); color: var(--crust); font-weight: 600;
  box-shadow: 0 0 12px rgba(203, 166, 247, 0.35);
}
.btn.primary:hover { box-shadow: 0 0 16px rgba(232, 121, 255, 0.55); }
.btn.danger { background: var(--red); color: var(--crust); }
.btn.small { padding: 3px 9px; font-size: 12px; }
.input {
  background: var(--surface0); color: var(--text);
  border: 1px solid var(--surface1); border-radius: 6px;
  padding: 8px 10px; font-size: 14px; outline: none;
}
.input:focus { border-color: var(--mauve); box-shadow: 0 0 8px rgba(203, 166, 247, 0.35); }
.row { display: flex; align-items: center; gap: 10px; }
.muted { color: var(--subtext); }
.error-banner {
  background: rgba(243, 139, 168, 0.12); color: var(--red);
  border: 1px solid var(--red); border-radius: 8px;
  padding: 8px 12px; margin-bottom: 12px; font-size: 13px;
}

/* ── Tabelle ── */
.song-table { width: 100%; border-collapse: collapse; }
.song-table th {
  text-align: left; color: var(--subtext); font-weight: 600; font-size: 12px;
  padding: 6px 8px; border-bottom: 1px solid var(--surface0);
}
.song-table td { padding: 5px 8px; border-bottom: 1px solid var(--surface0); }
.song-table tr:hover td { background: var(--surface0); }
.cover-thumb {
  width: 28px; height: 28px; border-radius: 4px; object-fit: cover;
  background: var(--surface1); display: block;
}
.tag {
  background: var(--surface0); color: var(--mauve);
  border-radius: 8px; padding: 1px 8px; font-size: 11px; margin-right: 4px;
}
.check { color: var(--green); }
```

- [ ] **Step 2: `src/desktop/renderer/hooks.ts`** — Event-Abos als React-Hooks:

```ts
import { useEffect, useState } from "react";
import type {
  EventChannel,
  EventPayloads,
} from "../shared/ipc-contract.ts";

/** Abonniert einen Main-Event-Kanal; initialValue bis zum ersten Event. */
export const useIpcEvent = <C extends EventChannel>(
  channel: C,
  initialValue: EventPayloads[C],
): EventPayloads[C] => {
  const [value, setValue] = useState<EventPayloads[C]>(initialValue);
  useEffect(
    () => window.ultrastar.on(channel, setValue),
    [channel],
  );
  return value;
};
```

- [ ] **Step 3: `src/desktop/renderer/components/StatusDots.tsx`:**

```tsx
import type { FC } from "react";
import type { AppStatus } from "../../shared/ipc-contract.ts";

const dotClass = (v: boolean | null): string =>
  v === null ? "dot pending" : v ? "dot ok" : "dot bad";

export const StatusDots: FC<{ status: AppStatus }> = ({ status }) => (
  <div className="status-dots">
    <div className="status-dot" title="USDB-Login">
      <span className={dotClass(status.loggedIn)} /> USDB
    </div>
    <div className="status-dot" title="yt-dlp">
      <span className={dotClass(status.ytDlpAvailable)} /> yt-dlp
    </div>
    <div className="status-dot" title="ffmpeg">
      <span className={dotClass(status.ffmpegAvailable)} /> ffmpeg
    </div>
  </div>
);

export default StatusDots;
```

- [ ] **Step 4: `src/desktop/renderer/components/Sidebar.tsx`:**

```tsx
import type { FC } from "react";
import type { AppStatus } from "../../shared/ipc-contract.ts";
import StatusDots from "./StatusDots.tsx";

export type ViewId = "search" | "queue" | "downloaded" | "repair" | "settings";

const ITEMS: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: "search", label: "Suche", icon: "🔍" },
  { id: "queue", label: "Queue", icon: "📋" },
  { id: "downloaded", label: "Heruntergeladen", icon: "✅" },
  { id: "repair", label: "Reparatur", icon: "🔧" },
  { id: "settings", label: "Einstellungen", icon: "⚙️" },
];

export const Sidebar: FC<{
  active: ViewId;
  onSelect: (view: ViewId) => void;
  queueCount: number;
  status: AppStatus;
}> = ({ active, onSelect, queueCount, status }) => (
  <nav className="sidebar">
    <div className="brand">🎤 UltraStar</div>
    {ITEMS.map((item) => (
      <button
        key={item.id}
        type="button"
        className={`nav-item${active === item.id ? " active" : ""}`}
        onClick={() => onSelect(item.id)}
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
        {item.id === "queue" && queueCount > 0 && (
          <span className="badge">{queueCount}</span>
        )}
      </button>
    ))}
    <div className="spacer" />
    <StatusDots status={status} />
  </nav>
);

export default Sidebar;
```

- [ ] **Step 5: `src/desktop/renderer/components/DownloadBar.tsx`:**

```tsx
import type { FC } from "react";
import type { ActiveDownload } from "../../shared/ipc-contract.ts";

export const DownloadBar: FC<{ downloads: ActiveDownload[] }> = ({
  downloads,
}) => {
  if (downloads.length === 0) return null;
  return (
    <div className="download-bar">
      {downloads.map((d) => (
        <div
          key={d.apiId}
          className={`download-row${d.status === "failed" ? " failed" : ""}`}
        >
          <span className="name">
            {d.artist} – {d.title}
            {d.status === "failed" && d.error ? ` — ${d.error}` : ""}
          </span>
          {d.status === "downloading" && (
            <>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round(d.progress * 100)}%` }}
                />
              </div>
              <span className="muted">{Math.round(d.progress * 100)}%</span>
            </>
          )}
          {d.status === "completed" && <span className="check">✓ fertig</span>}
          {d.status === "failed" && <span>✗</span>}
        </div>
      ))}
    </div>
  );
};

export default DownloadBar;
```

- [ ] **Step 6: `src/desktop/renderer/App.tsx`** (ersetzt den Platzhalter) — lädt Initial-State, hält View-Routing, reicht Events durch. Die View-Komponenten existieren ab den Tasks 11–15; bis dahin werden sie in diesem Task als minimale Dateien MIT angelegt (siehe Step 7), damit jeder Zwischenstand kompiliert:

```tsx
import type { FC } from "react";
import { useEffect, useState } from "react";
import type {
  AppError,
  InitialState,
} from "../shared/ipc-contract.ts";
import DownloadBar from "./components/DownloadBar.tsx";
import Sidebar, { type ViewId } from "./components/Sidebar.tsx";
import { useIpcEvent } from "./hooks.ts";
import DownloadedView from "./views/DownloadedView.tsx";
import QueueView from "./views/QueueView.tsx";
import RepairView from "./views/RepairView.tsx";
import SearchView from "./views/SearchView.tsx";
import SettingsView from "./views/SettingsView.tsx";

const ERROR_DISPLAY_MS = 6000;

/**
 * Äußere Komponente: lädt nur den Initial-State. Die Shell wird erst danach
 * gemountet, damit die useIpcEvent-Hooks mit den korrekten Initialwerten
 * starten (Hook-Initialwerte werden nur beim ersten Render übernommen).
 */
export const App: FC = () => {
  const [initial, setInitial] = useState<InitialState | null>(null);

  useEffect(() => {
    void window.ultrastar.getInitialState().then(setInitial);
  }, []);

  if (!initial) {
    return (
      <div className="app-shell">
        <div className="main-view muted">Initialisiere…</div>
      </div>
    );
  }
  return <Shell initial={initial} />;
};

const Shell: FC<{ initial: InitialState }> = ({ initial }) => {
  const [view, setView] = useState<ViewId>("search");
  const [lastError, setLastError] = useState<AppError | null>(null);

  useEffect(
    () =>
      window.ultrastar.on("event:error", (err) => {
        setLastError(err);
        setTimeout(() => setLastError(null), ERROR_DISPLAY_MS);
      }),
    [],
  );

  const status = useIpcEvent("event:status", initial.status);
  const queue = useIpcEvent("event:queueChanged", initial.queue);
  const downloads = useIpcEvent("event:activeDownloads", []);
  const downloaded = useIpcEvent("event:downloadedChanged", initial.downloaded);

  return (
    <div className="app-shell">
      <Sidebar
        active={view}
        onSelect={setView}
        queueCount={queue.length}
        status={status}
      />
      <main className="main-view">
        {lastError && (
          <div className="error-banner">
            [{lastError.context}] {lastError.message}
          </div>
        )}
        {view === "search" && (
          <SearchView downloaded={downloaded} status={status} />
        )}
        {view === "queue" && <QueueView queue={queue} />}
        {view === "downloaded" && <DownloadedView entries={downloaded} />}
        {view === "repair" && <RepairView status={status} />}
        {view === "settings" && (
          <SettingsView initialConfig={initial.config} version={initial.version} />
        )}
      </main>
      <DownloadBar downloads={downloads} />
    </div>
  );
};

export default App;
```

- [ ] **Step 7: Minimale View-Dateien anlegen** (werden in 11–15 durch die echten Implementierungen ERSETZT; bis dahin kompilierende Hüllen mit den finalen Props-Signaturen) — `src/desktop/renderer/views/SearchView.tsx`:

```tsx
import type { FC } from "react";
import type { AppStatus, DownloadedEntry } from "../../shared/ipc-contract.ts";

export const SearchView: FC<{
  downloaded: DownloadedEntry[];
  status: AppStatus;
}> = () => <h2>Suche</h2>;

export default SearchView;
```

`src/desktop/renderer/views/QueueView.tsx`:

```tsx
import type { FC } from "react";
import type { Song } from "../../shared/ipc-contract.ts";

export const QueueView: FC<{ queue: Song[] }> = () => <h2>Queue</h2>;

export default QueueView;
```

`src/desktop/renderer/views/DownloadedView.tsx`:

```tsx
import type { FC } from "react";
import type { DownloadedEntry } from "../../shared/ipc-contract.ts";

export const DownloadedView: FC<{ entries: DownloadedEntry[] }> = () => (
  <h2>Heruntergeladen</h2>
);

export default DownloadedView;
```

`src/desktop/renderer/views/RepairView.tsx`:

```tsx
import type { FC } from "react";
import type { AppStatus } from "../../shared/ipc-contract.ts";

export const RepairView: FC<{ status: AppStatus }> = () => <h2>Reparatur</h2>;

export default RepairView;
```

`src/desktop/renderer/views/SettingsView.tsx`:

```tsx
import type { FC } from "react";
import type { AppConfig } from "../../shared/ipc-contract.ts";

export const SettingsView: FC<{
  initialConfig: AppConfig | null;
  version: string;
}> = () => <h2>Einstellungen</h2>;

export default SettingsView;
```

- [ ] **Step 8: CSS-Import in `main.tsx`** — erste Zeile ergänzen:

```tsx
import "./theme.css";
```

- [ ] **Step 9: Verifizieren, manuell ansehen, committen**

```powershell
bun x tsc --noEmit
bun x electron-vite build
```
Dann den Menschen bitten: `bun run desktop:dev` — Sidebar mit 5 Einträgen + Status-Punkten sichtbar, Views schalten um.

```powershell
git add src/desktop/renderer
git commit -m "feat(desktop): app shell with sidebar, theme, download bar"
```

---

### Task 11: SearchView (komplett)

Suchfelder, Ergebnis-Tabelle mit Cover-Thumbnails, Seiten-Navigation, Zeilen-Aktionen, Bulk-Queue-Buttons mit Fortschritt, Bestätigungsdialog für „ganze Datenbank".

**Files:**
- Replace: `src/desktop/renderer/views/SearchView.tsx`
- Create: `src/desktop/renderer/components/CoverThumb.tsx`

- [ ] **Step 1: `src/desktop/renderer/components/CoverThumb.tsx`:**

```tsx
import type { FC } from "react";
import { useEffect, useState } from "react";

export const CoverThumb: FC<{ apiId: number }> = ({ apiId }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void window.ultrastar.coverGet(apiId).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [apiId]);
  return src ? (
    <img className="cover-thumb" src={src} alt="" />
  ) : (
    <div className="cover-thumb" />
  );
};

export default CoverThumb;
```

- [ ] **Step 2: `src/desktop/renderer/views/SearchView.tsx` ersetzen:**

```tsx
import type { FC, FormEvent } from "react";
import { useMemo, useState } from "react";
import type {
  AppStatus,
  DownloadedEntry,
  Song,
} from "../../shared/ipc-contract.ts";
import CoverThumb from "../components/CoverThumb.tsx";
import { useIpcEvent } from "../hooks.ts";

export const SearchView: FC<{
  downloaded: DownloadedEntry[];
  status: AppStatus;
}> = ({ downloaded, status }) => {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const fetchAllProgress = useIpcEvent("event:fetchAllProgress", null);
  const downloadedIds = useMemo(
    () => new Set(downloaded.map((e) => e.apiId)),
    [downloaded],
  );
  const canDownload =
    status.ytDlpAvailable !== false && status.ffmpegAvailable !== false;
  const bulkRunning = fetchAllProgress !== null;

  const fetchPage = async (p: number): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.ultrastar.search({ artist, title, page: p });
      setSongs(result.songs);
      setTotalPages(result.totalPages);
      setPage(p);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    void fetchPage(1);
  };

  const queueEntireDatabase = (): void => {
    if (
      window.confirm(
        "Wirklich die GESAMTE USDB-Datenbank in die Queue laden? Das sind zehntausende Songs und dauert eine Weile.",
      )
    ) {
      void window.ultrastar.queueEntireDatabase();
    }
  };

  return (
    <div>
      <h2>Suche</h2>
      <form className="row" style={{ marginBottom: 16 }} onSubmit={onSubmit}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Interpret…"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
        />
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Titel…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Suche…" : "Suchen"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {searched && !loading && songs.length === 0 && (
        <p className="muted">Keine Treffer.</p>
      )}

      {songs.length > 0 && (
        <>
          <table className="song-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Interpret</th>
                <th>Titel</th>
                <th>Sprachen</th>
                <th style={{ width: 170 }} />
              </tr>
            </thead>
            <tbody>
              {songs.map((s) => {
                const isDownloaded = downloadedIds.has(s.apiId);
                return (
                  <tr key={s.apiId}>
                    <td>
                      <CoverThumb apiId={s.apiId} />
                    </td>
                    <td style={{ color: "var(--yellow)" }}>{s.artist}</td>
                    <td>
                      {s.title}{" "}
                      {isDownloaded && (
                        <span className="check" title="bereits heruntergeladen">
                          ✓
                        </span>
                      )}
                    </td>
                    <td>
                      {s.languages.map((l) => (
                        <span key={l} className="tag">
                          {l}
                        </span>
                      ))}
                    </td>
                    <td>
                      {!isDownloaded && (
                        <span className="row">
                          <button
                            className="btn small primary"
                            type="button"
                            disabled={!canDownload}
                            onClick={() =>
                              void window.ultrastar.downloadSingle(s)
                            }
                          >
                            ⬇
                          </button>
                          <button
                            className="btn small"
                            type="button"
                            onClick={() => void window.ultrastar.queueAdd([s])}
                          >
                            ＋ Queue
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
            <span className="row">
              <button
                className="btn small"
                type="button"
                onClick={() => void window.ultrastar.queueAdd(songs)}
              >
                ＋ Seite in Queue
              </button>
              <button
                className="btn small"
                type="button"
                disabled={bulkRunning}
                onClick={() =>
                  void window.ultrastar.queueFetchAllPages({ artist, title })
                }
              >
                ＋ Alle {totalPages} Seiten
              </button>
            </span>
            <span className="row">
              <button
                className="btn small"
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => void fetchPage(page - 1)}
              >
                ◀
              </button>
              <span className="muted">
                Seite {totalPages === 0 ? 0 : page} / {totalPages}
              </span>
              <button
                className="btn small"
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => void fetchPage(page + 1)}
              >
                ▶
              </button>
            </span>
          </div>
        </>
      )}

      <div style={{ marginTop: 20 }}>
        <button
          className="btn"
          type="button"
          disabled={bulkRunning}
          onClick={queueEntireDatabase}
        >
          🗄 Ganze Datenbank in Queue
        </button>
        {fetchAllProgress && (
          <p className="muted">
            Lade Seiten… ({fetchAllProgress.current}/{fetchAllProgress.total})
          </p>
        )}
      </div>
    </div>
  );
};

export default SearchView;
```

- [ ] **Step 3: Verifizieren, manuell testen, committen**

```powershell
bun x tsc --noEmit
bun x electron-vite build
```
Manuell (`bun run desktop:dev`): Suche nach z.B. „ABBA" liefert Tabelle mit Covern; Blättern funktioniert; ⬇ startet Download (sofern yt-dlp/ffmpeg vorhanden) mit Fortschritt in der Download-Leiste; „＋ Queue" erhöht den Sidebar-Badge.

```powershell
git add src/desktop/renderer
git commit -m "feat(desktop): full search view with covers, paging, bulk queue"
```

---

### Task 12: QueueView (komplett)

**Files:**
- Replace: `src/desktop/renderer/views/QueueView.tsx`

- [ ] **Step 1: Ersetzen durch:**

```tsx
import type { FC } from "react";
import { useEffect, useState } from "react";
import type { FailedDownload, Song } from "../../shared/ipc-contract.ts";
import { useIpcEvent } from "../hooks.ts";

export const QueueView: FC<{ queue: Song[] }> = ({ queue }) => {
  const running = useIpcEvent("event:queueRunning", false);
  const [failed, setFailed] = useState<FailedDownload[]>([]);
  const [showFailed, setShowFailed] = useState(false);

  const refreshFailed = (): void => {
    void window.ultrastar.failedList().then(setFailed);
  };
  // Liste beim Öffnen der View und nach jedem Queue-Lauf aktualisieren
  useEffect(refreshFailed, []);
  useEffect(() => {
    if (!running) refreshFailed();
  }, [running]);

  const retry = (f: FailedDownload): void => {
    void window.ultrastar.queueAdd([
      { apiId: f.apiId, artist: f.artist, title: f.title, languages: [] },
    ]);
  };

  return (
    <div>
      <h2>Queue</h2>
      <div className="row" style={{ marginBottom: 16 }}>
        <button
          className="btn primary"
          type="button"
          disabled={running || queue.length === 0}
          onClick={() => void window.ultrastar.queueStart()}
        >
          {running
            ? `Läuft… (${queue.length} verbleibend)`
            : `▶ ${queue.length} Songs herunterladen`}
        </button>
        {running && (
          <button
            className="btn"
            type="button"
            onClick={() => void window.ultrastar.queueCancel()}
          >
            ⏸ Abbrechen (nach aktuellem Batch)
          </button>
        )}
        <button
          className="btn danger"
          type="button"
          disabled={running || queue.length === 0}
          onClick={() => void window.ultrastar.queueClear()}
        >
          Queue leeren
        </button>
      </div>

      {queue.length === 0 ? (
        <p className="muted">Die Queue ist leer.</p>
      ) : (
        <table className="song-table">
          <thead>
            <tr>
              <th>Interpret</th>
              <th>Titel</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {queue.slice(0, 200).map((s) => (
              <tr key={s.apiId}>
                <td style={{ color: "var(--yellow)" }}>{s.artist}</td>
                <td>{s.title}</td>
                <td>
                  <button
                    className="btn small"
                    type="button"
                    disabled={running}
                    onClick={() => void window.ultrastar.queueRemove(s.apiId)}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {queue.length > 200 && (
        <p className="muted">… und {queue.length - 200} weitere.</p>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          className="btn small"
          type="button"
          onClick={() => setShowFailed((v) => !v)}
        >
          {showFailed ? "▼" : "▶"} Fehlgeschlagen ({failed.length})
        </button>
        {showFailed && failed.length > 0 && (
          <table className="song-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Song</th>
                <th>Fehler</th>
                <th style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {failed.map((f) => (
                <tr key={`${f.apiId}-${f.timestamp}`}>
                  <td>
                    {f.artist} – {f.title}
                  </td>
                  <td className="muted" style={{ maxWidth: 420 }}>
                    {f.error}
                  </td>
                  <td>
                    <button
                      className="btn small"
                      type="button"
                      onClick={() => retry(f)}
                    >
                      ↻ Erneut
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default QueueView;
```

- [ ] **Step 2: Verifizieren & committen** (tsc, build, manueller Blick wie gehabt)

```powershell
bun x tsc --noEmit
bun x electron-vite build
git add src/desktop/renderer
git commit -m "feat(desktop): queue view with start/clear and failed retry"
```

---

### Task 13: DownloadedView (komplett)

**Files:**
- Replace: `src/desktop/renderer/views/DownloadedView.tsx`

- [ ] **Step 1: Ersetzen durch:**

```tsx
import type { FC } from "react";
import { useMemo, useState } from "react";
import type { DownloadedEntry } from "../../shared/ipc-contract.ts";
import CoverThumb from "../components/CoverThumb.tsx";

export const DownloadedView: FC<{ entries: DownloadedEntry[] }> = ({
  entries,
}) => {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const sorted = [...entries].sort((a, b) =>
      b.downloadedAt.localeCompare(a.downloadedAt),
    );
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.artist.toLowerCase().includes(q) || e.title.toLowerCase().includes(q),
    );
  }, [entries, filter]);

  return (
    <div>
      <h2>Heruntergeladen ({entries.length})</h2>
      <input
        className="input"
        style={{ width: 320, marginBottom: 14 }}
        placeholder="Filtern…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="muted">Keine Einträge.</p>
      ) : (
        <table className="song-table">
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th>Interpret</th>
              <th>Titel</th>
              <th>Datum</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.apiId}>
                <td>
                  {/* Negative apiIds = rekonstruierte Einträge ohne USDB-Cover */}
                  {e.apiId > 0 ? (
                    <CoverThumb apiId={e.apiId} />
                  ) : (
                    <div className="cover-thumb" />
                  )}
                </td>
                <td style={{ color: "var(--green)" }}>{e.artist}</td>
                <td>{e.title}</td>
                <td className="muted">
                  {e.downloadedAt.slice(0, 10)}
                </td>
                <td>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => void window.ultrastar.openFolder(e.songDir)}
                  >
                    📂 Ordner
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DownloadedView;
```

- [ ] **Step 2: Verifizieren & committen**

```powershell
bun x tsc --noEmit
bun x electron-vite build
git add src/desktop/renderer
git commit -m "feat(desktop): downloaded view with filter and open-folder"
```

---

### Task 14: RepairView (komplett)

**Files:**
- Replace: `src/desktop/renderer/views/RepairView.tsx`

- [ ] **Step 1: Ersetzen durch:**

```tsx
import type { FC } from "react";
import type { AppStatus } from "../../shared/ipc-contract.ts";
import { useIpcEvent } from "../hooks.ts";

export const RepairView: FC<{ status: AppStatus }> = ({ status }) => {
  const repair = useIpcEvent("event:repair", {
    running: false,
    progress: null,
    result: null,
  });
  const canRun =
    status.ytDlpAvailable !== false &&
    status.ffmpegAvailable !== false &&
    !repair.running;

  return (
    <div>
      <h2>Video-Reparatur</h2>
      <p className="muted" style={{ maxWidth: 560 }}>
        Durchsucht den Download-Ordner nach Songs mit fehlendem oder defektem
        video.mp4 und lädt die Videos erneut herunter. Songs ohne
        Tracking-Eintrag werden dabei rekonstruiert.
      </p>
      <button
        className="btn primary"
        type="button"
        disabled={!canRun}
        onClick={() => void window.ultrastar.repairStart()}
      >
        {repair.running ? "Scan läuft…" : "🔧 Scan starten"}
      </button>

      {repair.running && repair.progress && (
        <div style={{ marginTop: 16 }}>
          <p>
            [{repair.progress.current}/{repair.progress.total}]{" "}
            <span style={{ color: "var(--yellow)" }}>
              {repair.progress.currentSong}
            </span>
          </p>
          {repair.progress.videoProgress != null && (
            <div className="row">
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.round(repair.progress.videoProgress * 100)}%`,
                  }}
                />
              </div>
              <span className="muted">
                {Math.round(repair.progress.videoProgress * 100)}%
              </span>
            </div>
          )}
        </div>
      )}

      {repair.result && (
        <div style={{ marginTop: 16 }}>
          <p>
            <span className="check">Fertig!</span> Repariert:{" "}
            <strong>{repair.result.fixed}</strong> / {repair.result.total}
            {repair.result.rebuilt > 0 && (
              <> · Tracking rekonstruiert: {repair.result.rebuilt}</>
            )}
          </p>
          {repair.result.failed.length > 0 && (
            <>
              <p style={{ color: "var(--yellow)" }}>
                Nicht reparierbar ({repair.result.failed.length}):
              </p>
              <ul className="muted">
                {repair.result.failed.slice(0, 15).map((name) => (
                  <li key={name}>{name}</li>
                ))}
                {repair.result.failed.length > 15 && (
                  <li>… und {repair.result.failed.length - 15} weitere</li>
                )}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RepairView;
```

- [ ] **Step 2: Verifizieren & committen**

```powershell
bun x tsc --noEmit
bun x electron-vite build
git add src/desktop/renderer
git commit -m "feat(desktop): repair view with live progress and result report"
```

---

### Task 15: SettingsView (komplett)

**Files:**
- Replace: `src/desktop/renderer/views/SettingsView.tsx`

- [ ] **Step 1: Ersetzen durch:**

```tsx
import type { FC } from "react";
import { useEffect, useState } from "react";
import type {
  AppConfig,
  BinariesStatus,
} from "../../shared/ipc-contract.ts";
import { useIpcEvent } from "../hooks.ts";

const BROWSERS = [
  "edge",
  "chrome",
  "firefox",
  "brave",
  "chromium",
  "opera",
  "vivaldi",
] as const;

const sourceLabel = (s: "system" | "managed" | "missing"): string =>
  s === "system" ? "System" : s === "managed" ? "App-verwaltet" : "fehlt";

export const SettingsView: FC<{
  initialConfig: AppConfig | null;
  version: string;
}> = ({ initialConfig, version }) => {
  const [downloadDir, setDownloadDir] = useState(
    initialConfig?.downloadDir ?? "",
  );
  const [browser, setBrowser] = useState(initialConfig?.browser ?? "edge");
  const [saved, setSaved] = useState(false);
  const [binaries, setBinaries] = useState<BinariesStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const binariesProgress = useIpcEvent("event:binariesProgress", null);

  useEffect(() => {
    void window.ultrastar.binariesStatus().then(setBinaries);
    // Live-Updates (z.B. nach Erststart-Auto-Install im Main-Prozess)
    return window.ultrastar.on("event:binariesStatus", setBinaries);
  }, []);

  const choose = async (): Promise<void> => {
    const dir = await window.ultrastar.chooseDirectory();
    if (dir) setDownloadDir(dir);
  };

  const save = async (): Promise<void> => {
    await window.ultrastar.settingsSave({ downloadDir, browser });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const install = async (force: boolean): Promise<void> => {
    setInstalling(true);
    setInstallError(null);
    try {
      await window.ultrastar.binariesInstall(force);
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const anythingMissing =
    binaries !== null &&
    (binaries.ytDlp === "missing" || binaries.ffmpeg === "missing");
  const anythingManaged =
    binaries !== null &&
    (binaries.ytDlp === "managed" || binaries.ffmpeg === "managed");

  return (
    <div>
      <h2>Einstellungen</h2>

      <h3>Download-Ordner</h3>
      <div className="row" style={{ marginBottom: 18 }}>
        <input
          className="input"
          style={{ flex: 1, maxWidth: 520 }}
          value={downloadDir}
          onChange={(e) => setDownloadDir(e.target.value)}
          placeholder="z.B. D:\Karaoke\songs"
        />
        <button className="btn" type="button" onClick={() => void choose()}>
          Durchsuchen…
        </button>
      </div>

      <h3>Browser für YouTube-Cookies</h3>
      <p className="muted" style={{ maxWidth: 560 }}>
        yt-dlp nutzt die Cookies dieses Browsers, um YouTube-Bot-Schutz zu
        umgehen. Du solltest dort in YouTube eingeloggt sein.
      </p>
      <select
        className="input"
        style={{ width: 240, marginBottom: 18 }}
        value={browser}
        onChange={(e) => setBrowser(e.target.value)}
      >
        {BROWSERS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <div className="row" style={{ marginBottom: 28 }}>
        <button className="btn primary" type="button" onClick={() => void save()}>
          Speichern
        </button>
        {saved && <span className="check">✓ gespeichert</span>}
      </div>

      <h3>Tools</h3>
      {binaries === null ? (
        <p className="muted">Prüfe…</p>
      ) : (
        <>
          <p>
            yt-dlp: <strong>{sourceLabel(binaries.ytDlp)}</strong> · ffmpeg:{" "}
            <strong>{sourceLabel(binaries.ffmpeg)}</strong>
          </p>
          <div className="row">
            {anythingMissing && (
              <button
                className="btn primary"
                type="button"
                disabled={installing}
                onClick={() => void install(false)}
              >
                {installing
                  ? "Installiere…"
                  : "⬇ Fehlende Tools automatisch installieren"}
              </button>
            )}
            {anythingManaged && (
              <button
                className="btn"
                type="button"
                disabled={installing}
                onClick={() => void install(true)}
              >
                ↻ Jetzt aktualisieren
              </button>
            )}
          </div>
          {anythingMissing && (
            <p className="muted">
              Manuelle Alternative:{" "}
              <a href="https://github.com/yt-dlp/yt-dlp#installation">yt-dlp</a>{" "}
              · <a href="https://www.gyan.dev/ffmpeg/builds/">ffmpeg</a>{" "}
              installieren und in den PATH aufnehmen, dann App neu starten.
            </p>
          )}
          {binariesProgress && (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">{binariesProgress.name}</span>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round(binariesProgress.percent * 100)}%` }}
                />
              </div>
            </div>
          )}
          {installError && <div className="error-banner">{installError}</div>}
        </>
      )}

      <h3 style={{ marginTop: 28 }}>App</h3>
      <p className="muted">UltraStar Desktop v{version}</p>
    </div>
  );
};

export default SettingsView;
```

- [ ] **Step 2: Verifizieren, manuell testen, committen**

```powershell
bun x tsc --noEmit
bun x electron-vite build
```
Manuell: Ordner-Dialog öffnet nativ; Speichern persistiert (Neustart behält Werte); fehlende Tools lassen sich per Button installieren (Fortschritt sichtbar), danach Status-Punkte grün.

```powershell
git add src/desktop/renderer
git commit -m "feat(desktop): settings view with dir picker, browser, binaries install"
```

---

### Task 16: Playwright-Smoke-Test

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/app.spec.ts`
- Modify: `.gitignore` (Playwright-Artefakte)

- [ ] **Step 1: `playwright.config.ts`** (Repo-Root):

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { trace: "retain-on-failure" },
});
```

- [ ] **Step 2: `e2e/app.spec.ts`:**

```ts
import { _electron as electron, expect, test } from "@playwright/test";

test("app boots and shows the search view", async () => {
  const app = await electron.launch({ args: ["out/main/index.js"] });
  const window = await app.firstWindow();

  await expect(window).toHaveTitle("UltraStar");
  // Sidebar-Einträge vorhanden
  await expect(window.getByRole("button", { name: /Suche/ })).toBeVisible();
  await expect(window.getByRole("button", { name: /Queue/ })).toBeVisible();
  await expect(window.getByRole("button", { name: /Einstellungen/ })).toBeVisible();
  // Such-View ist die Startansicht
  await expect(window.getByPlaceholder("Interpret…")).toBeVisible();

  await app.close();
});
```

- [ ] **Step 3: `.gitignore` ergänzen:**

```
# Playwright
test-results/
playwright-report/
```

- [ ] **Step 4: Ausführen**

```powershell
bun run test:e2e
```
Expected: 1 passed. (Der Test braucht keinen Netz-Login-Erfolg — die UI rendert auch mit `loggedIn: null/false`.)

- [ ] **Step 5: Commit**

```powershell
git add playwright.config.ts e2e .gitignore
git commit -m "test(desktop): playwright smoke test for app boot"
```

---

### Task 17: electron-builder, README, Gesamtverifikation

**Files:**
- Create: `electron-builder.yml`
- Modify: `README.md` (Desktop-Abschnitt)
- Modify: `.gitignore` (falls `release/` als Output gewählt — hier: `dist` ist schon ignoriert)

- [ ] **Step 1: `electron-builder.yml`** (Repo-Root):

```yaml
appId: com.github.normannormalmann.ultrastar
productName: UltraStar
directories:
  output: dist
files:
  - out/**
  - package.json
npmRebuild: false
win:
  target:
    - nsis
nsis:
  oneClick: true
  deleteAppDataOnUninstall: false
# Hinweis: bewusst ohne eigenes Icon in v1 (Standard-Electron-Icon);
# eigenes .ico ist als Folgeaufgabe vorgesehen.
```

- [ ] **Step 2: Installer bauen**

```powershell
bun run desktop:dist
```
Expected: `dist\UltraStar Setup <version>.exe` entsteht. Bekannte Stolperstellen: (a) erste Ausführung lädt electron-builder-Werkzeuge nach (dauert), (b) Virenscanner kann NSIS-Signierung verzögern. Falls electron-builder wegen fehlendem Code-Signing meckert: Signing ist in v1 bewusst nicht konfiguriert (unsignierter Installer, SmartScreen-Warnung ist bekannt und akzeptiert).

- [ ] **Step 3: Installer manuell testen** — den Menschen bitten: Setup ausführen, App startet, Suche funktioniert, Einstellungen → Tools-Install funktioniert. Deinstallation über Windows-Apps entfernt die App (userData bleibt erhalten, gewollt).

- [ ] **Step 4: README-Abschnitt ergänzen** — in `README.md` nach dem bestehenden Installations-/CLI-Teil:

```markdown
## Desktop App (Windows)

Die Desktop-App bietet dieselben Funktionen wie die CLI (Suche, Download,
Queue, Reparatur) mit grafischer Oberfläche.

**Download:** Neueste `UltraStar Setup *.exe` von den
[GitHub Releases](https://github.com/normannormalmann/UltraStar-CLI/releases)
herunterladen und ausführen. yt-dlp und ffmpeg lädt die App bei Bedarf
selbst herunter (Einstellungen → Tools).

**Entwicklung:**

```bash
bun install
bun run desktop:dev    # Dev-Modus mit Hot Reload
bun run desktop:dist   # Windows-Installer bauen (dist/)
```
```

- [ ] **Step 5: Gesamtverifikation**

```powershell
bun run test          # 22 pass (14 core + 8 desktop unit tests)
bun run test:e2e      # 1 passed
bun x tsc --noEmit    # exit 0
bun x biome lint src  # 0 Fehler
bun run build         # CLI-Build weiterhin ok (TUI unberührt)
```

- [ ] **Step 6: Commit**

```powershell
git add electron-builder.yml README.md .gitignore
git commit -m "feat(desktop): windows installer config and docs"
```

---

## Endzustand nach diesem Plan

```
src/
  core/                  (unverändert, + loadFailedDownloads-Export)
  tui/                   (unverändert)
  desktop/
    main/    index.ts, ipc.ts, state.ts, downloads.ts, binaries.ts, covers.ts (+tests)
    preload/ index.ts
    shared/  ipc-contract.ts (+test)
    renderer/ index.html, main.tsx, App.tsx, theme.css, hooks.ts, global.d.ts
      components/ Sidebar, DownloadBar, StatusDots, CoverThumb
      views/      SearchView, QueueView, DownloadedView, RepairView, SettingsView
  index.tsx, build.ts
e2e/app.spec.ts
electron.vite.config.ts, electron-builder.yml, playwright.config.ts
```

**Bewusst nicht enthalten (Spec „Nicht in v1"):** Auto-Update, macOS/Linux-Builds, Light Mode, Song-Vorschau, eigenes App-Icon (Folgeaufgabe), Code-Signing.
