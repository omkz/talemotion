import { z } from "zod";

export const wizardSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1, "Topic or story idea is required")
    .max(4000, "Topic must be 4,000 characters or fewer"),
  sourceNotes: z
    .string()
    .trim()
    .max(12000, "Source notes must be 12,000 characters or fewer"),
  title: z
    .string()
    .trim()
    .max(200, "Project title must be 200 characters or fewer"),
  language: z.enum(["en", "id", "nl", "de", "fr", "es"]),
  tone: z.enum([
    "cinematic",
    "informative",
    "dramatic",
    "inspirational",
    "neutral",
  ]),
  targetAudience: z
    .string()
    .trim()
    .min(1, "Target audience is required")
    .max(200, "Target audience must be 200 characters or fewer"),
  additionalDirection: z
    .string()
    .trim()
    .max(4000, "Additional direction must be 4,000 characters or fewer"),
  duration: z.enum(["30", "45"]),
  aspectRatio: z.literal("9:16"),
  visualStyle: z.string().trim().min(1),
  narrationStyle: z.string().trim().min(1),
  narrationEnabled: z.boolean(),
  captionsEnabled: z.boolean(),
  musicEnabled: z.boolean(),
});

export type WizardFormValues = z.infer<typeof wizardSchema>;

export const STEP_FIELDS: Record<number, (keyof WizardFormValues)[]> = {
  1: ["topic", "sourceNotes", "title"],
  2: [
    "language",
    "tone",
    "targetAudience",
    "additionalDirection",
  ],
  3: [
    "duration",
    "aspectRatio",
    "visualStyle",
    "narrationStyle",
    "narrationEnabled",
    "captionsEnabled",
    "musicEnabled",
  ],
};

export const WIZARD_DEFAULT_VALUES: WizardFormValues = {
  topic: "",
  sourceNotes: "",
  title: "",
  language: "en",
  tone: "cinematic",
  targetAudience: "General audience",
  additionalDirection: "",
  duration: "45",
  aspectRatio: "9:16",
  visualStyle: "Cinematic Realistic",
  narrationStyle: "Documentary",
  narrationEnabled: true,
  captionsEnabled: false,
  musicEnabled: false,
};
