import { FolderOpen, FolderSearch } from "lucide-react";
import type { FC } from "react";
import { useMemo, useState } from "react";
import type {
  ArchiveImportResult,
  DownloadedEntry,
} from "../../shared/ipc-contract.ts";
import CoverThumb from "../components/CoverThumb.tsx";

const importMessage = (r: ArchiveImportResult): string => {
  const parts = [`${r.imported} Songs importiert`];
  if (r.importedWithoutVideo > 0) {
    parts.push(
      `davon ${r.importedWithoutVideo} ohne Video — Reparatur ausführen, damit sie hier erscheinen`,
    );
  }
  if (r.skipped > 0) parts.push(`${r.skipped} bereits vorhanden`);
  return parts.join(" · ");
};

export const DownloadedView: FC<{ entries: DownloadedEntry[] }> = ({
  entries,
}) => {
  const [filter, setFilter] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ArchiveImportResult | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);

  const runImport = async (): Promise<void> => {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      setImportResult(await window.ultrastar.archiveImport());
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const importButton = (
    <button
      className="btn"
      type="button"
      disabled={importing}
      onClick={() => void runImport()}
    >
      <FolderSearch size={14} aria-hidden />
      {importing ? "Importiere…" : "Archiv importieren"}
    </button>
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const sorted = [...entries].sort((a, b) =>
      b.downloadedAt.localeCompare(a.downloadedAt),
    );
    if (!q) return sorted;
    return sorted.filter(
      (e) =>
        e.artist.toLowerCase().includes(q) || e.title.toLowerCase().includes(q),
    );
  }, [entries, filter]);

  return (
    <div>
      <h2>Heruntergeladen ({entries.length})</h2>
      <div className="row" style={{ marginBottom: 14 }}>
        <input
          className="input"
          style={{ width: 320 }}
          placeholder="Filtern…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {importButton}
      </div>
      {importError && <div className="error-banner">{importError}</div>}
      {importResult && <p className="muted">{importMessage(importResult)}</p>}

      {entries.length === 0 ? (
        <div style={{ marginTop: 8 }}>
          <p className="muted" style={{ maxWidth: 520 }}>
            Noch keine Einträge. Du hast bereits Songs auf der Platte?
            Importiere dein bestehendes Archiv aus dem Download-Ordner — ganz
            ohne erneute Downloads.
          </p>
          {importButton}
        </div>
      ) : filtered.length === 0 ? (
        <p className="muted">Keine Treffer für den Filter.</p>
      ) : (
        <table className="song-table">
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th>Interpret</th>
              <th>Titel</th>
              <th>Datum</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.dirName}>
                <td>
                  {/* Negative apiIds = rekonstruierte/importierte Einträge ohne USDB-Cover */}
                  {e.apiId > 0 ? (
                    <CoverThumb apiId={e.apiId} />
                  ) : (
                    <div className="cover-thumb" />
                  )}
                </td>
                <td style={{ color: "var(--green)" }}>{e.artist}</td>
                <td>{e.title}</td>
                <td className="muted">{e.downloadedAt.slice(0, 10)}</td>
                <td>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => void window.ultrastar.openFolder(e.songDir)}
                  >
                    <FolderOpen size={14} aria-hidden />
                    Ordner
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DownloadedView;
