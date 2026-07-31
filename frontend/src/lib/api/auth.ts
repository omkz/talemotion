import { ApiClient } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

function createAuthClient(): ApiClient {
  return new ApiClient(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"
  );
}

export function register(input: RegisterInput): Promise<AuthUser> {
  return createAuthClient().post<AuthUser>("/auth/register", { body: input });
}

export function login(input: LoginInput): Promise<AuthUser> {
  return createAuthClient().post<AuthUser>("/auth/login", { body: input });
}

export function logout(): Promise<void> {
  return createAuthClient().post<void>("/auth/logout");
}

export function getCurrentUser(signal?: AbortSignal): Promise<AuthUser> {
  return createAuthClient().get<AuthUser>("/auth/me", { signal });
}
