import { existsSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { FC } from "react";
import { useMemo, useState } from "react";

const VALID_BROWSERS = [
  "chrome",
  "chromium",
  "brave",
  "edge",
  "firefox",
  "opera",
  "vivaldi",
  "safari",
];

type Props = {
  path: string;
  onPathChange: (v: string) => void;
  browser: string;
  onBrowserChange: (v: string) => void;
  onConfirm: (path: string, browser: string) => void;
};

const isCookieFilePath = (val: string): boolean =>
  val.includes("\\") || val.includes("/");

export const PathSetupForm: FC<Props> = ({
  path,
  onPathChange,
  browser,
  onBrowserChange,
  onConfirm,
}) => {
  const [focused, setFocused] = useState<"path" | "browser">("path");

  const pathHint = useMemo(() => {
    if (!path.trim()) return null;
    const resolved = resolve(path.trim());
    if (!existsSync(resolved)) {
      return { text: "Directory will be created", color: "yellow" as const };
    }
    return { text: "Directory exists", color: "green" as const };
  }, [path]);

  const cookiesHint = useMemo(() => {
    const val = browser.trim();
    if (!val) return null;

    if (isCookieFilePath(val)) {
      // File path mode
      try {
        const resolved = resolve(val);
        if (existsSync(resolved) && lstatSync(resolved).isFile()) {
          return { text: "File found", color: "green" as const };
        }
        return { text: "File not found", color: "red" as const };
      } catch {
        return { text: "Invalid path", color: "red" as const };
      }
    }

    // Browser name mode
    const normalized = val.toLowerCase().replace(/\+$/, "");
    if (!VALID_BROWSERS.includes(normalized)) {
      return {
        text: `Unknown browser (${VALID_BROWSERS.join(", ")})`,
        color: "red" as const,
      };
    }
    return null;
  }, [browser]);

  // Auto-detect cookies.txt in common locations
  const detectedCookiesTxt = useMemo(() => {
    const candidates = [
      join(process.cwd(), "cookies.txt"),
      join(path.trim() || ".", "cookies.txt"),
    ];
    for (const c of candidates) {
      try {
        const resolved = resolve(c);
        if (existsSync(resolved) && lstatSync(resolved).isFile()) {
          return resolved;
        }
      } catch {
        // skip
      }
    }
    return null;
  }, [path]);

  useInput((_input, key) => {
    if (key.tab) {
      setFocused((prev) => (prev === "path" ? "browser" : "path"));
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="white" bold>
        Setup
      </Text>
      <Box gap={1}>
        <Box width={12}>
          <Text bold>Directory:</Text>
        </Box>
        <TextInput
          value={path}
          onChange={onPathChange}
          onSubmit={() => setFocused("browser")}
          focus={focused === "path"}
          placeholder="e.g. C:\Users\...\UltraStar\songs"
        />
        {pathHint && <Text color={pathHint.color}> ({pathHint.text})</Text>}
      </Box>
      <Box gap={1}>
        <Box width={12}>
          <Text bold>Cookies:</Text>
        </Box>
        <TextInput
          value={browser}
          onChange={onBrowserChange}
          onSubmit={(v) => onConfirm(path, v)}
          focus={focused === "browser"}
          placeholder="browser name OR path to cookies.txt"
        />
        {cookiesHint && (
          <Text color={cookiesHint.color}> ({cookiesHint.text})</Text>
        )}
      </Box>
      <Text dimColor>
        Cookies: browser name (edge, chrome, firefox) or path to cookies.txt
      </Text>
      {detectedCookiesTxt && !isCookieFilePath(browser.trim()) && (
        <Text color="cyan">Tip: cookies.txt found at {detectedCookiesTxt}</Text>
      )}
      <Text dimColor>Tab: switch field • Enter: confirm • Esc: quit</Text>
    </Box>
  );
};

export default PathSetupForm;
