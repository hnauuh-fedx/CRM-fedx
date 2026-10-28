import { prisma } from "../../../database/prisma";
import { runIntegrationTask } from "./integration-task-receipt";

export async function processDurableIntegrationMessage(provider: "zalo" | "meta", messageId: string, action: () => Promise<void>) {
  const message = provider === "zalo"
    ? await prisma.zalo_messages.findUnique({ where: { id: messageId } })
    : await prisma.meta_messages.findUnique({ where: { id: messageId } });
  if (!message) return;
  const taskKey = `message:${provider}:${messageId}`;
  if (["completed", "ignored", "needs_review"].includes(message.processing_status)) {
    const receipt = await prisma.integration_task_receipts.findUnique({ where: { task_key: taskKey }, select: { status: true } });
    if (!receipt || receipt.status === "completed") return;
  }
  const remoteId = "zalo_user_id" in message ? message.zalo_user_id : message.sender_psid;
  const terminal = async () => {
    const current = provider === "zalo" ? await prisma.zalo_messages.findUnique({ where: { id: messageId }, select: { processing_status: true } }) : await prisma.meta_messages.findUnique({ where: { id: messageId }, select: { processing_status: true } });
    return Boolean(current && ["completed", "ignored", "needs_review"].includes(current.processing_status));
  };
  const review = () => provider === "zalo"
    ? prisma.zalo_messages.updateMany({ where: { id: messageId }, data: { processing_status: "needs_review", processing_error: "Tác vụ bị gián đoạn hoặc chưa rõ kết quả; cần đối soát trước khi chạy lại.", processed_at: new Date() } })
    : prisma.meta_messages.updateMany({ where: { id: messageId }, data: { processing_status: "needs_review", processing_error: "Tác vụ bị gián đoạn hoặc chưa rõ kết quả; cần đối soát trước khi chạy lại.", processed_at: new Date() } });
  return runIntegrationTask({ key: taskKey, provider, entityId: messageId, lock: `conversation:${provider}:${message.connection_id}:${remoteId}`, review,
    action: async () => {
      if (await terminal()) return;
      await action();
      if (!await terminal()) throw new Error("Message did not reach a terminal state");
    },
  });
}
