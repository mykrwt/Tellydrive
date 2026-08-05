"use client";

export async function api<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      ...(options?.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data?.error as string) ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function jsonBody(
  url: string,
  method: string,
  body: Record<string, unknown>,
) {
  return api(url, { method, body: JSON.stringify(body) });
}
