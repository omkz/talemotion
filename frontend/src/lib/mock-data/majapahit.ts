import type { Scene, VideoProject } from "@/types";
import { PROVIDER_META } from "./constants";

interface RawScene {
  title: string;
  narration: string;
  visualPrompt: string;
  durationSeconds: number;
}

const RAW_SCENES: RawScene[] = [
  {
    title: "A Kingdom Is About to Rise",
    narration:
      "In the late thirteenth century, Java was about to witness the birth of a powerful new kingdom.",
    visualPrompt:
      "Ancient Java landscape, mist-covered mountains, traditional wooden settlements, cinematic sunrise, historically inspired clothing, realistic documentary style.",
    durationSeconds: 7,
  },
  {
    title: "Raden Wijaya Survives",
    narration:
      "A prince named Raden Wijaya survived political defeat and began planning his return.",
    visualPrompt:
      "Javanese prince standing inside a forest settlement, ancient royal clothing, determined expression, warm torchlight, cinematic historical realism.",
    durationSeconds: 8,
  },
  {
    title: "The Foreign Fleet Arrives",
    narration:
      "When a foreign army arrived in Java, Raden Wijaya saw an opportunity to defeat his enemies.",
    visualPrompt:
      "Large medieval Asian fleet approaching Java, wooden warships, soldiers preparing to land, dramatic clouds, epic cinematic scale.",
    durationSeconds: 9,
  },
  {
    title: "The Strategic Reversal",
    narration:
      "After securing their help, he turned against the invading forces and drove them from the island.",
    visualPrompt:
      "Ancient Javanese warriors confronting foreign soldiers, dense tropical landscape, dynamic historical battle, non-graphic, cinematic documentary style.",
    durationSeconds: 9,
  },
  {
    title: "Majapahit Is Born",
    narration:
      "From this victory emerged Majapahit, a kingdom that would shape the history of the Indonesian archipelago.",
    visualPrompt:
      "Majapahit-inspired palace and red-brick gates, busy port with large wooden ships, golden sunset, prosperous ancient kingdom, epic cinematic ending.",
    durationSeconds: 10,
  },
];

export function createMajapahitScenes(): Scene[] {
  return RAW_SCENES.map((raw, index) => ({
    id: `majapahit-scene-${index + 1}`,
    position: index + 1,
    title: raw.title,
    narration: raw.narration,
    visualPrompt: raw.visualPrompt,
    durationSeconds: raw.durationSeconds,
    status: "draft",
    activeVersion: 1,
    versions: [
      {
        version: 1,
        visualPrompt: raw.visualPrompt,
        instruction: null,
        asset: null,
        createdAt: new Date("2026-07-20T09:00:00Z").toISOString(),
      },
    ],
    currentJob: null,
    approved: false,
  }));
}

export function createMajapahitProject(): VideoProject {
  return {
    id: "majapahit",
    mode: "historical-documentary",
    status: "storyboard-ready",
    brief: {
      mode: "historical-documentary",
      topic:
        "The founding of the Majapahit Empire — how Raden Wijaya turned defeat into the birth of a kingdom.",
      additionalDirection:
        "Emphasize strategy and resilience over spectacle. Keep tone reverent and cinematic, suitable for a general audience.",
      sourceNotes:
        "Based on the Pararaton and Nagarakretagama chronicles; simplified for a 45-second narrative.",
    },
    output: {
      title: "The Rise of Majapahit",
      language: "English",
      duration: 45,
      aspectRatio: "9:16",
      visualStyle: "Cinematic Realistic",
      narrationStyle: "Documentary",
      sceneCount: 5,
      captionsEnabled: true,
      musicEnabled: true,
    },
    chapters: [
      {
        id: "majapahit-chapter-main",
        title: "Main",
        position: 1,
        scenes: createMajapahitScenes(),
      },
    ],
    thumbnailUrl: null,
    historicalAccuracyNote:
      "Historical details are simplified for narrative pacing. Names and the broad sequence of events are drawn from traditional chronicles; exact dialogue and minor details are dramatized.",
    createdAt: new Date("2026-07-20T09:00:00Z").toISOString(),
    updatedAt: new Date("2026-07-20T09:00:00Z").toISOString(),
    generationProgress: 0,
  };
}

export const MAJAPAHIT_REGENERATION_EXAMPLE =
  "Make the ships larger wooden vessels with Southeast Asian sails. Avoid European-style ships.";

export const MOCK_PROVIDER_META = PROVIDER_META;
