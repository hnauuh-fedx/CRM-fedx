import type { Deployment, DeploymentRequest, Release, ReleaseOverview, ReleasePage } from "@admission-crm/shared/releases";
import { apiRequest } from "./api";

const base = "/system/releases";
export const getReleaseOverview = (token: string) => apiRequest<ReleaseOverview>(`${base}/overview`, {}, token);
export const listReleases = (token: string, page: number, search: string) => apiRequest<ReleasePage<Release>>(`${base}/releases?${new URLSearchParams({ page: String(page), search })}`, {}, token);
export const listDeployments = (token: string, page: number) => apiRequest<ReleasePage<Deployment>>(`${base}/deployments?page=${page}`, {}, token);
export const requestDeployment = (token: string, input: DeploymentRequest) => apiRequest<Deployment>(`${base}/deployments`, { method: "POST", body: JSON.stringify(input) }, token);
export const getDeploymentEvents = (token: string, id: string, page: number) => apiRequest<{ data: { id: string; message: string; createdAt: string }[] }>(`${base}/deployments/${id}/events?page=${page}`, {}, token);
