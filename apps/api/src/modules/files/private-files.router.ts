import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuthentication } from "../../middlewares/auth.middleware";
import { getInstitutionProgramScope } from "../institutions/institution-program-scope";
import { assertFileTarget, type UploadTarget } from "./private-file-access";
import { assertUploadsEnabled, downloadPrivateFile, fileConfig, uploadPrivateFile } from "./private-file.service";
import { PrivateFileError, privateFileTypes } from "./file-validation";

export const privateFilesRouter = Router();
privateFilesRouter.use(["/files", "/leads/:leadId/files/upload", "/admissions/:leadId/files/upload"], requireAuthentication, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
privateFilesRouter.get("/files/capabilities", (_req, res) => {
  const c = fileConfig(); res.json({ uploadEnabled: c.FILE_UPLOADS_ENABLED && c.FILE_STORAGE_PROVIDER === "s3", maxBytes: c.FILE_UPLOAD_MAX_BYTES, allowedTypes: privateFileTypes });
});
let active = 0;
const gate: RequestHandler = async (req, res, next) => {
  try {
    const c = assertUploadsEnabled();
    if (active >= c.FILE_UPLOAD_CONCURRENCY) throw new PrivateFileError(429, "Đang có nhiều tệp được xử lý. Vui lòng thử lại sau.");
    const leadId = z.uuid().parse(req.params.leadId), programId = getInstitutionProgramScope(req);
    const requestId = z.uuid().parse(req.header("x-request-id"));
    if (!programId) throw new PrivateFileError(403, "Chọn chương trình trước khi tải tệp.");
    const domain = req.path.startsWith("/admissions/") ? "admission" : "lead";
    const documentType = domain === "admission" ? z.string().trim().min(1).max(150).parse(req.query.documentType) : undefined;
    const target: UploadTarget = { domain, leadId, programId, documentType };
    await assertFileTarget(req.authUser!, target, true);
    if (active >= c.FILE_UPLOAD_CONCURRENCY) throw new PrivateFileError(429, "Đang có nhiều tệp được xử lý. Vui lòng thử lại sau.");
    active++; let released = false, processing = false;
    const release = () => { if (!released) { released = true; active--; } };
    res.once("close", () => { if (!processing) release(); });
    multer({ storage: multer.memoryStorage(), limits: { fileSize: c.FILE_UPLOAD_MAX_BYTES, files: 1, fields: 0, parts: 2 } }).single("file")(req, res, error => {
      if (error) { release(); res.status(400).json({ message: "Tệp không hợp lệ hoặc vượt dung lượng cho phép." }); return; }
      if (!req.file) { release(); res.status(400).json({ message: "Vui lòng chọn một tệp." }); return; }
      processing = true;
      void uploadPrivateFile(req.authUser!, target, requestId, req.file, req.ip).then(result => { if (!res.destroyed) res.status(201).json(result); }).catch(next).finally(release);
    });
  } catch (error) { next(error); }
};
privateFilesRouter.post("/leads/:leadId/files/upload", gate);
privateFilesRouter.post("/admissions/:leadId/files/upload", gate);
privateFilesRouter.post("/files/:fileId/download-url", async (req, res, next) => {
  try {
    const program = getInstitutionProgramScope(req);
    if (!program) throw new PrivateFileError(403, "Chọn chương trình trước khi tải tệp.");
    res.json(await downloadPrivateFile(req.authUser!, z.uuid().parse(req.params.fileId), program, req.ip));
  } catch (error) { next(error); }
});
privateFilesRouter.use(((error, _req, res, next) => {
  if (error instanceof PrivateFileError) { res.status(error.status).json({ message: error.message }); return; }
  if (error instanceof z.ZodError) { res.status(400).json({ message: "Yêu cầu tệp không hợp lệ." }); return; }
  next(error);
}) as import("express").ErrorRequestHandler);
