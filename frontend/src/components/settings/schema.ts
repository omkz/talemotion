import { z } from "zod";

export const settingsFormSchema = z.object({
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
