"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ImagePlus,
  Palette,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";

import { ThemeToggle } from "@/components/theme/toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const defaultColors = [
  { name: "Background", value: "#0A0A0A", usage: "Primary app and canvas background" },
  { name: "Surface", value: "#171717", usage: "Cards, dialogs, and panels" },
  { name: "Border", value: "#2A2A2A", usage: "Subtle dividers and component outlines" },
  { name: "Text", value: "#FAFAFA", usage: "Primary foreground content" },
  { name: "Accent", value: "#AFC8FF", usage: "Active tools, focus states, and AI actions" },
];

const defaultTypography = [
  { role: "Display", family: "Inter", weight: "700", size: "40px", lineHeight: "48px", usage: "High-emphasis product or page titles" },
  { role: "Heading", family: "Inter", weight: "600", size: "24px", lineHeight: "32px", usage: "Section headings and dashboard titles" },
  { role: "Body", family: "Inter", weight: "400", size: "14px", lineHeight: "22px", usage: "Forms, cards, and standard UI text" },
  { role: "Label", family: "Inter", weight: "500", size: "12px", lineHeight: "16px", usage: "Inputs, metadata, and controls" },
];

type ColorSection = {
  name: string;
  value: string;
  usage: string;
};

type TypographySection = {
  role: string;
  family: string;
  weight: string;
  size: string;
  lineHeight: string;
  usage: string;
};

type StyleGuide = {
  colorSections: ColorSection[];
  typographySections: TypographySection[];
  notes: string;
};

function parseStyleGuide(value?: string): StyleGuide {
  if (!value) {
    return {
      colorSections: defaultColors,
      typographySections: defaultTypography,
      notes: "A compact, work-focused design system for S2C project workflows.",
    };
  }

  try {
    const parsed = JSON.parse(value) as Partial<StyleGuide>;

    return {
      colorSections: parsed.colorSections?.length ? parsed.colorSections : defaultColors,
      typographySections: parsed.typographySections?.length ? parsed.typographySections : defaultTypography,
      notes: parsed.notes ?? "",
    };
  } catch {
    return {
      colorSections: defaultColors,
      typographySections: defaultTypography,
      notes: value,
    };
  }
}


function isRemoteUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:") || value.startsWith("blob:");
}

function MoodboardImage({ value }: { value: string }) {
  const resolvedUrl = useQuery(api.projects.resolveMoodboardImage, isRemoteUrl(value) ? "skip" : { storageId: value });
  const src = isRemoteUrl(value) ? value : resolvedUrl;

  if (!src) {
    return <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">Loading image</div>;
  }

  return <img src={src} alt="Moodboard reference" className="h-full w-full object-cover" />;
}
function suggestedGuideFromMoodboard(images: string[]): StyleGuide {
  const hasImages = images.length > 0;

  return {
    colorSections: hasImages
      ? [
          { name: "Ink", value: "#0B0D10", usage: "Ground the workspace and high-focus editor surfaces" },
          { name: "Panel", value: "#181B20", usage: "Dashboard cards, forms, and right-side inspector panels" },
          { name: "Line", value: "#343A46", usage: "Wireframes, borders, dividers, and canvas primitives" },
          { name: "Signal", value: "#9DB7FF", usage: "AI actions, selected states, and generation progress" },
          { name: "Soft Text", value: "#AEB6C5", usage: "Secondary labels, tabs, and helper copy" },
        ]
      : defaultColors,
    typographySections: defaultTypography,
    notes: hasImages
      ? "Generated from the current moodboard direction. Keep the system compact, functional, and close to the sketch-to-code workflow."
      : "Add moodboard images to generate a more specific design direction.",
  };
}

export function StyleGuidePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as Id<"projects">;
  const project = useQuery(api.projects.get, { id: projectId });
  const updateProject = useMutation(api.projects.update);
  const generateUploadUrl = useMutation(api.projects.generateMoodboardUploadUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [localImages, setLocalImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialGuide = useMemo(() => parseStyleGuide(project?.styleGuide), [project?.styleGuide]);
  const [guide, setGuide] = useState<StyleGuide | null>(null);

  const activeGuide = guide ?? initialGuide;
  const moodboardImages = localImages;

  useEffect(() => {
    setLocalImages(project?.moodBoardImages ?? []);
  }, [project?.moodBoardImages]);

  const setColors = (colors: ColorSection[]) => setGuide({ ...activeGuide, colorSections: colors });
  const setTypography = (typography: TypographySection[]) => setGuide({ ...activeGuide, typographySections: typography });

  const saveGuide = async (nextGuide = activeGuide, nextImages = moodboardImages) => {
    setLocalImages(nextImages);
    setIsSaving(true);

    try {
      await updateProject({
        id: projectId,
        patch: {
          styleGuide: JSON.stringify(nextGuide),
          moodBoardImages: nextImages,
        },
      });
      setGuide(nextGuide);
      toast.success("Style guide saved");
    } catch (error) {
      console.error(error);
      toast.error("Could not save style guide");
    } finally {
      setIsSaving(false);
    }
  };

  const addImage = async () => {
    const trimmed = imageUrl.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      toast.error("Enter a valid image URL");
      return;
    }

    const nextImages = Array.from(new Set([...moodboardImages, trimmed]));
    setImageUrl("");
    await saveGuide(activeGuide, nextImages);
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (images.length === 0) {
      toast.error("Drop or choose image files only");
      return;
    }

    setIsUploading(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of images) {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!response.ok) {
          throw new Error(`Upload failed for ${file.name}`);
        }

        const { storageId } = (await response.json()) as { storageId: string };
        uploadedUrls.push(storageId);
      }

      const nextImages = Array.from(new Set([...moodboardImages, ...uploadedUrls]));
      await saveGuide(activeGuide, nextImages);
      toast.success(`${uploadedUrls.length} image${uploadedUrls.length === 1 ? "" : "s"} uploaded`);
    } catch (error) {
      console.error(error);
      toast.error("Could not upload moodboard image");
    } finally {
      setIsUploading(false);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    await uploadFiles(event.dataTransfer.files);
  };

  const removeImage = async (url: string) => {
    await saveGuide(activeGuide, moodboardImages.filter((image) => image !== url));
  };

  const generateGuide = () => {
    setGuide(suggestedGuideFromMoodboard(moodboardImages));
    toast.success("Starter guide generated");
  };

  if (project === undefined) {
    return <div className="grid min-h-svh place-items-center bg-background text-muted-foreground">Loading style guide</div>;
  }

  if (project === null) {
    return <div className="grid min-h-svh place-items-center bg-background text-foreground">Project not found</div>;
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="size-9 rounded-md">
              <Link href={`/dashboard/projects/${projectId}`} aria-label="Back to editor">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-none">Style Guide</h1>
              <p className="mt-1 truncate text-xs text-muted-foreground">{project.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button className="h-9" disabled={isSaving} onClick={() => void saveGuide()}>
              <Save className="size-4" />
              {isSaving ? "Saving" : "Save"}
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary">Design system</Badge>
              <Badge variant="outline">Project {project.projectNumber}</Badge>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">Style Guide</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage the colors, typography, and moodboard direction that will guide AI-generated screens for this project.
            </p>
          </div>
          <Button variant="outline" className="h-9" onClick={generateGuide}>
            <Sparkles className="size-4" />
            Generate from moodboard
          </Button>
        </div>

        <Tabs defaultValue="colours" className="gap-5">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="colours">
              <Palette className="size-4" />
              colours
            </TabsTrigger>
            <TabsTrigger value="typography">
              <Type className="size-4" />
              typography
            </TabsTrigger>
            <TabsTrigger value="moodboard">
              <ImagePlus className="size-4" />
              moodboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="colours" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeGuide.colorSections.map((color, index) => (
                <Card key={`${color.name}-${index}`} className="rounded-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-3">
                      <Input
                        value={color.name}
                        onChange={(event) => {
                          const next = [...activeGuide.colorSections];
                          next[index] = { ...color, name: event.target.value };
                          setColors(next);
                        }}
                        className="h-8 border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
                      />
                      <button
                        type="button"
                        className="size-8 rounded-md border border-border"
                        style={{ backgroundColor: color.value }}
                        aria-label={color.name}
                        suppressHydrationWarning
                      />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-[44px_1fr] gap-2">
                      <input
                        type="color"
                        value={color.value}
                        onChange={(event) => {
                          const next = [...activeGuide.colorSections];
                          next[index] = { ...color, value: event.target.value };
                          setColors(next);
                        }}
                        className="h-9 w-11 cursor-pointer rounded-md border border-border bg-background"
                      />
                      <Input
                        value={color.value}
                        onChange={(event) => {
                          const next = [...activeGuide.colorSections];
                          next[index] = { ...color, value: event.target.value };
                          setColors(next);
                        }}
                        className="h-9 font-mono text-xs uppercase"
                      />
                    </div>
                    <Textarea
                      value={color.usage}
                      onChange={(event) => {
                        const next = [...activeGuide.colorSections];
                        next[index] = { ...color, usage: event.target.value };
                        setColors(next);
                      }}
                      className="min-h-20 resize-none"
                    />
                    <Button
                      variant="outline"
                      className="h-8 w-full"
                      onClick={() => setColors(activeGuide.colorSections.filter((_, colorIndex) => colorIndex !== index))}
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => setColors([...activeGuide.colorSections, { name: "New color", value: "#AFC8FF", usage: "Describe where this color belongs" }])}
            >
              <Plus className="size-4" />
              Add colour
            </Button>
          </TabsContent>

          <TabsContent value="typography" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {activeGuide.typographySections.map((typeStyle, index) => (
                <Card key={`${typeStyle.role}-${index}`} className="rounded-lg">
                  <CardContent className="space-y-4 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-xs text-muted-foreground">
                        Role
                        <Input
                          value={typeStyle.role}
                          onChange={(event) => {
                            const next = [...activeGuide.typographySections];
                            next[index] = { ...typeStyle, role: event.target.value };
                            setTypography(next);
                          }}
                        />
                      </label>
                      <label className="space-y-1.5 text-xs text-muted-foreground">
                        Family
                        <Input
                          value={typeStyle.family}
                          onChange={(event) => {
                            const next = [...activeGuide.typographySections];
                            next[index] = { ...typeStyle, family: event.target.value };
                            setTypography(next);
                          }}
                        />
                      </label>
                      <label className="space-y-1.5 text-xs text-muted-foreground">
                        Weight
                        <Input
                          value={typeStyle.weight}
                          onChange={(event) => {
                            const next = [...activeGuide.typographySections];
                            next[index] = { ...typeStyle, weight: event.target.value };
                            setTypography(next);
                          }}
                        />
                      </label>
                      <label className="space-y-1.5 text-xs text-muted-foreground">
                        Size
                        <Input
                          value={typeStyle.size}
                          onChange={(event) => {
                            const next = [...activeGuide.typographySections];
                            next[index] = { ...typeStyle, size: event.target.value };
                            setTypography(next);
                          }}
                        />
                      </label>
                      <label className="space-y-1.5 text-xs text-muted-foreground">
                        Line height
                        <Input
                          value={typeStyle.lineHeight}
                          onChange={(event) => {
                            const next = [...activeGuide.typographySections];
                            next[index] = { ...typeStyle, lineHeight: event.target.value };
                            setTypography(next);
                          }}
                        />
                      </label>
                      <label className="space-y-1.5 text-xs text-muted-foreground sm:col-span-2">
                        Usage
                        <Input
                          value={typeStyle.usage}
                          onChange={(event) => {
                            const next = [...activeGuide.typographySections];
                            next[index] = { ...typeStyle, usage: event.target.value };
                            setTypography(next);
                          }}
                        />
                      </label>
                    </div>
                    <div className="rounded-lg border bg-background p-4">
                      <p
                        style={{
                          fontFamily: typeStyle.family,
                          fontWeight: Number(typeStyle.weight) || 400,
                          fontSize: typeStyle.size,
                          lineHeight: typeStyle.lineHeight,
                        }}
                      >
                        {typeStyle.role} typography sample
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">{typeStyle.usage}</p>
                    </div>
                    <Button
                      variant="outline"
                      className="h-8 w-full"
                      onClick={() => setTypography(activeGuide.typographySections.filter((_, typeIndex) => typeIndex !== index))}
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() =>
                setTypography([
                  ...activeGuide.typographySections,
                  { role: "New style", family: "Inter", weight: "500", size: "16px", lineHeight: "24px", usage: "Describe where this type style belongs" },
                ])
              }
            >
              <Plus className="size-4" />
              Add typography
            </Button>
          </TabsContent>

          <TabsContent value="moodboard" className="space-y-5">
            <Card className="rounded-lg">
              <CardContent className="p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="moodboard-url">Image URL</Label>
                    <Input
                      id="moodboard-url"
                      value={imageUrl}
                      onChange={(event) => setImageUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addImage();
                        }
                      }}
                      placeholder="https://..."
                    />
                  </div>
                  <Button className="self-end" onClick={() => void addImage()} disabled={!imageUrl.trim() || isSaving || isUploading}>
                    <ImagePlus className="size-4" />
                    Add image
                  </Button>
                </div>
              </CardContent>
            </Card>

            {moodboardImages.length === 0 ? (
              <div
                className={`grid min-h-72 place-items-center rounded-lg border border-dashed p-10 text-center transition ${
                  isDragging ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => void onDrop(event)}
              >
                <div className="max-w-md">
                  <button
                    type="button"
                    className="mx-auto grid size-12 place-items-center rounded-lg border bg-muted transition hover:bg-muted/70"
                    onClick={() => fileInputRef.current?.click()}
                    suppressHydrationWarning
                  >
                    <ImagePlus className="size-5 text-muted-foreground" />
                  </button>
                  <h3 className="mt-4 text-base font-semibold">{isUploading ? "Uploading images" : "No moodboard images yet"}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Drag and drop images here, click the upload icon, or paste an image URL above.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => event.target.files && void uploadFiles(event.target.files)}
                  />
                  <Button variant="outline" className="mt-5" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                    <ImagePlus className="size-4" />
                    Choose images
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={`grid gap-4 rounded-lg border border-dashed p-3 transition sm:grid-cols-2 lg:grid-cols-3 ${
                  isDragging ? "border-primary bg-primary/5" : "border-transparent"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => void onDrop(event)}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => event.target.files && void uploadFiles(event.target.files)}
                />
                <button
                  type="button"
                  className="grid aspect-video place-items-center rounded-lg border border-dashed border-border bg-card text-sm text-muted-foreground transition hover:bg-muted"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  suppressHydrationWarning
                >
                  <span className="flex items-center gap-2"><ImagePlus className="size-4" /> {isUploading ? "Uploading" : "Add or drop"}</span>
                </button>
                {moodboardImages.map((url) => (
                  <Card key={url} className="rounded-lg">
                    <CardContent className="p-3">
                      <div className="aspect-video overflow-hidden rounded-md border bg-muted">
                        <MoodboardImage value={url} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="truncate text-xs text-muted-foreground">{url}</p>
                        <Button variant="outline" size="icon" className="size-8" onClick={() => void removeImage(url)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}