import { Prisma } from "../../generated/prisma/client";

export type WebhookErrorCategory =
  | "VALIDATION"
  | "BUSINESS"
  | "AUTH"
  | "RATE_LIMIT"
  | "DATABASE_TRANSIENT"
  | "INFRASTRUCTURE"
  | "UNKNOWN";

export class WebhookProcessingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly category: WebhookErrorCategory,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

const transientPrismaCodes = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"]);

export function classifyWebhookError(error: unknown) {
  if (error instanceof WebhookProcessingError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && transientPrismaCodes.has(error.code)) {
    return new WebhookProcessingError("DATABASE_TRANSIENT", "Lỗi cơ sở dữ liệu tạm thời.", "DATABASE_TRANSIENT", true);
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new WebhookProcessingError("DATABASE_UNAVAILABLE", "Cơ sở dữ liệu tạm thời không khả dụng.", "DATABASE_TRANSIENT", true);
  }
  return new WebhookProcessingError("UNKNOWN_PROCESSING_ERROR", "Không thể xử lý webhook.", "UNKNOWN", true);
}
