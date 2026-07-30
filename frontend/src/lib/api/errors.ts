import type { ApiErrorBody } from "./contracts";
import { errorResponseSchema } from "./validation";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorBody["error"]["details"];
  readonly requestId: string | null;

  constructor({
    status,
    code,
    message,
    details = {},
    requestId = null,
  }: {
    status: number;
    code: string;
    message: string;
    details?: ApiErrorBody["error"]["details"];
    requestId?: string | null;
  }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export function parseApiError(status: number, body: unknown): ApiError {
  const parsed = errorResponseSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError({
      status,
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      details: parsed.data.error.details,
      requestId: parsed.data.error.request_id,
    });
  }

  return new ApiError({
    status,
    code: "unexpected_api_error",
    message: `The API request failed with status ${status}.`,
  });
}
