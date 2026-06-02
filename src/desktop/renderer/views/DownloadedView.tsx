import { FolderOpen, FolderSearch } from "lucide-react";
import type { FC } from "react";
import { useMemo, useState } from "react";
import type {
  ArchiveImportResult,
  DownloadedEntry,
} from "../../shared/ipc-contract.ts";
import CoverThumb from "../components/CoverThumb.tsx";
import { useIpcEvent } from "../hooks.ts";

const importMessage = (r: ArchiveImportResult): string => {
  const parts = [`${r.imported} Songs importiert`];
  if (r.importedWithoutVideo > 0) {
    parts.push(
      `davon ${r.importedWithoutVideo} ohne Video — Reparatur ausführen, damit sie hier erscheinen`,
    );
  }
  if (r.skipped > 0) parts.push(`${r.skipped} bereits vorhanden`);
  if (r.refreshed > 0) {
    parts.push(`${r.refreshed} Einträge um Metadaten ergänzt`);
  }
  return parts.join(" · ");
};

export const DownloadedView: FC<{ entries: DownloadedEntry[] }> = ({
  entries,
}) => {
  const importProgress = useIpcEvent("event:archiveImportProgress", null);
  const [filter, setFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
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

  const languageOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const key = e.language ?? "Unbekannt";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const genreOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const key = e.genre ?? "Unbekannt";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const from = yearFrom ? Number.parseInt(yearFrom, 10) : null;
    const to = yearTo ? Number.parseInt(yearTo, 10) : null;
    const sorted = [...entries].sort((a, b) =>
      b.downloadedAt.localeCompare(a.downloadedAt),
    );
    return sorted.filter((e) => {
      if (
        q &&
        !e.artist.toLowerCase().includes(q) &&
        !e.title.toLowerCase().includes(q)
      )
        return false;
      if (langFilter && (e.language ?? "Unbekannt") !== langFilter)
        return false;
      if (genreFilter && (e.genre ?? "Unbekannt") !== genreFilter) return false;
      if (from !== null && (e.year === undefined || e.year < from))
        return false;
      if (to !== null && (e.year === undefined || e.year > to)) return false;
      return true;
    });
  }, [entries, filter, langFilter, genreFilter, yearFrom, yearTo]);

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
        <select
          className="input"
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
        >
          <option value="">Sprache: Alle</option>
          {languageOptions.map(([lang, count]) => (
            <option key={lang} value={lang}>
              {lang} ({count.toLocaleString("de-DE")})
            </option>
          ))}
        </select>
        <select
          className="input"
          value={genreFilter}
          onChange={(e) => setGenreFilter(e.target.value)}
        >
          <option value="">Genre: Alle</option>
          {genreOptions.map(([g, count]) => (
            <option key={g} value={g}>
              {g} ({count.toLocaleString("de-DE")})
            </option>
          ))}
        </select>
        <input
          className="input"
          style={{ width: 90 }}
          type="number"
          placeholder="Jahr von"
          value={yearFrom}
          onChange={(e) => setYearFrom(e.target.value)}
        />
        <input
          className="input"
          style={{ width: 90 }}
          type="number"
          placeholder="bis"
          value={yearTo}
          onChange={(e) => setYearTo(e.target.value)}
        />
        {importButton}
      </div>
      {(langFilter || genreFilter || yearFrom || yearTo || filter) && (
        <p className="muted">
          {filtered.length.toLocaleString("de-DE")} Treffer
        </p>
      )}
      {importError && <div className="error-banner">{importError}</div>}
      {importResult && <p className="muted">{importMessage(importResult)}</p>}
      {importProgress && (
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="muted">
            Scanne Archiv… ({importProgress.current.toLocaleString("de-DE")}/
            {importProgress.total.toLocaleString("de-DE")})
          </span>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${Math.round((importProgress.current / Math.max(importProgress.total, 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

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
        <>
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
              {filtered.slice(0, 500).map((e) => (
                <tr key={e.dirName}>
                  <td>
                    <CoverThumb apiId={e.apiId} songDir={e.songDir} />
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
          {filtered.length > 500 && (
            <p className="muted">
              … und {(filtered.length - 500).toLocaleString("de-DE")} weitere —
              nutze den Filter.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default DownloadedView;
