import type { Asset, Scene, VideoProject } from "@/types";
import { PROVIDER_META } from "./constants";

let assetCounter = 0;

function createAsset(sceneId: string, kind: Asset["kind"]): Asset {
  assetCounter += 1;
  return {
    id: `${sceneId}-asset-${assetCounter}`,
    sceneId,
    kind,
    previewUrl: null,
    version: 1,
    provider: PROVIDER_META.provider,
    model: PROVIDER_META.model,
    orchestration: PROVIDER_META.orchestration,
    storageProvider: PROVIDER_META.storageProvider,
    manifestStatus: "verified",
    promptSaved: true,
    sha256: `${sceneId}${assetCounter}`
      .padEnd(12, "0")
      .slice(0, 12)
      .concat("…a1f9"),
    generationDurationMs: 4200 + assetCounter * 137,
    createdAt: new Date("2026-07-18T12:00:00Z").toISOString(),
  };
}

function createScene(
  projectId: string,
  index: number,
  input: {
    title: string;
    narration: string;
    visualPrompt: string;
    durationSeconds: number;
    status: Scene["status"];
  }
): Scene {
  const id = `${projectId}-scene-${index + 1}`;
  const isCompleted = input.status === "completed";
  return {
    id,
    position: index + 1,
    title: input.title,
    narration: input.narration,
    visualPrompt: input.visualPrompt,
    durationSeconds: input.durationSeconds,
    status: input.status,
    activeVersion: 1,
    versions: [
      {
        version: 1,
        visualPrompt: input.visualPrompt,
        instruction: null,
        asset: isCompleted ? createAsset(id, "video") : null,
        createdAt: new Date("2026-07-18T12:00:00Z").toISOString(),
      },
    ],
    currentJob: null,
    approved: isCompleted,
  };
}

export function createPalaceGuardProject(): VideoProject {
  const id = "palace-guard-secret";
  return {
    id,
    mode: "microdrama",
    status: "draft",
    brief: {
      mode: "microdrama",
      premise:
        "A loyal palace guard uncovers a conspiracy against the queen he swore to protect.",
      mainCharacter: "Kael, the Queen's Guard",
      genre: "Political Thriller",
      desiredEnding:
        "Kael exposes the traitor just before the coronation, earning the queen's trust.",
    },
    output: {
      title: "A Palace Guard's Secret",
      language: "English",
      duration: 30,
      aspectRatio: "9:16",
      visualStyle: "Cinematic Realistic",
      narrationStyle: "Dramatic",
      sceneCount: "auto",
      captionsEnabled: true,
      musicEnabled: true,
    },
    chapters: [
      {
        id: `${id}-chapter-main`,
        title: "Main",
        position: 1,
        scenes: [],
      },
    ],
    thumbnailUrl: null,
    historicalAccuracyNote: null,
    createdAt: new Date("2026-07-27T10:00:00Z").toISOString(),
    updatedAt: new Date("2026-07-27T10:00:00Z").toISOString(),
    generationProgress: 0,
  };
}

export function createCoffeeAdProject(): VideoProject {
  const id = "minimalist-coffee-ad";
  const scenes: Scene[] = [
    createScene(id, 0, {
      title: "A Quiet Morning Ritual",
      narration: "Some mornings deserve more than just caffeine.",
      visualPrompt:
        "Minimalist kitchen counter, soft morning light, steam rising from a ceramic cup, clean composition.",
      durationSeconds: 6,
      status: "completed",
    }),
    createScene(id, 1, {
      title: "Single-Origin, Small-Batch",
      narration: "Solace Coffee is roasted in small batches for a smoother, calmer cup.",
      visualPrompt:
        "Close-up of coffee beans being poured, warm neutral tones, shallow depth of field, minimalist product photography style.",
      durationSeconds: 7,
      status: "generating-video",
    }),
    createScene(id, 2, {
      title: "Smooth, Not Bitter",
      narration: "No acidity. No jitters. Just a smoother start to your day.",
      visualPrompt:
        "Slow-motion coffee pour into a minimalist white cup, soft natural light, clean background.",
      durationSeconds: 7,
      status: "waiting",
    }),
    createScene(id, 3, {
      title: "Order Your First Bag",
      narration: "Order your first bag of Solace Coffee today.",
      visualPrompt:
        "Coffee bag on a minimalist wooden table, soft studio lighting, product hero shot, clean brand aesthetic.",
      durationSeconds: 6,
      status: "waiting",
    }),
  ];

  return {
    id,
    mode: "product-advertisement",
    status: "generating",
    brief: {
      mode: "product-advertisement",
      productName: "Solace Coffee",
      productDescription:
        "Small-batch, single-origin coffee roasted for a calmer, smoother morning.",
      mainBenefit: "A smoother, less acidic cup that won't upset your stomach.",
      targetAudience: "Young professionals who want a coffee ritual, not just caffeine.",
      callToAction: "Order your first bag today.",
    },
    output: {
      title: "Minimalist Coffee Ad",
      language: "English",
      duration: 30,
      aspectRatio: "9:16",
      visualStyle: "Minimalist Clean",
      narrationStyle: "Warm & Friendly",
      sceneCount: 4,
      captionsEnabled: true,
      musicEnabled: true,
    },
    chapters: [
      {
        id: `${id}-chapter-main`,
        title: "Main",
        position: 1,
        scenes,
      },
    ],
    thumbnailUrl: null,
    historicalAccuracyNote: null,
    createdAt: new Date("2026-07-29T08:00:00Z").toISOString(),
    updatedAt: new Date("2026-07-30T02:00:00Z").toISOString(),
    generationProgress: 55,
  };
}

export function createLostCityProject(): VideoProject {
  const id = "lost-city-beneath-the-sea";
  const raw: Array<{ title: string; narration: string; visualPrompt: string; durationSeconds: number }> = [
    {
      title: "A Legend Beneath the Waves",
      narration: "Off the coast of India lies a legend that has puzzled historians for decades.",
      visualPrompt: "Aerial drone shot of ocean coastline at dawn, cinematic documentary style, moody blue tones.",
      durationSeconds: 9,
    },
    {
      title: "Divers Find Ruins",
      narration: "Marine archaeologists uncovered stone structures resting on the ocean floor.",
      visualPrompt: "Underwater divers examining ancient stone ruins, shafts of sunlight through water, realistic documentary style.",
      durationSeconds: 10,
    },
    {
      title: "A City Lost to the Sea",
      narration: "Ancient texts describe a prosperous coastal city swallowed by rising waters.",
      visualPrompt: "Reconstructed ancient coastal city at golden hour, wide establishing shot, cinematic realism.",
      durationSeconds: 11,
    },
    {
      title: "Evidence and Uncertainty",
      narration: "Scientists remain divided on whether these ruins are natural or man-made.",
      visualPrompt: "Researchers analyzing sonar imagery on a boat deck, documentary lighting, realistic detail.",
      durationSeconds: 10,
    },
    {
      title: "A Modern Investigation",
      narration: "Modern sonar and diving expeditions continue to search for answers.",
      visualPrompt: "Research vessel deploying sonar equipment at sea, dramatic overcast sky, cinematic wide shot.",
      durationSeconds: 10,
    },
    {
      title: "The Mystery Endures",
      narration: "Until then, the lost city beneath the sea keeps its secrets.",
      visualPrompt: "Sunset over calm ocean water, silhouetted research boat, epic cinematic ending shot.",
      durationSeconds: 10,
    },
  ];

  const scenes = raw.map((r, i) => createScene(id, i, { ...r, status: "completed" }));

  return {
    id,
    mode: "historical-documentary",
    status: "ready",
    brief: {
      mode: "historical-documentary",
      topic: "The submerged ruins believed to be the lost city of Dwarka.",
      additionalDirection:
        "Focus on mystery and marine archaeology. Present it as a legend explored through evidence, not a settled fact.",
      sourceNotes: "Marine archaeological surveys off the coast of Gujarat, India.",
      contentType: "documentary",
      language: "en",
      tone: "cinematic",
      targetAudience: "General audience",
    },
    output: {
      title: "The Lost City Beneath the Sea",
      language: "English",
      duration: 60,
      aspectRatio: "16:9",
      visualStyle: "Cinematic Realistic",
      narrationStyle: "Documentary",
      sceneCount: 6,
      captionsEnabled: true,
      musicEnabled: true,
    },
    chapters: [
      {
        id: `${id}-chapter-main`,
        title: "Main",
        position: 1,
        scenes,
      },
    ],
    thumbnailUrl: null,
    historicalAccuracyNote:
      "Presented as an unresolved historical mystery. Scientific consensus on the site's origin is not settled.",
    createdAt: new Date("2026-07-10T09:00:00Z").toISOString(),
    updatedAt: new Date("2026-07-25T09:00:00Z").toISOString(),
    generationProgress: 100,
  };
}
