export const TONE_OPTIONS = [
  { value: "cinematic", label: "Cinematic" },
  { value: "informative", label: "Informative" },
  { value: "dramatic", label: "Dramatic" },
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

export const AUDIENCE_SUGGESTIONS = [
  "General audience",
  "Students",
  "Professionals",
  "Children",
] as const;

export function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
