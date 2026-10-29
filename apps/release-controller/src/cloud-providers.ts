import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { z } from "zod";
import path from "node:path";

export type RenderDeployment = { id: string; status: string; image?: { ref?: string; sha?: string }; createdAt?: string };
export function matchesRenderImage(deployment: RenderDeployment, expected: string) {
  const sha = deployment.image?.sha, digest = expected.split("@")[1];
  return deployment.image?.ref === expected && (!sha || sha === digest || `sha256:${sha}` === digest);
}
export type PagesDeployment = { id: string; environment: string; deployment_trigger: { metadata: { commit_hash: string; commit_message?: string } }; latest_stage?: { status: string } };
export function createProviderClient(input: { renderToken: string; pagesToken: string; renderOrigin?: string; pagesOrigin?: string; allowLoopback?: boolean }) {
  const render = input.renderOrigin ?? "https://api.render.com/v1/";
  const pages = input.pagesOrigin ?? "https://api.cloudflare.com/client/v4/";
  for (const origin of [render, pages]) {
    const url = new URL(origin);
    if (url.username || url.password || (url.protocol !== "https:" && !(input.allowLoopback && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Invalid provider API origin.");
  }
  const request = async (provider: "render" | "pages", route: string, body?: unknown) => {
    const response = await fetch(new URL(route, provider === "render" ? render : pages), { method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${provider === "render" ? input.renderToken : input.pagesToken}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(`Provider ${provider} returned HTTP ${response.status}.`);
    const json = await response.json();
    if (provider === "pages" && json.success !== true) throw new Error("Pages provider rejected request.");
    return provider === "pages" ? json.result : json;
  };
  const service = (id: string) => { if (!/^srv-[a-z0-9]+$/.test(id)) throw new Error("Invalid Render service ID."); return `services/${id}`; };
  const project = (account: string, name: string) => { if (!/^[a-f0-9]{32}$/.test(account) || !/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid Pages project."); return `accounts/${account}/pages/projects/${name}`; };
  return {
    renderService: (id: string) => request("render", service(id)),
    renderDeploys: async (id: string): Promise<RenderDeployment[]> => (await request("render", `${service(id)}/deploys?limit=100`)).map((item: { deploy: RenderDeployment }) => item.deploy),
    renderDeploy: (id: string, image: string): Promise<RenderDeployment> => request("render", `${service(id)}/deploys`, { imageUrl: image }),
    renderGet: (id: string, deployId: string): Promise<RenderDeployment> => request("render", `${service(id)}/deploys/${encodeURIComponent(deployId)}`),
    pagesProject: (account: string, name: string) => request("pages", project(account, name)),
    pagesDeploys: (account: string, name: string): Promise<PagesDeployment[]> => request("pages", `${project(account, name)}/deployments?per_page=100`),
    pagesRollback: (account: string, name: string, id: string): Promise<PagesDeployment> => request("pages", `${project(account, name)}/deployments/${encodeURIComponent(id)}/rollback`, {}),
  };
}

export async function publishPages(directory: string, options: { accountId: string; projectName: string; productionBranch: string; commit: string; intentId: string; token: string; timeoutMs: number }) {
  const require = createRequire(path.join(__dirname, "cloud-providers.js"));
  const cli = path.join(path.dirname(require.resolve("wrangler/package.json")), "bin", "wrangler.js");
  z.string().regex(/^[a-f0-9]{40}$/).parse(options.commit);
  // The executable and argument structure are fixed; stdout/stderr may contain provider details and are never journaled.
  const inherited = Object.fromEntries(["PATH", "Path", "SystemRoot", "WINDIR", "HOME", "USERPROFILE", "TEMP", "TMP", "NODE_EXTRA_CA_CERTS"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  await promisify(execFile)(process.execPath, [cli, "pages", "deploy", directory, "--project-name", options.projectName, "--branch", options.productionBranch, "--commit-hash", options.commit, "--commit-message", `crm-intent:${options.intentId}`], {
    cwd: directory, timeout: options.timeoutMs, maxBuffer: 1048576, env: { ...inherited, CLOUDFLARE_ACCOUNT_ID: options.accountId, CLOUDFLARE_API_TOKEN: options.token, WRANGLER_SEND_METRICS: "false", CI: "true" }, windowsHide: true,
  });
}
