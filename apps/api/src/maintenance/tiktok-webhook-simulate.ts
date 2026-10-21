// Sends a TikTok-style lead notification to the CRM so the webhook flow can be tested without TikTok.
// Usage: npm run simulate:tiktok-lead -- --url "http://localhost:3000/api/integrations/tiktok/webhook/<webhookKey>/<secret>"
//        [--name "Nguyễn Văn A"] [--phone 0901234567] [--email a@example.com]
//        [--major "Công nghệ thông tin"] [--degree "Tốt nghiệp THPT"] [--lead-id 123]
// Answers use the same question labels as the real Instant Form, so CRM mappings behave as in production.

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const url = readArg("--url");
  if (!url) {
    console.error("Thiếu --url (callback URL của webhook TikTok: .../webhook/<key>/<secret>).");
    process.exitCode = 1;
    return;
  }
  const leadId = readArg("--lead-id") ?? String(Date.now());
  // Mirrors a real TikTok Instant Form notification: one `entry` per lead, answers in `changes`.
  const payload = {
    request_id: Date.now(),
    object: 1,
    entry: [{
      id: leadId,
      page_id: "7696083428135190805",
      page_name: "Biểu mẫu thử nghiệm",
      advertiser_id: process.env.TIKTOK_ADVERTISER_ID ?? "0",
      create_time: Math.floor(Date.now() / 1000),
      lead_source: "INSTANT_FORM",
      changes: [
        { field: "name", value: readArg("--name") ?? "Lead TikTok thử nghiệm" },
        { field: "phone_number", value: readArg("--phone") ?? `09${String(Date.now()).slice(-8)}` },
        { field: "email", value: readArg("--email") ?? `tiktok.${leadId}@example.com` },
        { field: "Bạn quan tâm đến ngành học nào?", value: readArg("--major") ?? "Công nghệ thông tin" },
        { field: "Bằng cấp hiện có của bạn là gì ?", value: readArg("--degree") ?? "Tốt nghiệp THPT" },
      ],
    }],
    time: Math.floor(Date.now() / 1000),
  };

  console.log("Payload:", JSON.stringify(payload, null, 2));
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  console.log(`HTTP ${response.status}:`, await response.text());
  if (!response.ok) process.exitCode = 1;
}

void main();
