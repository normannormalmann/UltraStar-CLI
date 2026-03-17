import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { Box, Text, useApp, useInput } from "ink";
import type { FC } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Page, type Song, searchSongs } from "../api/usdb/search.ts";
import {
  checkFfmpegAvailable,
  checkYtDlpAvailable,
} from "../api/youtube/check.ts";
import { ffmpegInstallHint, ytDlpInstallHint } from "../platform.ts";
import { ensureSession } from "../session.ts";
import { type AppConfig, loadConfig, saveConfig } from "../storage/config.ts";
import {
  appendDownloadedEntry,
  type DownloadedEntry,
  loadDownloadedEntries,
} from "../storage/downloaded.ts";
import DownloadedList from "./components/DownloadedList.tsx";
import HelpRow from "./components/HelpRow.tsx";
import LoadingRow from "./components/LoadingRow.tsx";
import PathSetupForm from "./components/PathSetupForm.tsx";
import ProgressBar from "./components/ProgressBar.tsx";
import SearchForm from "./components/SearchForm.tsx";
import Select from "./components/Select.tsx";
import { downloadSong } from "./downloadSong.ts";
import {
  type RepairProgress,
  type RepairResult,
  scanAndRepairVideos,
} from "./repairSongs.ts";

type Mode = "setup" | "form" | "results" | "repair";

export const App: FC = () => {
  const { exit } = useApp();

  const [mode, setMode] = useState<Mode>("setup");
  const [focusedField, setFocusedField] = useState<"artist" | "title">(
    "artist",
  );

  const [artist, setArtist] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [limit] = useState<number>(20);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const [downloadDir, setDownloadDir] = useState<string>(
    join(process.cwd(), "songs"),
  );
  const [browser, setBrowser] = useState<string>("edge");

  const [cookie, setCookie] = useState<string>("");

  const [ytAvailable, setYtAvailable] = useState<boolean | null>(null);
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);

  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeDownloads, setActiveDownloads] = useState<
    Array<{ apiId: number; artist: string; title: string; progress: number }>
  >([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadedEntries, setDownloadedEntries] = useState<DownloadedEntry[]>(
    [],
  );
  const [isFetchingAllPages, setIsFetchingAllPages] = useState<boolean>(false);
  const [allPagesFetchProgress, setAllPagesFetchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [repairProgress, setRepairProgress] = useState<RepairProgress | null>(
    null,
  );
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);

  const canPaginate = useMemo(() => totalPages > 1, [totalPages]);
  const downloadedApiIds = useMemo(
    () => new Set(downloadedEntries.map((e) => e.apiId)),
    [downloadedEntries],
  );

  const activeDownloadsRef = useRef(activeDownloads);
  activeDownloadsRef.current = activeDownloads;

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      try {
        setIsInitializing(true);
        const session = await Effect.runPromise(ensureSession);
        if (!isMounted) return;
        setCookie(session.cookie);
        const cfg = await Effect.runPromise(loadConfig).catch(
          () => null as AppConfig | null,
        );
        if (cfg?.downloadDir) setDownloadDir(cfg.downloadDir);
        if (cfg?.browser) setBrowser(cfg.browser);
        setMode(cfg?.downloadDir ? "form" : "setup");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    };
    void run();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      const ok = await Effect.runPromise(checkYtDlpAvailable);
      if (!canceled) setYtAvailable(ok);
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      const ok = await Effect.runPromise(checkFfmpegAvailable);
      if (!canceled) setFfmpegAvailable(ok);
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const entries = await Effect.runPromise(loadDownloadedEntries);
        // Filter out entries where video.mp4 no longer exists
        const valid: DownloadedEntry[] = [];
        await Promise.all(
          entries.map(async (e) => {
            try {
              await stat(join(e.songDir, "video.mp4"));
              valid.push(e);
            } catch {
              // file missing – drop silently
            }
          }),
        );
        setDownloadedEntries(valid);
        // Broken entries (missing video.mp4) are intentionally kept in downloaded.json
        // so the repair feature can retrieve their apiId for USDB lookups.
      } catch {}
    };
    void run();
  }, []);

  const fetchPage = useCallback(
    async (pageNumber: number) => {
      if (!cookie) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const pageStart = (pageNumber - 1) * limit;
        const page: Page = await Effect.runPromise(
          searchSongs(
            {
              interpret: artist.trim() || undefined,
              title: title.trim() || undefined,
              limit,
              start: pageStart,
            },
            cookie,
          ),
        );
        setSongs(page.songs);
        setSelectedIndex(0);
        setTotalPages(page.totalPages || 0);
        setCurrentPage(pageNumber);
        setMode("results");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
      } finally {
        setIsLoading(false);
      }
    },
    [artist, title, cookie, limit],
  );

  const onSubmitSearch = useCallback(() => {
    void fetchPage(1);
  }, [fetchPage]);

  const handleSetupConfirm = useCallback(
    async (dir: string, browserName: string) => {
      const trimmed = dir.trim() || join(process.cwd(), "songs");
      const trimmedBrowser = browserName.trim() || "edge";
      setDownloadDir(trimmed);
      setBrowser(trimmedBrowser);
      await Effect.runPromise(
        saveConfig({ downloadDir: trimmed, browser: trimmedBrowser }),
      ).catch(() => {});
      setMode("form");
    },
    [],
  );

  const downloadSongItem = useCallback(
    async (song: Song) => {
      if (!cookie) return;
      if (ytAvailable === false) {
        setErrorMessage("yt-dlp is not installed. Downloading is disabled.");
        return;
      }
      if (ffmpegAvailable === false) {
        setErrorMessage("ffmpeg is not installed. Downloading is disabled.");
        return;
      }
      if (activeDownloadsRef.current.some((d) => d.apiId === song.apiId))
        return;

      setErrorMessage(null);
      setActiveDownloads((prev) => [
        ...prev,
        {
          apiId: song.apiId,
          artist: song.artist,
          title: song.title,
          progress: 0,
        },
      ]);

      try {
        const result = await Effect.runPromise(
          downloadSong({
            song,
            cookie,
            baseDir: downloadDir,
            cookiesBrowser: browser,
            onProgress: (p) =>
              setActiveDownloads((prev) =>
                prev.map((d) =>
                  d.apiId === song.apiId ? { ...d, progress: p } : d,
                ),
              ),
          }),
        );
        try {
          const updated = await Effect.runPromise(
            appendDownloadedEntry({
              apiId: song.apiId,
              artist: song.artist,
              title: song.title,
              dirName: result.dirName,
              songDir: result.songDir,
              downloadedAt: new Date().toISOString(),
            }),
          );
          setDownloadedEntries(updated);
        } catch {}
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
      } finally {
        setActiveDownloads((prev) =>
          prev.filter((d) => d.apiId !== song.apiId),
        );
      }
    },
    [cookie, ytAvailable, ffmpegAvailable, downloadDir, browser],
  );

  const downloadSelectedSong = useCallback(
    async (index?: number) => {
      const song = songs[index ?? selectedIndex];
      if (!song) return;
      await downloadSongItem(song);
    },
    [songs, selectedIndex, downloadSongItem],
  );

  const downloadAllCurrentPage = useCallback(async () => {
    const toDownload = songs.filter((s) => !downloadedApiIds.has(s.apiId));
    if (toDownload.length === 0) return;
    let i = 0;
    const CONCURRENCY = 3;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, toDownload.length) },
      async () => {
        while (i < toDownload.length) {
          const song = toDownload[i++];
          if (song) await downloadSongItem(song);
        }
      },
    );
    await Promise.all(workers);
  }, [songs, downloadedApiIds, downloadSongItem]);

  const downloadAllPages = useCallback(async () => {
    if (!cookie || isFetchingAllPages) return;
    if (ytAvailable === false) {
      setErrorMessage("yt-dlp is not installed. Downloading is disabled.");
      return;
    }
    if (ffmpegAvailable === false) {
      setErrorMessage("ffmpeg is not installed. Downloading is disabled.");
      return;
    }
    setIsFetchingAllPages(true);
    setErrorMessage(null);
    try {
      const allSongs: Song[] = [];
      let page = 1;
      let totalPagesFound = Math.max(totalPages, 1);
      while (page <= totalPagesFound) {
        setAllPagesFetchProgress({ current: page, total: totalPagesFound });
        const result = await Effect.runPromise(
          searchSongs(
            {
              interpret: artist.trim() || undefined,
              title: title.trim() || undefined,
              limit,
              start: (page - 1) * limit,
            },
            cookie,
          ),
        );
        if (result.totalPages > totalPagesFound) {
          totalPagesFound = result.totalPages;
        }
        allSongs.push(...result.songs);
        page++;
      }
      setAllPagesFetchProgress(null);
      const filteredSongs = allSongs.filter(
        (s) => !downloadedApiIds.has(s.apiId),
      );
      let i = 0;
      const CONCURRENCY = 3;
      const workers = Array.from(
        { length: Math.min(CONCURRENCY, filteredSongs.length) },
        async () => {
          while (i < filteredSongs.length) {
            const song = filteredSongs[i++];
            if (song) await downloadSongItem(song);
          }
        },
      );
      await Promise.all(workers);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
    } finally {
      setIsFetchingAllPages(false);
      setAllPagesFetchProgress(null);
    }
  }, [
    cookie,
    ytAvailable,
    isFetchingAllPages,
    artist,
    title,
    limit,
    totalPages,
    downloadedApiIds,
    downloadSongItem,
    ffmpegAvailable,
  ]);

  const startRepair = useCallback(async () => {
    if (ytAvailable === false) {
      setErrorMessage("yt-dlp is not installed. Downloading is disabled.");
      return;
    }
    if (ffmpegAvailable === false) {
      setErrorMessage("ffmpeg is not installed. Downloading is disabled.");
      return;
    }
    setRepairProgress(null);
    setRepairResult(null);
    setMode("repair");
    try {
      const result = await Effect.runPromise(
        scanAndRepairVideos(downloadDir, cookie, browser, (p) =>
          setRepairProgress(p),
        ),
      );
      setRepairResult(result);
      // Reload tracking so newly repaired/rebuilt songs appear in the list
      try {
        const entries = await Effect.runPromise(loadDownloadedEntries);
        const valid: DownloadedEntry[] = [];
        await Promise.all(
          entries.map(async (e) => {
            try {
              await stat(join(e.songDir, "video.mp4"));
              valid.push(e);
            } catch {
              // file still missing – keep out of UI list
            }
          }),
        );
        setDownloadedEntries(valid);
      } catch {}
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      setMode("form");
    }
  }, [downloadDir, cookie, browser, ytAvailable, ffmpegAvailable]);

  useInput((input, key) => {
    if (key.escape) {
      if (mode === "setup") {
        exit();
        return;
      }
      if (mode === "results") {
        setMode("form");
        return;
      }
      if (mode === "repair" && repairResult !== null) {
        setMode("form");
        return;
      }
      if (mode === "form") {
        exit();
        return;
      }
    }
    if (mode === "form") {
      if (key.tab) {
        setFocusedField((prev) => (prev === "artist" ? "title" : "artist"));
        return;
      }
      if (key.return) {
        onSubmitSearch();
        return;
      }
      if (input === "v") {
        void startRepair();
        return;
      }
    } else if (mode === "results") {
      if (input === "e") {
        setMode("form");
        return;
      }
      if (input === "r") {
        void fetchPage(currentPage);
        return;
      }
      if (input === "a" && !isFetchingAllPages) {
        void downloadAllCurrentPage();
        return;
      }
      if (input === "A" && !isFetchingAllPages) {
        void downloadAllPages();
        return;
      }
      // Up/Down handled by Select component
      if (key.return && !isLoading) {
        void downloadSelectedSong();
        return;
      }
      if (key.leftArrow) {
        if (currentPage > 1) void fetchPage(currentPage - 1);
        return;
      }
      if (key.rightArrow) {
        if (totalPages > 0 && currentPage < totalPages) {
          void fetchPage(currentPage + 1);
        }
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box>
        <Text color="magentaBright" bold underline>
          UltraStar CLI
        </Text>
      </Box>

      {/* Status Row */}
      <Box flexDirection="column">
        <Text>
          <Text color="white" bold>
            Login:
          </Text>{" "}
          {cookie ? (
            <Text color="greenBright">Logged in</Text>
          ) : isInitializing ? (
            <Text color="yellow">Checking…</Text>
          ) : (
            <Text color="red">Not logged in</Text>
          )}
        </Text>
        {!isInitializing && !cookie && (
          <Text color="red">
            An unknown error occured. Please report on GitHub.
          </Text>
        )}
        <Text>
          <Text color="white" bold>
            yt-dlp:
          </Text>{" "}
          {ytAvailable == null ? (
            <Text color="yellow">Checking…</Text>
          ) : ytAvailable ? (
            <Text color="greenBright">Available</Text>
          ) : (
            <Text>
              <Text color="red">Not installed.</Text>{" "}
              <Text dimColor>
                {ytDlpInstallHint()} See
                https://github.com/yt-dlp/yt-dlp#installation
              </Text>
            </Text>
          )}
        </Text>
        {ytAvailable === false && (
          <Text>
            <Text color="red" bold>
              Downloading songs is not possible without yt-dlp.
            </Text>
          </Text>
        )}
        <Text>
          <Text color="white" bold>
            ffmpeg:
          </Text>{" "}
          {ffmpegAvailable == null ? (
            <Text color="yellow">Checking…</Text>
          ) : ffmpegAvailable ? (
            <Text color="greenBright">Available</Text>
          ) : (
            <Text>
              <Text color="red">Not installed.</Text>{" "}
              <Text dimColor>{ffmpegInstallHint()}</Text>
            </Text>
          )}
        </Text>
        {ffmpegAvailable === false && (
          <Text>
            <Text color="red" bold>
              Downloading songs is not possible without ffmpeg.
            </Text>
          </Text>
        )}
      </Box>

      {isInitializing ? (
        <LoadingRow label="Initializing session..." />
      ) : mode === "setup" ? (
        <PathSetupForm
          path={downloadDir}
          onPathChange={setDownloadDir}
          browser={browser}
          onBrowserChange={setBrowser}
          onConfirm={handleSetupConfirm}
        />
      ) : mode === "repair" ? (
        <Box flexDirection="column" gap={1}>
          {repairResult === null ? (
            <Box flexDirection="column">
              <Text color="cyan" bold>
                Scanning for missing videos...
              </Text>
              {repairProgress && (
                <Box flexDirection="column">
                  <Text>
                    <Text color="white">
                      [{repairProgress.current}/{repairProgress.total}]
                    </Text>{" "}
                    <Text color="yellow">{repairProgress.currentSong}</Text>
                  </Text>
                  {repairProgress.videoProgress != null && (
                    <Box gap={1}>
                      <ProgressBar
                        value={repairProgress.videoProgress}
                        width={30}
                      />
                      <Text dimColor>
                        {Math.round(repairProgress.videoProgress * 100)}%
                      </Text>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color="greenBright" bold>
                Repair complete!
              </Text>
              <Text>
                <Text color="white">Fixed: </Text>
                <Text color="greenBright" bold>
                  {repairResult.fixed}
                </Text>
                <Text color="white"> / {repairResult.total} songs</Text>
              </Text>
              {repairResult.rebuilt > 0 && (
                <Text>
                  <Text color="white">Rebuilt tracking: </Text>
                  <Text color="cyanBright" bold>
                    {repairResult.rebuilt}
                  </Text>
                  <Text color="white"> songs</Text>
                </Text>
              )}
              {repairResult.failed.length > 0 && (
                <Box flexDirection="column">
                  <Text color="yellow">
                    Could not fix ({repairResult.failed.length}):
                  </Text>
                  {repairResult.failed.slice(0, 10).map((name) => (
                    <Text key={name} dimColor>
                      {" "}
                      • {name}
                    </Text>
                  ))}
                  {repairResult.failed.length > 10 && (
                    <Text dimColor>
                      {" "}
                      ... and {repairResult.failed.length - 10} more
                    </Text>
                  )}
                </Box>
              )}
              <Text dimColor>Esc: back to search</Text>
            </Box>
          )}
        </Box>
      ) : (
        <>
          {mode === "form" && (
            <SearchForm
              artist={artist}
              title={title}
              focusedField={focusedField}
              setArtist={setArtist}
              setTitle={setTitle}
            />
          )}

          {mode === "results" && (
            <Box flexDirection="row">
              <Box flexDirection="column" width={"50%"}>
                {isLoading ? (
                  <LoadingRow label="Searching..." />
                ) : (
                  <>
                    {songs.length === 0 ? (
                      <Text color="yellow">No results.</Text>
                    ) : (
                      <Select
                        options={songs.map((s, i) => ({
                          label: (
                            <Text>
                              {downloadedApiIds.has(s.apiId) && (
                                <Text color="greenBright">✓ </Text>
                              )}
                              <Text color="yellowBright">{s.artist}</Text>
                              <Text color="gray"> - </Text>
                              <Text color="cyanBright">{s.title}</Text>
                              {s.languages.length > 0 && (
                                <Text>
                                  {" "}
                                  <Text color="gray">[</Text>
                                  <Text color="magentaBright">
                                    {s.languages.join(", ")}
                                  </Text>
                                  <Text color="gray">]</Text>
                                </Text>
                              )}
                            </Text>
                          ),
                          value: String(i),
                        }))}
                        onChange={(v: string) => {
                          const idx = Number(v);
                          setSelectedIndex(idx);
                        }}
                        visibleOptionCount={20}
                        value={String(selectedIndex)}
                      />
                    )}
                    <Box>
                      <Text>
                        <Text color="white" bold>
                          Page
                        </Text>{" "}
                        <Text color="cyanBright" bold>
                          {totalPages === 0 ? 0 : currentPage}
                        </Text>{" "}
                        <Text color="white" bold>
                          of
                        </Text>{" "}
                        <Text color="cyanBright" bold>
                          {totalPages}
                        </Text>
                      </Text>
                    </Box>
                    {canPaginate && (
                      <Text dimColor>Use ←/→ to navigate pages</Text>
                    )}
                    {isFetchingAllPages && (
                      <Text color="cyan">
                        {allPagesFetchProgress
                          ? `Fetching pages... (${allPagesFetchProgress.current}/${allPagesFetchProgress.total})`
                          : "Preparing bulk download..."}
                      </Text>
                    )}
                  </>
                )}
              </Box>
              <Box flexDirection="column" width={"40%"}>
                <DownloadedList
                  entries={downloadedEntries}
                  currentDownloading={activeDownloads.map((d) => ({
                    artist: d.artist,
                    title: d.title,
                    progress: d.progress,
                  }))}
                />
              </Box>
            </Box>
          )}

          {errorMessage && (
            <Text>
              <Text color="red" bold>
                Error:
              </Text>{" "}
              <Text color="red">{errorMessage}</Text>
            </Text>
          )}

          <HelpRow
            mode={mode}
            canDownload={ytAvailable !== false && ffmpegAvailable !== false}
          />
        </>
      )}
    </Box>
  );
};

export default App;
