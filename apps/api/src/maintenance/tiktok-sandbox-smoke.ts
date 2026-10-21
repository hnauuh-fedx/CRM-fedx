import { env } from "../config/env";
import {
  TikTokApiError, createTikTokMockLead, deleteTikTokMockLead, getTikTokMockLead, isTikTokSandbox, listTikTokLeadForms,
} from "../modules/integrations/tiktok/tiktok-api.service";

function describeError(error: unknown) {
  return error instanceof TikTokApiError
    ? `TikTok error code=${error.code} requestId=${error.requestId ?? "-"}: ${error.message}`
    : String(error);
}

async function step(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`[OK] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}: ${describeError(error)}`);
    process.exitCode = 1;
  }
}

function findLeadId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.lead_id === "string" || typeof record.lead_id === "number") return String(record.lead_id);
  for (const nested of Object.values(record)) {
    const found = Array.isArray(nested) ? nested.map(findLeadId).find(Boolean) ?? null : findLeadId(nested);
    if (found) return found;
  }
  return null;
}

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

// Usage: npm run test:tiktok-sandbox [-- --page-id <instant form id>] [-- --create-mock | --recreate-mock]
// --recreate-mock deletes the form's existing test lead first so TikTok sends a fresh webhook notification.
async function main() {
  console.log(`TikTok API base: ${env.TIKTOK_API_BASE} (${isTikTokSandbox() ? "sandbox" : "production"})`);

  let pageId = readArg("--page-id");
  await step("GET /page/get/ (Instant Forms)", async () => {
    const forms = await listTikTokLeadForms(1, 20);
    console.log(`Lead forms: ${forms.pageInfo.total_number}`);
    for (const form of forms.items) console.log(`- ${form.page_id} | ${form.title ?? "-"} | ${form.status ?? "-"}`);
    pageId ??= forms.items[0]?.page_id;
  });

  if (!pageId) {
    console.log("Chưa có Instant Form nào, bỏ qua bước mock lead.");
    return;
  }
  if (process.argv.includes("--recreate-mock")) {
    await step(`POST /page/lead/mock/delete/ (page ${pageId})`, async () => {
      const existing = await getTikTokMockLead(pageId!).catch(() => null);
      const leadId = existing ? findLeadId(existing) : null;
      if (!leadId) { console.log("Không có mock lead cũ để xóa."); return; }
      await deleteTikTokMockLead(leadId);
      console.log(`Đã xóa mock lead ${leadId}.`);
    });
  }
  if (process.argv.includes("--create-mock") || process.argv.includes("--recreate-mock")) {
    await step(`POST /page/lead/mock/create/ (page ${pageId})`, async () => {
      console.log("Mock lead:", await createTikTokMockLead(pageId!));
    });
  }
  await step(`GET /page/lead/mock/get/ (page ${pageId})`, async () => {
    console.log("Mock lead:", await getTikTokMockLead(pageId!));
  });
}

void main();
