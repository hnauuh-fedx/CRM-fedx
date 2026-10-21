// Exchanges the auth_code from TikTok's advertiser authorization redirect for a long-lived access token.
// Usage: npm run tiktok:exchange-code -- --code <auth_code>
// The auth_code is single-use and expires after about one hour.

const productionBase = "https://business-api.tiktok.com/open_api/v1.3";

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const authCode = readArg("--code");
  const appId = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_SECRET;
  if (!authCode || !appId || !secret) {
    console.error("Cần --code <auth_code> và TIKTOK_APP_ID, TIKTOK_SECRET trong .env.");
    process.exitCode = 1;
    return;
  }
  const response = await fetch(`${productionBase}/oauth2/access_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, secret, auth_code: authCode }),
  });
  const payload = await response.json() as { code: number; message: string; data?: { access_token?: string; advertiser_ids?: string[]; scope?: number[] } };
  if (payload.code !== 0 || !payload.data?.access_token) {
    console.error(`TikTok error code=${payload.code}: ${payload.message}`);
    process.exitCode = 1;
    return;
  }
  const accessToken = payload.data.access_token;
  const advertiserIds = payload.data.advertiser_ids ?? [];
  // Suggest the advertiser that actually owns Instant Forms, since lead webhooks are scoped to it.
  console.log("Advertiser được cấp quyền:");
  let suggested: string | undefined;
  for (const advertiserId of advertiserIds) {
    const query = new URLSearchParams({ advertiser_id: advertiserId, business_type: "LEAD_GEN" });
    const forms = await fetch(`${productionBase}/page/get/?${query}`, { headers: { "Access-Token": accessToken } })
      .then((result) => result.json() as Promise<{ code: number; data?: { page_info?: { total_number?: number } } }>)
      .catch(() => null);
    const total = forms?.code === 0 ? forms.data?.page_info?.total_number ?? 0 : null;
    console.log(`- ${advertiserId}: ${total === null ? "không đọc được form" : `${total} Instant Form`}`);
    if (!suggested && total) suggested = advertiserId;
  }
  console.log("\nCập nhật apps/api/.env với các giá trị sau rồi khởi động lại API:\n");
  console.log(`TIKTOK_API_BASE=${productionBase}`);
  console.log(`TIKTOK_ACCESS_TOKEN=${accessToken}`);
  console.log(`TIKTOK_ADVERTISER_ID=${suggested ?? advertiserIds[0] ?? "<chọn một advertiser id ở trên>"}`);
}

void main();
