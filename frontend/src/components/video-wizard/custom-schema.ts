import { z } from "zod";

export const customWizardSchema = z.object({
  title: z.string().trim().max(200, "Project title must be 200 characters or fewer"),
  prompt: z
    .string()
    .trim()
    .min(1, "Video description is required")
    .max(4000, "Video description must be 4,000 characters or fewer"),
  sourceNotes: z
    .string()
    .trim()
    .max(12000, "Source notes must be 12,000 characters or fewer"),
  language: z.enum(["en", "id", "nl", "de", "fr", "es"]),
  targetAudience: z
    .string()
    .trim()
    .min(1, "Target audience is required")
    .max(200, "Target audience must be 200 characters or fewer"),
  duration: z.enum(["30", "45"]),
  aspectRatio: z.literal("9:16"),
  visualStyle: z.string().trim().min(1),
  narrationStyle: z.string().trim().min(1),
  narrationEnabled: z.boolean(),
  captionsEnabled: z.boolean(),
  musicEnabled: z.boolean(),
});

export type CustomWizardFormValues = z.infer<typeof customWizardSchema>;

export const CUSTOM_WIZARD_DEFAULT_VALUES: CustomWizardFormValues = {
  title: "",
  prompt: "",
  sourceNotes: "",
  language: "en",
  targetAudience: "General audience",
  duration: "45",
  aspectRatio: "9:16",
  visualStyle: "Cinematic Realistic",
  narrationStyle: "Documentary",
  narrationEnabled: true,
  captionsEnabled: false,
  musicEnabled: false,
};

export const CUSTOM_STEP_FIELDS: Record<
  number,
  (keyof CustomWizardFormValues)[]
> = {
  1: ["title", "prompt", "sourceNotes", "language", "targetAudience"],
  2: [
    "duration",
    "aspectRatio",
    "visualStyle",
    "narrationStyle",
    "narrationEnabled",
    "captionsEnabled",
    "musicEnabled",
  ],
};
