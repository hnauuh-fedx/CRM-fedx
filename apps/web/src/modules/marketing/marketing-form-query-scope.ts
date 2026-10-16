export function marketingFormQueryKey(programId: string | null | undefined, resource: string, ...parts: unknown[]) {
  return ["marketing-forms", resource, programId ?? null, ...parts] as const;
}

// Capture program and cancellation at request construction, not after an await.
export function marketingFormRequestOptions(programId?: string, signal?: AbortSignal): RequestInit {
  return {
    ...(programId ? { headers: { "X-Institution-Program-Id": programId } } : {}),
    ...(signal ? { signal } : {}),
  };
}
