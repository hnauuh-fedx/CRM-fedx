import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivateFileUpload, PrivateFileDownload } from "../src/components/shared/private-file-controls";
import "../src/index.css";

declare global { interface Window { fileRequests: Array<{ id: string | null; size: number }>; downloadRequests: number } }
window.fileRequests = []; window.downloadRequests = 0;
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.origin);
  if (url.pathname.endsWith("/capabilities")) return Response.json({ uploadEnabled: !location.search.includes("disabled"), maxBytes: 1024, allowedTypes: ["application/pdf"] });
  if (url.pathname.endsWith("/upload")) {
    const headers = new Headers(init?.headers); const form = init?.body as FormData;
    if (headers.get("Content-Type")) throw new Error("Browser must set multipart boundary");
    window.fileRequests.push({ id: headers.get("X-Request-Id"), size: (form.get("file") as File).size });
    if (window.fileRequests.length === 1) return Response.json({ message: "Lỗi tạm thời trong fixture" }, { status: 503 });
    return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
  }
  if (url.pathname.endsWith("/download-url")) { window.downloadRequests++; return Response.json({ url: `${location.origin}/download`, expiresIn: 300 }); }
  return Response.json({ message: "Endpoint ngoài fixture" }, { status: 404 });
};
function Fixture() {
  const [uploaded, setUploaded] = useState(false);
  return <main className="mx-auto flex max-w-xl flex-col gap-4 p-4"><h1>Tệp đính kèm</h1><PrivateFileUpload leadId="22222222-2222-4222-8222-222222222222" token="fixture-token" onUploaded={() => setUploaded(true)} />{uploaded && <><p>Đã đính kèm tệp</p><PrivateFileDownload id="11111111-1111-4111-8111-111111111111" name="fixture.pdf" token="fixture-token" /></>}</main>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><Fixture /></QueryClientProvider>);
