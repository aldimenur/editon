import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageLayoutProps = {
  children: ReactNode;
  className?: string;
};

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageLayout({ children, className }: PageLayoutProps) {
  return (
    <section
      className={cn(
        "h-[calc(100dvh-30px)] overflow-y-auto px-3 py-3 md:px-4 md:py-4",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-sm font-semibold tracking-[0.01em] md:text-base">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
