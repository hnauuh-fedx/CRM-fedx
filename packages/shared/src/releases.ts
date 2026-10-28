import { z } from "zod";

export const releasePermissions = { view: "release.view", deploy: "release.deploy" } as const;
export const environmentSchema = z.enum(["staging", "production"]);
export type ReleaseEnvironment = z.infer<typeof environmentSchema>;
export const releaseRegistrationSchema = z.object({
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  version: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(4000).default(""),
  apiImage: z.string().regex(/^[a-z0-9][a-z0-9./_-]+@sha256:[a-f0-9]{64}$/),
  webImage: z.string().regex(/^[a-z0-9][a-z0-9./_-]+@sha256:[a-f0-9]{64}$/),
  schemaGeneration: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
  buildUrl: z.string().url().startsWith("https://").max(500),
}).strict();
export type ReleaseRegistration = z.infer<typeof releaseRegistrationSchema>;
export type Release = ReleaseRegistration & { id: string; createdAt: string };
export const deploymentRequestSchema = z.object({
  releaseId: z.uuid(),
  environment: environmentSchema,
  operation: z.enum(["deploy", "rollback"]),
  requestId: z.uuid(),
  reason: z.string().trim().min(5, "Nhập lý do tối thiểu 5 ký tự.").max(500),
}).strict();
export type DeploymentRequest = z.infer<typeof deploymentRequestSchema>;
export const releaseActorSchema = z.object({ id: z.uuid(), name: z.string().min(1).max(200) }).strict();
export const releasePageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
});
export type ReleasePage<T> = { data: T[]; pagination: { page: number; totalPages: number; total: number } };
export type DeploymentStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "NEEDS_REVIEW";
export type Deployment = DeploymentRequest & {
  id: string; version: string; status: DeploymentStatus; actorName: string;
  createdAt: string; finishedAt: string | null; message: string;
};
export type EnvironmentState = {
  name: ReleaseEnvironment; schemaGeneration: string; currentReleaseId: string | null;
  version: string | null; blocked: boolean; activeDeploymentId: string | null;
};
export type ReleaseOverview = { configured: boolean; environments: EnvironmentState[] };

// Infrastructure changes are global. A program-scoped permission must not affect other programs.
export function canAccessReleases(user: { accessScope: string; permissions: string[] }, action: "view" | "deploy") {
  return user.accessScope === "ALL" && user.permissions.includes(releasePermissions.view)
    && (action === "view" || user.permissions.includes(releasePermissions.deploy));
}

export function deploymentBlockReason(input: {
  generation: string; targetGeneration: string; busy: boolean; blocked: boolean;
  currentReleaseId: string | null; releaseId: string; environment: ReleaseEnvironment;
  staged: boolean; operation: "deploy" | "rollback"; previouslyDeployed: boolean;
}): string | null {
  if (input.blocked) return "Môi trường cần được kiểm tra và đối soát trước khi triển khai tiếp.";
  if (input.busy) return "Môi trường đang có một lần triển khai chưa kết thúc.";
  if (input.generation !== input.targetGeneration) return "Phiên bản không tương thích thế hệ database hiện tại. Cần quy trình migration riêng.";
  if (input.currentReleaseId === input.releaseId) return "Phiên bản này đang được sử dụng.";
  if (input.environment === "production" && !input.staged) return "Phiên bản phải chạy thành công tại staging trước khi đưa vào vận hành.";
  if (input.operation === "rollback" && !input.previouslyDeployed) return "Chỉ có thể quay về phiên bản đã từng chạy thành công tại môi trường này.";
  return null;
}
