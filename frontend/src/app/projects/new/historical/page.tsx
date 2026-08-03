import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VideoWizard } from "@/components/video-wizard/video-wizard";

export default function NewHistoricalProjectPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/projects/new"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to video formats
      </Link>
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Historical Documentary
        </h1>
        <p className="text-sm text-muted-foreground">
          Build a structured four-scene historical documentary.
        </p>
      </div>
      <VideoWizard />
    </div>
  );
}
