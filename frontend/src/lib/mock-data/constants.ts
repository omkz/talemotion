export const LANGUAGES = [
  "English",
  "Indonesian",
  "Spanish",
  "French",
  "Japanese",
] as const;

export const VISUAL_STYLES = [
  "Cinematic Realistic",
  "Minimalist Clean",
  "Stylized Animation",
  "Vintage Film",
  "Epic Fantasy",
  "Epic Historical",
  "Cinematic Drama",
  "Dark Cinematic",
  "Clean Commercial",
] as const;

export const NARRATION_STYLES = [
  "Documentary",
  "Dramatic",
  "Warm & Friendly",
  "Energetic",
  "Calm & Reflective",
  "Energetic Documentary",
  "Emotional",
  "Suspenseful",
  "Promotional",
] as const;

export const GENRES = [
  "Political Thriller",
  "Romance",
  "Family Drama",
  "Revenge Story",
  "Mystery",
] as const;

/** Mock provider metadata surfaced throughout Generate + Final Video sections. */
export const PROVIDER_META = {
  provider: "GMI Cloud",
  model: "Demo Video Model v1",
  orchestration: "Genblaze",
  storageProvider: "Backblaze B2",
} as const;
