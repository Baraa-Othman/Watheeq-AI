// Helper to call FastAPI backend - base URL, fetch wrapper, error handling
/**
 * Base URL for the FastAPI backend (see README: `NEXT_PUBLIC_API_URL` in `.env.local`).
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

/**
 * Like apiFetch but automatically attaches the Firebase ID token as a Bearer header.
 * Pass the Firebase User object from useAuth().user.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetchAuth(path: string, firebaseUser: any, init?: RequestInit): Promise<Response> {
  const idToken: string = await firebaseUser.getIdToken();
  return apiFetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...init?.headers,
    },
  });
}

