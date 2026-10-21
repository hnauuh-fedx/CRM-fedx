import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  scopeLabel?: string;
  actions?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  scopeLabel,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
      <div className="flex max-w-3xl flex-col gap-1">
        {eyebrow && (
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
          {scopeLabel && <Badge variant="secondary">{scopeLabel}</Badge>}
        </div>
        <p className="text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
