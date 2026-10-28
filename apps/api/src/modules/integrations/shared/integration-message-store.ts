// Prisma may emulate an empty-update upsert with a read followed by insert.
// Concurrent API replicas must treat the unique provider-event conflict as the same durable message.
export async function storeIntegrationMessage<T>(upsert: () => Promise<T>, readExisting: () => Promise<T>): Promise<T> {
  try { return await upsert(); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return readExisting();
    throw error;
  }
}
