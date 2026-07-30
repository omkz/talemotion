import { Skeleton } from "@/components/ui/skeleton";

export function ProjectsGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl ring-1 ring-foreground/10">
          <Skeleton className="aspect-video w-full rounded-b-none rounded-t-xl" />
          <div className="space-y-3 p-4 pt-0">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
