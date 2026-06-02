import { readFile, writeFile } from "node:fs/promises";
import { Effect } from "effect";
import { resolveDataFilePath } from "./paths.ts";

export type StoredCredentials = {
  user: string;
  pass: string;
};

const FILE_NAME = "credentials.json";

const readJsonFile = (
  path: string,
): Effect.Effect<StoredCredentials | null, Error> =>
  Effect.catchAll(
    Effect.tryPromise({
      try: async () =>
        JSON.parse(await readFile(path, "utf8")) as StoredCredentials,
      catch: (e) =>
        e instanceof Error ? e : new Error("Failed to read credentials"),
    }),
    () => Effect.succeed<StoredCredentials | null>(null),
  );

const writeJsonFile = (
  path: string,
  data: unknown,
): Effect.Effect<true, Error> =>
  Effect.tryPromise({
    try: async () => {
      await writeFile(path, JSON.stringify(data, null, 2), "utf8");
      return true as const;
    },
    catch: (e) => (e instanceof Error ? e : new Error("Failed to write file")),
  });

/**
 * Validates and sanitizes credentials with runtime checks.
 * Ensures fields meet security requirements.
 */
const validateCredentials = (data: unknown): data is StoredCredentials => {
  // Type guard: check if data is an object with required fields
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const creds = data as Record<string, unknown>;

  // Check if required fields exist and are strings
  if (typeof creds.user !== "string" || typeof creds.pass !== "string") {
    return false;
  }

  // Trim whitespace
  const user = creds.user.trim();
  const pass = creds.pass.trim();

  // Validate lengths (prevent DoS with very long strings)
  const MIN_LENGTH = 1;
  const MAX_LENGTH = 255;

  if (
    user.length < MIN_LENGTH ||
    user.length > MAX_LENGTH ||
    pass.length < MIN_LENGTH ||
    pass.length > MAX_LENGTH
  ) {
    return false;
  }

  // Update the object with trimmed values
  creds.user = user;
  creds.pass = pass;

  return true;
};

export const loadCredentials: Effect.Effect<StoredCredentials | null, Error> =
  Effect.gen(function* () {
    const path = yield* resolveDataFilePath(FILE_NAME);
    const data = yield* readJsonFile(path);

    // Use runtime validation instead of type assertion
    if (validateCredentials(data)) {
      return data; // Now type-safe due to validateCredentials type guard
    }

    return null;
  });

export const saveCredentials = (
  creds: StoredCredentials,
): Effect.Effect<StoredCredentials, Error> =>
  Effect.gen(function* () {
    const path = yield* resolveDataFilePath(FILE_NAME);
    yield* writeJsonFile(path, creds);
    return creds;
  });
