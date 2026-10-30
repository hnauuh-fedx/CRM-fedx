import type { PersonalNotificationResponse } from "@/modules/notifications/notification.types";
import { apiRequest, apiStream } from "./api";

export function openNotificationStream(accessToken: string, signal: AbortSignal) {
  return apiStream("/notifications/stream", accessToken, signal);
}

export function getPersonalNotifications(accessToken: string) {
  return apiRequest<PersonalNotificationResponse>("/notifications", {}, accessToken);
}

export function markNotificationRead(notificationId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/notifications/${notificationId}/read`, { method: "PATCH" }, accessToken);
}

export function hideNotificationCountdown(notificationId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/notifications/${notificationId}/countdown/hide`, { method: "PATCH" }, accessToken);
}
