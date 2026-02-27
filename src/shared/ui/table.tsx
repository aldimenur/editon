import type { ReactNode } from "react";

type TableProps = {
  children: ReactNode;
};

export function Table({ children }: TableProps) {
  return (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  );
}
