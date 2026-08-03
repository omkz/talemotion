import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomVideoWizard } from "@/components/video-wizard/custom-video-wizard";

export default function NewCustomProjectPage() {
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
          Custom Video
        </h1>
        <p className="text-sm text-muted-foreground">
          Describe the short video you want to create.
        </p>
      </div>
      <CustomVideoWizard />
    </div>
  );
}
