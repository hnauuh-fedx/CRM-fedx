import type { PersonalNotificationResponse } from "@/modules/notifications/notification.types";
import { apiRequest } from "./api";

export function getPersonalNotifications(accessToken: string) {
  return apiRequest<PersonalNotificationResponse>("/notifications", {}, accessToken);
}

export function markNotificationRead(notificationId: string, accessToken: string) {
  return apiRequest<{ id: string }>(`/notifications/${notificationId}/read`, { method: "PATCH" }, accessToken);
}
