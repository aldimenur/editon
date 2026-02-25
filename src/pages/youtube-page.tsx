import { open } from "@tauri-apps/plugin-dialog";
import {
  Download,
  FolderOpen,
  Link2,
  ListVideo,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  queueYoutubeDownload,
  probeYoutube,
  type YtdlpProbeResult,
} from "@/features/youtube";
import { useAssetsStore } from "@/features/assets";
import {
  getDependenciesStatus,
  installDependencies,
  updateDependencies,
  type DependencyStatus,
} from "@/features/system/api/system-api";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Progress } from "@/shared/ui/progress";
import { StatusText } from "@/shared/ui/status-text";

function formatDuration(seconds: number | null): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return "-";
  }
  const whole = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function YoutubePage() {
  const { scanRoots, refreshScanRoots } = useAssetsStore();

  const [url, setUrl] = useState("");
  const [destinationPath, setDestinationPath] = useState("");
  const [selectedRootPath, setSelectedRootPath] = useState("");
  const [mode, setMode] = useState<"video" | "audio">("video");
  const [format, setFormat] = useState("");
  const [filenameTemplate, setFilenameTemplate] = useState(
    "%(title).200B [%(id)s].%(ext)s",
  );
  const [audioFormat, setAudioFormat] = useState("mp3");
  const [audioQuality, setAudioQuality] = useState("0");
  const [noPlaylist, setNoPlaylist] = useState(true);
  const [embedThumbnail, setEmbedThumbnail] = useState(false);
  const [embedMetadata, setEmbedMetadata] = useState(false);
  const [writeSubtitles, setWriteSubtitles] = useState(false);
  const [writeThumbnail, setWriteThumbnail] = useState(false);

  const [probeResult, setProbeResult] = useState<YtdlpProbeResult | null>(null);
  const [dependencies, setDependencies] = useState<DependencyStatus | null>(
    null,
  );
  const [depsLoading, setDepsLoading] = useState(false);
  const [probeLoading, setProbeLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [statusText, setStatusText] = useState("Ready.");
  const [error, setError] = useState<string | null>(null);

  const runtimeEnabled = isTauriRuntime();

  const allDependenciesReady = useMemo(() => {
    return Boolean(
      dependencies?.ytDlpInstalled &&
      dependencies?.ffmpegInstalled &&
      dependencies?.ffprobeInstalled,
    );
  }, [dependencies]);

  const checkDependencies = async () => {
    if (!runtimeEnabled) {
      return;
    }

    setDepsLoading(true);
    try {
      const next = await getDependenciesStatus();
      setDependencies(next);
      setStatusText("Dependency status updated.");
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Failed to check dependencies",
      );
    } finally {
      setDepsLoading(false);
    }
  };

  useEffect(() => {
    if (!runtimeEnabled) {
      return;
    }

    void refreshScanRoots();
    void checkDependencies();
  }, [refreshScanRoots, runtimeEnabled]);

  const pickFolder = async () => {
    if (!runtimeEnabled) {
      return;
    }

    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose output directory",
    });
    if (!selected || typeof selected !== "string") {
      return;
    }
    setDestinationPath(selected);
    setSelectedRootPath("");
  };

  const installDeps = async () => {
    setDepsLoading(true);
    try {
      const message = await installDependencies();
      setStatusText(message);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Failed to queue dependency install",
      );
    } finally {
      setDepsLoading(false);
    }
  };

  const updateDeps = async () => {
    setDepsLoading(true);
    try {
      const message = await updateDependencies();
      setStatusText(message);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Failed to queue dependency update",
      );
    } finally {
      setDepsLoading(false);
    }
  };

  const inspectUrl = async () => {
    if (!url.trim()) {
      setError("URL is required.");
      return;
    }

    setProbeLoading(true);
    try {
      const result = await probeYoutube(url.trim());
      setProbeResult(result);
      setStatusText("URL inspected successfully.");
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to inspect URL",
      );
    } finally {
      setProbeLoading(false);
    }
  };

  const queueDownload = async () => {
    if (!url.trim()) {
      setError("URL is required.");
      return;
    }
    if (!destinationPath.trim()) {
      setError("Output directory is required.");
      return;
    }

    setDownloadLoading(true);
    try {
      const message = await queueYoutubeDownload({
        url: url.trim(),
        outputDir: destinationPath.trim(),
        mode,
        format: format.trim() || undefined,
        filenameTemplate: filenameTemplate.trim() || undefined,
        extractAudio: mode === "audio",
        audioFormat: audioFormat.trim() || undefined,
        audioQuality: audioQuality.trim() || undefined,
        noPlaylist,
        embedMetadata,
        embedThumbnail,
        writeSubtitles,
        writeThumbnail,
      });
      setStatusText(message);
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Failed to queue download",
      );
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <section className="page-shell">
      <section className="pane">
        <header className="pane-head">
          <h2>YouTube Downloader</h2>
          <div className="row-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void checkDependencies()}
              disabled={depsLoading || !runtimeEnabled}
            >
              <RefreshCw size={13} aria-hidden="true" />
              Check deps
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void installDeps()}
              disabled={depsLoading || !runtimeEnabled}
            >
              Install deps
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void updateDeps()}
              disabled={depsLoading || !runtimeEnabled}
            >
              Update deps
            </Button>
          </div>
        </header>

        <div className="kv-grid">
          <p>yt-dlp</p>
          <strong>
            {dependencies?.ytDlpInstalled ? "Installed" : "Missing"}
          </strong>
          <p>ffmpeg</p>
          <strong>
            {dependencies?.ffmpegInstalled ? "Installed" : "Missing"}
          </strong>
          <p>ffprobe</p>
          <strong>
            {dependencies?.ffprobeInstalled ? "Installed" : "Missing"}
          </strong>
        </div>
      </section>

      <section className="pane">
        <header className="pane-head">
          <h2>Download Setup</h2>
          <div className="row-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void inspectUrl()}
              disabled={probeLoading || !runtimeEnabled}
            >
              <ListVideo size={13} aria-hidden="true" />
              Inspect URL
            </Button>
            <Button
              type="button"
              onClick={() => void queueDownload()}
              disabled={
                downloadLoading ||
                !runtimeEnabled ||
                !url.trim() ||
                !destinationPath.trim() ||
                !allDependenciesReady
              }
            >
              <Download size={13} aria-hidden="true" />
              Queue Download
            </Button>
          </div>
        </header>

        <div className="youtube-field-grid">
          <label className="youtube-field">
            <span>URL</span>
            <div className="youtube-url-input">
              <Link2 size={13} aria-hidden="true" />
              <Input
                value={url}
                onChange={(event) => setUrl(event.currentTarget.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
          </label>

          <label className="youtube-field">
            <span>Imported root paths</span>
            <select
              className="youtube-select"
              value={selectedRootPath}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSelectedRootPath(value);
                setDestinationPath(value);
              }}
            >
              <option value="">Select imported root path</option>
              {scanRoots.map((root) => (
                <option key={root.rootPath} value={root.rootPath}>
                  {root.rootPath}
                </option>
              ))}
            </select>
          </label>

          <label className="youtube-field">
            <span>Output directory (manual path)</span>
            <div className="youtube-output-row">
              <Input
                value={destinationPath}
                onChange={(event) => {
                  setDestinationPath(event.currentTarget.value);
                  setSelectedRootPath("");
                }}
                placeholder="Select folder or type manually"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => void pickFolder()}
                disabled={!runtimeEnabled}
              >
                <FolderOpen size={13} aria-hidden="true" />
                Browse
              </Button>
            </div>
          </label>

          <div className="youtube-two-cols">
            <label className="youtube-field">
              <span>Mode</span>
              <select
                className="youtube-select"
                value={mode}
                onChange={(event) =>
                  setMode(event.currentTarget.value as "video" | "audio")
                }
              >
                <option value="video">Video</option>
                <option value="audio">Audio</option>
              </select>
            </label>

            <label className="youtube-field">
              <span>Format selector (-f)</span>
              <Input
                value={format}
                onChange={(event) => setFormat(event.currentTarget.value)}
                placeholder={
                  mode === "audio"
                    ? "bestaudio/best"
                    : "bestvideo*+bestaudio/best"
                }
              />
            </label>
          </div>

          <label className="youtube-field">
            <span>Filename template</span>
            <Input
              value={filenameTemplate}
              onChange={(event) =>
                setFilenameTemplate(event.currentTarget.value)
              }
              placeholder="%(title).200B [%(id)s].%(ext)s"
            />
          </label>

          {mode === "audio" ? (
            <div className="youtube-two-cols">
              <label className="youtube-field">
                <span>Audio format</span>
                <Input
                  value={audioFormat}
                  onChange={(event) =>
                    setAudioFormat(event.currentTarget.value)
                  }
                  placeholder="mp3"
                />
              </label>
              <label className="youtube-field">
                <span>Audio quality</span>
                <Input
                  value={audioQuality}
                  onChange={(event) =>
                    setAudioQuality(event.currentTarget.value)
                  }
                  placeholder="0"
                />
              </label>
            </div>
          ) : null}

          <div className="youtube-check-grid">
            <label>
              <input
                type="checkbox"
                checked={noPlaylist}
                onChange={(event) => setNoPlaylist(event.currentTarget.checked)}
              />
              No playlist
            </label>
            <label>
              <input
                type="checkbox"
                checked={embedMetadata}
                onChange={(event) =>
                  setEmbedMetadata(event.currentTarget.checked)
                }
              />
              Embed metadata
            </label>
            <label>
              <input
                type="checkbox"
                checked={embedThumbnail}
                onChange={(event) =>
                  setEmbedThumbnail(event.currentTarget.checked)
                }
              />
              Embed thumbnail
            </label>
            <label>
              <input
                type="checkbox"
                checked={writeSubtitles}
                onChange={(event) =>
                  setWriteSubtitles(event.currentTarget.checked)
                }
              />
              Write subtitles
            </label>
            <label>
              <input
                type="checkbox"
                checked={writeThumbnail}
                onChange={(event) =>
                  setWriteThumbnail(event.currentTarget.checked)
                }
              />
              Write thumbnail
            </label>
          </div>
        </div>

        {!allDependenciesReady ? (
          <StatusText
            text="Some dependencies are missing. Install or update dependencies before queueing downloads."
            isError
          />
        ) : null}
      </section>

      {probeResult ? (
        <section className="pane">
          <header className="pane-head">
            <h2>Detected Media</h2>
          </header>
          <div className="kv-grid">
            <p>Title</p>
            <strong>{probeResult.title ?? "-"}</strong>
            <p>Uploader</p>
            <strong>{probeResult.uploader ?? "-"}</strong>
            <p>Duration</p>
            <strong>{formatDuration(probeResult.duration)}</strong>
          </div>

          {probeResult.formats.length > 0 ? (
            <div className="youtube-format-list">
              {probeResult.formats.slice(0, 40).map((item) => (
                <button
                  key={`${item.formatId}:${item.ext}`}
                  type="button"
                  className="youtube-format-item"
                  onClick={() => setFormat(item.formatId)}
                >
                  <span>{item.formatId}</span>
                  <span>{item.ext}</span>
                  <span>{item.resolution ?? "-"}</span>
                  <span>{item.formatNote ?? ""}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {(depsLoading || probeLoading || downloadLoading) && runtimeEnabled ? (
        <section className="pane">
          <Progress indeterminate />
        </section>
      ) : null}

      {error ? <StatusText text={error} isError /> : null}
      <StatusText text={statusText} />
    </section>
  );
}
