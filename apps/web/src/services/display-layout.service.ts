import type {
  DisplayLayout,
  LayoutScreen,
  ListLayoutScreen,
  EffectiveLayout,
  LayoutDraft,
  LayoutImpact,
  LayoutTarget,
  LayoutVersion,
  DisplayField,
  PersonalLayoutWrite,
} from "@admission-crm/shared/display-layout";
import { apiRequest } from "./api";
export type LayoutDetail = DisplayLayout & {
  versions: LayoutVersion[];
  versionPage: number;
  versionPages: number;
  assignments: LayoutTarget[];
  targetLabels: Record<string, string>;
};
export type LayoutList = {
  data: DisplayLayout[];
  page: number;
  totalPages: number;
  total: number;
  fields: DisplayField[];
};
const base = "/display-layouts";
export const savePersonalDisplayLayout = (
  token: string,
  input: PersonalLayoutWrite,
  screen: ListLayoutScreen = "LEAD_LIST",
) =>
  apiRequest<EffectiveLayout>(
    `${base}/personal?screen=${screen}`,
    { method: "PUT", body: JSON.stringify(input) },
    token,
  );
export const resetPersonalDisplayLayout = (
  token: string,
  revision: number,
  screen: ListLayoutScreen = "LEAD_LIST",
) =>
  apiRequest<EffectiveLayout>(
    `${base}/personal/reset?screen=${screen}`,
    { method: "POST", body: JSON.stringify({ revision }) },
    token,
  );
export const getDisplayLayouts = (
  token: string,
  page: number,
  search: string,
  screen: LayoutScreen = "LEAD_LIST",
) =>
  apiRequest<LayoutList>(
    `${base}?${new URLSearchParams({ page: String(page), search, screen })}`,
    {},
    token,
  );
export const getDisplayLayout = (token: string, id: string, page = 1) =>
  apiRequest<LayoutDetail>(`${base}/${id}?page=${page}`, {}, token);
export const getEffectiveDisplayLayout = (
  token: string,
  screen: LayoutScreen = "LEAD_LIST",
  programId?: string,
) =>
  apiRequest<EffectiveLayout>(
    `${base}/effective?screen=${screen}`,
    programId ? { headers: { "X-Institution-Program-Id": programId } } : {},
    token,
  );
export const getDisplayLayoutTargets = (
  token: string,
  type: "USER" | "DEPARTMENT",
  search: string,
  page: number,
  departmentId?: string,
  purpose: "ASSIGNMENT" | "OWNER" = "ASSIGNMENT",
) =>
  apiRequest<{ data: Array<{ id: string; name: string }>; totalPages: number }>(
    `${base}/targets?${new URLSearchParams({ type, search, page: String(page), purpose, ...(departmentId ? { departmentId } : {}) })}`,
    {},
    token,
  );
export const saveDisplayLayout = (
  token: string,
  draft: LayoutDraft,
  departmentId: string | null,
  item?: DisplayLayout | null,
  screen: LayoutScreen = "LEAD_LIST",
) =>
  apiRequest<DisplayLayout>(
    item ? `${base}/${item.id}/draft` : base,
    {
      method: item ? "PUT" : "POST",
      body: JSON.stringify(
        item
          ? { draft, revision: item.revision }
          : { draft, managementDepartmentId: departmentId, screen },
      ),
    },
    token,
  );
export const previewDisplayLayout = (token: string, item: DisplayLayout) =>
  apiRequest<LayoutImpact>(
    `${base}/${item.id}/preview`,
    { method: "POST", body: JSON.stringify({ revision: item.revision }) },
    token,
  );
export const publishDisplayLayout = (
  token: string,
  item: DisplayLayout,
  assignmentRevision: number,
) =>
  apiRequest<DisplayLayout>(
    `${base}/${item.id}/publish`,
    {
      method: "POST",
      body: JSON.stringify({ revision: item.revision, assignmentRevision }),
    },
    token,
  );
export const restoreDisplayLayout = (
  token: string,
  item: DisplayLayout,
  version: number,
) =>
  apiRequest<DisplayLayout>(
    `${base}/${item.id}/restore`,
    {
      method: "POST",
      body: JSON.stringify({ revision: item.revision, version }),
    },
    token,
  );
