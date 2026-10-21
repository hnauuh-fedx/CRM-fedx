import { PublicMarketingFormShell as PublicShell, PublicMarketingFormLoadingState } from "../public-marketing-form-shell";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMarketingFormEmbedMessage, parseMarketingFormEmbedMessage, sanitizeMarketingFormTracking, type MarketingFormEmbedMessage, type MarketingFormTracking } from "@admission-crm/shared/marketing-form-embed";
import { CheckCircle2 } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "@/services/api";
import { getPublicMarketingForm, submitPublicMarketingForm } from "@/services/marketing-reference.service";
import { MarketingFormFill } from "../marketing-form-fill";
import type { MarketingFormPublicValues } from "../marketing-form-public-values";

export function PublicMarketingFormPage() {
  const { publicKey = "" } = useParams();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";
  const parentOrigin = useMemo(() => {
    if (!isEmbed) return null;
    const value = searchParams.get("parent_origin");
    if (!value) return null;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && url.origin === value ? url.origin : null;
    } catch { return null; }
  }, [isEmbed, searchParams]);
  const [tracking, setTracking] = useState<MarketingFormTracking>(() => sanitizeMarketingFormTracking({
    ...Object.fromEntries(new URLSearchParams(window.location.search)),
    source_url: window.location.href,
    source_referrer: document.referrer,
  }));
  const client = useQueryClient();
  const attempt = useRef<{ content: string; key: string } | null>(null);
  const query = useQuery({ queryKey: ["public-marketing-form", publicKey], queryFn: () => getPublicMarketingForm(publicKey), enabled: Boolean(publicKey) });
  const formId = query.data?.id ?? "";
  useEffect(() => {
    if (!isEmbed || !parentOrigin || !formId || window.parent === window) return;
    const post = (message: MarketingFormEmbedMessage) => window.parent.postMessage(message, parentOrigin);
    const content = document.querySelector("main");
    const resize = () => {
      const contentHeight = content?.getBoundingClientRect().height ?? document.body.scrollHeight;
      post(createMarketingFormEmbedMessage("resize", formId, { height: Math.max(240, Math.min(4_000, Math.ceil(contentHeight))) }));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(document.body);
    if (content) observer.observe(content);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== parentOrigin || event.source !== window.parent) return;
      const message = parseMarketingFormEmbedMessage(event.data, formId);
      if (message?.type === "tracking") setTracking(current => ({ ...current, ...message.tracking }));
    };
    window.addEventListener("message", onMessage);
    post(createMarketingFormEmbedMessage("ready", formId, {}));
    resize();
    return () => { observer.disconnect(); window.removeEventListener("message", onMessage); };
  }, [formId, isEmbed, parentOrigin]);
  const mutation = useMutation({
    mutationFn: (payload: MarketingFormPublicValues) => {
      const submittedPayload = { ...payload, ...tracking };
      const content = JSON.stringify({ publicKey, payload: submittedPayload });
      if (attempt.current?.content !== content) attempt.current = { content, key: crypto.randomUUID() };
      return submitPublicMarketingForm(publicKey, submittedPayload, attempt.current.key);
    },
    onSuccess: result => {
      void client.invalidateQueries({ queryKey: ["public-marketing-form", publicKey] });
      if (!result.redirectUrl) return;
      if (result.redirectMode === "landing_page") {
        if (isEmbed && parentOrigin && formId && window.parent !== window) window.parent.postMessage(createMarketingFormEmbedMessage("redirect", formId, { url: result.redirectUrl }), parentOrigin);
        else if (!isEmbed) window.location.assign(result.redirectUrl);
        return;
      }
      window.location.assign(result.redirectUrl);
    },
  });
  if (query.isLoading) return <PublicMarketingFormLoadingState isEmbed={isEmbed} />;
  if (!query.data || query.isError) return <PublicShell isEmbed={isEmbed}><p className="text-center text-white">Biểu mẫu không khả dụng hoặc đã ngừng nhận thông tin.</p></PublicShell>;
  const form = query.data;
  return <PublicShell backgroundColor={form.backgroundColor} isEmbed={isEmbed}>
    {mutation.isSuccess ? <div role="status" className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-background p-8 text-center"><CheckCircle2 aria-hidden="true" /><h1 className="text-2xl font-semibold">Đã gửi thông tin</h1><p>{mutation.data.message || String(form.successSettings?.message ?? "Cảm ơn Quý Anh, Chị đã gửi thông tin.")}</p>{isEmbed && !parentOrigin && mutation.data.redirectMode === "landing_page" && mutation.data.redirectUrl && <a className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-primary-foreground" href={mutation.data.redirectUrl} target="_top">Tiếp tục</a>}</div> : <MarketingFormFill key={publicKey} mode="public" form={form} onSubmit={payload => mutation.mutate(payload)} isPending={mutation.isPending} error={mutation.isError ? mutation.error instanceof ApiError ? mutation.error.message : "Không thể gửi thông tin. Vui lòng thử lại." : undefined} />}
  </PublicShell>;
}
