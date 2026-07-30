import { z } from "zod";
import type {
  AppSettings,
  IntegrationCheckHistory,
  MockIntegrationCheckResult,
} from "@/types";
import { delay } from "./utils";

const SETTINGS_STORAGE_KEY = "talemotion.settings.v1";
const CHECKS_STORAGE_KEY = "talemotion.integration-checks.v1";

const settingsSchema = z.object({
  general: z.object({
    defaultLanguage: z.enum([
      "English",
      "Indonesian",
      "Spanish",
      "French",
      "German",
    ]),
    defaultAspectRatio: z.enum(["9:16", "16:9"]),
    defaultDuration: z.union([z.literal(30), z.literal(45), z.literal(60)]),
    captionsEnabled: z.boolean(),
    backgroundMusicEnabled: z.boolean(),
  }),
  generation: z.object({
    defaultVisualStyle: z.enum([
      "Cinematic Realistic",
      "Epic Historical",
      "Cinematic Drama",
      "Dark Cinematic",
      "Clean Commercial",
      "Animated Illustration",
    ]),
    defaultNarrationStyle: z.enum([
      "Documentary",
      "Energetic Documentary",
      "Emotional",
      "Suspenseful",
      "Promotional",
      "Conversational",
    ]),
    preferredImageProvider: z.enum([
      "Automatic",
      "GMI Cloud",
      "OpenAI",
      "Google",
      "NVIDIA NIM",
    ]),
    preferredVideoProvider: z.enum([
      "Automatic",
      "GMI Cloud",
      "Runway",
      "Luma",
      "Decart",
    ]),
    preferredVoiceProvider: z.enum([
      "Automatic",
      "ElevenLabs",
      "OpenAI",
      "Google",
    ]),
    autoRetryFailedGenerations: z.boolean(),
    maximumAutomaticRetries: z.number().int().min(0).max(5),
  }),
  integrations: z.object({
    genblazeMode: z.literal("mock"),
    backblazeMode: z.literal("mock"),
    b2BucketName: z.string().min(1),
    b2Region: z.string().min(1),
  }),
});

const checkHistorySchema = z.object({
  genblazeLastCheckedAt: z.string().datetime().nullable(),
  backblazeLastCheckedAt: z.string().datetime().nullable(),
});

const DEFAULT_SETTINGS: AppSettings = {
  general: {
    defaultLanguage: "English",
    defaultAspectRatio: "9:16",
    defaultDuration: 45,
    captionsEnabled: true,
    backgroundMusicEnabled: true,
  },
  generation: {
    defaultVisualStyle: "Cinematic Realistic",
    defaultNarrationStyle: "Documentary",
    preferredImageProvider: "Automatic",
    preferredVideoProvider: "Automatic",
    preferredVoiceProvider: "Automatic",
    autoRetryFailedGenerations: true,
    maximumAutomaticRetries: 2,
  },
  integrations: {
    genblazeMode: "mock",
    backblazeMode: "mock",
    b2BucketName: "talemotion-media",
    b2Region: "us-west-004",
  },
};

const EMPTY_CHECK_HISTORY: IntegrationCheckHistory = {
  genblazeLastCheckedAt: null,
  backblazeLastCheckedAt: null,
};

let settingsCache: AppSettings | null = null;
let checksCache: IntegrationCheckHistory | null = null;

function cloneSettings(settings: AppSettings): AppSettings {
  return structuredClone(settings);
}

function readSettings(): AppSettings {
  if (typeof window === "undefined") return cloneSettings(DEFAULT_SETTINGS);
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return cloneSettings(DEFAULT_SETTINGS);
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? (parsed.data as AppSettings)
      : cloneSettings(DEFAULT_SETTINGS);
  } catch {
    return cloneSettings(DEFAULT_SETTINGS);
  }
}

function writeSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch {
    // The in-memory settings cache remains available if storage is blocked.
  }
}

function readCheckHistory(): IntegrationCheckHistory {
  if (typeof window === "undefined") return { ...EMPTY_CHECK_HISTORY };
  try {
    const raw = window.localStorage.getItem(CHECKS_STORAGE_KEY);
    if (!raw) return { ...EMPTY_CHECK_HISTORY };
    const parsed = checkHistorySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { ...EMPTY_CHECK_HISTORY };
  } catch {
    return { ...EMPTY_CHECK_HISTORY };
  }
}

function writeCheckHistory(history: IntegrationCheckHistory) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CHECKS_STORAGE_KEY,
      JSON.stringify(history)
    );
  } catch {
    // Simulated check history remains available in memory.
  }
}

export async function getSettings(): Promise<AppSettings> {
  await delay(260);
  settingsCache ??= readSettings();
  return cloneSettings(settingsCache);
}

export async function updateSettings(
  settings: AppSettings
): Promise<AppSettings> {
  await delay(420);
  const parsed = settingsSchema.safeParse(settings);
  if (!parsed.success) {
    throw new Error("Invalid TaleMotion settings");
  }
  settingsCache = parsed.data as AppSettings;
  writeSettings(settingsCache);
  return cloneSettings(settingsCache);
}

export async function resetSettings(): Promise<AppSettings> {
  await delay(320);
  settingsCache = cloneSettings(DEFAULT_SETTINGS);
  writeSettings(settingsCache);
  return cloneSettings(settingsCache);
}

export async function getIntegrationCheckHistory(): Promise<IntegrationCheckHistory> {
  await delay(120);
  checksCache ??= readCheckHistory();
  return { ...checksCache };
}

export async function testGenblazeConnection(): Promise<MockIntegrationCheckResult> {
  await delay(1_200);
  checksCache ??= readCheckHistory();
  const checkedAt = new Date().toISOString();
  checksCache = { ...checksCache, genblazeLastCheckedAt: checkedAt };
  writeCheckHistory(checksCache);
  return { status: "mock-connected", checkedAt };
}

export async function testBackblazeConnection(): Promise<MockIntegrationCheckResult> {
  await delay(1_200);
  checksCache ??= readCheckHistory();
  const checkedAt = new Date().toISOString();
  checksCache = { ...checksCache, backblazeLastCheckedAt: checkedAt };
  writeCheckHistory(checksCache);
  return { status: "mock-connected", checkedAt };
}
