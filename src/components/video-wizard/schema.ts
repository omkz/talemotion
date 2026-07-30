import { z } from "zod";

export const wizardSchema = z
  .object({
    mode: z.enum(["historical-documentary", "microdrama", "product-advertisement"]),

    // Historical Documentary
    topic: z.string().optional(),
    additionalDirection: z.string().optional(),
    sourceNotes: z.string().optional(),

    // Microdrama
    premise: z.string().optional(),
    mainCharacter: z.string().optional(),
    genre: z.string().optional(),
    desiredEnding: z.string().optional(),

    // Product Advertisement
    productName: z.string().optional(),
    productDescription: z.string().optional(),
    mainBenefit: z.string().optional(),
    targetAudience: z.string().optional(),
    callToAction: z.string().optional(),

    // Output settings
    title: z.string().min(1, "Title is required"),
    language: z.string().min(1, "Language is required"),
    duration: z.enum(["30", "45", "60"]),
    aspectRatio: z.enum(["9:16", "16:9"]),
    visualStyle: z.string().min(1, "Visual style is required"),
    narrationStyle: z.string().min(1, "Narration style is required"),
    sceneCount: z.enum(["auto", "4", "5", "6"]),
    captionsEnabled: z.boolean(),
    musicEnabled: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const requireField = (
      field: keyof typeof data,
      message: string
    ) => {
      const value = data[field];
      if (typeof value !== "string" || !value.trim()) {
        ctx.addIssue({ code: "custom", path: [field], message });
      }
    };

    if (data.mode === "historical-documentary") {
      requireField("topic", "Topic is required");
    }
    if (data.mode === "microdrama") {
      requireField("premise", "Premise is required");
      requireField("mainCharacter", "Main character is required");
      requireField("genre", "Genre is required");
      requireField("desiredEnding", "Desired ending is required");
    }
    if (data.mode === "product-advertisement") {
      requireField("productName", "Product name is required");
      requireField("productDescription", "Product description is required");
      requireField("mainBenefit", "Main benefit is required");
      requireField("targetAudience", "Target audience is required");
      requireField("callToAction", "Call to action is required");
    }
  });

export type WizardFormValues = z.infer<typeof wizardSchema>;

export const STEP_FIELDS: Record<number, (keyof WizardFormValues)[]> = {
  1: ["mode"],
  2: [
    "topic",
    "additionalDirection",
    "sourceNotes",
    "premise",
    "mainCharacter",
    "genre",
    "desiredEnding",
    "productName",
    "productDescription",
    "mainBenefit",
    "targetAudience",
    "callToAction",
  ],
  3: [
    "title",
    "language",
    "duration",
    "aspectRatio",
    "visualStyle",
    "narrationStyle",
    "sceneCount",
    "captionsEnabled",
    "musicEnabled",
  ],
};

export const WIZARD_DEFAULT_VALUES: WizardFormValues = {
  mode: "historical-documentary",
  topic: "",
  additionalDirection: "",
  sourceNotes: "",
  premise: "",
  mainCharacter: "",
  genre: "",
  desiredEnding: "",
  productName: "",
  productDescription: "",
  mainBenefit: "",
  targetAudience: "",
  callToAction: "",
  title: "",
  language: "English",
  duration: "45",
  aspectRatio: "9:16",
  visualStyle: "Cinematic Realistic",
  narrationStyle: "Documentary",
  sceneCount: "5",
  captionsEnabled: true,
  musicEnabled: true,
};
