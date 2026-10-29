// Explicit preparation command: builds local artifacts only. No provider SDKs or upload/deploy calls.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import * as tar from 'tar';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts/cloud-preparation');
function publicUrl(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing public build setting: ${name}`);
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(`Invalid public HTTPS build setting: ${name}`);
  return value;
}
async function main() {
  const apiUrl = publicUrl('VITE_API_URL'), webUrl = publicUrl('VITE_PUBLIC_WEB_URL');
  const environment = process.env.CLOUD_ARTIFACT_ENVIRONMENT || 'staging';
  if (!['staging', 'production'].includes(environment)) throw new Error('Invalid artifact environment.');
  if (!process.env.npm_execpath) throw new Error('Run using npm run prepare:cloud:web.');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build', '--workspace', 'apps/web'], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error('Frontend build failed.');
  const { commit } = JSON.parse(await readFile(path.join(root, 'apps/web/dist/version.json'), 'utf8'));
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error('Set RELEASE_COMMIT to the exact Git SHA before preparing a cloud release.');
  await mkdir(output, { recursive: true });
  const archive = path.join(output, `web-${commit}.tar.gz`);
  const dist = path.join(root, 'apps/web/dist'), files = [];
  async function collect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not permitted in frontend artifacts.');
      if (entry.isDirectory()) await collect(path.join(directory, entry.name), relative + '/');
      else if (entry.isFile()) files.push(relative);
    }
  }
  await collect(dist);
  await tar.c({ cwd: dist, file: archive, portable: true, mtime: new Date(0), gzip: true, noDirRecurse: true }, files.sort());
  const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
  const namedArchive = `web-${environment}-${sha256}.tar.gz`;
  const { rename } = await import('node:fs/promises'); await rename(archive, path.join(output, namedArchive));
  const metadata = { commit, environment, archive: namedArchive, key: `releases/${commit}/${environment}/web-${sha256}.tar.gz`, sha256, size: (await readFile(path.join(output, namedArchive))).byteLength, apiOrigin: new URL(apiUrl).origin, webOrigin: new URL(webUrl).origin };
  await writeFile(path.join(output, `web-artifact-${environment}.json`), JSON.stringify(metadata, null, 2));
  await writeFile(path.join(output, 'web-artifact.json'), JSON.stringify({ ...metadata, executable: false }, null, 2));
  console.log('Frontend artifact and checksum prepared locally. Nothing uploaded or deployed.');
}
main().catch(() => { console.error('Cloud preparation failed. Check public HTTPS build settings, RELEASE_COMMIT, build output and tar availability.'); process.exitCode = 1; });
