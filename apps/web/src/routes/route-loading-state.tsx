import { useLocation } from "react-router-dom";

import { PageLoadingState, SessionLoadingState } from "@/components/shared/page-loading-state";
import { PublicMarketingFormLoadingState } from "@/modules/marketing/public-marketing-form-shell";
import { getPageSkeletonVariant } from "./page-skeleton-config";

export function RouteLoadingState() {
  const location = useLocation();
  const variant = getPageSkeletonVariant(location.pathname);
  if (variant === "public-form") {
    return <PublicMarketingFormLoadingState isEmbed={new URLSearchParams(location.search).get("embed") === "1"} />;
  }
  if (variant === "session") return <SessionLoadingState />;
  return <PageLoadingState variant={variant} />;
}
