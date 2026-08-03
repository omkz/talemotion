import Link from "next/link";
import {
  Archive,
  ArrowRight,
  Boxes,
  Check,
  CircleDot,
  Clapperboard,
  Clock3,
  Code2,
  Database,
  Film,
  ImageIcon,
  Layers3,
  LayoutList,
  Play,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/omkz/talemotion";

const steps = [
  {
    number: "01",
    title: "Plan",
    description: "Turn a topic or story idea into a structured storyboard.",
  },
  {
    number: "02",
    title: "Generate",
    description: "Create keyframes and animated clips for each scene.",
  },
  {
    number: "03",
    title: "Review",
    description: "Inspect scenes and regenerate only what needs improvement.",
  },
  {
    number: "04",
    title: "Render",
    description: "Assemble completed clips into a finished video project.",
  },
];

const capabilities = [
  {
    icon: LayoutList,
    title: "Structured storyboards",
    description: "Organize a story into ordered, editable scenes.",
  },
  {
    icon: ImageIcon,
    title: "Scene-level generation",
    description: "Generate and manage visual assets independently per scene.",
  },
  {
    icon: RefreshCcw,
    title: "Independent retries",
    description:
      "Retry failed or unsatisfactory scenes without restarting the project.",
  },
  {
    icon: Database,
    title: "Persistent projects",
    description:
      "Restore project, job, and asset state after leaving or refreshing.",
  },
  {
    icon: Archive,
    title: "Durable media assets",
    description:
      "Keep generated images, clips, manifests, and renders with the project.",
  },
  {
    icon: Clapperboard,
    title: "Final rendering",
    description: "Assemble completed scene clips into a final MP4 workflow.",
  },
];

const workflow = [
  "Story idea",
  "Storyboard",
  "Scene keyframes",
  "Animated clips",
  "Review and retry",
  "Final render",
];

const previewScenes = [
  { number: 1, title: "A Kingdom Takes Shape", status: "Ready", progress: 100 },
  { number: 2, title: "Maritime Power", status: "Ready", progress: 100 },
  { number: 3, title: "Trade Across the Java Sea", status: "Generating", progress: 64 },
  { number: 4, title: "A Lasting Legacy", status: "Planned", progress: 0 },
];

interface LandingPageProps {
  authenticated: boolean;
}

function CtaLink({
  authenticated,
  className,
}: LandingPageProps & { className?: string }) {
  return (
    <Button
      asChild
      size="lg"
      className={cn(
        "h-11 bg-accent px-5 text-accent-foreground shadow-[0_12px_30px_-14px_color-mix(in_oklch,var(--accent),transparent_45%)] hover:bg-accent/90",
        className,
      )}
    >
      <Link href={authenticated ? "/projects" : "/register"}>
        {authenticated ? "Open workspace" : "Start creating"}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-accent uppercase">
      <span className="h-px w-6 bg-accent/70" aria-hidden="true" />
      {children}
    </p>
  );
}

function ProductPreview() {
  return (
    <figure
      aria-labelledby="preview-caption"
      className="relative mx-auto mt-14 max-w-6xl sm:mt-20"
    >
      <div
        className="absolute inset-x-20 -top-10 h-40 rounded-full bg-accent/8 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111210] shadow-2xl shadow-black/40">
        <div className="flex min-h-12 items-center justify-between gap-4 border-b border-white/8 bg-white/[0.025] px-4 sm:px-5">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/15" />
          </div>
          <figcaption
            id="preview-caption"
            className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase sm:text-xs"
          >
            Illustrative workspace preview
          </figcaption>
        </div>

        <div className="grid lg:grid-cols-[1fr_18rem]">
          <div className="min-w-0 p-4 sm:p-6 lg:p-8">
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Film className="size-3.5 text-accent" aria-hidden="true" />
                  Historical documentary · 4 scenes
                </div>
                <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  The Rise of Majapahit
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                Project state persisted
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {previewScenes.map((scene) => (
                <article
                  key={scene.number}
                  className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]"
                >
                  <div className="flex gap-3 p-3.5">
                    <div className="relative flex aspect-[9/12] w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/8 bg-[radial-gradient(circle_at_30%_20%,rgba(205,154,67,0.22),transparent_45%),linear-gradient(155deg,#262722,#10110f)] sm:w-20">
                      <Layers3 className="size-5 text-accent/70" aria-hidden="true" />
                      <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/70">
                        v1
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col py-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Scene {scene.number}
                        </p>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                            scene.status === "Ready"
                              ? "bg-emerald-400/10 text-emerald-300"
                              : scene.status === "Generating"
                                ? "bg-accent/12 text-accent"
                                : "bg-white/6 text-muted-foreground",
                          )}
                        >
                          {scene.status}
                        </span>
                      </div>
                      <h4 className="mt-1 text-xs leading-snug font-medium sm:text-sm">
                        {scene.title}
                      </h4>
                      <div className="mt-auto pt-3">
                        <div className="h-1 overflow-hidden rounded-full bg-white/6">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${scene.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="border-t border-white/8 bg-black/15 p-5 lg:border-t-0 lg:border-l lg:p-6">
            <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">
              Production state
            </p>
            <div className="mt-5 space-y-5">
              <PreviewStatus icon={Check} label="Storyboard" value="4 scenes ready" complete />
              <PreviewStatus icon={Sparkles} label="Scene assets" value="2 of 4 complete" active />
              <PreviewStatus icon={ShieldCheck} label="Asset storage" value="Durable + versioned" complete />
              <PreviewStatus icon={Clock3} label="Final render" value="Waiting for scenes" />
            </div>
            <div className="mt-7 rounded-xl border border-accent/15 bg-accent/[0.055] p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-accent">
                <CircleDot className="size-3.5" aria-hidden="true" />
                Background job active
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Progress, retries, and completed assets remain attached to this project.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </figure>
  );
}

function PreviewStatus({
  icon: Icon,
  label,
  value,
  complete = false,
  active = false,
}: {
  icon: typeof Check;
  label: string;
  value: string;
  complete?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border",
          complete
            ? "border-emerald-400/15 bg-emerald-400/8 text-emerald-300"
            : active
              ? "border-accent/20 bg-accent/8 text-accent"
              : "border-white/8 bg-white/[0.025] text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

export function LandingPage({ authenticated }: LandingPageProps) {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0d0e0c] text-[#f1efe8] selection:bg-accent/30">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0d0e0c]/88 backdrop-blur-xl">
        <nav
          aria-label="Primary navigation"
          className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
        >
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Film className="size-4" aria-hidden="true" />
            </span>
            TaleMotion
          </Link>

          <div className="hidden items-center gap-6 text-sm text-white/60 lg:flex">
            <a className="rounded-sm transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" href="#product">
              Product
            </a>
            <a className="rounded-sm transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" href="#how-it-works">
              How it works
            </a>
            <a className="rounded-sm transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" href="#architecture">
              Architecture
            </a>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button asChild variant="ghost" className="hidden text-white/65 hover:text-white md:inline-flex">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                <Code2 aria-hidden="true" />
                GitHub
              </a>
            </Button>
            <Button asChild variant="ghost" className="text-white/70 hover:text-white">
              <Link href={authenticated ? "/projects" : "/login"}>
                {authenticated ? "Projects" : "Sign in"}
              </Link>
            </Button>
            <CtaLink authenticated={authenticated} className="h-9 px-2 text-xs sm:px-3 sm:text-sm" />
          </div>
        </nav>
      </header>

      <main>
        <section className="relative px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-24 lg:px-8 lg:pt-36">
          <div className="absolute inset-x-0 top-0 -z-0 h-[34rem] bg-[radial-gradient(ellipse_at_top,rgba(190,139,59,0.10),transparent_58%)]" aria-hidden="true" />
          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mx-auto mb-7 inline-flex max-w-full items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.055] px-3 py-1.5 text-xs text-accent sm:px-4">
              <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              Currently focused on short-form documentary workflows
            </div>
            <h1 className="text-balance text-4xl leading-[1.04] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Turn story ideas into structured cinematic videos.
            </h1>
            <p className="mx-auto mt-7 max-w-3xl text-balance text-base leading-7 text-white/62 sm:text-lg sm:leading-8">
              TaleMotion is an AI-assisted production workspace for planning storyboards,
              generating scene assets, reviewing individual clips, and assembling finished
              video projects.
            </p>
            <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <CtaLink authenticated={authenticated} className="w-full sm:w-auto" />
              <Button asChild variant="outline" size="lg" className="h-11 w-full border-white/12 bg-white/[0.025] px-5 text-white hover:bg-white/[0.07] sm:w-auto">
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <Code2 aria-hidden="true" />
                  View source on GitHub
                </a>
              </Button>
            </div>
          </div>
          <ProductPreview />
        </section>

        <section id="product" className="scroll-mt-24 border-y border-white/8 bg-white/[0.018] px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-20">
            <div>
              <SectionLabel>A persistent production workflow</SectionLabel>
              <h2 className="text-3xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">
                More than a single generated output.
              </h2>
            </div>
            <div className="border-l border-accent/30 pl-5 sm:pl-8">
              <p className="text-lg leading-8 text-white/70 sm:text-xl sm:leading-9">
                Most AI video tools focus on producing a single output. TaleMotion keeps the
                complete production process structured and persistent, so creators can manage
                scenes, preserve completed assets, retry failed work, and continue their project
                later.
              </p>
              <p className="mt-5 leading-7 text-white/45">
                The workspace separates planning, generation, review, and rendering—giving each
                scene its own state, assets, and recovery path.
              </p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionLabel>How it works</SectionLabel>
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <h2 className="max-w-2xl text-3xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">
                One project, from narrative structure to finished output.
              </h2>
              <p className="max-w-md text-sm leading-6 text-white/45">
                Work scene by scene while the project retains the state of every generation job
                and asset.
              </p>
            </div>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/8 bg-white/8 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <li key={step.number} className="min-h-56 bg-[#111210] p-6 sm:p-7">
                  <span className="font-mono text-xs text-accent">{step.number}</span>
                  <h3 className="mt-12 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/48">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionLabel>Production capabilities</SectionLabel>
            <h2 className="max-w-2xl text-3xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">
              Control the work at scene level.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, description }) => (
                <article key={title} className="rounded-2xl border border-white/8 bg-white/[0.025] p-6 transition-colors hover:border-white/14 motion-reduce:transition-none">
                  <span className="flex size-10 items-center justify-center rounded-xl border border-accent/15 bg-accent/[0.055] text-accent">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/46">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/8 bg-white/[0.018] px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-9 text-center">
              <SectionLabel>Workflow</SectionLabel>
              <h2 className="text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
                A durable path from idea to render.
              </h2>
            </div>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6 lg:gap-0">
              {workflow.map((item, index) => (
                <li key={item} className="flex min-w-0 items-center gap-2 lg:gap-0">
                  <div className="flex min-h-16 min-w-0 flex-1 items-center justify-center rounded-xl border border-white/8 bg-[#111210] px-3 text-center text-xs font-medium sm:text-sm">
                    {item}
                  </div>
                  {index < workflow.length - 1 && (
                    <ArrowRight className="hidden size-4 shrink-0 text-accent/60 lg:block" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="architecture" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <SectionLabel>Architecture that preserves the work</SectionLabel>
            <h2 className="mb-10 max-w-2xl text-3xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">
              Provider orchestration backed by durable media storage.
            </h2>
            <div className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-2xl border border-white/8 bg-white/[0.025] p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/[0.07] text-accent">
                    <Workflow className="size-4.5" aria-hidden="true" />
                  </span>
                  <h3 className="text-xl font-semibold">Genblaze</h3>
                </div>
                <p className="mt-6 leading-7 text-white/54">
                  TaleMotion uses Genblaze to orchestrate image and video generation, provider
                  polling, output processing, media lineage, asset hashing, and provenance
                  manifests behind a provider-independent workflow.
                </p>
              </article>
              <article className="rounded-2xl border border-white/8 bg-white/[0.025] p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/[0.07] text-accent">
                    <Boxes className="size-4.5" aria-hidden="true" />
                  </span>
                  <h3 className="text-xl font-semibold">Backblaze B2</h3>
                </div>
                <p className="mt-6 leading-7 text-white/54">
                  Generated images, video clips, manifests, and final renders are stored as
                  durable project assets in Backblaze B2 rather than depending on temporary
                  provider URLs.
                </p>
              </article>
            </div>
            <div className="mt-5 rounded-2xl border border-accent/15 bg-accent/[0.045] p-5 sm:p-7">
              <p className="mb-4 text-xs font-medium tracking-[0.14em] text-accent uppercase">Architecture flow</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/65 sm:text-sm">
                {[
                  "TaleMotion",
                  "Genblaze pipeline",
                  "AI providers",
                  "Backblaze B2",
                  "Review and final render",
                ].map((item, index, items) => (
                  <div key={item} className="contents">
                    <span className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">{item}</span>
                    {index < items.length - 1 && <ArrowRight className="size-3.5 text-accent/60" aria-hidden="true" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-8 rounded-3xl border border-white/8 bg-white/[0.025] p-6 sm:p-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:p-12">
            <div>
              <SectionLabel>Current MVP</SectionLabel>
              <h2 className="text-3xl leading-tight font-semibold tracking-[-0.03em]">
                Focused scope, complete workflow.
              </h2>
              <p className="mt-5 leading-7 text-white/52">
                The current MVP focuses on short, four-scene cinematic projects, with historical
                documentaries as its first supported workflow.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Current MVP capabilities">
              {[
                "Structured four-scene storyboard",
                "Scene image and video workflows",
                "Background jobs",
                "Persistent project state",
                "Scene-level retries",
                "Durable asset storage",
                "Provenance metadata",
                "FFmpeg rendering infrastructure",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 rounded-xl border border-white/7 bg-black/10 px-3.5 py-3 text-sm text-white/64">
                  <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-white/8 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <Play className="mx-auto size-5 text-accent" aria-hidden="true" />
            <h2 className="mt-6 text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">
              Build your story one scene at a time.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-balance leading-7 text-white/52">
              Plan the narrative, generate individual scenes, preserve completed work, and
              assemble the final project in one persistent workspace.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <CtaLink authenticated={authenticated} />
              <Button asChild variant="ghost" size="lg" className="h-11 text-white/65 hover:text-white">
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  View source code
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-white/42 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-white/80">TaleMotion</p>
            <p className="mt-1 text-xs">AI-assisted cinematic production, structured scene by scene.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a className="rounded-sm hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
            <Link className="rounded-sm hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" href="/login">Sign in</Link>
            <span>© {year} TaleMotion</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
