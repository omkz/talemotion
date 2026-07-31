import { parseApiError } from "./errors";

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export interface ApiRequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

async function fetchCsrfToken(baseUrl: string): Promise<string | null> {
  if (typeof document === "undefined") {
    return null;
  }
  const response = await fetch(`${baseUrl}/auth/csrf`, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }
  const body: unknown = await response.json().catch(() => null);
  if (
    body &&
    typeof body === "object" &&
    "csrf_token" in body &&
    typeof body.csrf_token === "string"
  ) {
    return body.csrf_token;
  }
  return null;
}

export class ApiClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    if (!baseUrl.trim()) {
      throw new Error("An API base URL is required for HTTP mode.");
    }
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  post<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("POST", path, options);
  }

  patch<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, options);
  }

  delete<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, options);
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(options.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    const headers = new Headers({ Accept: "application/json" });
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }
    if (options.idempotencyKey) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }
    if (method !== "GET") {
      let csrfToken = readCookie("talemotion_csrf");
      if (
        !csrfToken &&
        path !== "/auth/login" &&
        path !== "/auth/register"
      ) {
        csrfToken = await fetchCsrfToken(this.baseUrl);
      }
      if (csrfToken) {
        headers.set("X-CSRF-Token", csrfToken);
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      signal: options.signal,
      credentials: "include",
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw parseApiError(response.status, body);
    }
    return body as T;
  }
}
