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
        <Text dimColor>
          ↑/↓: select • Enter: download • Ctrl+a: all on page • Ctrl+p: all pages • ←/→:
          page • Ctrl+e: edit search • Ctrl+r: refresh • Esc: back
        </Text>
      ) : (
        <Text dimColor>
          ↑/↓: select • ←/→: page • Ctrl+e: edit search • Ctrl+r: refresh • Esc: back
        </Text>
      )}
    </Box>
  );
};

export default HelpRow;
