import { useEffect } from "react";

import { JobsTable, useJobsStore } from "@/features/jobs";
import { isTauriRuntime } from "@/shared/lib/guards/is-tauri";
import { Button } from "@/shared/ui/button";
import { StatusText } from "@/shared/ui/status-text";

export function JobsPage() {
  const { items, loading, error, refresh } = useJobsStore();

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void refresh();
  }, [refresh]);

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
      {error ? <StatusText text={error} isError /> : null}
      <JobsTable items={items} />
    </section>
  );
}
