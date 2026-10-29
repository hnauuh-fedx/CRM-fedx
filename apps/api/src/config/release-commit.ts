export function releaseCommit(input: Record<string, string | undefined> = process.env) {
  return input.RELEASE_COMMIT || input.RENDER_GIT_COMMIT || "development";
}
