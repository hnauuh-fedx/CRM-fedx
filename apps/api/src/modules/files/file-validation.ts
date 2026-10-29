import { createHash } from "node:crypto";

export const privateFileTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
export class PrivateFileError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function validatePrivateFile(file: { originalname: string; mimetype: string; buffer: Buffer }, maximum: number) {
  const { buffer, mimetype } = file;
  if (!buffer.length || buffer.length > maximum) throw new PrivateFileError(400, "Dung lượng tệp không hợp lệ.");
  const name = file.originalname.normalize("NFC").trim();
  if (!name || name.length > 200 || /[\x00-\x1f\x7f/\\]/.test(name)) throw new PrivateFileError(400, "Tên tệp không hợp lệ.");
  const pdf = buffer.subarray(0, 5).toString() === "%PDF-" && buffer.subarray(Math.max(0, buffer.length - 1024)).includes(Buffer.from("%%EOF"));
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.length >= 24 && buffer.subarray(12, 16).toString() === "IHDR";
  const jpg = buffer.length > 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 && buffer[buffer.length - 2] === 255 && buffer[buffer.length - 1] === 217;
  const valid = mimetype === "application/pdf" && /\.pdf$/i.test(name) && pdf || mimetype === "image/png" && /\.png$/i.test(name) && png || mimetype === "image/jpeg" && /\.jpe?g$/i.test(name) && jpg;
  if (!valid) throw new PrivateFileError(400, "Chỉ chấp nhận tệp PDF, JPEG hoặc PNG có nội dung đúng định dạng.");
  return { name, type: mimetype, size: buffer.length, checksum: createHash("sha256").update(buffer).digest("hex") };
}
