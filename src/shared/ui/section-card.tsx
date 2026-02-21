import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
}: SectionCardProps) {
  return (
    <article className="panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </header>
      {children}
    </article>
  );
}
