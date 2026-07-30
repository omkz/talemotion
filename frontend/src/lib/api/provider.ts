import { HttpVideoProjectApi } from "./http-video-project-api";
import { MockVideoProjectApi } from "./mock-video-project-api";
import type { VideoProjectApi } from "./video-project-api";

export type ApiMode = "mock" | "http";

export function getConfiguredApiMode(): ApiMode {
  return process.env.NEXT_PUBLIC_API_MODE === "http" ? "http" : "mock";
}

export function createConfiguredVideoProjectApi(): VideoProjectApi {
  if (getConfiguredApiMode() === "http") {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!baseUrl) {
      throw new Error(
        "NEXT_PUBLIC_API_BASE_URL is required when NEXT_PUBLIC_API_MODE=http."
      );
    }
    return new HttpVideoProjectApi(baseUrl);
  }
  return new MockVideoProjectApi();
}

/**
 * Explicitly active provider. Existing UI modules still call the underlying
 * mock functions directly; migrations can move feature-by-feature to this
 * interface without enabling HTTP requests.
 */
export const videoProjectApi: VideoProjectApi =
  createConfiguredVideoProjectApi();
