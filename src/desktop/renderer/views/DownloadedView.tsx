import type { FC } from "react";
import { useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import type { DownloadedEntry } from "../../shared/ipc-contract.ts";
import CoverThumb from "../components/CoverThumb.tsx";

export const DownloadedView: FC<{ entries: DownloadedEntry[] }> = ({
  entries,
}) => {
  const [filter, setFilter] = useState("");

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
      <input
        className="input"
        style={{ width: 320, marginBottom: 14 }}
        placeholder="Filtern…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="muted">Keine Einträge.</p>
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
              <tr key={e.apiId}>
                <td>
                  {/* Negative apiIds = rekonstruierte Einträge ohne USDB-Cover */}
                  {e.apiId > 0 ? (
                    <CoverThumb apiId={e.apiId} />
                  ) : (
                    <div className="cover-thumb" />
                  )}
                </td>
                <td style={{ color: "var(--green)" }}>{e.artist}</td>
                <td>{e.title}</td>
                <td className="muted">
                  {e.downloadedAt.slice(0, 10)}
                </td>
                <td>
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => void window.ultrastar.openFolder(e.songDir)}
                  >
                    <FolderOpen size={14} aria-hidden />Ordner
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
