import { useEffect, useState } from "react";

import { listJobs, type JobItem } from "@/features/backend/api/backend-api";
import { canUseTauri } from "@/shared/lib/tauri-client";
import { SectionCard } from "@/shared/ui/section-card";

export function JobsPanel() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseTauri()) {
      setError("Run in Tauri mode to inspect queue jobs.");
      return;
    }

    listJobs()
      .then((result) => {
        setJobs(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : "Failed to load jobs",
        );
      });
  }, []);

  return (
    <SectionCard
      title="Worker Jobs"
      subtitle="Recent jobs from v2_jobs_list"
      actions={<span className="pill">{jobs.length} jobs</span>}
    >
      {error ? <p className="state is-error">{error}</p> : null}
      {!error ? (
        <ul className="job-list">
          {jobs.map((job) => (
            <li key={job.id}>
              <div>
                <strong>{job.jobType}</strong>
                <p>#{job.id}</p>
              </div>
              <span className={`job-status is-${job.status}`}>
                {job.status}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}
