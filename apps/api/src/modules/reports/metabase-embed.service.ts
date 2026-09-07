import jwt from "jsonwebtoken";

import { env } from "../../config/env";
import type { AuthUser } from "../auth/auth.types";

const dashboards = {
  "sale-pipeline": {
    id: env.METABASE_DASHBOARD_SALE_PIPELINE_ID,
    name: "Dashboard Sale và pipeline",
    description: "Theo dõi lead, chuyển đổi hồ sơ và nhập học theo phạm vi được cấp.",
    permissions: ["report.view_all", "report.sale.view_department", "report.sale.view_assigned"],
  },
} as const;

export type MetabaseDashboardKey = keyof typeof dashboards;

function canAccessDashboard(user: AuthUser, key: MetabaseDashboardKey) {
  const granted = new Set(user.permissions);
  return dashboards[key].permissions.some((permission) => granted.has(permission));
}

export function getMetabaseDashboardCatalog(user: AuthUser) {
  return (Object.entries(dashboards) as [MetabaseDashboardKey, typeof dashboards[MetabaseDashboardKey]][])
    .filter(([key, dashboard]) => Boolean(dashboard.id) && canAccessDashboard(user, key))
    .map(([key, dashboard]) => ({ key, name: dashboard.name, description: dashboard.description }));
}

export function resolveMetabaseScopeKeys(user: AuthUser) {
  const permissions = new Set(user.permissions);
  if (user.accessScope === "ALL" && permissions.has("report.view_all")) return ["ALL"];
  if (user.accessScope === "OWNED_ONLY") return [`OWNED:${user.id}`];
  if (user.accessScope === "DEPARTMENT") return user.departmentIds.map((id) => `DEPARTMENT:${id}`);
  return [`ASSIGNED:${user.id}`];
}

export function createMetabaseGuestToken(user: AuthUser, key: MetabaseDashboardKey, institutionProgramId: string) {
  const dashboard = dashboards[key];
  if (!dashboard || !dashboard.id || !canAccessDashboard(user, key)) return { ok: false as const, reason: "forbidden" as const };
  if (!env.METABASE_PUBLIC_URL || !env.METABASE_EMBEDDING_SECRET) return { ok: false as const, reason: "unavailable" as const };
  const scopeKeys = resolveMetabaseScopeKeys(user);
  if (scopeKeys.length === 0) return { ok: false as const, reason: "forbidden" as const };

  const expiresAt = Math.floor(Date.now() / 1000) + env.METABASE_GUEST_TOKEN_TTL_SECONDS;
  const token = jwt.sign({
    resource: { dashboard: dashboard.id },
    params: {
      scope_key: scopeKeys,
      institution_program_id: [institutionProgramId],
    },
    exp: expiresAt,
  }, env.METABASE_EMBEDDING_SECRET);

  return {
    ok: true as const,
    data: {
      token,
      expiresAt,
      instanceUrl: env.METABASE_PUBLIC_URL.replace(/\/$/, ""),
      dashboardKey: key,
    },
  };
}
