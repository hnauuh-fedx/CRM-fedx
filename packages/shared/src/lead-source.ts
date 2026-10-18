import { z } from "zod";

export const leadSourceInputSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nguồn.").max(150, "Tên nguồn không được vượt quá 150 ký tự."),
}).strict();

export type LeadSourceInput = z.infer<typeof leadSourceInputSchema>;
