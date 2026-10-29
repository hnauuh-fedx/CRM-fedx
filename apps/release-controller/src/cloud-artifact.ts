import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as tar from "tar";
import { config } from "./config";

export async function unpackCloudArtifact(bytes: Uint8Array, sha256: string, expectedSize: number, commit: string) {
  if (bytes.byteLength !== expectedSize || bytes.byteLength > 104857600 || createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("Frontend artifact integrity mismatch.");
  const directory = await mkdtemp(path.join(tmpdir(), "crm-pages-artifact-"));
  const archive = path.join(directory, "artifact.tar.gz"), destination = path.join(directory, "public");
  try {
    await writeFile(archive, bytes); let count = 0, expanded = 0;
    await new Promise<void>((resolve, reject) => {
      const parser = new tar.Parser({ strict: true, maxDecompressionRatio: 1000, ondone: resolve, onReadEntry: entry => {
        const name = entry.path.replace(/^\.\//, ""); expanded += entry.size; count++;
        if (count > 5000 || expanded > 104857600 || !["File", "Directory"].includes(entry.type) || name.includes("\\") || path.posix.isAbsolute(name) || name.split("/").includes("..") || /^[a-z]:/i.test(name) || name.split("/").some(part => part === "functions" || part === "_worker.js" || part.startsWith(".env") || part.startsWith("wrangler."))) { parser.abort(new Error("Unsafe frontend archive.")); return; }
        entry.resume();
      } });
      parser.on("error", reject); parser.on("abort", reject); parser.end(Buffer.from(bytes));
    });
    const { mkdir } = await import("node:fs/promises"); await mkdir(destination);
    await tar.x({ file: archive, cwd: destination, strict: true, preservePaths: false, noChmod: true });
    const version = JSON.parse(await readFile(path.join(destination, "version.json"), "utf8"));
    if (version.commit !== commit || !(await readdir(destination)).includes("index.html")) throw new Error("Frontend version mismatch.");
    return { directory: destination, close: () => rm(directory, { recursive: true, force: true }) };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}

export async function loadCloudArtifact(artifact: { key: string; sha256: string; size: number }, commit: string) {
  const client = new S3Client({ endpoint: config.CONTROL_ARTIFACT_ENDPOINT, region: "auto", forcePathStyle: true, credentials: { accessKeyId: config.CONTROL_ARTIFACT_ACCESS_KEY_ID!, secretAccessKey: config.CONTROL_ARTIFACT_SECRET_ACCESS_KEY! } });
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: config.CONTROL_ARTIFACT_BUCKET!, Key: artifact.key }), { abortSignal: AbortSignal.timeout(30000) });
    if (!result.Body || result.ContentLength !== artifact.size) throw new Error("Frontend artifact size mismatch.");
    const chunks: Buffer[] = []; let total = 0;
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) { total += chunk.length; if (total > artifact.size) throw new Error("Frontend artifact exceeds limit."); chunks.push(Buffer.from(chunk)); }
    return await unpackCloudArtifact(Buffer.concat(chunks), artifact.sha256, artifact.size, commit);
  } finally { client.destroy(); }
}
