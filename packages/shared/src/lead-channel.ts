import { z } from "zod";

/** "Nguồn" values are per program and distinct from Nguồn học viên (lead-source). */
export const leadChannelInputSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nguồn.").max(255, "Tên nguồn không được vượt quá 255 ký tự."),
}).strict();

export const leadChannelStatusSchema = z.object({
  isActive: z.boolean(),
}).strict();

export type LeadChannelInput = z.infer<typeof leadChannelInputSchema>;

/** Matching key for inbound values: case-insensitive, trimmed, single spaces. */
export function normalizeLeadChannelName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Values added automatically from inbound data are shown with a trailing "*" until reviewed. */
export function formatLeadChannelName(channel: { name: string; isAutoCreated: boolean }) {
  return channel.isAutoCreated ? `${channel.name}*` : channel.name;
}
