"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { NARRATION_STYLES, VISUAL_STYLES } from "@/lib/mock-data";
import {
  CUSTOM_TARGET_AUDIENCE_VALUE,
  HISTORICAL_TARGET_AUDIENCE_OPTIONS,
  isPresetTargetAudience,
  LANGUAGE_OPTIONS,
  TONE_OPTIONS,
} from "@/components/video-wizard/project-options";
import type { ModeBrief, OutputConfig } from "@/types";

export interface BriefSaveValues {
  brief: ModeBrief;
  title: string;
  language: string;
  duration: 30 | 45;
  visualStyle: string;
  narrationStyle: string;
  narrationEnabled: boolean;
  captionsEnabled: boolean;
  musicEnabled: boolean;
  toneChanged: boolean;
  historicalAccuracyNote: string | null;
}

interface EditBriefSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brief: ModeBrief;
  output: OutputConfig;
  historicalAccuracyNote: string | null;
  onSave: (next: BriefSaveValues) => Promise<boolean>;
}

export function EditBriefSheet({
  open,
  onOpenChange,
  brief,
  output,
  historicalAccuracyNote,
  onSave,
}: EditBriefSheetProps) {
  const [isSaving, setIsSaving] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSaving) onOpenChange(nextOpen);
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit brief</SheetTitle>
          <SheetDescription>
            Update the original input and settings used to generate this video.
          </SheetDescription>
        </SheetHeader>

        {open && (
          <EditBriefForm
            brief={brief}
            output={output}
            historicalAccuracyNote={historicalAccuracyNote}
            isSaving={isSaving}
            onCancel={() => onOpenChange(false)}
            onSave={async (values) => {
              if (isSaving) return false;
              setIsSaving(true);
              try {
                const saved = await onSave(values);
                if (saved) onOpenChange(false);
                return saved;
              } finally {
                setIsSaving(false);
              }
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditBriefForm({
  brief,
  output,
  historicalAccuracyNote,
  isSaving,
  onSave,
  onCancel,
}: {
  brief: ModeBrief;
  output: OutputConfig;
  historicalAccuracyNote: string | null;
  isSaving: boolean;
  onSave: (values: BriefSaveValues) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ModeBrief>(brief);
  const [title, setTitle] = useState(output.title);
  const [language, setLanguage] = useState(output.language);
  const [duration, setDuration] = useState<30 | 45>(
    output.duration === 30 ? 30 : 45,
  );
  const [visualStyle, setVisualStyle] = useState(output.visualStyle);
  const [narrationStyle, setNarrationStyle] = useState(output.narrationStyle);
  const [narrationEnabled, setNarrationEnabled] = useState(
    output.narrationEnabled !== false,
  );
  const [captionsEnabled, setCaptionsEnabled] = useState(output.captionsEnabled);
  const [musicEnabled, setMusicEnabled] = useState(output.musicEnabled);
  const [accuracyNote, setAccuracyNote] = useState(historicalAccuracyNote ?? "");
  const historicalAudienceInvalid =
    draft.mode === "historical-documentary" &&
    !draft.targetAudience.trim();
  const handleSave = async () => {
    if (isSaving || historicalAudienceInvalid) return;
    const briefWithLanguage =
      draft.mode === "historical-documentary"
        ? { ...draft, language, targetAudience: draft.targetAudience.trim() }
        : draft.mode === "custom-video"
          ? { ...draft, language }
        : draft;
    await onSave({
      brief: briefWithLanguage,
      title,
      language,
      duration,
      visualStyle,
      narrationStyle,
      narrationEnabled,
      captionsEnabled,
      musicEnabled,
      toneChanged:
        draft.mode === "historical-documentary" &&
        brief.mode === "historical-documentary" &&
        draft.tone !== brief.tone,
      historicalAccuracyNote:
        draft.mode === "historical-documentary"
          ? accuracyNote
          : historicalAccuracyNote,
    });
  };

  return (
    <>
      <div className="flex flex-col gap-5 px-4 pb-4">
        {draft.mode === "historical-documentary" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="brief-title">Project title</Label>
              <Input id="brief-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-topic">Topic</Label>
              <Textarea
                id="brief-topic"
                rows={3}
                value={draft.topic}
                onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-sources">Source notes</Label>
              <Textarea
                id="brief-sources"
                rows={3}
                value={draft.sourceNotes}
                onChange={(e) => setDraft({ ...draft, sourceNotes: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGUAGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-narrative-tone">Narrative Tone</Label>
                <Select value={draft.tone} onValueChange={(tone) => setDraft({ ...draft, tone: tone as typeof draft.tone })}>
                  <SelectTrigger id="brief-narrative-tone" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{TONE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controls the storytelling and narration style, not the visual brightness.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-audience">Target audience</Label>
                <Select
                  value={
                    isPresetTargetAudience(draft.targetAudience)
                      ? draft.targetAudience
                      : CUSTOM_TARGET_AUDIENCE_VALUE
                  }
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      targetAudience:
                        value === CUSTOM_TARGET_AUDIENCE_VALUE ? "" : value,
                    })
                  }
                >
                  <SelectTrigger id="brief-audience" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HISTORICAL_TARGET_AUDIENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_TARGET_AUDIENCE_VALUE}>
                      Custom...
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Adjusts language complexity, context, and assumed historical knowledge.
                </p>
                {!isPresetTargetAudience(draft.targetAudience) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="brief-custom-audience">
                      Describe the audience
                    </Label>
                    <Input
                      id="brief-custom-audience"
                      placeholder="Indonesian high-school students"
                      maxLength={200}
                      value={draft.targetAudience}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          targetAudience: event.target.value,
                        })
                      }
                    />
                    {historicalAudienceInvalid && (
                      <p className="text-xs text-destructive" role="alert">
                        Describe the audience when Custom is selected.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-direction">Additional direction</Label>
              <Textarea
                id="brief-direction"
                rows={3}
                value={draft.additionalDirection}
                onChange={(e) => setDraft({ ...draft, additionalDirection: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-accuracy">Historical accuracy note</Label>
              <Textarea
                id="brief-accuracy"
                rows={2}
                value={accuracyNote}
                onChange={(e) => setAccuracyNote(e.target.value)}
              />
            </div>
          </>
        )}

        {draft.mode === "custom-video" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="brief-title">Project title</Label>
              <Input id="brief-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-custom-prompt">Video description</Label>
              <Textarea
                id="brief-custom-prompt"
                rows={5}
                value={draft.prompt}
                onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-custom-sources">Source notes</Label>
              <Textarea
                id="brief-custom-sources"
                rows={3}
                value={draft.sourceNotes}
                onChange={(event) => setDraft({ ...draft, sourceNotes: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGUAGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brief-custom-audience">Target audience</Label>
                <Input
                  id="brief-custom-audience"
                  value={draft.targetAudience}
                  onChange={(event) => setDraft({ ...draft, targetAudience: event.target.value })}
                />
              </div>
            </div>
          </>
        )}

        {draft.mode === "microdrama" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="brief-premise">Premise</Label>
              <Textarea
                id="brief-premise"
                rows={3}
                value={draft.premise}
                onChange={(e) => setDraft({ ...draft, premise: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-character">Main character</Label>
              <Textarea
                id="brief-character"
                rows={1}
                value={draft.mainCharacter}
                onChange={(e) => setDraft({ ...draft, mainCharacter: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-ending">Desired ending</Label>
              <Textarea
                id="brief-ending"
                rows={2}
                value={draft.desiredEnding}
                onChange={(e) => setDraft({ ...draft, desiredEnding: e.target.value })}
              />
            </div>
          </>
        )}

        {draft.mode === "product-advertisement" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="brief-product-desc">Product description</Label>
              <Textarea
                id="brief-product-desc"
                rows={3}
                value={draft.productDescription}
                onChange={(e) => setDraft({ ...draft, productDescription: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-benefit">Main benefit</Label>
              <Textarea
                id="brief-benefit"
                rows={2}
                value={draft.mainBenefit}
                onChange={(e) => setDraft({ ...draft, mainBenefit: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-cta">Call to action</Label>
              <Textarea
                id="brief-cta"
                rows={1}
                value={draft.callToAction}
                onChange={(e) => setDraft({ ...draft, callToAction: e.target.value })}
              />
            </div>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Project duration</Label>
            <Select
              value={String(duration)}
              onValueChange={(value) => setDuration(value === "30" ? 30 : 45)}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="45">45 seconds</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Visual style</Label>
            <Select value={visualStyle} onValueChange={setVisualStyle}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISUAL_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Narration style</Label>
            <Select value={narrationStyle} onValueChange={setNarrationStyle}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NARRATION_STYLES.map((style) => (
                  <SelectItem key={style} value={style}>
                    {style}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="brief-narration" className="text-sm font-normal">
            AI narration enabled
          </Label>
          <Switch
            id="brief-narration"
            checked={narrationEnabled}
            onCheckedChange={setNarrationEnabled}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="brief-captions" className="text-sm font-normal">
            Captions enabled
          </Label>
          <Switch id="brief-captions" checked={captionsEnabled} onCheckedChange={setCaptionsEnabled} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="brief-music" className="text-sm font-normal">
            Background music enabled
          </Label>
          <Switch id="brief-music" checked={musicEnabled} onCheckedChange={setMusicEnabled} />
        </div>
      </div>

      <SheetFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving || historicalAudienceInvalid}>
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </SheetFooter>
    </>
  );
}
