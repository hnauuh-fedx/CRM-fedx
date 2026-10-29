import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { configuredObjectStorage, createS3ObjectStorage, privateObjectKey } from "./object-storage";
import { objectStorageConfigSchema } from "./object-storage.config";

test("URL attachment mode is unchanged and does not need cloud credentials", () => {
  assert.equal(configuredObjectStorage({}), null);
  assert.equal(objectStorageConfigSchema.safeParse({ FILE_STORAGE_PROVIDER: "s3" }).success, false);
  assert.throws(() => privateObjectKey("../../other-program"));
});

test("S3 adapter works against a loopback receiver without any cloud account", async () => {
  const key = privateObjectKey("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222");
  let received = Buffer.alloc(0); const calls: string[] = [];
  const server = createServer(async (request, response) => {
    calls.push(request.method!); assert.match(request.headers.authorization ?? "", /^AWS4-HMAC-SHA256 /);
    if (request.method === "PUT") {
      for await (const chunk of request) received = Buffer.concat([received, chunk]);
      assert.equal(request.headers["content-type"], "application/pdf"); response.writeHead(200); response.end();
    } else { response.writeHead(200, { "Content-Length": received.length, "Content-Type": "application/pdf", ETag: '"fixture"' }); response.end(); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const config = objectStorageConfigSchema.parse({ FILE_STORAGE_PROVIDER: "s3", S3_ENDPOINT: `http://127.0.0.1:${address.port}`, S3_BUCKET: "fixture", S3_REGION: "auto", S3_ACCESS_KEY_ID: "test-key", S3_SECRET_ACCESS_KEY: "test-secret", S3_FORCE_PATH_STYLE: "true" });
  const storage = createS3ObjectStorage(config);
  try {
    await storage.put(key, Buffer.from("synthetic-file"), "application/pdf");
    assert.equal(received.toString(), "synthetic-file"); assert.equal((await storage.inspect(key)).size, received.length);
    const url = new URL(await storage.downloadUrl(key, "Hồ sơ.pdf"));
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300"); assert.ok(url.searchParams.get("X-Amz-Signature"));
    assert.equal(url.pathname, `/fixture/${key}`); assert.deepEqual(calls, ["PUT", "HEAD"], "Signing download must not contact the provider");
    await assert.rejects(storage.inspect("../unauthorized"));
    assert.equal(objectStorageConfigSchema.safeParse({ ...config, S3_FORCE_PATH_STYLE: "true", S3_ENDPOINT: "http://remote.example.test" }).success, false);
  } finally { storage.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
