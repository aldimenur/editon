import type { JobItem } from "@/entities/job/model/job.types";
import { Table } from "@/shared/ui/table";

type JobsTableProps = {
  items: JobItem[];
};

export function JobsTable({ items }: JobsTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Type</th>
          <th>Status</th>
          <th>Priority</th>
          <th>Attempts</th>
        </tr>
      </thead>
      <tbody>
        {items.map((job) => (
          <tr key={job.id}>
            <td>{job.id}</td>
            <td>{job.jobType}</td>
            <td>{job.status}</td>
            <td>{job.priority}</td>
            <td>{job.attempts}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
