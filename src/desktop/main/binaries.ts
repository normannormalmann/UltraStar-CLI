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

let installRunning = false;

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
    Readable.fromWeb(
      response.body.pipeThrough(
        progress,
      ) as unknown as import("node:stream/web").ReadableStream<Uint8Array>,
    ),
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
  if (installRunning) return; // bereits ein Install-Lauf aktiv
  if (process.platform !== "win32") {
    throw new Error(
      "Automatic install is only supported on Windows. Please install yt-dlp and ffmpeg manually.",
    );
  }
  installRunning = true;
  try {
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
  } finally {
    installRunning = false;
  }
};
