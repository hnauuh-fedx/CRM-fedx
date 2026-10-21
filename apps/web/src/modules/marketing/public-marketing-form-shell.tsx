import type { ReactNode } from "react";

import { PageLoadingState } from "@/components/shared/page-loading-state";
import { cn } from "@/lib/utils";

export function PublicMarketingFormShell({ children, backgroundColor, isEmbed = false }: { children: ReactNode; backgroundColor?: string; isEmbed?: boolean }) {
  return (
    <main className={cn("flex items-center justify-center px-4", isEmbed ? "min-h-170 py-4" : "min-h-dvh py-8")} style={{ backgroundColor: backgroundColor ?? "#08366f" }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(255,255,255,0.22),transparent_28%),linear-gradient(135deg,rgba(0,0,0,0.28),transparent_38%)]" aria-hidden="true" />
      <div className="relative w-full">{children}</div>
    </main>
  );
}

export function PublicMarketingFormLoadingState({ isEmbed = false }: { isEmbed?: boolean }) {
  return (
    <PublicMarketingFormShell isEmbed={isEmbed}>
      <PageLoadingState variant="public-form" label="Đang tải biểu mẫu" />
    </PublicMarketingFormShell>
  );
}
