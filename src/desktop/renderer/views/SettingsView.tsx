import type { FC } from "react";
import { useEffect, useState } from "react";
import { Check, Download, RefreshCw } from "lucide-react";
import type {
  AppConfig,
  BinariesStatus,
} from "../../shared/ipc-contract.ts";
import { useIpcEvent } from "../hooks.ts";

const BROWSERS = [
  "edge",
  "chrome",
  "firefox",
  "brave",
  "chromium",
  "opera",
  "vivaldi",
] as const;

const sourceLabel = (s: "system" | "managed" | "missing"): string =>
  s === "system" ? "System" : s === "managed" ? "App-verwaltet" : "fehlt";

export const SettingsView: FC<{
  initialConfig: AppConfig | null;
  version: string;
}> = ({ initialConfig, version }) => {
  const [downloadDir, setDownloadDir] = useState(
    initialConfig?.downloadDir ?? "",
  );
  const [browser, setBrowser] = useState(initialConfig?.browser ?? "edge");
  const [saved, setSaved] = useState(false);
  const [binaries, setBinaries] = useState<BinariesStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    void window.ultrastar.binariesStatus().then(setBinaries);
    // Live-Updates (z.B. nach Erststart-Auto-Install im Main-Prozess)
    return window.ultrastar.on("event:binariesStatus", setBinaries);
  }, []);

  const binariesProgress = useIpcEvent("event:binariesProgress", null);

  const choose = async (): Promise<void> => {
    const dir = await window.ultrastar.chooseDirectory();
    if (dir) setDownloadDir(dir);
  };

  const save = async (): Promise<void> => {
    await window.ultrastar.settingsSave({ downloadDir, browser });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const install = async (force: boolean): Promise<void> => {
    setInstalling(true);
    setInstallError(null);
    try {
      await window.ultrastar.binariesInstall(force);
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const anythingMissing =
    binaries !== null &&
    (binaries.ytDlp === "missing" || binaries.ffmpeg === "missing");
  const anythingManaged =
    binaries !== null &&
    (binaries.ytDlp === "managed" || binaries.ffmpeg === "managed");

  return (
    <div>
      <h2>Einstellungen</h2>

      <h3>Download-Ordner</h3>
      <div className="row" style={{ marginBottom: 18 }}>
        <input
          className="input"
          style={{ flex: 1, maxWidth: 520 }}
          value={downloadDir}
          onChange={(e) => setDownloadDir(e.target.value)}
          placeholder="z.B. D:\Karaoke\songs"
        />
        <button className="btn" type="button" onClick={() => void choose()}>
          Durchsuchen…
        </button>
      </div>

      <h3>Browser für YouTube-Cookies</h3>
      <p className="muted" style={{ maxWidth: 560 }}>
        yt-dlp nutzt die Cookies dieses Browsers, um YouTube-Bot-Schutz zu
        umgehen. Du solltest dort in YouTube eingeloggt sein.
      </p>
      <select
        className="input"
        style={{ width: 240, marginBottom: 18 }}
        value={browser}
        onChange={(e) => setBrowser(e.target.value)}
      >
        {BROWSERS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <div className="row" style={{ marginBottom: 28 }}>
        <button className="btn primary" type="button" onClick={() => void save()}>
          Speichern
        </button>
        {saved && (
          <span className="check row-inline">
            <Check size={14} aria-hidden /> gespeichert
          </span>
        )}
      </div>

      <h3>Tools</h3>
      {binaries === null ? (
        <p className="muted">Prüfe…</p>
      ) : (
        <>
          <p>
            yt-dlp: <strong>{sourceLabel(binaries.ytDlp)}</strong> · ffmpeg:{" "}
            <strong>{sourceLabel(binaries.ffmpeg)}</strong>
          </p>
          <div className="row">
            {anythingMissing && (
              <button
                className="btn primary"
                type="button"
                disabled={installing}
                onClick={() => void install(false)}
              >
                {installing ? (
                  "Installiere…"
                ) : (
                  <>
                    <Download size={14} aria-hidden />
                    Fehlende Tools automatisch installieren
                  </>
                )}
              </button>
            )}
            {anythingManaged && (
              <button
                className="btn"
                type="button"
                disabled={installing}
                onClick={() => void install(true)}
              >
                {installing ? (
                  "Aktualisiere…"
                ) : (
                  <>
                    <RefreshCw size={14} aria-hidden />
                    Jetzt aktualisieren
                  </>
                )}
              </button>
            )}
          </div>
          {anythingMissing && (
            <p className="muted">
              Manuelle Alternative:{" "}
              <a href="https://github.com/yt-dlp/yt-dlp#installation">yt-dlp</a>{" "}
              · <a href="https://www.gyan.dev/ffmpeg/builds/">ffmpeg</a>{" "}
              installieren und in den PATH aufnehmen, dann App neu starten.
            </p>
          )}
          {binariesProgress && (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">{binariesProgress.name}</span>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.round(binariesProgress.percent * 100)}%` }}
                />
              </div>
            </div>
          )}
          {installError && <div className="error-banner">{installError}</div>}
        </>
      )}

      <h3 style={{ marginTop: 28 }}>App</h3>
      <p className="muted">UltraStar Desktop v{version}</p>
    </div>
  );
};

export default SettingsView;
