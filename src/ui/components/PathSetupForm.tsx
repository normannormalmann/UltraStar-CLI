import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { FC } from "react";
import { useState } from "react";

type Props = {
  path: string;
  onPathChange: (v: string) => void;
  browser: string;
  onBrowserChange: (v: string) => void;
  onConfirm: (path: string, browser: string) => void;
};

export const PathSetupForm: FC<Props> = ({ path, onPathChange, browser, onBrowserChange, onConfirm }) => {
  const [focused, setFocused] = useState<"path" | "browser">("path");

  useInput((_input, key) => {
    if (key.tab) {
      setFocused((prev) => (prev === "path" ? "browser" : "path"));
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="white" bold>Setup</Text>
      <Box gap={1}>
        <Box width={12}><Text bold>Directory:</Text></Box>
        <TextInput
          value={path}
          onChange={onPathChange}
          onSubmit={() => setFocused("browser")}
          focus={focused === "path"}
          placeholder="e.g. C:\Users\...\UltraStar\songs"
        />
      </Box>
      <Box gap={1}>
        <Box width={12}><Text bold>Browser:</Text></Box>
        <TextInput
          value={browser}
          onChange={onBrowserChange}
          onSubmit={(v) => onConfirm(path, v)}
          focus={focused === "browser"}
          placeholder="edge, chrome, firefox, brave..."
        />
      </Box>
      <Text dimColor>Tab: switch field • Enter: confirm • Esc: quit</Text>
    </Box>
  );
};

export default PathSetupForm;
