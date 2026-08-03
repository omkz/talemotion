export const TONE_OPTIONS = [
  { value: "cinematic", label: "Cinematic" },
  { value: "dramatic", label: "Dramatic" },
  { value: "informative", label: "Informative" },
  { value: "inspirational", label: "Inspirational" },
  { value: "neutral", label: "Neutral" },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "id", label: "Indonesian" },
  { value: "nl", label: "Dutch" },
  { value: "de", label: "German" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
] as const;

export const HISTORICAL_TARGET_AUDIENCE_OPTIONS = [
  { value: "General audience", label: "General Audience" },
  { value: "Children", label: "Children" },
  { value: "Teenagers", label: "Teenagers" },
  { value: "Students", label: "Students" },
  { value: "History enthusiasts", label: "History Enthusiasts" },
  { value: "Academic audience", label: "Academic Audience" },
] as const;

export const HISTORICAL_VISUAL_STYLE_OPTIONS = [
  {
    value:
      "Cinematic historical realism, natural textures, atmospheric lighting, grounded period detail.",
    label: "Cinematic Realism",
  },
  {
    value:
      "Dark epic realism, muted colors, low-key lighting, heavy shadows, grounded historical detail.",
    label: "Dark Epic",
  },
  {
    value:
      "Historical realism, authentic environments, natural materials, accurate clothing and architecture.",
    label: "Historical Realism",
  },
  {
    value:
      "Natural documentary look, balanced daylight, clear composition, realistic colors, restrained style.",
    label: "Documentary Natural",
  },
  {
    value:
      "Painterly historical epic, rich textures, dramatic composition, expressive light, period atmosphere.",
    label: "Painterly Epic",
  },
] as const;

export const CUSTOM_TARGET_AUDIENCE_VALUE = "__custom__";
export const CUSTOM_VISUAL_STYLE_VALUE = "__custom__";

// Custom Video keeps its established free-text suggestions.
export const AUDIENCE_SUGGESTIONS = [
  "General audience",
  "Students",
  "Professionals",
  "Children",
] as const;

export function isPresetTargetAudience(value: string): boolean {
  return HISTORICAL_TARGET_AUDIENCE_OPTIONS.some(
    (option) => option.value === value,
  );
}

export function historicalTargetAudienceLabel(value: string): string {
  return optionLabel(HISTORICAL_TARGET_AUDIENCE_OPTIONS, value);
}

export function findHistoricalVisualStylePreset(value: string) {
  return HISTORICAL_VISUAL_STYLE_OPTIONS.find(
    (option) => option.value === value,
  );
}

export function isHistoricalVisualStylePreset(value: string): boolean {
  return findHistoricalVisualStylePreset(value) !== undefined;
}

export function historicalVisualStyleLabel(value: string): string {
  return findHistoricalVisualStylePreset(value)?.label ?? value;
}

export function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
