import { z } from "zod";

import { env, gptApiKey } from "../../../config/env";

const extractionSchema = z.object({
  isLeadInformation: z.boolean(),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  majorText: z.string().nullable(),
  address: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ZaloLeadExtraction = z.infer<typeof extractionSchema>;

function responseText(payload: unknown) {
  const response = payload as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("OpenAI không trả về nội dung trích xuất.");
}

export function mayContainLeadInformation(text: string) {
  const normalized = text.replace(/[\s.()-]/g, "");
  return /(?:\+?84|0)\d{9,10}/.test(normalized) || /(?:số điện thoại|sđt|điện thoại|phone)\s*:/i.test(text);
}

export function normalizeVietnamPhone(value: string | null) {
  if (!value) return null;
  let phone = value.replace(/[^\d+]/g, "");
  if (phone.startsWith("+84")) phone = `0${phone.slice(3)}`;
  if (phone.startsWith("84") && phone.length >= 11) phone = `0${phone.slice(2)}`;
  return /^0\d{9}$/.test(phone) ? phone : null;
}

export async function extractLeadInformation(conversation: string): Promise<ZaloLeadExtraction> {
  if (!gptApiKey) throw new Error("GPT_API_KEY chưa được cấu hình.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${gptApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.GPT_MODEL,
      reasoning: { effort: "none" },
      input: [
        {
          role: "developer",
          content: "Bạn trích xuất thông tin ứng viên từ hội thoại tuyển sinh tiếng Việt. Chỉ lấy dữ liệu người dùng cung cấp, không lấy dữ liệu trong câu hỏi mẫu của nhân viên. Không tự suy đoán dữ liệu còn thiếu.",
        },
        { role: "user", content: conversation },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "zalo_lead_information",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              isLeadInformation: { type: "boolean" },
              fullName: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              email: { type: ["string", "null"] },
              majorText: { type: ["string", "null"] },
              address: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["isLeadInformation", "fullName", "phone", "email", "majorText", "address", "confidence"],
          },
        },
      },
      max_output_tokens: 300,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: { message?: string } }).error?.message;
    throw new Error(message || `OpenAI API trả về HTTP ${response.status}.`);
  }
  return extractionSchema.parse(JSON.parse(responseText(payload)));
}
