import { Box, Text } from "ink";
import type { FC } from "react";

export type Mode = "form" | "results";

export type Props = {
  mode: Mode;
  canDownload?: boolean;
};

export const HelpRow: FC<Props> = ({ mode, canDownload }) => {
  if (mode === "form") {
    return (
      <Text>
        <Text color="white" bold>
          Tips:
        </Text>{" "}
        <Text dimColor>
          Tab: switch field • Enter: search
          {canDownload ? " • Ctrl+v: repair videos" : ""} • Ctrl+s: setup • Esc:
          quit
        </Text>
      </Text>
    );
  }
  return (
    <Box>
      <Text color="white" bold>
        Tips:
      </Text>
      <Text>{" "}</Text>
      {canDownload ? (
        <Box flexDirection="column">
          <Text dimColor>
            ↑/↓: select • Enter: download • Ctrl+q: queue song • Ctrl+a: queue page
          </Text>
          <Text dimColor>
            Ctrl+p: queue all • Ctrl+d: start queue • ←/→: page • Ctrl+e: edit search
          </Text>
          <Text dimColor>
            Ctrl+r: refresh • Esc: back
          </Text>
        </Box>
      ) : (
        <Text dimColor>
          ↑/↓: select • ←/→: page • Ctrl+e: edit search • Ctrl+r: refresh • Esc: back
        </Text>
      )}
    </Box>
  );
};

export default HelpRow;
