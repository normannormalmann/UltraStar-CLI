import { Check, ChevronLeft, ChevronRight, Database, Download, Plus } from "lucide-react";
import type { FC, FormEvent } from "react";
import { useMemo, useState } from "react";
import type {
  AppStatus,
  DownloadedEntry,
  Song,
} from "../../shared/ipc-contract.ts";
import CoverThumb from "../components/CoverThumb.tsx";
import { useIpcEvent } from "../hooks.ts";

export const SearchView: FC<{
  downloaded: DownloadedEntry[];
  status: AppStatus;
}> = ({ downloaded, status }) => {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const fetchAllProgress = useIpcEvent("event:fetchAllProgress", null);
  const downloadedIds = useMemo(
    () => new Set(downloaded.map((e) => e.apiId)),
    [downloaded],
  );
  const canDownload =
    status.ytDlpAvailable !== false && status.ffmpegAvailable !== false;
  const bulkRunning = fetchAllProgress !== null;

  const fetchPage = async (p: number): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.ultrastar.search({ artist, title, page: p });
      setSongs(result.songs);
      setTotalPages(result.totalPages);
      setPage(p);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    void fetchPage(1);
  };

  const queueEntireDatabase = (): void => {
    if (
      window.confirm(
        "Wirklich die GESAMTE USDB-Datenbank in die Queue laden? Das sind zehntausende Songs und dauert eine Weile.",
      )
    ) {
      void window.ultrastar.queueEntireDatabase();
    }
  };

  return (
    <div>
      <h2>Suche</h2>
      <form className="row" style={{ marginBottom: 16 }} onSubmit={onSubmit}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Interpret…"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
        />
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Titel…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Suche…" : "Suchen"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {searched && !loading && songs.length === 0 && (
        <p className="muted">Keine Treffer.</p>
      )}

      {songs.length > 0 && (
        <>
          <table className="song-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Interpret</th>
                <th>Titel</th>
                <th>Sprachen</th>
                <th style={{ width: 170 }} />
              </tr>
            </thead>
            <tbody>
              {songs.map((s) => {
                const isDownloaded = downloadedIds.has(s.apiId);
                return (
                  <tr key={s.apiId}>
                    <td>
                      <CoverThumb apiId={s.apiId} />
                    </td>
                    <td style={{ color: "var(--yellow)" }}>{s.artist}</td>
                    <td>
                      {s.title}{" "}
                      {isDownloaded && (
                        <span className="check" title="bereits heruntergeladen">
                          <Check size={14} aria-hidden />
                        </span>
                      )}
                    </td>
                    <td>
                      {s.languages.map((l) => (
                        <span key={l} className="tag">
                          {l}
                        </span>
                      ))}
                    </td>
                    <td>
                      {!isDownloaded && (
                        <span className="row">
                          <button
                            className="btn small primary"
                            type="button"
                            disabled={!canDownload}
                            onClick={() =>
                              void window.ultrastar.downloadSingle(s)
                            }
                          >
                            <Download size={14} aria-hidden />
                          </button>
                          <button
                            className="btn small"
                            type="button"
                            onClick={() => void window.ultrastar.queueAdd([s])}
                          >
                            <Plus size={14} aria-hidden />Queue
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
            <span className="row">
              <button
                className="btn small"
                type="button"
                onClick={() => void window.ultrastar.queueAdd(songs)}
              >
                <Plus size={14} aria-hidden />Seite in Queue
              </button>
              <button
                className="btn small"
                type="button"
                disabled={bulkRunning}
                onClick={() =>
                  void window.ultrastar.queueFetchAllPages({ artist, title })
                }
              >
                <Plus size={14} aria-hidden />Alle {totalPages} Seiten
              </button>
            </span>
            <span className="row">
              <button
                className="btn small"
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => void fetchPage(page - 1)}
              >
                <ChevronLeft size={14} aria-hidden />
              </button>
              <span className="muted">
                Seite {totalPages === 0 ? 0 : page} / {totalPages}
              </span>
              <button
                className="btn small"
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => void fetchPage(page + 1)}
              >
                <ChevronRight size={14} aria-hidden />
              </button>
            </span>
          </div>
        </>
      )}

      <div style={{ marginTop: 20 }}>
        <button
          className="btn"
          type="button"
          disabled={bulkRunning}
          onClick={queueEntireDatabase}
        >
          <Database size={16} aria-hidden />Ganze Datenbank in Queue
        </button>
        {fetchAllProgress && (
          <p className="muted">
            Lade Seiten… ({fetchAllProgress.current}/{fetchAllProgress.total})
          </p>
        )}
      </div>
    </div>
  );
};

export default SearchView;
