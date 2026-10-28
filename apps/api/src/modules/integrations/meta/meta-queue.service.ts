import { Queue } from "bullmq";
import { env } from "../../../config/env";
import { redisCommandConnection } from "../../../config/redis";
import { enqueueStoredMessage } from "../shared/integration-queue";

export const META_QUEUE_NAME = "meta_messenger_integration_queue";
export const metaQueue = redisCommandConnection && env.META_QUEUE_ENABLED ? new Queue(META_QUEUE_NAME, { connection: redisCommandConnection as never }) : null;
export const enqueueMetaMessage = (id: string) => enqueueStoredMessage(metaQueue, "meta", id);
