import { useState } from "react";

type TaskState<T> = {
  data: T | undefined;
  error: Error | null;
  isPending: boolean;
};

// UI tasks and reads do not own a server mutation or cache invalidation policy.
export function useAsyncTask<TData, TVariables>({
  task,
  onSuccess,
  onSettled,
}: {
  task: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  onSettled?: () => void;
}) {
  const [state, setState] = useState<TaskState<TData>>({
    data: undefined,
    error: null,
    isPending: false,
  });
  async function runAsync(variables: TVariables) {
    setState((current) => ({ ...current, error: null, isPending: true }));
    try {
      const data = await task(variables);
      await onSuccess?.(data, variables);
      setState({ data, error: null, isPending: false });
      return data;
    } catch (cause) {
      const error =
        cause instanceof Error
          ? cause
          : new Error("Không thể thực hiện thao tác.");
      setState((current) => ({ ...current, error, isPending: false }));
      throw error;
    } finally {
      onSettled?.();
    }
  }
  return {
    ...state,
    runAsync,
    run: (variables: TVariables) => {
      void runAsync(variables).catch(() => {});
    },
    reset: () => setState({ data: undefined, error: null, isPending: false }),
  };
}
