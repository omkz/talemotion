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

export const CUSTOM_TARGET_AUDIENCE_VALUE = "__custom__";

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

export function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
