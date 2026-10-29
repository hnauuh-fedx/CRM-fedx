// CI-only artifact publication/registration. This command never calls Render or Pages deployment APIs.
import "dotenv/config";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { releaseRegistrationSchema } from "@admission-crm/shared/releases";

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
async function main() {
  const directory = path.resolve(process.argv[2] ?? "../../artifacts/cloud-preparation");
  const variants: Record<string, any> = {}, payloads: Array<{ key: string; sha256: string; bytes: Buffer }> = [];
  for (const environment of ["staging", "production"]) {
    const metadata = JSON.parse(await readFile(path.join(directory, `web-artifact-${environment}.json`), "utf8"));
    if (metadata.commit !== required("GITHUB_SHA") || metadata.environment !== environment || typeof metadata.archive !== "string" || path.basename(metadata.archive) !== metadata.archive) throw new Error("Artifact metadata mismatch.");
    const bytes = await readFile(path.join(directory, metadata.archive));
    if (bytes.length !== metadata.size || createHash("sha256").update(bytes).digest("hex") !== metadata.sha256) throw new Error("Artifact integrity mismatch.");
    variants[environment] = { key: metadata.key, sha256: metadata.sha256, size: metadata.size, apiOrigin: metadata.apiOrigin, webOrigin: metadata.webOrigin };
    payloads.push({ key: metadata.key, sha256: metadata.sha256, bytes });
  }
  const manifest = releaseRegistrationSchema.parse({ provider: "render-cloudflare", capabilities: ["private-files-v1"], cloud: variants, commit: required("GITHUB_SHA"), version: `build-${required("GITHUB_RUN_NUMBER")}`, notes: process.env.RELEASE_NOTES ?? "", apiImage: required("API_IMAGE"), webImage: required("WEB_IMAGE"), schemaGeneration: required("RELEASE_SCHEMA_GENERATION"), buildUrl: `${required("GITHUB_SERVER_URL")}/${required("GITHUB_REPOSITORY")}/actions/runs/${required("GITHUB_RUN_ID")}` });
  const endpoint = new URL(required("CONTROL_ARTIFACT_ENDPOINT")), control = new URL(required("CONTROL_URL"));
  if (endpoint.protocol !== "https:" || control.protocol !== "https:" || endpoint.username || endpoint.password || control.username || control.password) throw new Error("CI provider endpoints require HTTPS.");
  const client = new S3Client({ endpoint: endpoint.href, region: "auto", credentials: { accessKeyId: required("CONTROL_ARTIFACT_ACCESS_KEY_ID"), secretAccessKey: required("CONTROL_ARTIFACT_SECRET_ACCESS_KEY") } });
  try {
    for (const artifact of payloads) {
      let exists = false;
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: required("CONTROL_ARTIFACT_BUCKET"), Key: artifact.key }));
        if (head.ContentLength !== artifact.bytes.length || head.Metadata?.sha256 !== artifact.sha256) throw new Error("Existing release artifact differs.");
        exists = true;
      } catch (error) { if (!(error && typeof error === "object" && "name" in error && ["NotFound", "NoSuchKey"].includes(String(error.name)))) throw error; }
      if (!exists) await client.send(new PutObjectCommand({ Bucket: required("CONTROL_ARTIFACT_BUCKET"), Key: artifact.key, Body: artifact.bytes, ContentLength: artifact.bytes.length, ContentType: "application/gzip", Metadata: { sha256: artifact.sha256 }, IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(60000) });
    }
    const response = await fetch(new URL("/v1/releases", control), { method: "POST", redirect: "error", signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${required("CONTROL_CI_TOKEN")}`, "Content-Type": "application/json" }, body: JSON.stringify(manifest) });
    if (!response.ok) throw new Error("Cloud release registration failed.");
    console.log("Cloud artifacts published and release registered. No deployment requested.");
  } finally { client.destroy(); }
}
void main().catch(() => { console.error("Cloud artifact publication failed. Check artifact integrity and CI configuration; no deployment was requested."); process.exitCode = 1; });
