import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "TaleMotion — AI-Assisted Cinematic Production",
  description:
    "Plan structured storyboards, generate scene assets, manage retries, and assemble cinematic video projects in one persistent AI-assisted workspace.",
  openGraph: {
    title: "TaleMotion — AI-Assisted Cinematic Production",
    description:
      "Plan structured storyboards, generate scene assets, manage retries, and assemble cinematic video projects in one persistent AI-assisted workspace.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "TaleMotion — AI-Assisted Cinematic Production",
    description:
      "Plan structured storyboards, generate scene assets, manage retries, and assemble cinematic video projects in one persistent AI-assisted workspace.",
  },
};

export default async function RootPage() {
  const cookieStore = await cookies();
  return (
    <LandingPage authenticated={cookieStore.has("talemotion_session")} />
  );
}
