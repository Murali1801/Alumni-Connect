/** JSON fetch for the Learning hub API; throws the server's message on failure. */
export async function learningApi<T = unknown>(url: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again.');
  return data as T;
}

/** The message to show for a failed call. */
export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Try again.');
