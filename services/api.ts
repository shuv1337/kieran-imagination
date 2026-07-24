export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const GUEST_ID_KEY = 'kieran_guest_id';

/** Stable browser identity so anonymous creations are not shared globally. */
export function getGuestId(): string | null {
  if (typeof window === 'undefined') return null;
  let id = window.localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const guestId = getGuestId();
  if (guestId && !headers.has('X-Kieran-Guest-Id')) {
    headers.set('X-Kieran-Guest-Id', guestId);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

export async function getSession(): Promise<{ authenticated: boolean; ownerId?: string }> {
  return apiFetch('/api/session');
}

export async function login(code: string): Promise<{ ok: boolean; ownerId: string }> {
  return apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch('/api/logout', { method: 'POST' });
}
