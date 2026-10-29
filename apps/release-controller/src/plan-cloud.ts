import { readFile } from "node:fs/promises";
import { prepareCloudDeployment } from "./cloud-plan";

async function main() {
  const [manifestPath, topologyPath, ...extra] = process.argv.slice(2);
  if (!manifestPath || !topologyPath || extra.length) throw new Error("Usage: npm run plan:cloud --workspace apps/release-controller -- <release.json> <cloud-topology.json>");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const topology = JSON.parse(await readFile(topologyPath, "utf8"));
  console.log(JSON.stringify(prepareCloudDeployment(manifest, topology), null, 2));
}
void main().catch(() => { console.error("Cloud plan is invalid. Check the manifest, service IDs, origins and schema generation; no deployment was attempted."); process.exitCode = 1; });
