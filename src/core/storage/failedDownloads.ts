import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { API_URL } from "../api/usdb/config.ts";

export type FailedDownload = {
  apiId: number;
  artist: string;
  title: string;
  error: string;
  usdbUrl: string;
  timestamp: string;
};

const TXT_FILE = "failed-downloads.txt";
const XLSX_FILE = "failed-downloads.xlsx";

const formatEntry = (entry: FailedDownload): string => {
  const lines = [
    `[${entry.timestamp}]`,
    `  Song:  ${entry.artist} - ${entry.title}`,
    `  USDB:  ${entry.usdbUrl}`,
    `  Error: ${entry.error}`,
    "",
  ];
  return lines.join("\n");
};

const createEntry = (
  song: { apiId: number; artist: string; title: string },
  error: string,
): FailedDownload => ({
  apiId: song.apiId,
  artist: song.artist,
  title: song.title,
  error,
  usdbUrl: `${API_URL}/?link=detail&id=${song.apiId}`,
  timestamp: new Date().toISOString(),
});

const writeExcel = async (
  filePath: string,
  entries: FailedDownload[],
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UltraStar CLI";

  const sheet = workbook.addWorksheet("Failed Downloads", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Datum", key: "timestamp", width: 22 },
    { header: "Artist", key: "artist", width: 25 },
    { header: "Titel", key: "title", width: 35 },
    { header: "USDB Link", key: "usdbUrl", width: 50 },
    { header: "Fehler", key: "error", width: 60 },
    { header: "API ID", key: "apiId", width: 10 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { vertical: "middle" };

  for (const entry of entries) {
    const row = sheet.addRow({
      timestamp: entry.timestamp.replace("T", " ").replace(/\.\d+Z$/, ""),
      artist: entry.artist,
      title: entry.title,
      usdbUrl: entry.usdbUrl,
      error: entry.error,
      apiId: entry.apiId,
    });

    // Make USDB URL a clickable hyperlink
    const urlCell = row.getCell("usdbUrl");
    urlCell.value = {
      text: entry.usdbUrl,
      hyperlink: entry.usdbUrl,
    } as ExcelJS.CellHyperlinkValue;
    urlCell.font = { color: { argb: "FF0563C1" }, underline: true };
  }

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 6 },
  };

  await workbook.xlsx.writeFile(filePath);
};

let pendingEntries: FailedDownload[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let flushPromise = Promise.resolve();

export const appendFailedDownload = async (
  downloadDir: string,
  song: { apiId: number; artist: string; title: string },
  error: string,
): Promise<void> => {
  const entry = createEntry(song, error);

  // Append to text log immediately
  const txtPath = join(downloadDir, TXT_FILE);
  await appendFile(txtPath, formatEntry(entry), "utf8");

  pendingEntries.push(entry);

  if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushTimeout = null;
      const entriesToFlush = pendingEntries;
      pendingEntries = [];

      flushPromise = flushPromise.then(async () => {
        if (entriesToFlush.length === 0) return;
        try {
          const xlsxPath = join(downloadDir, XLSX_FILE);
          const existing = await loadExistingEntries(xlsxPath);
          existing.push(...entriesToFlush);
          await writeExcel(xlsxPath, existing);
        } catch (e) {
          console.error("Failed to write Excel file:", e);
        }
      });
    }, 2000);
  }
};

const loadExistingEntries = async (
  xlsxPath: string,
): Promise<FailedDownload[]> => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxPath);
    const sheet = workbook.getWorksheet("Failed Downloads");
    if (!sheet) return [];

    const entries: FailedDownload[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      entries.push({
        timestamp: String(row.getCell("timestamp").value ?? ""),
        artist: String(row.getCell("artist").value ?? ""),
        title: String(row.getCell("title").value ?? ""),
        usdbUrl: String(
          (row.getCell("usdbUrl").value as ExcelJS.CellHyperlinkValue)?.text ??
            row.getCell("usdbUrl").value ??
            "",
        ),
        error: String(row.getCell("error").value ?? ""),
        apiId: Number(row.getCell("apiId").value ?? 0),
      });
    });
    return entries;
  } catch {
    return [];
  }
};

export const getFailedDownloadsPath = (downloadDir: string): string =>
  join(downloadDir, XLSX_FILE);

export const countFailedDownloads = async (
  downloadDir: string,
): Promise<number> => {
  try {
    const content = await readFile(join(downloadDir, TXT_FILE), "utf8");
    return (content.match(/^\[/gm) || []).length;
  } catch {
    return 0;
  }
};
