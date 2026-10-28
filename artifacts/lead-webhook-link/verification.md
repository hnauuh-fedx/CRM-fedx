# Lead creation webhook link

The webhook name in lead creation history links directly to /quan-ly/tich-hop/webhooks?webhookId=ID. Both the activity and recent changes tabs render the link. The webhook page reads selection from the URL, including on direct loads.

Links are returned only for existing webhooks in the lead's program and users with webhook.view or webhook.manage. The UI also checks that permission. Historical names remain intact after a webhook rename. Deleted, missing, or out-of-program webhook references remain plain text.

Changed files:
- apps/api/src/modules/leads/lead-list.service.ts: batched, permission- and program-scoped webhook reference lookup.
- apps/web/src/modules/leads/lead.types.ts: optional sourceWebhook reference.
- apps/web/src/modules/leads/pages/lead-detail-page.tsx: inline keyboard-accessible link in both tabs.
- apps/web/src/modules/webhooks/pages/webhooks-page.tsx: URL-based webhook selection.
- apps/api/src/integration/customer-source-flow.integration.ts: permission, cross-program and snapshot-name assertions.
- apps/web/tests/lead-creation-history-smoke.tsx: authenticated fixture and real webhook destination page.
- apps/web/tests/lead-creation-history.browser.mjs: link, navigation, direct load, permission and responsive checks.

Passed:
- Backend and frontend typecheck.
- Frontend production build.
- customer-source-flow integration in a disposable local database.
- Browser smoke: both tabs at 1440/390/375px, click to actual webhook page, direct URL load, hidden link without permission, no horizontal overflow.
- git diff --check for changed files.
- React Doctor: no new diagnostics. Same-file comparison scored 93 before and 93 after; both reports contain the same pre-existing LeadDetailPage complexity warning. The initial diff-only scan scored 100 because those two files were not yet included in its changed-file set.

Screenshots and reports are in this directory.
