import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "./data-states";

const integerFormatter = new Intl.NumberFormat("vi-VN");

type MetricCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
};

export function MetricCard({ label, value, icon: Icon }: MetricCardProps) {
  return (
    <Card className="gap-4 border-border/70 py-5 shadow-xs">
      <CardHeader className="flex flex-row items-start justify-between px-5">
        <CardDescription className="font-medium">{label}</CardDescription>
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent className="px-5">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

type BreakdownCardProps = {
  title: string;
  description?: string;
  items: Array<{ id: string | null; name: string; total: number }>;
  emptyText: string;
};

export function BreakdownCard({ title, description, items, emptyText }: BreakdownCardProps) {
  const maximum = Math.max(...items.map((item) => item.total), 1);

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title={emptyText} />
        ) : (
          <ul className="flex flex-col gap-5" aria-label={title}>
            {items.map((item) => (
              <li key={item.id ?? item.name} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {integerFormatter.format(item.total)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${(item.total / maximum) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
