import type { UseFormReturn } from "react-hook-form";
import type { MarketingFormInput } from "./marketing-reference.types";

type RouteLocation = { pathname: string; search: string };

export function shouldBlockMarketingFormRoute(dirty: boolean, saving: boolean, current: RouteLocation, next: RouteLocation) {
  return (dirty || saving) && (current.pathname !== next.pathname || current.search !== next.search);
}

export function preventMarketingFormUnload(event: Pick<BeforeUnloadEvent, "preventDefault" | "returnValue">) {
  event.preventDefault();
  event.returnValue = "";
}

export function acknowledgeMarketingFormSave(form: Pick<UseFormReturn<MarketingFormInput>, "getValues" | "reset">, saved: MarketingFormInput) {
  const current = structuredClone(form.getValues());
  // Establish the submitted baseline, then restore any edits made during the request.
  form.reset(saved);
  form.reset(current, { keepDefaultValues: true });
}
