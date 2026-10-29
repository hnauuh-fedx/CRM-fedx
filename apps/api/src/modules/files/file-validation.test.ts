import assert from "node:assert/strict";
import { test } from "node:test";
import { validatePrivateFile } from "./file-validation";

test("private uploads reject MIME spoofing, paths and oversize before storage access", () => {
  const pdf = { originalname: "Hồ sơ.pdf", mimetype: "application/pdf", buffer: Buffer.from("%PDF-1.4\nsynthetic fixture\n%%EOF") };
  assert.equal(validatePrivateFile(pdf, 1024).type, "application/pdf");
  assert.throws(() => validatePrivateFile({ ...pdf, buffer: Buffer.from("<html>fake</html>") }, 1024));
  assert.throws(() => validatePrivateFile({ ...pdf, originalname: "../file.pdf" }, 1024));
  assert.throws(() => validatePrivateFile(pdf, 2));
  assert.throws(() => validatePrivateFile({ ...pdf, mimetype: "text/html" }, 1024));
});
