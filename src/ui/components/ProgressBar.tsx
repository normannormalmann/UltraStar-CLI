import { Box, Text } from "ink";
import type { FC } from "react";
import { useMemo } from "react";

type Rgb = { r: number; g: number; b: number };

const toRgb = (hex: string): Rgb => {
  const normalized = hex.replace(/^#/, "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

// Gradient colors (module-level constants for stable useMemo references)
const GRADIENT_START = toRgb("#14b8a6"); // teal
const GRADIENT_END = toRgb("#22c55e"); // green

export type ProgressBarProps = {
  value: number; // 0..1
  width?: number; // bar width in characters (defaults to 30)
};

export const ProgressBar: FC<ProgressBarProps> = ({ value, width = 30 }) => {
  const clamped = Math.max(0, Math.min(1, value ?? 0));
  const barWidth = Math.max(1, width);
  const filledBlockCount = Math.round(clamped * barWidth);
  const emptyBlockCount = Math.max(0, barWidth - filledBlockCount);

  const gradientColors: Array<{ index: number; color: string }> =
    useMemo(() => {
      const colors: Array<{ index: number; color: string }> = [];
      for (let i = 0; i < filledBlockCount; i++) {
        const t = Math.min(1, (i + 1) / barWidth);
        const r = lerp(GRADIENT_START.r, GRADIENT_END.r, t);
        const g = lerp(GRADIENT_START.g, GRADIENT_END.g, t);
        const b = lerp(GRADIENT_START.b, GRADIENT_END.b, t);
        colors.push({ index: i, color: rgbToHex(r, g, b) });
      }
      return colors;
    }, [filledBlockCount, barWidth]);

  const showAllGray = clamped === 0;

  return (
    <Box flexGrow={1} minWidth={0}>
      <Text>
        {showAllGray ? (
          <Text backgroundColor="#555555">{" ".repeat(barWidth)}</Text>
        ) : (
          <>
            {gradientColors.map(({ index, color }) => (
              <Text key={index} backgroundColor={color}>
                {" "}
              </Text>
            ))}
            {emptyBlockCount > 0 && (
              <Text backgroundColor="#555555">
                {" ".repeat(emptyBlockCount)}
              </Text>
            )}
          </>
        )}
      </Text>
    </Box>
  );
};

export default ProgressBar;
