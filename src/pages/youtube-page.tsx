import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  FolderOpen,
  Link2,
  ListVideo,
  RefreshCw,
  Rocket,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  queueYoutubeDownload,
  probeYoutube,
  type YtdlpProbeResult,
} from "@/features/youtube";
import { useAssetsStore } from "@/features/assets";
import { onJobUpdated } from "@/features/jobs/api/jobs-api";
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

type LiveJobProgress = {
  id: number | null;
  jobType: string;
  status: string;
  message: string;
  progress: number | null;
};

function isTerminalJobStatus(status: string): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

function jobTone(status: string): "success" | "error" | "active" {
  if (status === "done") {
    return "success";
  }
  if (status === "failed" || status === "cancelled") {
    return "error";
  }
  return "active";
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
  const [dependencyJobProgress, setDependencyJobProgress] =
    useState<LiveJobProgress | null>(null);
  const [downloadJobProgress, setDownloadJobProgress] =
    useState<LiveJobProgress | null>(null);
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

  useEffect(() => {
    if (!runtimeEnabled) {
      return;
    }

    let unlisten: (() => void) | undefined;
    onJobUpdated((payload) => {
      if (payload.jobType === "youtube_download") {
        setDownloadJobProgress({
          id: payload.id,
          jobType: payload.jobType,
          status: payload.status,
          message: payload.message,
          progress: payload.progress,
        });

        setStatusText(
          `youtube_download · ${payload.status}${typeof payload.progress === "number" ? ` · ${payload.progress}%` : ""}${payload.message ? ` · ${payload.message}` : ""}`,
        );

        if (isTerminalJobStatus(payload.status)) {
          setDownloadLoading(false);
        } else {
          setDownloadLoading(true);
        }
      }

      if (
        payload.jobType === "dependencies_install" ||
        payload.jobType === "dependencies_update"
      ) {
        setDependencyJobProgress({
          id: payload.id,
          jobType: payload.jobType,
          status: payload.status,
          message: payload.message,
          progress: payload.progress,
        });

        setStatusText(
          `${payload.jobType} · ${payload.status}${typeof payload.progress === "number" ? ` · ${payload.progress}%` : ""}${payload.message ? ` · ${payload.message}` : ""}`,
        );

        if (isTerminalJobStatus(payload.status)) {
          setDepsLoading(false);

          if (payload.status === "done") {
            void (async () => {
              try {
                const next = await getDependenciesStatus();
                setDependencies(next);
              } catch {
                // keep previous dependency state if refresh fails
              }
            })();
          }
        } else {
          setDepsLoading(true);
        }
      }
    })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {
        setError("Failed to subscribe job updates.");
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [runtimeEnabled]);

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
    setDependencyJobProgress({
      id: null,
      jobType: "dependencies_install",
      status: "queued",
      message: "Waiting for installer job to start...",
      progress: 0,
    });
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
      setDepsLoading(false);
    }
  };

  const updateDeps = async () => {
    setDepsLoading(true);
    setDependencyJobProgress({
      id: null,
      jobType: "dependencies_update",
      status: "queued",
      message: "Waiting for updater job to start...",
      progress: 0,
    });
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
    setDownloadJobProgress({
      id: null,
      jobType: "youtube_download",
      status: "queued",
      message: "Waiting for download job to start...",
      progress: 0,
    });
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
      setDownloadLoading(false);
    }
  };

  const dependencyRows = [
    {
      key: "yt-dlp",
      label: "yt-dlp",
      installed: Boolean(dependencies?.ytDlpInstalled),
      path: dependencies?.ytDlpPath,
    },
    {
      key: "ffmpeg",
      label: "ffmpeg",
      installed: Boolean(dependencies?.ffmpegInstalled),
      path: dependencies?.ffmpegPath,
    },
    {
      key: "ffprobe",
      label: "ffprobe",
      installed: Boolean(dependencies?.ffprobeInstalled),
      path: dependencies?.ffprobePath,
    },
  ];

  const activeJobs = [dependencyJobProgress, downloadJobProgress].filter(
    (job): job is LiveJobProgress => job !== null,
  );

  const canQueueDownload =
    runtimeEnabled &&
    allDependenciesReady &&
    url.trim().length > 0 &&
    destinationPath.trim().length > 0 &&
    !downloadLoading;

  const showFallbackProgressPane =
    runtimeEnabled &&
    activeJobs.length === 0 &&
    (probeLoading ||
      (depsLoading && dependencyJobProgress === null) ||
      (downloadLoading && downloadJobProgress === null));

  return (
    <section className="page-shell youtube-page-shell">
      <section className="pane youtube-hero-pane">
        <div className="youtube-hero-head">
          <div className="youtube-hero-copy">
            <p className="explore-kicker">Production Ready</p>
            <h2>YouTube Downloader</h2>
            <p className="meta">
              Probe media, set output strategy, then queue stable yt-dlp jobs
              with live status tracking.
            </p>
          </div>
          <div className="youtube-hero-actions">
            <span
              className={`youtube-health-chip ${allDependenciesReady ? "is-ready" : "is-warning"}`}
            >
              {allDependenciesReady ? (
                <CheckCircle2 size={14} aria-hidden="true" />
              ) : (
                <AlertTriangle size={14} aria-hidden="true" />
              )}
              {allDependenciesReady
                ? "Dependencies ready"
                : "Dependencies required"}
            </span>
            <Button
              type="button"
              onClick={() => void queueDownload()}
              disabled={!canQueueDownload}
            >
              <Rocket size={13} aria-hidden="true" />
              Queue Download
            </Button>
          </div>
        </div>
      </section>

      <div className="youtube-layout">
        <section className="pane youtube-main-pane">
          <header className="pane-head">
            <h2>
              <Settings2 size={14} aria-hidden="true" />
              Download Setup
            </h2>
            <div className="row-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void inspectUrl()}
                disabled={probeLoading || !runtimeEnabled || !url.trim()}
              >
                <ListVideo size={13} aria-hidden="true" />
                Inspect URL
              </Button>
            </div>
          </header>

          <div className="youtube-field-grid">
            <label className="youtube-field">
              <span>Video URL</span>
              <div className="youtube-url-input">
                <Link2 size={13} aria-hidden="true" />
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.currentTarget.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </div>
            </label>

            <div className="youtube-two-cols">
              <label className="youtube-field">
                <span>Imported root path</span>
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
            </div>

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
            </div>

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

            <div className="youtube-options-block">
              <p className="youtube-options-title">Output options</p>
              <div className="youtube-check-grid">
                <label>
                  <input
                    type="checkbox"
                    checked={noPlaylist}
                    onChange={(event) =>
                      setNoPlaylist(event.currentTarget.checked)
                    }
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
          </div>
        </section>

        <aside className="youtube-side-stack">
          <section className="pane youtube-side-pane">
            <header className="pane-head">
              <h2>
                <ShieldCheck size={14} aria-hidden="true" />
                Dependencies
              </h2>
              <div className="row-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void checkDependencies()}
                  disabled={depsLoading || !runtimeEnabled}
                >
                  <RefreshCw size={13} aria-hidden="true" />
                  Check
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void installDeps()}
                  disabled={depsLoading || !runtimeEnabled}
                >
                  Install
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void updateDeps()}
                  disabled={depsLoading || !runtimeEnabled}
                >
                  Update
                </Button>
              </div>
            </header>

            <div className="youtube-dependency-list">
              {dependencyRows.map((item) => (
                <article key={item.key} className="youtube-dependency-item">
                  <div className="youtube-dependency-top">
                    <span className="youtube-dependency-label">
                      {item.installed ? (
                        <CheckCircle2 size={13} aria-hidden="true" />
                      ) : (
                        <AlertTriangle size={13} aria-hidden="true" />
                      )}
                      {item.label}
                    </span>
                    <strong>{item.installed ? "Installed" : "Missing"}</strong>
                  </div>
                  {item.path ? (
                    <p className="meta youtube-dependency-path">{item.path}</p>
                  ) : null}
                </article>
              ))}
            </div>

            {!allDependenciesReady ? (
              <StatusText
                text="Some dependencies are missing. Install or update dependencies before queueing downloads."
                isError
              />
            ) : null}
          </section>

          <section className="pane youtube-side-pane">
            <header className="pane-head">
              <h2>
                <Download size={14} aria-hidden="true" />
                Live Activity
              </h2>
            </header>

            {activeJobs.length === 0 ? (
              <p className="status youtube-empty-state">
                <CircleDashed size={13} aria-hidden="true" />
                No active jobs yet. Queue install/update/download to see live
                progress.
              </p>
            ) : (
              <div className="youtube-job-list">
                {activeJobs.map((job) => {
                  const tone = jobTone(job.status);
                  const key = `${job.jobType}:${job.id ?? "pending"}`;
                  const heading = `${job.jobType}${job.id ? ` #${job.id}` : ""}`;

                  return (
                    <article
                      key={key}
                      className={`youtube-job-item is-${tone}`}
                    >
                      <StatusText
                        text={`${heading} · ${job.status}${typeof job.progress === "number" ? ` · ${job.progress}%` : ""}`}
                        isError={tone === "error"}
                      />
                      <Progress
                        indeterminate={typeof job.progress !== "number"}
                        value={job.progress ?? undefined}
                      />
                      <p className="status">{job.message}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {probeResult ? (
            <section className="pane youtube-side-pane">
              <header className="pane-head">
                <h2>
                  <ListVideo size={14} aria-hidden="true" />
                  Detected Media
                </h2>
              </header>
              <div className="kv-grid">
                <p>Title</p>
                <strong>{probeResult.title ?? "-"}</strong>
                <p>Uploader</p>
                <strong>{probeResult.uploader ?? "-"}</strong>
                <p>Duration</p>
                <strong>{formatDuration(probeResult.duration)}</strong>
                <p>Formats</p>
                <strong>{probeResult.formats.length}</strong>
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
        </aside>
      </div>

      {showFallbackProgressPane ? (
        <section className="pane">
          <Progress indeterminate />
        </section>
      ) : null}

      {!runtimeEnabled ? (
        <StatusText
          text="Tauri runtime is unavailable. Downloader actions are disabled."
          isError
        />
      ) : null}
      {error ? <StatusText text={error} isError /> : null}
      <StatusText text={statusText} />
    </section>
  );
}
