/**
 * The kind of video the user is producing. Historical Documentary is the
 * flagship workflow, Custom Video is the free-form short-video workflow, and
 * the remaining modes are future-facing domain definitions.
 */
export type VideoMode =
  | "historical-documentary"
  | "custom-video"
  | "microdrama"
  | "product-advertisement";

export interface VideoModeDefinition {
  id: VideoMode;
  label: string;
  description: string;
  example: string;
}

export const VIDEO_MODES: VideoModeDefinition[] = [
  {
    id: "historical-documentary",
    label: "Historical Documentary",
    description:
      "A narrated documentary that brings a historical event, figure, or era to life with cinematic realism.",
    example: "“The Rise of Majapahit” — a 45s origin story of a 13th-century kingdom.",
  },
  {
    id: "custom-video",
    label: "Custom Video",
    description:
      "Describe the short video you want to create in your own words.",
    example: "A focused four-scene vertical video shaped from your description.",
  },
  {
    id: "microdrama",
    label: "Microdrama",
    description:
      "A short, emotionally charged serialized drama scene built around a character and a twist.",
    example: "“A Palace Guard’s Secret” — a courtly betrayal unfolds in under a minute.",
  },
  {
    id: "product-advertisement",
    label: "Product Advertisement",
    description:
      "A polished promotional video that highlights a product's benefit and drives a clear call to action.",
    example: "“Minimalist Coffee Ad” — a clean, aspirational 30s product spot.",
  },
];
