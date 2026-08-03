import { useFormContext } from "react-hook-form";
import { RectangleVertical } from "lucide-react";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NARRATION_STYLES, VISUAL_STYLES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function StepOutputSettings() {
  const { control } = useFormContext();
  return (
    <div className="grid gap-6">
      <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
        The current workflow creates four scenes in a vertical 9:16 project.
      </div>

      <FormField
        control={control}
        name="duration"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Project duration</FormLabel>
            <FormDescription>
              Choose the supported total duration for the four-scene storyboard.
            </FormDescription>
            <FormControl>
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex flex-wrap gap-3"
              >
                {(["30", "45"] as const).map((seconds) => (
                  <Label
                    key={seconds}
                    htmlFor={`duration-${seconds}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium",
                      field.value === seconds
                        ? "border-accent bg-accent/8 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    <RadioGroupItem value={seconds} id={`duration-${seconds}`} />
                    {seconds} seconds
                  </Label>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="aspectRatio"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Aspect ratio</FormLabel>
            <FormControl>
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                <Label
                  htmlFor="aspect-9:16"
                  className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-accent bg-accent/8 px-4 py-2.5 text-sm font-medium text-foreground"
                >
                  <RadioGroupItem value="9:16" id="aspect-9:16" />
                  <RectangleVertical className="size-4" />
                  9:16 Vertical
                </Label>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={control}
          name="visualStyle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visual style</FormLabel>
              <FormDescription>
                Controls the visual look, lighting, colors, realism, and atmosphere.
              </FormDescription>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>{VISUAL_STYLES.map((style) => <SelectItem key={style} value={style}>{style}</SelectItem>)}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="narrationStyle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Narration style</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>{NARRATION_STYLES.map((style) => <SelectItem key={style} value={style}>{style}</SelectItem>)}</SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-3">
        <OutputToggle
          name="narrationEnabled"
          label="AI narration"
          description="Generate narration audio"
        />
        <OutputToggle
          name="captionsEnabled"
          label="Captions"
          description="Include timed captions"
        />
        <OutputToggle
          name="musicEnabled"
          label="Background music"
          description="Add a mood-matched score"
        />
      </div>
    </div>
  );
}

function OutputToggle({
  name,
  label,
  description,
}: {
  name: "narrationEnabled" | "captionsEnabled" | "musicEnabled";
  label: string;
  description: string;
}) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-center justify-between gap-3">
          <div className="space-y-0.5">
            <FormLabel className="text-sm">{label}</FormLabel>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
