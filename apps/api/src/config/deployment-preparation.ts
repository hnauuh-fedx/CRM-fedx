import { postgresEnvironmentSchema } from "@admission-crm/shared/postgres-config";
import { objectStorageConfigSchema } from "../modules/files/object-storage.config";

export type PreparationCheck = { name: string; status: "ready" | "pending" | "invalid"; message: string };
export function checkDeploymentPreparation(input: Record<string, unknown>, target: "local" | "cloud") {
  const checks: PreparationCheck[] = [];
  const database = postgresEnvironmentSchema.safeParse(input);
  checks.push({ name: "postgres", status: database.success ? "ready" : "invalid", message: database.success ? "Cấu hình hợp lệ; chưa kiểm tra kết nối." : "Kiểm tra DATABASE_URL, TLS và giới hạn pool." });
  const storage = objectStorageConfigSchema.safeParse(input);
  checks.push({ name: "storage", status: storage.success ? "ready" : "invalid", message: storage.success ? "Cấu hình adapter hợp lệ; chưa upload hoặc đổi luồng đính kèm." : "Kiểm tra các biến S3 bắt buộc và endpoint." });
  if (target === "cloud") {
    checks.push({ name: "database-tls", status: database.success && database.data.DATABASE_SSL_MODE === "verify-full" ? "ready" : "pending", message: "Cloud cần TLS xác minh chứng chỉ; kết nối giữ khóa cần direct/session pooling." });
    const origin = typeof input.WEB_ORIGIN === "string" ? input.WEB_ORIGIN : "";
    checks.push({ name: "web-origin", status: /^https:\/\//.test(origin) ? "ready" : "pending", message: "Đặt WEB_ORIGIN HTTPS chính thức và kiểm thử cookie/CORS/proxy." });
    checks.push({ name: "storage-workflow", status: storage.success && storage.data.FILE_UPLOADS_ENABLED && storage.data.FILE_STORAGE_PROVIDER === "s3" ? "ready" : "pending", message: "Luồng private file đã có; cần migration, cấu hình provider và nghiệm thu quyền/cleanup trên staging." });
    checks.push({ name: "release-orchestration", status: "pending", message: "Executor cloud đã có; xác minh cấu hình controller và diễn tập deploy/rollback/recovery trên staging trước khi bật production." });
    checks.push({ name: "provider-verification", status: "pending", message: "Chưa xác minh Redis noeviction/persistence, trusted sources, backup/restore, callback và kiểm thử tải trên tài khoản thật." });
  }
  return { target, networkAccess: false, checks };
}
