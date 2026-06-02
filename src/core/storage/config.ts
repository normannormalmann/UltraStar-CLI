import { readFile, writeFile } from "node:fs/promises";
import { Effect } from "effect";
import { resolveDataFilePath } from "./paths.ts";

export type AppConfig = { downloadDir: string; browser: string };
const FILE_NAME = "config.json";

export const loadConfig: Effect.Effect<AppConfig | null, Error> = Effect.gen(
  function* () {
    const path = yield* resolveDataFilePath(FILE_NAME);
    return yield* Effect.catchAll(
      Effect.tryPromise({
        try: async () => JSON.parse(await readFile(path, "utf8")) as AppConfig,
        catch: (e) =>
          e instanceof Error ? e : new Error("Failed to read config"),
      }),
      () => Effect.succeed(null),
    );
  },
);

export const saveConfig = (
  config: AppConfig,
): Effect.Effect<AppConfig, Error> =>
  Effect.gen(function* () {
    const path = yield* resolveDataFilePath(FILE_NAME);
    yield* Effect.tryPromise({
      try: async () => writeFile(path, JSON.stringify(config, null, 2), "utf8"),
      catch: (e) =>
        e instanceof Error ? e : new Error("Failed to write config"),
    });
    return config;
  });
