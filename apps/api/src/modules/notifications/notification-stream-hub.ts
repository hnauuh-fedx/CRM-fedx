export type NotificationStreamListener = () => void;

/** In-memory fan-out of "your notifications changed" signals to the recipient's open streams. */
export function createNotificationStreamHub(maxStreamsPerUser: number) {
  const listeners = new Map<string, Set<NotificationStreamListener>>();

  return {
    /** Returns null when the user already holds the maximum number of open streams. */
    subscribe(userId: string, listener: NotificationStreamListener) {
      const userListeners = listeners.get(userId) ?? new Set<NotificationStreamListener>();
      if (userListeners.size >= maxStreamsPerUser) return null;
      userListeners.add(listener);
      listeners.set(userId, userListeners);
      return () => {
        userListeners.delete(listener);
        if (userListeners.size === 0 && listeners.get(userId) === userListeners) listeners.delete(userId);
      };
    },
    publish(userId: string) {
      for (const listener of listeners.get(userId) ?? []) listener();
    },
    /** Signals may have been missed (listener reconnected): every open stream refetches. */
    publishAll() {
      for (const userListeners of listeners.values()) for (const listener of userListeners) listener();
    },
    streamCount() {
      let count = 0;
      for (const userListeners of listeners.values()) count += userListeners.size;
      return count;
    },
  };
}
