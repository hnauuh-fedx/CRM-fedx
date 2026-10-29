import type { Plugin } from "vite";

export function releaseVersionPlugin(): Plugin {
  let apiOrigin = "http://localhost:3000", webOrigin = "http://localhost:5173";
  return {
    name: "crm-release-version",
    configResolved(config) {
      apiOrigin = new URL(config.env.VITE_API_URL || "http://localhost:3000/api", "http://localhost:3000").origin;
      webOrigin = new URL(config.env.VITE_PUBLIC_WEB_URL || "http://localhost:5173").origin;
    },
    generateBundle() {
      const commit = process.env.RELEASE_COMMIT || process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || "development";
      if (commit !== "development" && !/^[a-f0-9]{40}$/i.test(commit)) throw new Error("Release commit must be a full Git SHA.");
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ commit, apiOrigin, webOrigin }) });
    },
  };
}
