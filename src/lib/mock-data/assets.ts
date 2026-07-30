import type {
  MediaAssetStatus,
  MediaAssetType,
  MediaLibraryAsset,
  VideoProject,
} from "@/types";
import { PROVIDER_META } from "./constants";

interface AssetInput {
  id: string;
  project: VideoProject;
  name: string;
  type: MediaAssetType;
  status?: MediaAssetStatus;
  version?: number;
  chapterId?: string;
  sceneId?: string;
  sceneTitle?: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fileSizeBytes: number;
  storageKey: string;
  createdAt: string;
  provider?: string;
  model?: string;
  manifestStatus?: MediaLibraryAsset["manifestStatus"];
  generationStage?: string;
  promptSaved?: boolean;
}

const SHA_PARTS = [
  "c4a9199d31f850af",
  "8b72e66a0d3c91e4",
  "f015c8a77d2b46e9",
  "2ed74190ab6f35c8",
];

function makeSha(id: string) {
  const seed = id
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);
  return Array.from(
    { length: 4 },
    (_, index) => SHA_PARTS[(seed + index) % SHA_PARTS.length]
  ).join("");
}

function createAsset(input: AssetInput): MediaLibraryAsset {
  const status = input.status ?? "ready";
  return {
    id: input.id,
    projectId: input.project.id,
    projectTitle: input.project.output.title,
    chapterId: input.chapterId,
    sceneId: input.sceneId,
    sceneTitle: input.sceneTitle,
    name: input.name,
    type: input.type,
    status,
    version: input.version ?? 1,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    durationSeconds: input.durationSeconds,
    fileSizeBytes: input.fileSizeBytes,
    previewUrl: null,
    storageKey: input.storageKey,
    provider: input.provider ?? PROVIDER_META.provider,
    model: input.model ?? PROVIDER_META.model,
    orchestration: "genblaze",
    storageProvider: "backblaze-b2",
    storageState:
      status === "generating"
        ? "uploading"
        : status === "failed"
          ? "unavailable"
          : status === "archived"
            ? "archived"
            : "stored",
    manifestStatus:
      input.manifestStatus ??
      (status === "ready" || status === "archived"
        ? "verified"
        : status === "generating"
          ? "pending"
          : "unavailable"),
    sha256:
      status === "ready" || status === "archived"
        ? makeSha(input.id)
        : undefined,
    generationStage:
      input.generationStage ??
      (status === "generating"
        ? "Generating media"
        : status === "failed"
          ? "Generation failed"
          : "Completed"),
    promptSaved: input.promptSaved ?? true,
    signedUrlStatus: status === "failed" ? "unavailable" : "simulated",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function getProject(projects: VideoProject[], id: string): VideoProject {
  const project = projects.find((candidate) => candidate.id === id);
  if (!project) throw new Error(`Missing asset fixture project: ${id}`);
  return project;
}

function createMajapahitAssets(project: VideoProject): MediaLibraryAsset[] {
  const chapter = project.chapters[0];
  const sceneAssets = chapter.scenes.flatMap((scene, index) => {
    const position = String(scene.position).padStart(3, "0");
    const shortName =
      scene.position === 3 ? "Foreign Fleet" : scene.title.replace(/^The /, "");
    const createdDay = 21 + index;
    const imageHour = String(8 + index).padStart(2, "0");
    const createdAt = `2026-07-${createdDay}T${imageHour}:20:00.000Z`;

    return [
      createAsset({
        id: `majapahit-scene-${scene.position}-image-v1`,
        project,
        chapterId: chapter.id,
        sceneId: scene.id,
        sceneTitle: scene.title,
        name: `Majapahit Scene ${String(scene.position).padStart(2, "0")} — ${shortName}`,
        type: "image",
        mimeType: "image/png",
        width: 1080,
        height: 1920,
        fileSizeBytes: 4_100_000 + index * 314_000,
        storageKey: `projects/majapahit/chapters/main/scenes/${position}/images/storyboard-v1.png`,
        createdAt,
        model: "Imagen Studio v3",
      }),
      createAsset({
        id: `majapahit-scene-${scene.position}-video-v${scene.position === 3 ? 2 : 1}`,
        project,
        chapterId: chapter.id,
        sceneId: scene.id,
        sceneTitle: scene.title,
        name:
          scene.position === 3
            ? "Majapahit Scene 03 — Foreign Fleet v2"
            : `Majapahit Scene ${String(scene.position).padStart(2, "0")} Clip`,
        type: "video",
        version: scene.position === 3 ? 2 : 1,
        mimeType: "video/mp4",
        width: 1080,
        height: 1920,
        durationSeconds: scene.durationSeconds,
        fileSizeBytes: 17_800_000 + index * 1_760_000,
        storageKey: `projects/majapahit/chapters/main/scenes/${position}/video/clip-v${scene.position === 3 ? 2 : 1}.mp4`,
        createdAt: `2026-07-${createdDay}T${10 + index}:10:00.000Z`,
        model: "CineMotion 2.1",
      }),
      createAsset({
        id: `majapahit-scene-${scene.position}-narration-v1`,
        project,
        chapterId: chapter.id,
        sceneId: scene.id,
        sceneTitle: scene.title,
        name: `Majapahit Narration — Scene ${String(scene.position).padStart(2, "0")}`,
        type: "audio",
        mimeType: "audio/mpeg",
        durationSeconds: scene.durationSeconds,
        fileSizeBytes: 510_000 + index * 62_000,
        storageKey: `projects/majapahit/chapters/main/scenes/${position}/audio/narration-en-v1.mp3`,
        createdAt: `2026-07-${createdDay}T${11 + index}:05:00.000Z`,
        model: "Vocalis Documentary EN",
      }),
    ];
  });

  const scene = chapter.scenes[2];
  return [
    ...sceneAssets,
    createAsset({
      id: "majapahit-scene-3-video-v1",
      project,
      chapterId: chapter.id,
      sceneId: scene.id,
      sceneTitle: scene.title,
      name: "Majapahit Scene 03 — Foreign Fleet v1",
      type: "video",
      status: "archived",
      mimeType: "video/mp4",
      width: 1080,
      height: 1920,
      durationSeconds: scene.durationSeconds,
      fileSizeBytes: 18_420_000,
      storageKey:
        "projects/majapahit/chapters/main/scenes/003/video/clip-v1.mp4",
      createdAt: "2026-07-22T18:15:00.000Z",
      model: "CineMotion 2.0",
    }),
    createAsset({
      id: "majapahit-subtitle-en-v1",
      project,
      name: "Majapahit English Subtitles",
      type: "subtitle",
      mimeType: "application/x-subrip",
      fileSizeBytes: 8_420,
      storageKey: "projects/majapahit/subtitles/en-v1.srt",
      createdAt: "2026-07-27T07:45:00.000Z",
      model: "Caption Align 1.2",
    }),
    createAsset({
      id: "majapahit-thumbnail-v1",
      project,
      name: "Majapahit Project Thumbnail",
      type: "thumbnail",
      mimeType: "image/jpeg",
      width: 1080,
      height: 1920,
      fileSizeBytes: 1_640_000,
      storageKey: "projects/majapahit/thumbnails/project-v1.jpg",
      createdAt: "2026-07-27T08:05:00.000Z",
      model: "Imagen Studio v3",
    }),
    createAsset({
      id: "majapahit-final-v1",
      project,
      name: "Majapahit Final Render v1",
      type: "final-render",
      mimeType: "video/mp4",
      width: 1080,
      height: 1920,
      durationSeconds: 43,
      fileSizeBytes: 96_800_000,
      storageKey: "projects/majapahit/renders/final-v1.mp4",
      createdAt: "2026-07-27T09:30:00.000Z",
      provider: "TaleMotion Render Pipeline",
      model: "Timeline Composer v1",
    }),
  ];
}

function createPalaceAssets(project: VideoProject): MediaLibraryAsset[] {
  const chapterId = project.chapters[0]?.id;
  const scenes = [
    ["palace-guard-scene-1", "The Queen's Corridor"],
    ["palace-guard-scene-2", "A Whisper Behind the Door"],
    ["palace-guard-scene-3", "The Traitor Revealed"],
  ] as const;

  return [
    createAsset({
      id: "palace-character-kael-v1",
      project,
      chapterId,
      name: "Kael — Palace Guard Character",
      type: "image",
      mimeType: "image/png",
      width: 1080,
      height: 1920,
      fileSizeBytes: 5_340_000,
      storageKey: "projects/palace-guard-secret/references/kael-character-v1.png",
      createdAt: "2026-07-27T12:10:00.000Z",
      model: "Imagen Studio v3",
    }),
    ...scenes.map(([sceneId, sceneTitle], index) =>
      createAsset({
        id: `${sceneId}-clip-v1`,
        project,
        chapterId,
        sceneId,
        sceneTitle,
        name: `Palace Guard Clip — Scene 0${index + 1}`,
        type: "video",
        status: index === 2 ? "failed" : "ready",
        mimeType: "video/mp4",
        width: 1080,
        height: 1920,
        durationSeconds: 8 + index,
        fileSizeBytes: 19_600_000 + index * 2_100_000,
        storageKey: `projects/palace-guard-secret/chapters/main/scenes/00${index + 1}/video/clip-v1.mp4`,
        createdAt: `2026-07-28T0${8 + index}:40:00.000Z`,
        model: "CineMotion 2.1",
      })
    ),
    createAsset({
      id: "palace-dialogue-scene-2-v1",
      project,
      chapterId,
      sceneId: scenes[1][0],
      sceneTitle: scenes[1][1],
      name: "Palace Guard Dialogue — Scene 02",
      type: "audio",
      mimeType: "audio/mpeg",
      durationSeconds: 10,
      fileSizeBytes: 824_000,
      storageKey:
        "projects/palace-guard-secret/chapters/main/scenes/002/audio/dialogue-v1.mp3",
      createdAt: "2026-07-28T11:20:00.000Z",
      model: "Vocalis Drama EN",
    }),
    createAsset({
      id: "palace-subtitle-en-v1",
      project,
      name: "Palace Guard English Subtitles",
      type: "subtitle",
      mimeType: "application/x-subrip",
      fileSizeBytes: 6_980,
      storageKey: "projects/palace-guard-secret/subtitles/en-v1.srt",
      createdAt: "2026-07-28T13:15:00.000Z",
      model: "Caption Align 1.2",
    }),
    createAsset({
      id: "palace-final-v1",
      project,
      name: "A Palace Guard's Secret — Final Render",
      type: "final-render",
      mimeType: "video/mp4",
      width: 1080,
      height: 1920,
      durationSeconds: 30,
      fileSizeBytes: 71_200_000,
      storageKey: "projects/palace-guard-secret/renders/final-v1.mp4",
      createdAt: "2026-07-28T15:25:00.000Z",
      provider: "TaleMotion Render Pipeline",
      model: "Timeline Composer v1",
    }),
  ];
}

function createCoffeeAssets(project: VideoProject): MediaLibraryAsset[] {
  const chapter = project.chapters[0];
  const firstScene = chapter.scenes[0];
  const secondScene = chapter.scenes[1];

  return [
    createAsset({
      id: "coffee-product-reference-v1",
      project,
      name: "Solace Coffee Product Reference",
      type: "image",
      status: "archived",
      mimeType: "image/png",
      width: 1200,
      height: 1200,
      fileSizeBytes: 3_220_000,
      storageKey: "projects/minimalist-coffee-ad/references/product-v1.png",
      createdAt: "2026-07-29T08:30:00.000Z",
      provider: "User Reference",
      model: "Not applicable",
      promptSaved: false,
    }),
    createAsset({
      id: "coffee-hero-v2",
      project,
      chapterId: chapter.id,
      sceneId: firstScene.id,
      sceneTitle: firstScene.title,
      name: "Coffee Hero Product Shot v2",
      type: "image",
      version: 2,
      mimeType: "image/png",
      width: 1080,
      height: 1920,
      fileSizeBytes: 4_880_000,
      storageKey:
        "projects/minimalist-coffee-ad/scenes/001/images/hero-v2.png",
      createdAt: "2026-07-29T10:15:00.000Z",
      model: "Imagen Studio v3",
    }),
    createAsset({
      id: "coffee-clip-1-v1",
      project,
      chapterId: chapter.id,
      sceneId: firstScene.id,
      sceneTitle: firstScene.title,
      name: "Coffee Morning Ritual Clip",
      type: "video",
      mimeType: "video/mp4",
      width: 1080,
      height: 1920,
      durationSeconds: firstScene.durationSeconds,
      fileSizeBytes: 15_900_000,
      storageKey:
        "projects/minimalist-coffee-ad/scenes/001/video/clip-v1.mp4",
      createdAt: "2026-07-29T14:20:00.000Z",
      model: "CineMotion 2.1",
    }),
    createAsset({
      id: "coffee-clip-2-v1",
      project,
      chapterId: chapter.id,
      sceneId: secondScene.id,
      sceneTitle: secondScene.title,
      name: "Coffee Small-Batch Detail Clip",
      type: "video",
      status: "generating",
      mimeType: "video/mp4",
      width: 1080,
      height: 1920,
      durationSeconds: secondScene.durationSeconds,
      fileSizeBytes: 12_400_000,
      storageKey:
        "projects/minimalist-coffee-ad/scenes/002/video/clip-v1.mp4",
      createdAt: "2026-07-30T02:00:00.000Z",
      model: "CineMotion 2.1",
      generationStage: "Generating video frames",
    }),
    createAsset({
      id: "coffee-voiceover-v1",
      project,
      name: "Solace Coffee English Voice-over",
      type: "audio",
      mimeType: "audio/mpeg",
      durationSeconds: 26,
      fileSizeBytes: 1_920_000,
      storageKey:
        "projects/minimalist-coffee-ad/audio/voice-over-en-v1.mp3",
      createdAt: "2026-07-29T16:45:00.000Z",
      model: "Vocalis Warm EN",
    }),
    createAsset({
      id: "coffee-music-v1",
      project,
      name: "Coffee Morning Ambient Music",
      type: "audio",
      mimeType: "audio/mpeg",
      durationSeconds: 30,
      fileSizeBytes: 2_860_000,
      storageKey: "projects/minimalist-coffee-ad/audio/music-bed-v1.mp3",
      createdAt: "2026-07-29T17:10:00.000Z",
      model: "Soundscape Ambient v2",
    }),
    createAsset({
      id: "coffee-final-v1",
      project,
      name: "Minimalist Coffee Ad — Final Render",
      type: "final-render",
      mimeType: "video/mp4",
      width: 1080,
      height: 1920,
      durationSeconds: 26,
      fileSizeBytes: 62_400_000,
      storageKey: "projects/minimalist-coffee-ad/renders/final-v1.mp4",
      createdAt: "2026-07-30T04:20:00.000Z",
      provider: "TaleMotion Render Pipeline",
      model: "Timeline Composer v1",
    }),
  ];
}

function createLostCityAssets(project: VideoProject): MediaLibraryAsset[] {
  const chapter = project.chapters[0];
  const openingScene = chapter.scenes[0];

  return [
    createAsset({
      id: "lost-city-scene-1-image-v1",
      project,
      chapterId: chapter.id,
      sceneId: openingScene.id,
      sceneTitle: openingScene.title,
      name: "Lost City Scene 01 — Waves at Dawn",
      type: "image",
      mimeType: "image/png",
      width: 1920,
      height: 1080,
      fileSizeBytes: 5_180_000,
      storageKey:
        "projects/lost-city-beneath-the-sea/chapters/main/scenes/001/images/storyboard-v1.png",
      createdAt: "2026-07-23T07:20:00.000Z",
      model: "Imagen Studio v3",
    }),
    createAsset({
      id: "lost-city-scene-1-video-v1",
      project,
      chapterId: chapter.id,
      sceneId: openingScene.id,
      sceneTitle: openingScene.title,
      name: "Lost City Opening Ocean Clip",
      type: "video",
      mimeType: "video/mp4",
      width: 1920,
      height: 1080,
      durationSeconds: openingScene.durationSeconds,
      fileSizeBytes: 28_700_000,
      storageKey:
        "projects/lost-city-beneath-the-sea/chapters/main/scenes/001/video/clip-v1.mp4",
      createdAt: "2026-07-23T09:45:00.000Z",
      model: "CineMotion 2.1",
    }),
    createAsset({
      id: "lost-city-narration-en-v1",
      project,
      chapterId: chapter.id,
      sceneId: openingScene.id,
      sceneTitle: openingScene.title,
      name: "Lost City English Narration",
      type: "audio",
      mimeType: "audio/mpeg",
      durationSeconds: 60,
      fileSizeBytes: 4_220_000,
      storageKey:
        "projects/lost-city-beneath-the-sea/audio/narration-en-v1.mp3",
      createdAt: "2026-07-24T11:10:00.000Z",
      model: "Vocalis Documentary EN",
    }),
    createAsset({
      id: "lost-city-thumbnail-v1",
      project,
      name: "Lost City Project Thumbnail",
      type: "thumbnail",
      mimeType: "image/jpeg",
      width: 1920,
      height: 1080,
      fileSizeBytes: 1_920_000,
      storageKey: "projects/lost-city-beneath-the-sea/thumbnails/project-v1.jpg",
      createdAt: "2026-07-25T08:30:00.000Z",
      model: "Imagen Studio v3",
    }),
    createAsset({
      id: "lost-city-final-v1",
      project,
      name: "The Lost City Beneath the Sea — Final Render",
      type: "final-render",
      mimeType: "video/mp4",
      width: 1920,
      height: 1080,
      durationSeconds: 60,
      fileSizeBytes: 148_200_000,
      storageKey: "projects/lost-city-beneath-the-sea/renders/final-v1.mp4",
      createdAt: "2026-07-25T09:00:00.000Z",
      provider: "TaleMotion Render Pipeline",
      model: "Timeline Composer v1",
    }),
  ];
}

export function createInitialAssets(
  projects: VideoProject[]
): MediaLibraryAsset[] {
  return [
    ...createMajapahitAssets(getProject(projects, "majapahit")),
    ...createPalaceAssets(getProject(projects, "palace-guard-secret")),
    ...createCoffeeAssets(getProject(projects, "minimalist-coffee-ad")),
    ...createLostCityAssets(
      getProject(projects, "lost-city-beneath-the-sea")
    ),
  ];
}
