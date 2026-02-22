import { useEffect } from "react";

import { JobsTable, useJobsStore } from "@/features/jobs";
import { onJobUpdated } from "@/features/jobs/api/jobs-api";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { Button } from "@/shared/ui/button";
import { StatusText } from "@/shared/ui/status-text";

export function JobsPage() {
  const { items, loading, error, liveStatus, setLiveStatus, refresh } =
    useJobsStore();

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void refresh();

    let unlisten: (() => void) | undefined;
    onJobUpdated((payload) => {
      if (
        payload.jobType === "dependencies_install" ||
        payload.jobType === "dependencies_update"
      ) {
        setLiveStatus(payload.message);
      }

      if (payload.status === "done" || payload.status === "failed") {
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
      {error ? <StatusText text={error} isError /> : null}
      <JobsTable items={items} />
    </section>
  );
}
