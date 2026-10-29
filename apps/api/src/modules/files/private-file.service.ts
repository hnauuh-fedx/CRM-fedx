import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../database/prisma";
import type { AuthUser } from "../auth/auth.types";
import { getAuthUser } from "../auth/auth.service";
import { uploadAdmissionDocument } from "../admissions/admission-document-management.service";
import { assertFileTarget, type UploadTarget } from "./private-file-access";
import { PrivateFileError, validatePrivateFile } from "./file-validation";
import { configuredObjectStorage, privateObjectKey, type ObjectStorage } from "./object-storage";
import { objectStorageConfigSchema } from "./object-storage.config";

export const fileConfig = () => objectStorageConfigSchema.parse(process.env);
let storage: ObjectStorage | null | undefined;
export function privateStorage() { return storage ??= configuredObjectStorage(); }
export function assertUploadsEnabled() {
  const config = fileConfig();
  if (!config.FILE_UPLOADS_ENABLED || config.FILE_STORAGE_PROVIDER !== "s3") throw new PrivateFileError(409, "Chức năng tải tệp chưa được bật.");
  return config;
}
export async function uploadPrivateFile(actor: AuthUser, target: UploadTarget, requestId: string, file: Express.Multer.File, ip?: string, provider = privateStorage()) {
  const config = assertUploadsEnabled();
  await assertFileTarget(actor, target, true);
  if (!provider) throw new PrivateFileError(503, "Dịch vụ lưu tệp chưa sẵn sàng.");
  const validated = validatePrivateFile(file, config.FILE_UPLOAD_MAX_BYTES);
  const fingerprint = createHash("sha256").update(JSON.stringify([target.domain, target.leadId, target.programId, target.documentType ?? "", validated])).digest("hex");
  const where = { uploaded_by_request_id: { uploaded_by: actor.id, request_id: requestId } };
  const id = randomUUID(), token = randomUUID();
  const now = new Date(), lease = new Date(now.getTime() + 600000);
  let record;
  try {
    record = await prisma.files.upsert({ where, update: {}, create: {
      id, file_name: validated.name, file_url: null, mime_type: validated.type, file_size: BigInt(validated.size), uploaded_by: actor.id,
      storage_provider: "s3", storage_status: "pending", storage_bucket: config.S3_BUCKET!, object_key: privateObjectKey(target.programId, id),
      institution_program_id: target.programId, upload_target_id: target.leadId, upload_domain: target.domain, document_type: target.documentType,
      request_id: requestId, request_fingerprint: fingerprint, content_sha256: validated.checksum, operation_token: token, lease_until: lease,
    } });
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
    record = await prisma.files.findUniqueOrThrow({ where });
  }
  if (record.request_fingerprint !== fingerprint) throw new PrivateFileError(409, "Mã yêu cầu đã được dùng cho tệp hoặc hồ sơ khác.");
  if (record.storage_status === "ready") return { id: record.id, replayed: true };
  if (record.storage_status !== "pending") throw new PrivateFileError(409, "Lần tải trước chưa hoàn tất. Hãy chọn lại tệp để tạo yêu cầu mới.");
  if (record.operation_token !== token) {
    // A crashed upload may be resumed only after its lease expires; a fresh request never races an active writer.
    const claimed = await prisma.files.updateMany({ where: { id: record.id, storage_status: "pending", lease_until: { lt: now } }, data: { operation_token: token, lease_until: lease } });
    if (!claimed.count) throw new PrivateFileError(409, "Tệp đang được xử lý. Vui lòng thử lại sau.");
  }
  try {
    await provider.put(record.object_key!, file.buffer, validated.type);
    const head = await provider.inspect(record.object_key!);
    if (head.size !== validated.size || head.contentType !== validated.type) throw new PrivateFileError(503, "Không xác nhận được nội dung tệp đã lưu.");
    const fresh = await getAuthUser(actor.id, target.programId);
    if (!fresh) throw new PrivateFileError(403, "Tài khoản không còn quyền truy cập.");
    await assertFileTarget(fresh, target, true);
    if (target.domain === "admission") {
      const result = await uploadAdmissionDocument(fresh, { leadId: target.leadId, documentType: target.documentType! }, ip, target.programId, {
        managedFile: { id: record.id, token }, afterMutation: tx => assertFileTarget(fresh, target, true, tx),
      });
      if (!result.ok) throw new PrivateFileError(404, "Không tìm thấy hồ sơ tuyển sinh.");
    } else {
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM files WHERE id=${record.id}::uuid FOR UPDATE`;
        await assertFileTarget(fresh, target, true, tx);
        const claim = await tx.files.updateMany({ where: { id: record.id, storage_status: "pending", operation_token: token, lease_until: { gt: new Date() } }, data: { storage_status: "ready", lease_until: null, operation_token: null } });
        if (!claim.count) throw new PrivateFileError(409, "Tệp không còn ở lượt xử lý hiện tại.");
        await tx.file_relations.create({ data: { file_id: record.id, entity_type: "lead", entity_id: target.leadId } });
        await tx.lead_activities.create({ data: { lead_id: target.leadId, user_id: actor.id, type: "file_attached", content: `Đính kèm tệp ${validated.name}.`, metadata: { fileId: record.id } } });
        await tx.audit_logs.create({ data: { user_id: actor.id, entity_type: "lead", entity_id: target.leadId, action: "file_attached", ip_address: ip, new_data: { fileId: record.id } } });
      });
    }
    return { id: record.id, replayed: false };
  } catch (error) {
    await prisma.files.updateMany({ where: { id: record.id, operation_token: token, storage_status: "pending" }, data: { storage_status: "failed", lease_until: new Date() } }).catch(() => {});
    if (error instanceof PrivateFileError) throw error;
    throw new PrivateFileError(503, "Chưa xác nhận được kết quả tải tệp. Vui lòng kiểm tra lại trước khi tải mới.");
  }
}

export async function downloadPrivateFile(actor: AuthUser, id: string, programId: string, ip?: string, provider = privateStorage()) {
  const file = await prisma.files.findFirst({ where: { id, storage_provider: "s3", storage_status: "ready", institution_program_id: programId }, include: { file_relations: { take: 100 } } });
  if (!file || !file.upload_target_id || !file.upload_domain || !provider || file.storage_bucket !== fileConfig().S3_BUCKET) throw new PrivateFileError(404, "Không tìm thấy tệp có thể tải.");
  const target = { domain: file.upload_domain as UploadTarget["domain"], leadId: file.upload_target_id, programId };
  await assertFileTarget(actor, target, false);
  const related = target.domain === "lead"
    ? file.file_relations.some(relation => relation.entity_type === "lead" && relation.entity_id === target.leadId)
    : Boolean(await prisma.admission_documents.findFirst({ where: { file_id: id, lead_id: target.leadId }, select: { id: true } }));
  if (!related) throw new PrivateFileError(404, "Tệp không còn được liên kết với hồ sơ.");
  const url = await provider.downloadUrl(file.object_key!, file.file_name);
  await prisma.audit_logs.create({ data: { user_id: actor.id, entity_type: "file", entity_id: id, action: "download_authorized", ip_address: ip, new_data: { leadId: target.leadId } } });
  return { url, expiresIn: fileConfig().S3_SIGNED_URL_SECONDS };
}

export async function cleanupPrivateFiles(provider = privateStorage(), limit = 50) {
  if (!provider) return 0;
  const config = fileConfig(), token = randomUUID();
  const cutoff = new Date(Date.now() - config.FILE_CLEANUP_TTL_SECONDS * 1000);
  const rows = await prisma.$queryRaw<Array<{ id: string; object_key: string }>>`
    WITH candidates AS (SELECT f.id FROM files f WHERE storage_provider='s3' AND storage_bucket=${config.S3_BUCKET ?? ""}
      AND storage_status IN ('pending','failed','deleting') AND created_at < ${cutoff} AND lease_until < now()
      AND NOT EXISTS(SELECT 1 FROM file_relations r WHERE r.file_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM admission_documents d WHERE d.file_id=f.id)
      ORDER BY lease_until LIMIT ${Math.min(100, Math.max(1, limit))} FOR UPDATE SKIP LOCKED)
    UPDATE files SET storage_status='deleting',operation_token=${token}::uuid,lease_until=now()+interval '10 minutes'
    WHERE id IN(SELECT id FROM candidates) RETURNING id,object_key`;
  for (const row of rows) {
    try {
      await provider.delete(row.object_key);
      await prisma.$transaction(async tx => {
        const done = await tx.files.updateMany({ where: { id: row.id, operation_token: token, storage_status: "deleting", file_relations: { none: {} }, admission_documents: { none: {} } }, data: { storage_status: "deleted", lease_until: null, operation_token: null } });
        if (done.count) await tx.audit_logs.create({ data: { entity_type: "file", entity_id: row.id, action: "orphan_upload_deleted", new_data: { reason: "Expired unlinked private upload" } } });
      });
    } catch { /* Remains deleting until lease expiry; independent retry never touches ready files. */ }
  }
  return rows.length;
}
