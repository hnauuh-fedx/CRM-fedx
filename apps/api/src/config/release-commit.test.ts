import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseCommit } from "./release-commit";

test("local and Compose version identity is preserved, with Render metadata as an optional fallback", () => {
  assert.equal(releaseCommit({}), "development");
  assert.equal(releaseCommit({ RELEASE_COMMIT: "compose", RENDER_GIT_COMMIT: "render" }), "compose");
  assert.equal(releaseCommit({ RENDER_GIT_COMMIT: "render" }), "render");
});
