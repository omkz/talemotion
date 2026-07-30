import type { VideoProject } from "@/types";
import { createMajapahitProject } from "./majapahit";
import {
  createCoffeeAdProject,
  createLostCityProject,
  createPalaceGuardProject,
} from "./other-projects";

export function createInitialProjects(): VideoProject[] {
  return [
    createMajapahitProject(),
    createPalaceGuardProject(),
    createCoffeeAdProject(),
    createLostCityProject(),
  ];
}

export * from "./majapahit";
export * from "./constants";
export * from "./video-templates";
