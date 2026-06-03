"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Circle,
  Code2,
  Copy,
  FrameIcon,
  ImagePlus,
  Layers3,
  MousePointer2,
  MoveRight,
  PenLine,
  RectangleHorizontal,
  Save,
  Slash,
  Sparkles,
  SwatchBook,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Arrow } from "@/components/shapes/arrow";
import { Elipse } from "@/components/shapes/elipse";
import { Frame } from "@/components/shapes/frame";
import { Line } from "@/components/shapes/line";
import { Rectangle } from "@/components/shapes/rectangle";
import { Stroke } from "@/components/shapes/stroke";
import { Text } from "@/components/shapes/text";
import { ThemeToggle } from "@/components/theme/toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RootState } from "@/redux/store";
import {
  addArrow,
  addEllipse,
  addFrame,
  addFreeDrawShape,
  addLine,
  addRect,
  addText,
  clearSelection,
  deleteSelected,
  loadProject,
  removeShape,
  selectShape,
  setTool,
  updateShape,
  type Shape,
  type Tool,
} from "@/redux/slice/shapes";
import {
  panEnd,
  panMove,
  panStart,
  resetView,
  restoreViewport,
  screenToWorld,
  setScale,
  wheelPan,
  wheelZoom,
} from "@/redux/slice/viewport";
import { cn } from "@/lib/utils";

const tools: Array<{ id: Tool; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "frame", label: "Frame", icon: FrameIcon },
  { id: "rect", label: "Rectangle", icon: RectangleHorizontal },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "line", label: "Line", icon: Slash },
  { id: "arrow", label: "Arrow", icon: MoveRight },
  { id: "freedraw", label: "Draw", icon: PenLine },
  { id: "text", label: "Text", icon: Type },
];

type Bounds = { x: number; y: number; w: number; h: number };
type ResizeCorner = "nw" | "ne" | "sw" | "se";

function renderShape(shape: Shape) {
  switch (shape.type) {
    case "frame":
      return <Frame key={shape.id} shape={shape} toggleInspiration={() => undefined} />;
    case "rect":
      return <Rectangle key={shape.id} shape={shape} />;
    case "ellipse":
      return <Elipse key={shape.id} shape={shape} />;
    case "line":
      return <Line key={shape.id} shape={shape} />;
    case "arrow":
      return <Arrow key={shape.id} shape={shape} />;
    case "freedraw":
      return <Stroke key={shape.id} shape={shape} />;
    case "text":
      return <Text key={shape.id} shape={shape} />;
    default:
      return null;
  }
}

function shapeLabel(shape: Shape) {
  if (shape.type === "frame") return `Frame ${shape.frameNumber}`;
  if (shape.type === "text") return shape.text || "Text";
  if (shape.type === "generatedui") return "Generated UI";
  return shape.type.charAt(0).toUpperCase() + shape.type.slice(1);
}

function getShapeBounds(shape: Shape): Bounds {
  if (shape.type === "frame" || shape.type === "rect" || shape.type === "ellipse" || shape.type === "generatedui") {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }

  if (shape.type === "text") {
    return {
      x: shape.x,
      y: shape.y,
      w: Math.max(80, shape.text.length * shape.fontSize * 0.6 + 16),
      h: shape.fontSize * 1.6,
    };
  }

  if (shape.type === "line" || shape.type === "arrow") {
    const x = Math.min(shape.startX, shape.endX) - 10;
    const y = Math.min(shape.startY, shape.endY) - 10;
    return {
      x,
      y,
      w: Math.max(20, Math.abs(shape.endX - shape.startX) + 20),
      h: Math.max(20, Math.abs(shape.endY - shape.startY) + 20),
    };
  }

  if (shape.points.length === 0) return { x: 0, y: 0, w: 20, h: 20 };

  const xs = shape.points.map((point) => point.x);
  const ys = shape.points.map((point) => point.y);
  const x = Math.min(...xs) - 10;
  const y = Math.min(...ys) - 10;

  return {
    x,
    y,
    w: Math.max(20, Math.max(...xs) - Math.min(...xs) + 20),
    h: Math.max(20, Math.max(...ys) - Math.min(...ys) + 20),
  };
}

function moveShapePatch(shape: Shape, dx: number, dy: number): Partial<Shape> {
  if (shape.type === "frame" || shape.type === "rect" || shape.type === "ellipse" || shape.type === "generatedui") {
    return { x: shape.x + dx, y: shape.y + dy } as Partial<Shape>;
  }

  if (shape.type === "text") {
    return { x: shape.x + dx, y: shape.y + dy } as Partial<Shape>;
  }

  if (shape.type === "line" || shape.type === "arrow") {
    return {
      startX: shape.startX + dx,
      startY: shape.startY + dy,
      endX: shape.endX + dx,
      endY: shape.endY + dy,
    } as Partial<Shape>;
  }

  return {
    points: shape.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  } as Partial<Shape>;
}

function boundsPatch(shape: Shape, next: Bounds, previous = getShapeBounds(shape)): Partial<Shape> {
  const normalized = {
    x: next.w < 0 ? next.x + next.w : next.x,
    y: next.h < 0 ? next.y + next.h : next.y,
    w: Math.max(8, Math.abs(next.w)),
    h: Math.max(8, Math.abs(next.h)),
  };

  if (shape.type === "frame" || shape.type === "rect" || shape.type === "ellipse" || shape.type === "generatedui") {
    return normalized as Partial<Shape>;
  }

  if (shape.type === "text") {
    return {
      x: normalized.x,
      y: normalized.y,
      fontSize: Math.max(10, Math.round(normalized.h / 1.6)),
    } as Partial<Shape>;
  }

  const scalePoint = (point: { x: number; y: number }) => ({
    x: normalized.x + ((point.x - previous.x) / Math.max(1, previous.w)) * normalized.w,
    y: normalized.y + ((point.y - previous.y) / Math.max(1, previous.h)) * normalized.h,
  });

  if (shape.type === "line" || shape.type === "arrow") {
    const start = scalePoint({ x: shape.startX, y: shape.startY });
    const end = scalePoint({ x: shape.endX, y: shape.endY });

    return {
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
    } as Partial<Shape>;
  }

  return { points: shape.points.map(scalePoint) } as Partial<Shape>;
}

function resizeBounds(bounds: Bounds, corner: ResizeCorner, dx: number, dy: number): Bounds {
  if (corner === "nw") return { x: bounds.x + dx, y: bounds.y + dy, w: bounds.w - dx, h: bounds.h - dy };
  if (corner === "ne") return { x: bounds.x, y: bounds.y + dy, w: bounds.w + dx, h: bounds.h - dy };
  if (corner === "sw") return { x: bounds.x + dx, y: bounds.y, w: bounds.w - dx, h: bounds.h + dy };
  return { x: bounds.x, y: bounds.y, w: bounds.w + dx, h: bounds.h + dy };
}

export function ProjectEditorPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId as Id<"projects">;
  const project = useQuery(api.projects.get, { id: projectId });
  const updateProject = useMutation(api.projects.update);
  const dispatch = useDispatch();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [didLoadProject, setDidLoadProject] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const dragRef = useRef<{ id: string; start: { x: number; y: number }; shape: Shape } | null>(null);
  const resizeRef = useRef<{ id: string; corner: ResizeCorner; start: { x: number; y: number }; shape: Shape; bounds: Bounds } | null>(null);

  const shapesState = useSelector((state: RootState) => state.shapes);
  const viewport = useSelector((state: RootState) => state.viewport);
  const shapes = useMemo(
    () =>
      (shapesState.shapes.ids as string[])
        .map((id) => shapesState.shapes.entities[id])
        .filter(Boolean) as Shape[],
    [shapesState.shapes]
  );
  const selectedIds = Object.keys(shapesState.selected);
  const selectedShape = selectedIds.length === 1 ? shapesState.shapes.entities[selectedIds[0]] : null;
  const selectedBounds = selectedShape ? getShapeBounds(selectedShape) : null;

  useEffect(() => {
    if (!project || didLoadProject) return;

    const savedSketches = project.sketchesData as Partial<typeof shapesState> | undefined;
    const savedViewport = project.viewportData as { scale?: number; translate?: { x: number; y: number } } | undefined;

    if (savedSketches?.shapes && savedSketches.tool && savedSketches.selected && typeof savedSketches.frameCounter === "number") {
      dispatch(
        loadProject({
          shapes: savedSketches.shapes,
          tool: savedSketches.tool,
          selected: savedSketches.selected,
          frameCounter: savedSketches.frameCounter,
        })
      );
    }

    if (savedViewport?.scale && savedViewport.translate) {
      dispatch(restoreViewport({ scale: savedViewport.scale, translate: savedViewport.translate }));
    } else {
      dispatch(resetView());
    }

    setDidLoadProject(true);
  }, [didLoadProject, dispatch, project, shapesState]);

  const screenPoint = (event: PointerEvent | MouseEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const onSave = useCallback(async () => {
    setIsSaving(true);

    try {
      await updateProject({
        id: projectId,
        patch: {
          sketchesData: shapesState,
          viewportData: {
            scale: viewport.scale,
            translate: viewport.translate,
          },
        },
      });
      toast.success("Project saved");
    } catch (error) {
      console.error(error);
      toast.error("Could not save project");
    } finally {
      setIsSaving(false);
    }
  }, [projectId, shapesState, updateProject, viewport.scale, viewport.translate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

      if (event.key === " ") {
        event.preventDefault();
        setSpacePressed(true);
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void onSave();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        dispatch(resetView());
      }

      if (event.key === "Escape") {
        dispatch(clearSelection());
        dispatch(setTool("select"));
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.length > 0) {
          event.preventDefault();
          dispatch(deleteSelected());
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") setSpacePressed(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [dispatch, onSave, selectedIds.length]);

  const addShapeAt = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button === 1 || spacePressed) {
      event.preventDefault();
      dispatch(panStart({ screen: screenPoint(event), mode: "panning" }));
      return;
    }

    const world = screenToWorld(screenPoint(event), viewport.translate, viewport.scale);
    const common = { stroke: "#8ea0c4", strokeWidth: 2 };

    if (shapesState.tool === "select") {
      dispatch(clearSelection());
      return;
    }

    if (shapesState.tool === "frame") {
      dispatch(addFrame({ x: world.x, y: world.y, w: 390, h: 300, fill: "rgba(255,255,255,0.035)" }));
    }

    if (shapesState.tool === "rect") {
      dispatch(addRect({ ...common, x: world.x, y: world.y, w: 180, h: 110, fill: "rgba(255,255,255,0.03)" }));
    }

    if (shapesState.tool === "ellipse") {
      dispatch(addEllipse({ ...common, x: world.x, y: world.y, w: 150, h: 100, fill: "rgba(255,255,255,0.03)" }));
    }

    if (shapesState.tool === "line") {
      dispatch(addLine({ ...common, startX: world.x, startY: world.y, endX: world.x + 160, endY: world.y + 72 }));
    }

    if (shapesState.tool === "arrow") {
      dispatch(addArrow({ ...common, startX: world.x, startY: world.y, endX: world.x + 170, endY: world.y + 80 }));
    }

    if (shapesState.tool === "freedraw") {
      dispatch(
        addFreeDrawShape({
          ...common,
          points: [
            { x: world.x, y: world.y },
            { x: world.x + 38, y: world.y + 24 },
            { x: world.x + 92, y: world.y + 10 },
            { x: world.x + 132, y: world.y + 44 },
          ],
        })
      );
    }

    if (shapesState.tool === "text") {
      dispatch(addText({ x: world.x, y: world.y, text: "Type here...", fontSize: 18, fill: "#dbe5ff" }));
    }

    dispatch(setTool("select"));
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      dispatch(wheelZoom({ deltaY: event.deltaY, originScreen: screenPoint(event) }));
      return;
    }

    dispatch(wheelPan({ dx: -event.deltaX, dy: -event.deltaY }));
  };

  const startShapeDrag = (event: PointerEvent<HTMLDivElement>, shape: Shape) => {
    if (shapesState.tool !== "select") return;

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: shape.id, start: screenToWorld(screenPoint(event), viewport.translate, viewport.scale), shape };
    dispatch(clearSelection());
    dispatch(selectShape(shape.id));
  };

  const startResize = (event: PointerEvent<HTMLButtonElement>, shape: Shape, corner: ResizeCorner) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      id: shape.id,
      corner,
      start: screenToWorld(screenPoint(event), viewport.translate, viewport.scale),
      shape,
      bounds: getShapeBounds(shape),
    };
    dispatch(clearSelection());
    dispatch(selectShape(shape.id));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      const current = screenToWorld(screenPoint(event), viewport.translate, viewport.scale);
      const dx = current.x - dragRef.current.start.x;
      const dy = current.y - dragRef.current.start.y;

      dispatch(updateShape({ id: dragRef.current.id, patch: moveShapePatch(dragRef.current.shape, dx, dy) }));
      return;
    }

    if (resizeRef.current) {
      const current = screenToWorld(screenPoint(event), viewport.translate, viewport.scale);
      const dx = current.x - resizeRef.current.start.x;
      const dy = current.y - resizeRef.current.start.y;
      const nextBounds = resizeBounds(resizeRef.current.bounds, resizeRef.current.corner, dx, dy);

      dispatch(
        updateShape({
          id: resizeRef.current.id,
          patch: boundsPatch(resizeRef.current.shape, nextBounds, resizeRef.current.bounds),
        })
      );
      return;
    }

    if (viewport.mode === "panning" || viewport.mode === "shiftPanning") {
      dispatch(panMove(screenPoint(event)));
    }
  };

  const endPointerOperation = () => {
    dragRef.current = null;
    resizeRef.current = null;
    dispatch(panEnd());
  };

  const updateSelectedBounds = (patch: Partial<Bounds>) => {
    if (!selectedShape || !selectedBounds) return;

    dispatch(
      updateShape({
        id: selectedShape.id,
        patch: boundsPatch(selectedShape, { ...selectedBounds, ...patch }, selectedBounds),
      })
    );
  };

  const updateSelectedText = (text: string) => {
    if (!selectedShape || selectedShape.type !== "text") return;
    dispatch(updateShape({ id: selectedShape.id, patch: { text } as Partial<Shape> }));
  };

  if (project === undefined) {
    return <div className="grid min-h-svh place-items-center bg-background text-muted-foreground">Loading workspace</div>;
  }

  if (project === null) {
    return <div className="grid min-h-svh place-items-center bg-background text-foreground">Project not found</div>;
  }

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="size-9 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <Link href="/dashboard" aria-label="Back to dashboard">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-none">{project.name}</h1>
            <p className="mt-1 truncate text-xs text-muted-foreground">S2C / Editor</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
            <ZoomOut className="size-4 cursor-pointer" onClick={() => dispatch(setScale({ scale: viewport.scale / 1.15, originScreen: { x: 500, y: 320 } }))} />
            <button type="button" className="w-12 text-center" onClick={() => dispatch(resetView())} suppressHydrationWarning>
              {Math.round(viewport.scale * 100)}%
            </button>
            <ZoomIn className="size-4 cursor-pointer" onClick={() => dispatch(setScale({ scale: viewport.scale * 1.15, originScreen: { x: 500, y: 320 } }))} />
          </div>
          <Button asChild variant="outline" className="h-9 rounded-md px-3">
            <Link href={`/dashboard/projects/${projectId}/style-guide`}>
              <SwatchBook className="size-4" />
              Style guide
            </Link>
          </Button>
          <ThemeToggle />
          <Button onClick={onSave} disabled={isSaving} className="h-9 rounded-md px-4">
            <Save className="size-4" />
            {isSaving ? "Saving" : "Save"}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)_260px]">
        <aside className="flex flex-col items-center border-r border-border bg-muted/35 py-3">
          <div className="grid gap-2">
            {tools.map((tool, index) => {
              const Icon = tool.icon;
              const active = shapesState.tool === tool.id;

              return (
                <button
                  key={tool.id}
                  type="button"
                  title={tool.label}
                  suppressHydrationWarning
                  onClick={() => dispatch(setTool(tool.id))}
                  className={cn(
                    "grid size-10 place-items-center rounded-md border border-transparent text-muted-foreground transition hover:bg-muted hover:text-foreground",
                    active && "border-primary/50 bg-primary/10 text-primary"
                  )}
                >
                  <Icon className="size-5" />
                  {index === 1 || index === 5 ? <span className="mt-3 h-px w-8 bg-border" /> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-auto grid gap-2">
            <button className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Layers" suppressHydrationWarning>
              <Layers3 className="size-5" />
            </button>
          </div>
        </aside>

        <section
          ref={viewportRef}
          className={cn("relative overflow-hidden bg-muted/30 dark:bg-[#090909]", spacePressed && "cursor-grab")}
          onPointerDown={addShapeAt}
          onWheel={onWheel}
          onPointerMove={onPointerMove}
          onPointerUp={endPointerOperation}
          onPointerLeave={endPointerOperation}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(120,120,120,0.22)_1px,transparent_1px)] bg-[size:28px_28px] opacity-45" />
          <div
            className="absolute left-0 top-0 h-[1800px] w-[2400px] origin-top-left"
            style={{ transform: `translate(${viewport.translate.x}px, ${viewport.translate.y}px) scale(${viewport.scale})` }}
          >
            {shapes.length === 0 && (
              <div className="absolute left-[280px] top-[120px] h-[500px] w-[820px] rounded-lg border border-border bg-card shadow-2xl shadow-black/10 dark:shadow-black/50">
                <div className="absolute left-16 top-16 h-2 w-44 rounded-full bg-muted-foreground/45" />
                <div className="absolute left-16 top-[145px] h-2 w-80 rounded-full bg-muted-foreground/45" />
                <div className="absolute left-16 top-[178px] h-2 w-[360px] rounded-full bg-muted-foreground/45" />
                <div className="absolute right-16 top-24 h-60 w-64 border-2 border-muted-foreground/45" />
              </div>
            )}

            {shapes.map((shape) => {
              const bounds = getShapeBounds(shape);
              const isSelected = Boolean(shapesState.selected[shape.id]);

              return (
                <div key={shape.id}>
                  {renderShape(shape)}
                  <div
                    className={cn("absolute z-20 cursor-move rounded-md border border-transparent", isSelected && "border-primary/70 bg-primary/5")}
                    style={{ left: bounds.x - 4, top: bounds.y - 4, width: bounds.w + 8, height: bounds.h + 8 }}
                    onPointerDown={(event) => startShapeDrag(event, shape)}
                  />
                  {isSelected && (
                    <>
                      {(["nw", "ne", "sw", "se"] as ResizeCorner[]).map((corner) => (
                        <button
                          key={corner}
                          type="button"
                          aria-label={`Resize ${corner}`}
                          className={cn(
                            "absolute z-30 size-3 rounded-full border border-background bg-primary shadow-sm",
                            corner === "nw" && "cursor-nw-resize",
                            corner === "ne" && "cursor-ne-resize",
                            corner === "sw" && "cursor-sw-resize",
                            corner === "se" && "cursor-se-resize"
                          )}
                          style={{
                            left: corner.includes("w") ? bounds.x - 8 : bounds.x + bounds.w + 2,
                            top: corner.includes("n") ? bounds.y - 8 : bounds.y + bounds.h + 2,
                          }}
                          onPointerDown={(event) => startResize(event, shape, corner)}
                          suppressHydrationWarning
                        />
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute bottom-4 left-5 rounded-md border border-border bg-card/90 px-3 py-2 text-xs text-muted-foreground">
            X: {Math.round(viewport.translate.x)} Y: {Math.round(viewport.translate.y)} | {Math.round(viewport.scale * 100)}% | Space to pan
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-border bg-card">
          <section className="border-b border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Properties</p>
              <span className="text-xs capitalize text-muted-foreground">{selectedShape ? selectedShape.type : "None"}</span>
            </div>

            {selectedShape && selectedBounds ? (
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1.5 text-muted-foreground">
                  X
                  <Input className="h-8 text-right" type="number" value={Math.round(selectedBounds.x)} onChange={(event) => updateSelectedBounds({ x: Number(event.target.value) })} />
                </label>
                <label className="space-y-1.5 text-muted-foreground">
                  Y
                  <Input className="h-8 text-right" type="number" value={Math.round(selectedBounds.y)} onChange={(event) => updateSelectedBounds({ y: Number(event.target.value) })} />
                </label>
                <label className="space-y-1.5 text-muted-foreground">
                  Width
                  <Input className="h-8 text-right" type="number" value={Math.round(selectedBounds.w)} onChange={(event) => updateSelectedBounds({ w: Number(event.target.value) })} />
                </label>
                <label className="space-y-1.5 text-muted-foreground">
                  Height
                  <Input className="h-8 text-right" type="number" value={Math.round(selectedBounds.h)} onChange={(event) => updateSelectedBounds({ h: Number(event.target.value) })} />
                </label>
                {selectedShape.type === "text" && (
                  <label className="col-span-2 space-y-1.5 text-muted-foreground">
                    Text
                    <Input className="h-8" value={selectedShape.text} onChange={(event) => updateSelectedText(event.target.value)} />
                  </label>
                )}
                <Button
                  variant="destructive"
                  className="col-span-2 mt-1 h-8"
                  onClick={() => dispatch(removeShape(selectedShape.id))}
                >
                  <Trash2 className="size-4" />
                  Delete selection
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-5 text-muted-foreground">Select a shape to edit position, size, or text.</p>
            )}
          </section>

          <section className="min-h-0 overflow-y-auto border-b border-border p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Layers</p>
              <span className="text-xs text-muted-foreground">{shapes.length}</span>
            </div>
            <div className="space-y-1.5">
              {[...shapes].reverse().map((shape) => {
                const active = Boolean(shapesState.selected[shape.id]);

                return (
                  <button
                    key={shape.id}
                    type="button"
                    className={cn(
                      "flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                      active && "bg-primary/10 text-primary"
                    )}
                    onClick={() => {
                      dispatch(clearSelection());
                      dispatch(selectShape(shape.id));
                    }}
                    suppressHydrationWarning
                  >
                    <span className="truncate">{shapeLabel(shape)}</span>
                    <span className="capitalize opacity-60">{shape.type}</span>
                  </button>
                );
              })}
              {shapes.length === 0 && <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Use the tools on the left to create your first frame or shape.</p>}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto border-b border-border p-3">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI Generation</p>
              <Sparkles className="size-4 text-primary" />
            </div>
            <p className="mb-2 text-xs text-muted-foreground">Context Images</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid aspect-square place-items-center rounded-md border border-dashed border-border bg-muted/50 text-center text-xs text-muted-foreground">
                <div>
                  <ImagePlus className="mx-auto mb-2 size-5" />
                  Upload
                </div>
              </div>
              <div className="aspect-square rounded-md border border-border bg-muted" />
            </div>
            <label className="mt-4 block space-y-2 text-xs text-muted-foreground">
              Prompt Input
              <textarea
                className="min-h-20 w-full resize-none rounded-md border border-border bg-background p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Describe the desired aesthetic, component style, and color palette..."
                suppressHydrationWarning
              />
            </label>
            <Button className="mt-4 h-10 w-full rounded-md">
              <Sparkles className="size-4" />
              Generate Modern UI
            </Button>
          </section>

          <section className="mt-auto border-t border-border p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Code Export</p>
              <Code2 className="size-4 text-muted-foreground" />
            </div>
            <div className="rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
              <span className="text-primary">Tailwind + React</span>
              <br />
              {`<div className="bg-background..." />`}
            </div>
            <Button variant="outline" className="mt-3 h-9 w-full rounded-md">
              <Copy className="size-4" />
              Copy JSX
            </Button>
          </section>
        </aside>
      </div>
    </main>
  );
}