import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import envPaths from "env-paths";

/**
 * Get the app name from environment variable or use default.
 * This allows users to customize the app name for different configurations.
 */
const getAppName = (): string => {
  // Check environment variable first
  const envAppName = process.env.ULTRASTAR_APP_NAME || process.env.APP_NAME;
  if (envAppName && envAppName.trim().length > 0) {
    return envAppName.trim();
  }

  // Default app name
  return "ultrastar-cli";
};

export const getCacheDir = (
  appName?: string,
): Effect.Effect<string, Error, never> =>
  Effect.tryPromise({
    try: async () => {
      // Use provided appName, or get from environment/default
      const finalAppName = appName ?? getAppName();
      const paths = envPaths(finalAppName, { suffix: "" });
      const dir = paths.cache;
      await mkdir(dir, { recursive: true });
      return dir;
    },
    catch: (e) =>
      e instanceof Error ? e : new Error("Failed to ensure cache dir"),
  });

export const resolveDataFilePath = (
  fileName: string,
): Effect.Effect<string, Error, never> =>
  Effect.gen(function* () {
    const dir = yield* getCacheDir();
    return join(dir, fileName);
  });
