import { useEffect, useMemo, useState } from "react";

import { JobsTable, useJobsStore } from "@/features/jobs";
import { onJobUpdated } from "@/features/jobs/api/jobs-api";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";
import { StatusText } from "@/shared/ui/status-text";

type ActiveJobProgress = {
  id: number;
  jobType: string;
  status: string;
  message: string;
  progress: number | null;
};

export function JobsPage() {
  const { items, loading, error, liveStatus, setLiveStatus, refresh } =
    useJobsStore();
  const [activeJobProgress, setActiveJobProgress] = useState<
    Record<number, ActiveJobProgress>
  >({});

  const activeProgressList = useMemo(() => {
    return Object.values(activeJobProgress).sort(
      (left, right) => left.id - right.id,
    );
  }, [activeJobProgress]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void refresh();

    let unlisten: (() => void) | undefined;
    onJobUpdated((payload) => {
      if (
        payload.jobType === "generate_waveform" ||
        payload.jobType === "generate_video_thumbnail" ||
        payload.jobType === "dependencies_install" ||
        payload.jobType === "dependencies_update"
      ) {
        const progressText =
          typeof payload.progress === "number" ? ` · ${payload.progress}%` : "";
        setLiveStatus(
          `${payload.jobType} · ${payload.status}${progressText}${payload.message ? ` · ${payload.message}` : ""}`,
        );
      }

      if (
        payload.jobType === "generate_waveform" ||
        payload.jobType === "generate_video_thumbnail"
      ) {
        setActiveJobProgress((current) => {
          const next = {
            ...current,
            [payload.id]: {
              id: payload.id,
              jobType: payload.jobType,
              status: payload.status,
              message: payload.message,
              progress: payload.progress,
            },
          };

          if (
            payload.status === "done" ||
            payload.status === "failed" ||
            payload.status === "cancelled"
          ) {
            window.setTimeout(() => {
              setActiveJobProgress((state) => {
                if (!(payload.id in state)) {
                  return state;
                }
                const copy = { ...state };
                delete copy[payload.id];
                return copy;
              });
            }, 1800);
          }

          return next;
        });
      }

      if (
        payload.status === "done" ||
        payload.status === "failed" ||
        payload.status === "cancelled"
      ) {
        void refresh();
      }
    })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {
        setLiveStatus("Failed to subscribe job updates.");
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [refresh, setLiveStatus]);

  return (
    <section className="pane">
      <header className="pane-head">
        <h2>Queue Jobs</h2>
        <Button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || !isTauriRuntime()}
        >
          Refresh
        </Button>
      </header>
      {liveStatus ? <StatusText text={liveStatus} /> : null}
      {activeProgressList.length > 0 ? (
        <div className="scan-status-row">
          <div style={{ width: "100%", display: "grid", gap: 8 }}>
            {activeProgressList.map((job) => (
              <div key={job.id}>
                <StatusText
                  text={`job:${job.id} · ${job.jobType} · ${job.status}${typeof job.progress === "number" ? ` · ${job.progress}%` : ""}${job.message ? ` · ${job.message}` : ""}`}
                />
                <Progress
                  indeterminate={typeof job.progress !== "number"}
                  value={job.progress ?? undefined}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <StatusText text={error} isError /> : null}
      <JobsTable items={items} />
    </section>
  );
}
