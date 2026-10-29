import { z } from "zod";
import { releaseRegistrationSchema, type ReleaseRegistration } from "@admission-crm/shared/releases";

const httpsOrigin = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
}, "Use an HTTPS origin without credentials, path or query.");
export const cloudTopologySchema = z.object({
  environment: z.enum(["staging", "production"]),
  schemaGeneration: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
  publicApiOrigin: httpsOrigin,
  publicWebOrigin: httpsOrigin,
  renderOwnerId: z.string().regex(/^(tea|usr)-[a-z0-9]+$/).optional(),
  requiredCapabilities: z.array(z.enum(["private-files-v1"])).optional(),
  pages: z.object({ accountId: z.string().regex(/^[a-f0-9]{32}$/), projectName: z.string().regex(/^[a-z0-9-]{1,63}$/), productionBranch: z.string().regex(/^[a-zA-Z0-9/_-]{1,100}$/).default("main") }).strict(),
  render: z.object({
    api: z.string(), webhooks: z.string(), automation: z.string(), integrations: z.string(), reminders: z.string(), monitor: z.string(),
  }).strict().superRefine((services, context) => {
    for (const [key, id] of Object.entries(services)) if (!/^srv-[a-z0-9]+$/.test(id)) context.addIssue({ code: "custom", path: [key], message: "A Render service ID is required." });
    if (new Set(Object.values(services)).size !== 6) context.addIssue({ code: "custom", message: "Each process must have its own service ID." });
  }),
}).strict();

// Preparation only: deliberately no HTTP clients, provider tokens, shell commands or deployment side effects.
export function prepareCloudDeployment(manifest: ReleaseRegistration, topologyInput: unknown) {
  const release = releaseRegistrationSchema.parse(manifest);
  const topology = cloudTopologySchema.parse(topologyInput);
  if (release.schemaGeneration !== topology.schemaGeneration) throw new Error("Cloud environment and release have incompatible schema generations.");
  return {
    provider: "render-cloudflare" as const, executable: false as const, environment: topology.environment,
    commit: release.commit, schemaGeneration: release.schemaGeneration,
    render: Object.entries(topology.render).map(([process, serviceId]) => ({ process, serviceId, image: release.apiImage })),
    frontend: { provider: "cloudflare-pages" as const, ...topology.pages, expectedCommit: release.commit, versionProbe: `${topology.publicWebOrigin.replace(/\/$/, "")}/version.json` },
    readinessProbe: `${topology.publicApiOrigin.replace(/\/$/, "")}/api/ready`,
    requiredBeforeExecution: [
      "Validate immutable Pages artifact and checksum for this commit.",
      "Implement provider execution, per-service deployment IDs, status polling and partial-failure reconciliation.",
      "Verify staging success, schema compatibility and an operator-approved rollback procedure.",
    ],
  };
}
