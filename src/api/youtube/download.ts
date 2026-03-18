import { spawn } from "node:child_process";
import { Effect } from "effect";
import { resolve, normalize } from "node:path";
import { existsSync, lstatSync } from "node:fs";

// Constants for download behavior
const DOWNLOAD_TIMEOUT_MS = 300000; // 5 minutes - timeout for yt-dlp process
const PROGRESS_THROTTLE_MS = 67; // ~15 updates per second - throttling for progress updates

/**
 * Securely validates and normalizes the cookies browser parameter.
 * Prevents command injection and path traversal attacks.
 */
const validateCookiesBrowserParam = (
  cookiesBrowser: string | undefined,
): string[] | undefined => {
  if (!cookiesBrowser) return undefined;

  // Remove quotes and trim whitespace
  const val = cookiesBrowser.replace(/^["']+|["']+$/g, "").trim();

  // Maximum length to prevent buffer overflow attacks
  const MAX_LENGTH = 255;
  if (val.length > MAX_LENGTH || val.length === 0) {
    throw new Error(`Invalid cookies browser parameter: length must be between 1 and ${MAX_LENGTH}`);
  }

  // Whitelist of supported browser names for --cookies-from-browser
  const ALLOWED_BROWSERS = [
    "chrome",
    "chrome+",
    "chromium",
    "chromium+",
    "brave",
    "brave+",
    "edge",
    "edge+",
    "firefox",
    "firefox+",
    "opera",
    "opera+",
    "vivaldi",
    "vivaldi+",
    "safari",
  ] as const;

  // Check if it's a file path (contains backslash or forward slash)
  if (val.includes("\\") || val.includes("/")) {
    // Normalize the path to prevent path traversal
    const normalizedPath = normalize(val);

    // Resolve to absolute path to prevent relative path attacks
    const resolvedPath = resolve(normalizedPath);

    // Check if path contains parent directory references (should be resolved by now)
    if (resolvedPath.includes("..")) {
      throw new Error("Invalid cookies file path: path traversal detected");
    }

    // Validate file extension
    if (!/\.(txt|json)$/i.test(resolvedPath)) {
      throw new Error('Invalid cookies file: must be .txt or .json format');
    }

    // Check if file exists and is actually a file (not a directory or symlink)
    // Use lstatSync instead of existsSync to prevent symlink attacks
    try {
      const stats = lstatSync(resolvedPath);
      if (!stats.isFile()) {
        throw new Error(`Invalid cookies file: path is not a file (is ${stats.isDirectory() ? 'directory' : 'special file'}): ${resolvedPath}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid cookies file: cannot access file at ${resolvedPath}: ${message}`);
    }

    return ["--cookies", resolvedPath];
  } else {
    // It's a browser name - validate against whitelist
    if (!ALLOWED_BROWSERS.includes(val as typeof ALLOWED_BROWSERS[number])) {
      throw new Error(
        `Invalid browser name: '${val}'. Supported browsers: ${ALLOWED_BROWSERS.join(", ")}`,
      );
    }
    return ["--cookies-from-browser", val];
  }
};

/**
 * Download a youtube video from direct link (watch URL or ID) and save to provided path.
 * Equivalent shell: yt-dlp -S "ext,res:1080" -o '${path}' -- ${link}
 */
export const downloadYoutubeVideo = (
  link: string,
  path: string,
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      const args = ["-S", "ext,res:1080", "-o", path, "--", link];

      await new Promise<void>((resolve, reject) => {
        const child = spawn("yt-dlp", args, {
          stdio: ["ignore", "ignore", "ignore"],
        });

        // Set timeout to prevent indefinite hanging
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`Download timeout after ${DOWNLOAD_TIMEOUT_MS}ms`));
        }, DOWNLOAD_TIMEOUT_MS);

        const cleanup = () => clearTimeout(timeout);

        child.on("error", (err) => {
          cleanup();
          reject(err);
        });
        child.on("close", (code) => {
          cleanup();
          if (code === 0) resolve();
          else reject(new Error(`yt-dlp download failed (code ${code})`));
        });
      });
    },
    catch: (e) =>
      e instanceof Error ? e : new Error("Failed to download youtube video"),
  });

export type YoutubeDownloadProgress = {
  percent: number; // 0..1
  eta?: string; // e.g. 00:12
  speed?: string; // e.g. 2.31MiB/s
};

// New type for the JSON progress output from yt-dlp
type YtDlpProgressData = {
  type: "progress";
  downloaded: number | string;
  total: "NA" | string;
  frag_index: number | string;
  frag_count: number | string;
};

/**
 * Download with progress updates via callback. Parses yt-dlp stdout progress lines in JSON format.
 * Uses --newline to receive line-by-line updates.
 */
export const downloadYoutubeVideoWithProgress = (
  link: string,
  path: string,
  onProgress: (p: YoutubeDownloadProgress) => void,
  cookiesBrowser?: string,
): Effect.Effect<void, Error, never> =>
  Effect.tryPromise({
    try: async () => {
      const args = [
        "-S",
        "ext,res:1080",
        "-o",
        path,
        "--merge-output-format",
        "mp4",
        "--quiet",
        "--newline",
        "--progress",
        "--progress-template",
        `{"type": "progress", "downloaded": "%(progress.downloaded_bytes)s", "total": "%(progress.total_bytes)s", "frag_index": "%(progress.fragment_index)s", "frag_count": "%(progress.fragment_count)s"}`,
        ...(validateCookiesBrowserParam(cookiesBrowser) ?? []),
        "--",
        link,
      ];

      await new Promise<void>((resolve, reject) => {
        const child = spawn("yt-dlp", args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        // Set timeout to prevent indefinite hanging
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`Download timeout after ${DOWNLOAD_TIMEOUT_MS}ms`));
        }, DOWNLOAD_TIMEOUT_MS);

        const stderrLines: string[] = [];

        // Throttle progress updates to avoid excessive UI re-renders
        // Max. 15-20 updates per second
        let lastUpdate = 0;
        let pendingUpdate: YoutubeDownloadProgress | null = null;

        const throttledUpdate = (progress: YoutubeDownloadProgress) => {
          const now = Date.now();
          if (now - lastUpdate >= PROGRESS_THROTTLE_MS) {
            lastUpdate = now;
            onProgress(progress);
            pendingUpdate = null;
          } else {
            // Store the latest update for later
            pendingUpdate = progress;
          }
        };

        // Flush pending updates periodically
        const flushInterval = setInterval(() => {
          if (pendingUpdate) {
            onProgress(pendingUpdate);
            pendingUpdate = null;
            lastUpdate = Date.now();
          }
        }, PROGRESS_THROTTLE_MS);

        const parseAndEmit = (line: string) => {
          try {
            // Try to parse the line as JSON
            const raw = line.trim();
            if (raw.length === 0) return;
            const maybeUnwrapped =
              (raw.startsWith("'") && raw.endsWith("'")) ||
              (raw.startsWith('"') && raw.endsWith('"'))
                ? raw.slice(1, -1)
                : raw;
            const data = JSON.parse(maybeUnwrapped) as YtDlpProgressData;

            if (data.type === "progress") {
              let percent = 0;

              const toNumber = (v: unknown): number => {
                if (typeof v === "number") return v;
                const n = Number.parseInt(String(v), 10);
                return Number.isNaN(n) ? Number.NaN : n;
              };

              if (data.total !== "NA") {
                // Use downloaded / total ratio
                const total = toNumber(data.total);
                const downloaded = toNumber(data.downloaded);
                if (
                  !Number.isNaN(total) &&
                  total > 0 &&
                  !Number.isNaN(downloaded)
                ) {
                  percent = Math.max(0, Math.min(1, downloaded / total));
                } else {
                  // Fallback to fragment-based ratio if total is not usable
                  const fragCount = toNumber(data.frag_count);
                  const fragIndex = toNumber(data.frag_index);
                  if (
                    !Number.isNaN(fragCount) &&
                    fragCount > 0 &&
                    !Number.isNaN(fragIndex)
                  ) {
                    const clampedIndex = Math.min(fragIndex, fragCount);
                    percent = Math.max(
                      0,
                      Math.min(1, clampedIndex / fragCount),
                    );
                  }
                }
              } else {
                // Use frag_index / frag_count ratio
                const fragCount = toNumber(data.frag_count);
                const fragIndex = toNumber(data.frag_index);
                if (
                  !Number.isNaN(fragCount) &&
                  fragCount > 0 &&
                  !Number.isNaN(fragIndex)
                ) {
                  // Clamp frag_index to frag_count to ensure ratio doesn't exceed 1
                  const clampedIndex = Math.min(fragIndex, fragCount);
                  // Log edge case where frag_index exceeds frag_count
                  if (fragIndex > fragCount) {
                    console.warn(
                      `[yt-dlp] Fragment index (${fragIndex}) exceeds fragment count (${fragCount}). ` +
                      `This can happen with some YouTube videos. Clamping to ${fragCount}.`
                    );
                  }
                  percent = Math.max(0, Math.min(1, clampedIndex / fragCount));
                }
              }

              throttledUpdate({ percent });
            }
          } catch {
            // Ignore lines that aren't valid JSON
            // This handles non-progress lines from yt-dlp
          }
        };

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {
          const text = chunk as string;
          text.split(/[\r\n]+/).forEach((line) => {
            if (line.trim()) stderrLines.push(line.trim());
            parseAndEmit(line);
          });
        });
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          // do not print to console; parse progress only
          const text = chunk as string;
          text.split(/[\r\n]+/).forEach(parseAndEmit);
        });
        child.on("error", (err) => {
          clearTimeout(timeout);
          clearInterval(flushInterval);
          reject(err);
        });
        child.on("close", (code) => {
          clearTimeout(timeout);
          clearInterval(flushInterval);
          if (code === 0) {
            // Always send final 100% update without throttling
            onProgress({ percent: 1 });
            resolve();
          } else {
            const detail = stderrLines.slice(-8).join(" | ");
            reject(new Error(`yt-dlp download failed (code ${code})${detail ? `: ${detail}` : ""}`));
          }
        });
      });
    },
    catch: (e) =>
      e instanceof Error
        ? e
        : new Error("Failed to download youtube video with progress"),
  });
