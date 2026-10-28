# Lead history execution source

Verified 2026-10-28. No schema migration or React changes.

Activity and recent-change labels now use explicit execution provenance independently of the permission principal. Webhooks record their captured name and request identity; automation actions and delayed reassignment record the rule identity/name. Existing user IDs remain available for audit and authorization.

Legacy webhook updates and automation event types receive system labels. Legacy source receipts use a generic system label because they can originate from either forms or webhooks. Historical assignments without execution provenance retain their original attribution; no timestamp or role-based inference is used.

## Changed files

- apps/api/src/database/history-source.ts: async execution context and additive history metadata.
- apps/api/src/database/prisma.ts: enrich activity/audit create calls, including transaction clients.
- apps/api/src/modules/leads/lead-inbound.service.ts: enter inbound execution context.
- apps/api/src/modules/automations/automation-action-registry.ts: enter rule context for actions.
- apps/api/src/modules/automations/automation-reassignment.service.ts: enter rule context for delayed reassignment.
- apps/api/src/modules/leads/lead-history-actor.ts: Vietnamese source labels and conservative legacy handling.
- apps/api/src/modules/leads/lead-list.service.ts: labels for both tabs; omit technical metadata from changed-field descriptions.
- apps/api/src/database/history-source.test.ts: concurrent/nested context isolation and legacy/manual labels.
- apps/api/src/integration/lead-history-source.integration.ts: inbound + actual automation executor + detail serialization + responsible user + rollback.
- apps/api/src/integration/customer-source-flow.integration.ts: both-tab labels for queued webhook updates/source receipts; fix existing cleanup of program lead channels.
- apps/api/src/integration/automation-reassignment.integration.ts: assert rule metadata on both assignment and reassignment events/audit.

## Verification

All passed:

- From apps/api: node --import tsx --test src/database/history-source.test.ts src/modules/leads/lead-creation-history.test.ts (10 tests).
- From apps/api: node scripts/test-manual-unassignment-isolated.cjs lead-history-source customer-source-flow automation-reassignment (3 integration suites, disposable local database).
- npm run typecheck --workspace @admission-crm/api.
- git diff --check.

Integration logs are in this directory. API serialization was verified; no browser visual check was run because the existing UI already prioritizes actorLabel and no React code changed.
