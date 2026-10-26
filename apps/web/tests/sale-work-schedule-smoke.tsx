import { createRoot } from "react-dom/client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SaleWorkScheduleDialog } from "../src/modules/management/components/sale-work-schedule-dialog";
import type { SaleWorkScheduleInput } from "@admission-crm/shared/sale-work-schedule";
import "../src/index.css";
declare global {
  interface Window {
    scheduleSaves: SaleWorkScheduleInput[];
  }
}
window.scheduleSaves = [];
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (String(url).includes("/sale-work-schedules")) {
    if (init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      window.scheduleSaves.push(body);
      return Response.json({
        ...body,
        id: "00000000-0000-4000-8000-000000000003",
        sales: [],
        version: 1,
      });
    }
    return Response.json({
      data: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          fullName: "Nguyễn Thanh An",
        },
      ],
      hasMore: false,
    });
  }
  return fetchOriginal(url, init);
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <QueryClientProvider client={client}>
      {open ? (
        <SaleWorkScheduleDialog
          token="test"
          programId="00000000-0000-4000-8000-000000000002"
          onClose={() => setOpen(false)}
        />
      ) : (
        <p>Đã đóng biểu mẫu</p>
      )}
    </QueryClientProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
