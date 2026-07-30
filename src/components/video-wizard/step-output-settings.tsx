import type { Control } from "react-hook-form";
import { RectangleVertical, RectangleHorizontal } from "lucide-react";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LANGUAGES, NARRATION_STYLES, VISUAL_STYLES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { WizardFormValues } from "./schema";

interface StepOutputSettingsProps {
  control: Control<WizardFormValues>;
}

export function StepOutputSettings({ control }: StepOutputSettingsProps) {
  return (
    <div className="grid gap-6">
      <FormField
        control={control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Title</FormLabel>
            <FormControl>
              <Input placeholder="The Rise of Majapahit" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={control}
          name="language"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Language</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="visualStyle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visual style</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {VISUAL_STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {style}
                    </SelectItem>
                  ))}
                </SelectContent>
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
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {NARRATION_STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {style}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="sceneCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Scene count</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="4">4 scenes</SelectItem>
                  <SelectItem value="5">5 scenes</SelectItem>
                  <SelectItem value="6">6 scenes</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="duration"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Duration</FormLabel>
            <FormControl>
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex gap-3"
              >
                {(["30", "45", "60"] as const).map((seconds) => (
                  <Label
                    key={seconds}
                    htmlFor={`duration-${seconds}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium",
                      field.value === seconds
                        ? "border-accent bg-accent/8 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    <RadioGroupItem value={seconds} id={`duration-${seconds}`} />
                    {seconds}s
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
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex gap-3"
              >
                {[
                  { value: "9:16" as const, label: "9:16 Vertical", icon: RectangleVertical },
                  { value: "16:9" as const, label: "16:9 Horizontal", icon: RectangleHorizontal },
                ].map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`aspect-${option.value}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium",
                      field.value === option.value
                        ? "border-accent bg-accent/8 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    <RadioGroupItem value={option.value} id={`aspect-${option.value}`} />
                    <option.icon className="size-4" />
                    {option.label}
                  </Label>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="captionsEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-3">
              <div className="space-y-0.5">
                <FormLabel className="text-sm">Captions</FormLabel>
                <p className="text-xs text-muted-foreground">Burn in synced captions</p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="musicEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-3">
              <div className="space-y-0.5">
                <FormLabel className="text-sm">Background music</FormLabel>
                <p className="text-xs text-muted-foreground">Add a mood-matched score</p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
