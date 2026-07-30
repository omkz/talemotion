import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProjectStatus } from "@/types";

export type ProjectFilter = "all" | Extract<ProjectStatus, "draft" | "generating" | "ready">;

const FILTERS: { value: ProjectFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "generating", label: "Generating" },
  { value: "ready", label: "Ready" },
];

interface ProjectFiltersProps {
  value: ProjectFilter;
  onChange: (value: ProjectFilter) => void;
}

export function ProjectFilters({ value, onChange }: ProjectFiltersProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as ProjectFilter)}>
      <TabsList>
        {FILTERS.map((filter) => (
          <TabsTrigger key={filter.value} value={filter.value}>
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
