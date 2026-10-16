import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { marketingFormQueryKey, marketingFormRequestOptions } from "../src/modules/marketing/marketing-form-query-scope";
import { canReviewMarketingFormSubmission } from "../src/modules/marketing/marketing-form-review-permissions";
import type { AuthUser } from "../src/types/auth";

test("all form resources have separate program caches", () => {
  for (const resource of ["list", "detail", "options", "submissions", "review-candidates", "lead-history"]) {
    assert.notDeepEqual(marketingFormQueryKey("program-a", resource, "form"), marketingFormQueryKey("program-b", resource, "form"));
  }
});

test("review action requires form management, Lead view/update and writable scope, never a role name", () => {
  const user: AuthUser = { id: "fixture", email: "fixture@example.com", fullName: "Fixture", avatarUrl: null, roles: ["admin"], departmentIds: [], institutionProgramIds: ["fixture"], accessScope: "ALL", permissions: [] };
  assert.equal(canReviewMarketingFormSubmission(null), false);
  assert.equal(canReviewMarketingFormSubmission(user), false);
  const permissions = ["marketing_form.manage", "lead.view_all", "lead.update_all"];
  assert.equal(canReviewMarketingFormSubmission({ ...user, roles: [], permissions }), true);
  assert.equal(canReviewMarketingFormSubmission({ ...user, permissions, accessScope: "READ_ONLY" }), false);
  for (const missing of permissions) assert.equal(canReviewMarketingFormSubmission({ ...user, permissions: permissions.filter((key) => key !== missing) }), false);
});

test("late result from previous program cannot replace the new program result", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let resolveOld!: (value: string) => void;
  const oldKey = marketingFormQueryKey("program-a", "detail", "same-form");
  const newKey = marketingFormQueryKey("program-b", "detail", "same-form");
  try {
    const oldRequest = client.fetchQuery({ queryKey: oldKey, queryFn: () => new Promise<string>((resolve) => { resolveOld = resolve; }) });
    await client.fetchQuery({ queryKey: newKey, queryFn: async () => "current-program" });
    resolveOld("previous-program");
    await oldRequest;
    assert.equal(client.getQueryData(newKey), "current-program");
    assert.equal(client.getQueryData(oldKey), "previous-program");
  } finally { client.clear(); }
});

test("captured program header and AbortSignal stay tied to their request", () => {
  let selected = "program-a";
  const controller = new AbortController();
  const request = marketingFormRequestOptions(selected, controller.signal);
  selected = "program-b";
  assert.equal(new Headers(request.headers).get("X-Institution-Program-Id"), "program-a");
  assert.equal(new Headers(marketingFormRequestOptions(selected).headers).get("X-Institution-Program-Id"), "program-b");
  controller.abort();
  assert.equal(request.signal?.aborted, true);
});

test("cancelling an old query propagates to request without touching new program cache", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const oldKey = marketingFormQueryKey("program-a", "submissions", "form", 1);
  const newKey = marketingFormQueryKey("program-b", "submissions", "form", 1);
  let requestSignal: AbortSignal | undefined;
  try {
    const pending = client.fetchQuery({ queryKey: oldKey, queryFn: ({ signal }) => {
      requestSignal = signal;
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    } }).catch(() => null);
    client.setQueryData(newKey, ["current"]);
    await client.cancelQueries({ queryKey: oldKey });
    await pending;
    assert.equal(requestSignal?.aborted, true);
    assert.deepEqual(client.getQueryData(newKey), ["current"]);
  } finally { client.clear(); }
});
