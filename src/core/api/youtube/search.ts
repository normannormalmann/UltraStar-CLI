import { spawn } from "node:child_process";
import { Effect } from "effect";

const SEARCH_TIMEOUT_MS = 60_000; // 1 minute timeout for search

export type YoutubeThumbnail = {
  url: string;
  id?: string;
  height?: number;
  width?: number;
};

export type YoutubeVideo = {
  id: string;
  url: string;
  title: string;
  description: null;
  duration: number;
  channel_id: string;
  channel: string;
  channel_url: string;
  thumbnails: YoutubeThumbnail[];
  view_count: number;
  channel_is_verified: boolean;
};

/**
 * Search youtube videos using yt-dlp and parse JSONL output.
 */
export const searchYoutubeVideos = (
  search: string,
): Effect.Effect<YoutubeVideo[], Error, never> =>
  Effect.tryPromise({
    try: async () => {
      const args = [
        "--match-filters",
        "original_url!*=/shorts/",
        `ytsearch5:${search}`,
        "--flat-playlist",
        "-j",
        "--no-simulate",
      ];

      const result = await new Promise<string>((resolve, reject) => {
        const child = spawn("yt-dlp", args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          reject(
            new Error(`yt-dlp search timed out after ${SEARCH_TIMEOUT_MS}ms`),
          );
        }, SEARCH_TIMEOUT_MS);

        let stdout = "";
        let stderr = "";
        const MAX_STDERR_LENGTH = 8192;

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk as string;
        });
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => {
          if (stderr.length < MAX_STDERR_LENGTH) {
            stderr += chunk as string;
          }
        });
        child.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        child.on("close", (code) => {
          clearTimeout(timeout);
          if (code === 0) resolve(stdout);
          else
            reject(
              new Error(
                `yt-dlp search failed (code ${code}): ${stderr.trim()}`,
              ),
            );
        });
      });

      // Parse and validate JSON with security measures
      const lines = result.split("\n").filter(Boolean);
      const MAX_RESULTS = 10; // We search for 5, but allow some margin

      // Validate array length to prevent memory exhaustion attacks
      if (lines.length > MAX_RESULTS) {
        throw new Error(
          `Too many search results: ${lines.length} (max: ${MAX_RESULTS})`,
        );
      }

      const json = `[${lines.join(",")}]`;

      // Parse with reviver to prevent prototype pollution
      const parsed = JSON.parse(json, (key, value) => {
        // Block dangerous keys that could modify prototype
        if (
          key === "__proto__" ||
          key === "constructor" ||
          key === "prototype"
        ) {
          return undefined;
        }
        return value;
      }) as unknown[];

      // Validate each result has required fields
      const validated = parsed
        .filter((item): item is YoutubeVideo => {
          // Type guard: check if item has required fields
          return (
            typeof item === "object" &&
            item !== null &&
            "id" in item &&
            "title" in item &&
            "url" in item &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            typeof item.url === "string"
          );
        })
        .slice(0, 5); // Limit to 5 results as intended

      return validated;
    },
    catch: (e) =>
      e instanceof Error ? e : new Error("Failed to search youtube"),
  });
